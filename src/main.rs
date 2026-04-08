mod cli;
mod handlers;
mod server;
mod watcher;

use clap::Parser;
use cli::Cli;
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "mq_serve=info".into()))
        .with(fmt::layer())
        .init();

    let cli = Cli::parse();

    let paths = if cli.paths.is_empty() {
        vec![std::env::current_dir().expect("failed to get current directory")]
    } else {
        cli.paths
    };

    if cli.stop {
        let pid_path = std::env::temp_dir().join(format!("mq-serve-{}.pid", cli.port));
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
                    cli.port,
                    pid_path.display()
                );
                std::process::exit(1);
            }
        }
        return;
    }

    if cli.daemon {
        let exe = std::env::current_exe().expect("failed to get current executable path");
        let args: Vec<String> = std::env::args()
            .skip(1)
            .filter(|a| a != "--daemon" && a != "-d")
            .collect();

        let child = std::process::Command::new(&exe)
            .args(&args)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .expect("failed to spawn background process");

        let pid = child.id();
        let pid_path = std::env::temp_dir().join(format!("mq-serve-{}.pid", cli.port));
        let _ = std::fs::write(&pid_path, pid.to_string());

        println!("mq-serve started in background (PID: {})", pid);
        println!("PID file: {}", pid_path.display());
        println!("Stop with: mq-serve --stop  (or: kill {})", pid);
        return;
    }

    if let Err(e) = server::start(paths, cli.port, cli.no_open, cli.no_watch).await {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
