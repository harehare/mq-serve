use std::{
    collections::HashSet,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Mutex, atomic::AtomicUsize},
};

use axum::{
    Router,
    routing::{get, post},
};
use tokio::{signal, sync::broadcast};
use tower_http::cors::CorsLayer;
use tracing::info;

use crate::{
    handlers::{
        AppState, add_files, get_file, get_status, list_files, restart, run_query,
        search_files, serve_asset, ws_handler,
    },
    session::{load_session, save_session},
    watcher::spawn_watcher,
};

pub async fn start(
    paths: Vec<PathBuf>,
    port: u16,
    bind: &str,
    no_open: bool,
    no_watch: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    // Merge session-persisted paths with command-line paths (session first).
    // If nothing is provided at all, fall back to the current directory.
    let mut merged: Vec<PathBuf> = load_session(port);
    let existing_set: HashSet<PathBuf> = merged.iter().cloned().collect();
    for p in paths {
        let canonical = p.canonicalize().unwrap_or(p);
        if !existing_set.contains(&canonical) {
            merged.push(canonical);
        }
    }
    if merged.is_empty() {
        merged.push(std::env::current_dir().unwrap_or_default());
    }

    let (watch_tx, _) = broadcast::channel::<String>(128);

    let watcher = if !no_watch {
        let w = spawn_watcher(&merged, watch_tx.clone())
            .map_err(|e| format!("Failed to start watcher: {}", e))?;
        Some(Arc::new(Mutex::new(w)))
    } else {
        None
    };

    let paths_arc = Arc::new(std::sync::RwLock::new(merged.clone()));

    let state = Arc::new(AppState {
        paths: paths_arc,
        watch_tx,
        connection_count: Arc::new(AtomicUsize::new(0)),
        watcher,
        port,
    });

    save_session(port, &merged);

    let app = Router::new()
        .route("/api/status", get(get_status))
        .route("/api/add", post(add_files))
        .route("/api/files", get(list_files))
        .route("/api/file", get(get_file))
        .route("/api/query", post(run_query))
        .route("/api/search", post(search_files))
        .route("/api/restart", post(restart))
        .route("/ws", get(ws_handler))
        .fallback(serve_asset)
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr: SocketAddr = format!("{}:{}", bind, port).parse()?;
    let display_host = if bind == "0.0.0.0" { "localhost" } else { bind };
    let url = format!("http://{}:{}", display_host, port);

    let listener = tokio::net::TcpListener::bind(addr).await?;

    info!("mq-serve listening on {}", addr);
    println!(
        "mq-serve: serving at {} (pid {})",
        url,
        std::process::id()
    );
    println!("Press Ctrl+C to stop.");

    if !no_open {
        let url_clone = url.clone();
        tokio::spawn(async move {
            // Small delay so the listener is definitely ready before the browser hits it.
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            if let Err(e) = open::that(&url_clone) {
                tracing::warn!("Failed to open browser: {}", e);
            }
        });
    }

    tokio::spawn(async {
        shutdown_signal().await;
        println!("\nShutting down.");
        std::process::exit(0);
    });

    axum::serve(listener, app).await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
