mod cli;
mod handlers;
mod server;
mod session;
mod watcher;

use std::{
    hash::{DefaultHasher, Hash, Hasher},
    io::Read,
    path::PathBuf,
};

use clap::Parser;
use cli::Cli;
use session::session_file_path;
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "mq_serve=info".into()))
        .with(fmt::layer())
        .init();

    let cli = Cli::parse();

    // ── single-action flags ───────────────────────────────────────────────────

    if cli.status {
        show_status(cli.port).await;
        return;
    }

    if cli.stop {
        stop_server(cli.port).await;
        return;
    }

    if cli.clear {
        clear_session(cli.port, &cli.bind, cli.no_watch).await;
        return;
    }

    if cli.restart {
        do_restart(cli.port, &cli.bind, cli.no_open, cli.no_watch).await;
        return;
    }

    // ── read stdin if piped ───────────────────────────────────────────────────

    let stdin_path = read_stdin_to_tempfile();

    // ── resolve CLI paths ────────────────────────────────────────────────────

    let mut paths: Vec<PathBuf> = cli
        .paths
        .iter()
        .map(|p| p.canonicalize().unwrap_or_else(|_| p.clone()))
        .collect();

    if let Some(p) = stdin_path {
        if !paths.contains(&p) {
            paths.push(p);
        }
    }

    let url = format!("http://localhost:{}", cli.port);

    // ── if a server is already running, add files to it ───────────────────────

    if is_mq_serve_running(&url).await {
        if !paths.is_empty() {
            match add_paths_to_server(&url, &paths).await {
                Ok(()) => println!("mq-serve: added files to {}", url),
                Err(e) => {
                    eprintln!("mq-serve: failed to add files: {}", e);
                    std::process::exit(1);
                }
            }
        }
        if !cli.no_open {
            let _ = open::that(&url);
        }
        return;
    }

    // ── start a new server ────────────────────────────────────────────────────

    let run_foreground = cli.foreground || cli.daemon;

    if run_foreground {
        if let Err(e) = server::start(paths, cli.port, &cli.bind, cli.no_open, cli.no_watch).await
        {
            eprintln!("Error: {}", e);
            std::process::exit(1);
        }
    } else {
        let pid = spawn_background_server(cli.port, &cli.bind, cli.no_watch, &paths);
        let pid_path = pid_file_path(cli.port);
        let _ = std::fs::write(&pid_path, pid.to_string());

        if wait_for_server(&url, 8).await {
            if !cli.no_open {
                let _ = open::that(&url);
            }
            println!("mq-serve: serving at {} (pid {})", url, pid);
        } else {
            let _ = std::fs::remove_file(&pid_path);
            eprintln!("mq-serve: server did not start in time");
            std::process::exit(1);
        }
    }
}

// ── stdin helper ──────────────────────────────────────────────────────────────

fn read_stdin_to_tempfile() -> Option<PathBuf> {
    use std::io::IsTerminal;
    if std::io::stdin().is_terminal() {
        return None;
    }
    let mut content = String::new();
    std::io::stdin().read_to_string(&mut content).ok()?;
    if content.trim().is_empty() {
        return None;
    }
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    let hash = hasher.finish();
    let path = std::env::temp_dir().join(format!("mq-serve-stdin-{:x}.md", hash));
    std::fs::write(&path, &content).ok()?;
    Some(path)
}

// ── background spawn ──────────────────────────────────────────────────────────

