//! mq query execution shared by the HTTP API and the `--query` CLI mode.

use std::path::{Path, PathBuf};

use miette::miette;
use rayon::prelude::*;
use serde::Serialize;

use crate::watcher::collect_markdown_files;

pub fn execute_query(content: &str, query: &str) -> miette::Result<String> {
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
        mq_lang::RuntimeValue::Markdown(node, _) => vec![(**node).clone()],
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

#[derive(Serialize)]
pub struct FileResult {
    pub path: String,
    pub name: String,
    pub result: String,
}

#[derive(Serialize)]
pub struct MultiResult {
    pub results: Vec<FileResult>,
    /// Set when the query failed for every file (typically a syntax error).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Runs `query` against every markdown file under `roots`, keeping only files
/// for which the query produced output.
pub fn query_files(roots: &[PathBuf], query: &str) -> MultiResult {
    let files = collect_markdown_files(roots);
    let outcomes: Vec<(PathBuf, miette::Result<String>)> = files
        .into_par_iter()
        .filter_map(|p| {
            let content = std::fs::read_to_string(&p).ok()?;
            let res = execute_query(&content, query);
            Some((p, res))
        })
        .collect();

    let total = outcomes.len();
    let mut first_error = None;
    let mut errors = 0;
    let mut results = Vec::new();
    for (path, outcome) in outcomes {
        match outcome {
            Ok(result) if !result.trim().is_empty() => results.push(FileResult {
                name: file_name(&path),
                path: path.to_string_lossy().into_owned(),
                result,
            }),
            Ok(_) => {}
            Err(e) => {
                errors += 1;
                first_error.get_or_insert_with(|| e.to_string());
            }
        }
    }
    results.sort_by(|a, b| a.path.cmp(&b.path));

    MultiResult {
        results,
        error: if total > 0 && errors == total {
            first_error
        } else {
            None
        },
    }
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_headings() {
        let out = execute_query("# A\n\ntext\n\n## B\n", ".h").unwrap();
        assert!(out.contains("# A") && out.contains("## B"));
        assert!(!out.contains("text"));
    }

    #[test]
    fn invalid_query_is_an_error() {
        assert!(execute_query("# A\n", "this is not (valid").is_err());
    }
}
