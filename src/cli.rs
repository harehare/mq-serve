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

    /// Assign the given files/directories to a named group in the sidebar.
    #[arg(long, short = 't', value_name = "NAME")]
    pub target: Option<String>,

    /// Port to listen on.
    #[arg(long, short = 'p', default_value_t = 7700)]
    pub port: u16,

    /// Address to bind to.
    #[arg(long, short = 'b', default_value = "127.0.0.1")]
    pub bind: String,

    /// Required together with a non-loopback --bind to confirm the server
    /// should be reachable from the network (it has no authentication).
    #[arg(long)]
    pub dangerously_allow_remote_access: bool,

    /// Do not automatically open the browser.
    #[arg(long)]
    pub no_open: bool,

    /// Always open the browser, even when adding files to an already-running server.
    #[arg(long)]
    pub open: bool,

    /// Disable file-change watching.
    #[arg(long)]
    pub no_watch: bool,

    /// Run in the foreground instead of the background (default is background).
    #[arg(long, short = 'f')]
    pub foreground: bool,

    /// Stop the background server running on the given port.
    #[arg(long)]
    pub stop: bool,

    /// Stop every background mq-serve server currently running.
    #[arg(long)]
    pub stop_all: bool,

    /// Restart the background server running on the given port.
    #[arg(long)]
    pub restart: bool,

    /// Show running server(s). With no other selector, lists every mq-serve
    /// server currently running on this machine, regardless of port.
    #[arg(long)]
    pub status: bool,

    /// Output --status as JSON instead of human-readable text.
    #[arg(long)]
    pub json: bool,

    /// Clear the saved session for the given port.
    /// If a server is running it will be restarted with an empty session.
    #[arg(long)]
    pub clear: bool,

    /// Remove one or more files/directories from the running session on the given port.
    #[arg(long, value_name = "PATH", num_args = 1..)]
    pub close: Vec<PathBuf>,

    /// Stop watching one or more files/directories on the running session on the given port.
    /// Alias for --close.
    #[arg(long, value_name = "PATH", num_args = 1..)]
    pub unwatch: Vec<PathBuf>,

    /// Backward-compatible alias for the default background behaviour (no-op).
    #[arg(long, short = 'd', hide = true)]
    pub daemon: bool,
}
