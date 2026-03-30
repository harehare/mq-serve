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
                        let _ = tx_inner.send(path_str);
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

    files.sort_by(|a, b| {
        if a.is_dir() && !b.is_dir() {
            std::cmp::Ordering::Less
        } else if !a.is_dir() && b.is_dir() {
            std::cmp::Ordering::Greater
        } else {
            a.cmp(b)
        }
    });

    files.sort();
    files.dedup();
    files
}