/// Spawn a new background server process and return its PID.
/// The child always gets --foreground and --no-open so the parent owns browser-open.
fn spawn_background_server(
    port: u16,
    bind: &str,
    no_watch: bool,
    paths: &[PathBuf],
) -> u32 {
    let exe = std::env::current_exe().expect("failed to get current executable path");
    let mut args = vec![
        "--foreground".to_string(),
        "--no-open".to_string(),
        "-p".to_string(),
        port.to_string(),
        "-b".to_string(),
        bind.to_string(),
    ];
    if no_watch {
        args.push("--no-watch".to_string());
    }
    for p in paths {
        args.push(p.to_string_lossy().into_owned());
    }

    #[allow(clippy::zombie_processes)]
    let child = std::process::Command::new(&exe)
        .args(&args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .expect("failed to spawn background process");

    child.id()
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

fn pid_file_path(port: u16) -> PathBuf {
    std::env::temp_dir().join(format!("mq-serve-{}.pid", port))
}

async fn is_mq_serve_running(url: &str) -> bool {
    let client = reqwest::Client::new();
    match client
        .get(format!("{}/api/status", url))
        .timeout(std::time::Duration::from_millis(800))
        .send()
        .await
    {
        Ok(resp) => {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                json.get("name").and_then(|v| v.as_str()) == Some("mq-serve")
            } else {
                false
            }
        }
        Err(_) => false,
    }
}

async fn add_paths_to_server(url: &str, paths: &[PathBuf]) -> Result<(), String> {
    let path_strings: Vec<String> = paths
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();

    reqwest::Client::new()
        .post(format!("{}/api/add", url))
        .json(&serde_json::json!({ "paths": path_strings }))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Polls /api/status every 200 ms until the server responds or timeout expires.
async fn wait_for_server(url: &str, timeout_secs: u64) -> bool {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);
    while std::time::Instant::now() < deadline {
        if is_mq_serve_running(url).await {
            return true;
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
    false
}

// ── action handlers ───────────────────────────────────────────────────────────

async fn stop_server(port: u16) {
    let pid_path = pid_file_path(port);
    match std::fs::read_to_string(&pid_path) {
        Ok(pid_str) => {
            let pid: u32 = pid_str.trim().parse().expect("invalid PID in file");
            #[cfg(unix)]
            {
                let _ = std::process::Command::new("kill")
                    .arg(pid.to_string())
                    .status();
            }
            #[cfg(not(unix))]
            {
                let _ = std::process::Command::new("taskkill")
                    .args(["/PID", &pid.to_string(), "/F"])
                    .status();
            }
            let _ = std::fs::remove_file(&pid_path);
            println!("Stopped mq-serve (PID: {})", pid);
        }
        Err(_) => {
            eprintln!(
                "No background mq-serve found for port {}.\nPID file not found: {}",
                port,
                pid_path.display()
            );
            std::process::exit(1);
        }
    }
}

async fn do_restart(port: u16, bind: &str, no_open: bool, no_watch: bool) {
    let url = format!("http://localhost:{}", port);

    if !is_mq_serve_running(&url).await {
        eprintln!("mq-serve: no server running on port {}", port);
        std::process::exit(1);
    }

    // Signal the current server to exit.
    let _ = reqwest::Client::new()
        .post(format!("{}/api/restart", url))
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await;

    // Wait for it to go down (up to 5 s).
    for _ in 0..25 {
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        if !is_mq_serve_running(&url).await {
            break;
        }
    }

    // Spawn a new background process (session will restore the files).
    let pid = spawn_background_server(port, bind, no_watch, &[]);
    let pid_path = pid_file_path(port);
    let _ = std::fs::write(&pid_path, pid.to_string());

    if wait_for_server(&url, 8).await {
        if !no_open {
            let _ = open::that(&url);
        }
        println!("mq-serve: restarted at {} (pid {})", url, pid);
    } else {
        let _ = std::fs::remove_file(&pid_path);
        eprintln!("mq-serve: server did not restart in time");
        std::process::exit(1);
    }
}

async fn clear_session(port: u16, bind: &str, no_watch: bool) {
    let session_path = session_file_path(port);
    let _ = std::fs::remove_file(&session_path);
    println!("mq-serve: session cleared for port {}", port);

    let url = format!("http://localhost:{}", port);
    if is_mq_serve_running(&url).await {
        // Restart the running server so it picks up the empty session.
        let _ = reqwest::Client::new()
            .post(format!("{}/api/restart", url))
            .timeout(std::time::Duration::from_secs(2))
            .send()
            .await;

        for _ in 0..25 {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            if !is_mq_serve_running(&url).await {
                break;
            }
        }

        let pid = spawn_background_server(port, bind, no_watch, &[]);
        let pid_path = pid_file_path(port);
        let _ = std::fs::write(&pid_path, pid.to_string());

        if wait_for_server(&url, 8).await {
            println!("mq-serve: server restarted with empty session (pid {})", pid);
        }
    }
}

async fn show_status(port: u16) {
    let url = format!("http://localhost:{}", port);
    let pid_path = pid_file_path(port);
    let pid = std::fs::read_to_string(&pid_path)
        .ok()
        .and_then(|s| s.trim().parse::<u32>().ok());

    match reqwest::Client::new()
        .get(format!("{}/api/status", url))
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
    {
        Ok(resp) => {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                let version = json.get("version").and_then(|v| v.as_str()).unwrap_or("?");
                let file_count = json
                    .get("file_count")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                let pid_str = pid
                    .map(|p| format!(", pid {}", p))
                    .unwrap_or_default();
                println!("{} (v{}{})", url, version, pid_str);
                println!("  {} file(s)", file_count);
            } else {
                println!("{}: running", url);
            }
        }
        Err(_) => {
            // Clean up stale PID file.
            if pid_path.exists() {
                let _ = std::fs::remove_file(&pid_path);
            }
            eprintln!("No mq-serve server running on port {}", port);
            std::process::exit(1);
        }
    }
}
