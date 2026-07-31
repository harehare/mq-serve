mod cli;
mod handlers;
mod registry;
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
use serde::Serialize;
use session::session_file_path;
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "mq_serve=info".into()))
        .with(fmt::layer())
        .init();

    let cli = Cli::parse();

    if cli.status {
        show_status(cli.json).await;
        return;
    }

    if cli.stop_all {
        stop_all_servers().await;
        return;
    }

    if cli.stop {
        stop_server(cli.port).await;
        return;
    }

    if !cli.close.is_empty() || !cli.unwatch.is_empty() {
        let mut paths = cli.close.clone();
        paths.extend(cli.unwatch.clone());
        close_paths(cli.port, &paths).await;
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

    let stdin_path = read_stdin_to_tempfile();

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

    if is_mq_serve_running(&url).await {
        if !paths.is_empty() {
            match add_paths_to_server(&url, &paths, cli.target.clone()).await {
                Ok(()) => println!("mq-serve: added files to {}", url),
                Err(e) => {
                    eprintln!("mq-serve: failed to add files: {}", e);
                    std::process::exit(1);
                }
            }
        }
        if !cli.no_open || cli.open {
            let _ = open::that(&url);
        }
        return;
    }

    if !is_loopback(&cli.bind) && !cli.dangerously_allow_remote_access {
        eprintln!(
            "mq-serve: refusing to bind to non-loopback address {} without --dangerously-allow-remote-access\n\
             mq-serve has no authentication; anyone who can reach this address can read your files.",
            cli.bind
        );
        std::process::exit(1);
    }

    let run_foreground = cli.foreground || cli.daemon;

    if run_foreground {
        if let Err(e) = server::start(
            paths,
            cli.port,
            &cli.bind,
            cli.no_open,
            cli.no_watch,
            cli.target.clone(),
            cli.dangerously_allow_remote_access,
        )
        .await
        {
            eprintln!("Error: {}", e);
            std::process::exit(1);
        }
    } else {
        let pid = spawn_background_server(
            cli.port,
            &cli.bind,
            cli.no_watch,
            &paths,
            cli.target.clone(),
            cli.dangerously_allow_remote_access,
        );
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

fn is_loopback(bind: &str) -> bool {
    matches!(bind, "127.0.0.1" | "localhost" | "::1")
}

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

/// The child always gets --foreground and --no-open so the parent owns browser-open.
fn spawn_background_server(
    port: u16,
    bind: &str,
    no_watch: bool,
    paths: &[PathBuf],
    target: Option<String>,
    allow_remote_access: bool,
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
    if let Some(target) = target {
        args.push("--target".to_string());
        args.push(target);
    }
    if allow_remote_access {
        args.push("--dangerously-allow-remote-access".to_string());
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

async fn add_paths_to_server(
    url: &str,
    paths: &[PathBuf],
    target: Option<String>,
) -> Result<(), String> {
    let path_strings: Vec<String> = paths
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();

    reqwest::Client::new()
        .post(format!("{}/api/add", url))
        .json(&serde_json::json!({ "paths": path_strings, "target": target }))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

async fn remove_paths_from_server(url: &str, paths: &[PathBuf]) -> Result<(), String> {
    let path_strings: Vec<String> = paths
        .iter()
        .map(|p| p.canonicalize().unwrap_or_else(|_| p.clone()))
        .map(|p| p.to_string_lossy().into_owned())
        .collect();

    reqwest::Client::new()
        .post(format!("{}/api/remove", url))
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

fn kill_pid(pid: u32) {
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
}

async fn stop_server(port: u16) {
    let pid_path = pid_file_path(port);
    let pid_from_file = std::fs::read_to_string(&pid_path)
        .ok()
        .and_then(|s| s.trim().parse::<u32>().ok());
    let pid_from_registry = registry::list_live()
        .into_iter()
        .find(|e| e.port == port)
        .map(|e| e.pid);

    match pid_from_registry.or(pid_from_file) {
        Some(pid) => {
            kill_pid(pid);
            let _ = std::fs::remove_file(&pid_path);
            registry::unregister(port);
            println!("Stopped mq-serve (PID: {})", pid);
        }
        None => {
            eprintln!("No mq-serve server found for port {}.", port);
            std::process::exit(1);
        }
    }
}

async fn stop_all_servers() {
    let entries = registry::list_live();
    if entries.is_empty() {
        println!("No mq-serve servers running.");
        return;
    }
    for entry in entries {
        kill_pid(entry.pid);
        let _ = std::fs::remove_file(pid_file_path(entry.port));
        registry::unregister(entry.port);
        println!(
            "Stopped mq-serve on port {} (PID: {})",
            entry.port, entry.pid
        );
    }
}

async fn close_paths(port: u16, paths: &[PathBuf]) {
    let url = format!("http://localhost:{}", port);
    if !is_mq_serve_running(&url).await {
        eprintln!("mq-serve: no server running on port {}", port);
        std::process::exit(1);
    }
    match remove_paths_from_server(&url, paths).await {
        Ok(()) => println!("mq-serve: removed {} path(s) from {}", paths.len(), url),
        Err(e) => {
            eprintln!("mq-serve: failed to remove files: {}", e);
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
    let pid = spawn_background_server(port, bind, no_watch, &[], None, false);
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

        let pid = spawn_background_server(port, bind, no_watch, &[], None, false);
        let pid_path = pid_file_path(port);
        let _ = std::fs::write(&pid_path, pid.to_string());

        if wait_for_server(&url, 8).await {
            println!(
                "mq-serve: server restarted with empty session (pid {})",
                pid
            );
        }
    }
}

#[derive(Serialize)]
struct StatusRow {
    url: String,
    port: u16,
    pid: u32,
    bind: String,
    version: Option<String>,
    file_count: Option<u64>,
    started_at: u64,
}

/// Shows every mq-serve server currently running on this machine, regardless
/// of which directory or port this invocation happens to be in.
async fn show_status(json: bool) {
    let entries = registry::list_live();

    if entries.is_empty() {
        if json {
            println!("[]");
        } else {
            println!("No mq-serve servers running.");
        }
        return;
    }

    let mut rows = Vec::new();
    for entry in entries {
        let host = if entry.bind == "0.0.0.0" {
            "localhost"
        } else {
            entry.bind.as_str()
        };
        let url = format!("http://{}:{}", host, entry.port);

        let (version, file_count) = match reqwest::Client::new()
            .get(format!("{}/api/status", url))
            .timeout(std::time::Duration::from_secs(2))
            .send()
            .await
        {
            Ok(resp) => match resp.json::<serde_json::Value>().await {
                Ok(json) => (
                    json.get("version")
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    json.get("file_count").and_then(|v| v.as_u64()),
                ),
                Err(_) => (None, None),
            },
            Err(_) => (None, None),
        };

        rows.push(StatusRow {
            url,
            port: entry.port,
            pid: entry.pid,
            bind: entry.bind,
            version,
            file_count,
            started_at: entry.started_at,
        });
    }

    if json {
        println!(
            "{}",
            serde_json::to_string_pretty(&rows).unwrap_or_default()
        );
        return;
    }

    for row in &rows {
        let version = row.version.as_deref().unwrap_or("?");
        let files = row
            .file_count
            .map(|c| format!("{} file(s)", c))
            .unwrap_or_else(|| "unreachable".to_string());
        println!("{} (v{}, pid {})", row.url, version, row.pid);
        println!("  {}", files);
    }
}
