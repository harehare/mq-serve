use std::path::{Path, PathBuf};

use ignore::WalkBuilder;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::broadcast;
use tracing::{debug, warn};

pub fn spawn_watcher(
    paths: &[PathBuf],
    tx: broadcast::Sender<String>,
) -> notify::Result<RecommendedWatcher> {
    let tx_inner = tx.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| match res {
        Ok(event) => {
            if matches!(
                event.kind,
                EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
            ) {
                for path in &event.paths {
                    if is_markdown(path) {
                        let path_str = path.to_string_lossy().into_owned();
                        debug!("file changed: {}", path_str);
                        // Broadcast a pre-serialized JSON message so the WS handler
                        // can forward it without re-wrapping.
                        let msg = serde_json::json!({ "type": "change", "path": path_str })
                            .to_string();
                        let _ = tx_inner.send(msg);
                    }
                }
            }
        }
        Err(e) => warn!("watch error: {:?}", e),
    })?;

    for path in paths {
        watcher.watch(path, RecursiveMode::Recursive)?;
    }

    Ok(watcher)
}

fn is_markdown(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()),
        Some("md") | Some("mdx") | Some("markdown")
    )
}

/// Collect markdown files, respecting .gitignore and other ignore rules.
pub fn collect_markdown_files(paths: &[PathBuf]) -> Vec<PathBuf> {
    let mut files = Vec::new();

    for path in paths {
        if path.is_file() {
            if is_markdown(path) {
                files.push(path.clone());
            }
            continue;
        }

        if !path.is_dir() {
            continue;
        }

        for result in WalkBuilder::new(path).build() {
            let Ok(entry) = result else { continue };
            if entry.file_type().map(|t| t.is_file()).unwrap_or(false) && is_markdown(entry.path())
            {
                files.push(entry.path().to_path_buf());
            }
        }
    }

    files.sort();
    files.dedup();
    files
}

