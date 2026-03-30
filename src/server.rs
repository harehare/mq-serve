use std::{
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, atomic::AtomicUsize},
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
        AppState, get_file, list_files, restart, run_query, search_files, serve_asset, ws_handler,
    },
    watcher::spawn_watcher,
};

pub async fn start(
    paths: Vec<PathBuf>,
    port: u16,
    no_open: bool,
    no_watch: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let (watch_tx, _) = broadcast::channel::<String>(128);

    let _watcher = if !no_watch {
        let watcher = spawn_watcher(&paths, watch_tx.clone())
            .map_err(|e| format!("Failed to start watcher: {}", e))?;
        Some(watcher)
    } else {
        None
    };

    let state = Arc::new(AppState {
        paths,
        watch_tx,
        connection_count: Arc::new(AtomicUsize::new(0)),
    });

    let app = Router::new()
        .route("/api/files", get(list_files))
        .route("/api/file", get(get_file))
        .route("/api/query", post(run_query))
        .route("/api/search", post(search_files))
        .route("/api/restart", post(restart))
        .route("/ws", get(ws_handler))
        .fallback(serve_asset)
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let url = format!("http://localhost:{}", port);

    info!("mq-serve listening on {}", url);

    if !no_open {
        let url_clone = url.clone();
        tokio::spawn(async move {
            if let Err(e) = open::that(&url_clone) {
                tracing::warn!("Failed to open browser: {}", e);
            }
        });
    }

    println!("Serving at {}", url);
    println!("Press Ctrl+C to stop.");

    // Spawn signal handler as a separate task so it can force-exit even when
    // the server has open WebSocket connections that would block graceful shutdown.
    tokio::spawn(async {
        shutdown_signal().await;
        println!("\nShutting down.");
        std::process::exit(0);
    });

    let listener = tokio::net::TcpListener::bind(addr).await?;
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
