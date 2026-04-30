use std::path::PathBuf;

use clap::Parser;

/// Browser-based Markdown viewer with mq query support.
#[derive(Parser, Debug)]
#[command(name = "mq-serve", version, about)]
pub struct Cli {
    /// Markdown files or directories to serve.
    /// Defaults to the current directory.
    #[arg(value_name = "FILES_OR_DIRS")]
    pub paths: Vec<PathBuf>,

    /// Port to listen on.
    #[arg(long, short = 'p', default_value_t = 7700)]
    pub port: u16,

    /// Address to bind to.
    #[arg(long, short = 'b', default_value = "127.0.0.1")]
    pub bind: String,

    /// Do not automatically open the browser.
    #[arg(long)]
    pub no_open: bool,

    /// Disable file-change watching.
    #[arg(long)]
    pub no_watch: bool,

    /// Run in the foreground instead of the background (default is background).
    #[arg(long, short = 'f')]
    pub foreground: bool,

    /// Stop the background server running on the given port.
    #[arg(long)]
    pub stop: bool,

    /// Restart the background server running on the given port.
    #[arg(long)]
    pub restart: bool,

    /// Show the status of the server running on the given port.
    #[arg(long)]
    pub status: bool,

    /// Clear the saved session for the given port.
    /// If a server is running it will be restarted with an empty session.
    #[arg(long)]
    pub clear: bool,

    /// Backward-compatible alias for the default background behaviour (no-op).
    #[arg(long, short = 'd', hide = true)]
    pub daemon: bool,
}
