use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::UNIX_EPOCH,
};

use axum::{
    Json,
    body::Body,
    extract::{
        Query, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::{StatusCode, Uri, header},
    response::{IntoResponse, Response},
};
use miette::miette;
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tracing::debug;

use crate::watcher::collect_markdown_files;

#[derive(RustEmbed)]
#[folder = "assets/dist/"]
struct FrontendAssets;

pub async fn serve_asset(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };

    match FrontendAssets::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path)
                .first_or_octet_stream()
                .to_string();
            Response::builder()
                .header(header::CONTENT_TYPE, mime)
                .body(Body::from(content.data.into_owned()))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        None => {
            // SPA fallback: serve index.html for unknown paths
            match FrontendAssets::get("index.html") {
                Some(content) => Response::builder()
                    .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                    .body(Body::from(content.data.into_owned()))
                    .unwrap_or_else(|_| StatusCode::NOT_FOUND.into_response()),
                None => (StatusCode::NOT_FOUND, "Not found").into_response(),
            }
        }
    }
}

pub struct AppState {
    pub paths: Vec<PathBuf>,
    pub watch_tx: broadcast::Sender<String>,
    pub connection_count: Arc<AtomicUsize>,
}

#[derive(Serialize)]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub modified: Option<u64>,
    pub title: Option<String>,
}

#[derive(Serialize)]
pub struct FileGroup {
    pub root: String,
    pub name: String,
    pub files: Vec<FileEntry>,
}

#[derive(Serialize)]
pub struct GroupsResponse {
    pub groups: Vec<FileGroup>,
}

fn extract_first_heading(path: &PathBuf) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    let mut lines = content.lines().peekable();

    // Skip YAML frontmatter if present
    if lines.peek() == Some(&"---") {
        lines.next();
        for line in lines.by_ref() {
            if line.trim() == "---" {
                break;
            }
        }
    }

    // Find first # heading
    for line in lines {
        if let Some(heading) = line.trim().strip_prefix("# ") {
            return Some(heading.trim().to_string());
        }
    }
    None
}

pub async fn list_files(State(state): State<Arc<AppState>>) -> Json<GroupsResponse> {
    let groups = state
        .paths
        .iter()
        .map(|root| {
            let name = root
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| root.to_string_lossy().into_owned());

            let files = collect_markdown_files(std::slice::from_ref(root))
                .into_iter()
                .map(|p| {
                    let modified = p
                        .metadata()
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| d.as_secs());
                    let fname = p
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_default();
                    let title = extract_first_heading(&p);
                    FileEntry {
                        path: p.to_string_lossy().into_owned(),
                        name: fname,
                        modified,
                        title,
                    }
                })
                .collect();

            FileGroup {
                root: root.to_string_lossy().into_owned(),
                name,
                files,
            }
        })
        .collect();

    Json(GroupsResponse { groups })
}

// ─── GET /api/file?path=... ───────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct FileQuery {
    pub path: String,
}

pub async fn get_file(
    State(state): State<Arc<AppState>>,
    Query(params): Query<FileQuery>,
) -> Result<String, (StatusCode, String)> {
    let requested = PathBuf::from(&params.path);
    let allowed = collect_markdown_files(&state.paths);
    if !allowed.contains(&requested) {
        return Err((StatusCode::FORBIDDEN, "access denied".into()));
    }
    std::fs::read_to_string(&requested).map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))
}

#[derive(Deserialize)]
pub struct QueryRequest {
    pub content: String,
    pub query: String,
}

#[derive(Serialize)]
pub struct QueryResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub async fn run_query(Json(req): Json<QueryRequest>) -> Response {
    let result = tokio::task::spawn_blocking(move || execute_query(&req.content, &req.query)).await;

    match result {
        Ok(Ok(result)) => Json(QueryResponse {
            result: Some(result),
            error: None,
        })
        .into_response(),
        Ok(Err(e)) => Json(QueryResponse {
            result: None,
            error: Some(e.to_string()),
        })
        .into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

fn execute_query(content: &str, query: &str) -> miette::Result<String> {
    let mut engine = mq_lang::DefaultEngine::default();
    engine.load_builtin_module();
    let input = mq_lang::parse_markdown_input(content)?;
    let runtime_values = engine
        .eval(query, input.into_iter())
        .map_err(|e| miette!("Query error: {}", e))?;
    let nodes: Vec<mq_markdown::Node> = runtime_values
        .values()
        .iter()
        .flat_map(runtime_value_to_nodes)
        .collect();
    Ok(mq_markdown::Markdown::new(nodes).to_string())
}

fn runtime_value_to_nodes(value: &mq_lang::RuntimeValue) -> Vec<mq_markdown::Node> {
    match value {
        mq_lang::RuntimeValue::Markdown(node, _) => vec![node.clone()],
        mq_lang::RuntimeValue::Array(items) => {
            let has_markdown = items
                .iter()
                .any(|v| matches!(v, mq_lang::RuntimeValue::Markdown(_, _)));
            if has_markdown {
                items.iter().flat_map(runtime_value_to_nodes).collect()
            } else if items.is_empty() {
                vec![]
            } else {
                vec![value.to_string().into()]
            }
        }
        _ => vec![value.to_string().into()],
    }
}

#[derive(Deserialize)]
pub struct SearchRequest {
    pub query: String,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub snippet: String,
    pub line: usize,
}

pub async fn search_files(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SearchRequest>,
) -> Json<Vec<SearchResult>> {
    let query_lower = req.query.to_lowercase();
    let files = collect_markdown_files(&state.paths);
    let mut results: Vec<SearchResult> = Vec::new();

    'outer: for file in files {
        let name = file
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();

        if let Ok(content) = std::fs::read_to_string(&file) {
            for (i, line) in content.lines().enumerate() {
                if line.to_lowercase().contains(&query_lower) {
                    results.push(SearchResult {
                        path: file.to_string_lossy().into_owned(),
                        name: name.clone(),
                        snippet: line.trim().to_string(),
                        line: i + 1,
                    });
                    if results.len() >= 200 {
                        break 'outer;
                    }
                }
            }
        }
    }

    Json(results)
}

pub async fn restart() -> StatusCode {
    StatusCode::OK
}

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> Response {
    ws.on_upgrade(move |socket| {
        handle_ws(
            socket,
            state.watch_tx.subscribe(),
            state.connection_count.clone(),
        )
    })
}

async fn handle_ws(
    mut socket: WebSocket,
    mut rx: broadcast::Receiver<String>,
    connection_count: Arc<AtomicUsize>,
) {
    connection_count.fetch_add(1, Ordering::SeqCst);

    loop {
        tokio::select! {
            msg = rx.recv() => {
                match msg {
                    Ok(path) => {
                        debug!("sending change notification: {}", path);
                        let payload = serde_json::json!({ "type": "change", "path": path });
                        if socket.send(Message::Text(payload.to_string().into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                }
            }
            msg = socket.recv() => {
                if msg.is_none() {
                    break;
                }
            }
        }
    }

    let remaining = connection_count.fetch_sub(1, Ordering::SeqCst) - 1;
    if remaining == 0 {
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
            if connection_count.load(Ordering::SeqCst) == 0 {
                println!("\nAll tabs closed. Shutting down.");
                std::process::exit(0);
            }
        });
    }
}
