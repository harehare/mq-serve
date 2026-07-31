use std::{collections::HashMap, path::PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct SessionData {
    pub paths: Vec<String>,
    /// Maps a root path (as given on the CLI, canonicalized) to a custom
    /// display name assigned via `-t/--target`.
    #[serde(default)]
    pub targets: HashMap<String, String>,
}

pub fn session_file_path(port: u16) -> PathBuf {
    std::env::temp_dir().join(format!("mq-serve-{}-session.json", port))
}

pub fn save_session(port: u16, paths: &[PathBuf], targets: &HashMap<String, String>) {
    let data = SessionData {
        paths: paths
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect(),
        targets: targets.clone(),
    };
    if let Ok(json) = serde_json::to_string(&data) {
        let _ = std::fs::write(session_file_path(port), json);
    }
}

pub fn load_session(port: u16) -> (Vec<PathBuf>, HashMap<String, String>) {
    let path = session_file_path(port);
    let Ok(content) = std::fs::read_to_string(&path) else {
        return (vec![], HashMap::new());
    };
    let Ok(data): Result<SessionData, _> = serde_json::from_str(&content) else {
        return (vec![], HashMap::new());
    };
    let paths = data
        .paths
        .into_iter()
        .map(PathBuf::from)
        .filter(|p| p.exists())
        .collect();
    (paths, data.targets)
}
