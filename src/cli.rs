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
    #[arg(long, default_value_t = 7700)]
    pub port: u16,

    /// Do not automatically open the browser.
    #[arg(long)]
    pub no_open: bool,

    /// Disable file-change watching.
    #[arg(long)]
    pub no_watch: bool,

    /// Run the server in the background (detach from terminal).
    #[arg(long, short = 'd')]
    pub daemon: bool,

    /// Stop a background server running on the given port.
    #[arg(long)]
    pub stop: bool,
}
