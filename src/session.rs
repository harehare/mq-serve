use std::path::PathBuf;

pub fn session_file_path(port: u16) -> PathBuf {
    std::env::temp_dir().join(format!("mq-serve-{}-session.json", port))
}

pub fn save_session(port: u16, paths: &[PathBuf]) {
    let serializable: Vec<String> = paths
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    if let Ok(json) = serde_json::to_string(&serializable) {
        let _ = std::fs::write(session_file_path(port), json);
    }
}

pub fn load_session(port: u16) -> Vec<PathBuf> {
    let path = session_file_path(port);
    let Ok(content) = std::fs::read_to_string(&path) else {
        return vec![];
    };
    let Ok(strings): Result<Vec<String>, _> = serde_json::from_str(&content) else {
        return vec![];
    };
    strings
        .into_iter()
        .map(PathBuf::from)
        .filter(|p| p.exists())
        .collect()
}
