use std::{
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};

use ignore::WalkBuilder;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::broadcast;
use tracing::{debug, warn};

static NO_IGNORE: AtomicBool = AtomicBool::new(false);
static NO_RECURSIVE: AtomicBool = AtomicBool::new(false);

/// Configures how roots are scanned. Set once at server/CLI-query startup.
pub fn configure_scan(no_ignore: bool, no_recursive: bool) {
    NO_IGNORE.store(no_ignore, Ordering::Relaxed);
    NO_RECURSIVE.store(no_recursive, Ordering::Relaxed);
}

/// How the file watcher should observe a root.
pub fn recursive_mode(root: &Path) -> RecursiveMode {
    if NO_RECURSIVE.load(Ordering::Relaxed) && root.is_dir() {
        RecursiveMode::NonRecursive
    } else {
        RecursiveMode::Recursive
    }
}

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
                        let msg =
                            serde_json::json!({ "type": "change", "path": path_str }).to_string();
                        let _ = tx_inner.send(msg);
                    }
                }
            }
        }
        Err(e) => warn!("watch error: {:?}", e),
    })?;

    for path in paths {
        watcher.watch(&crate::paths::watch_target(path), recursive_mode(path))?;
    }

    Ok(watcher)
}

fn is_markdown(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()),
        Some("md") | Some("mdx") | Some("markdown")
    )
}

/// Collect markdown files, respecting .gitignore and other ignore rules
/// unless `configure_scan` disabled that.
pub fn collect_markdown_files(paths: &[PathBuf]) -> Vec<PathBuf> {
    let mut files = Vec::new();

    for path in paths {
        if path.is_file() {
            if is_markdown(path) {
                files.push(path.clone());
            }
            continue;
        }

        let pattern = if crate::paths::is_pattern(path) {
            let Some(m) = crate::paths::matcher(path) else {
                continue;
            };
            Some(m)
        } else if path.is_dir() {
            None
        } else {
            continue;
        };
        let walk_root = crate::paths::watch_target(path);

        let mut builder = WalkBuilder::new(walk_root);
        if NO_IGNORE.load(Ordering::Relaxed) {
            builder.standard_filters(false);
        }
        if NO_RECURSIVE.load(Ordering::Relaxed) && pattern.is_none() {
            builder.max_depth(Some(1));
        }

        for result in builder.build() {
            let Ok(entry) = result else { continue };
            if entry.file_type().map(|t| t.is_file()).unwrap_or(false)
                && is_markdown(entry.path())
                && pattern.as_ref().is_none_or(|m| m.is_match(entry.path()))
            {
                files.push(entry.path().to_path_buf());
            }
        }
    }

    files.sort();
    files.dedup();
    files
}
