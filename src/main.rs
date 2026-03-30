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

    if let Err(e) = server::start(paths, cli.port, cli.no_open, cli.no_watch).await {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
