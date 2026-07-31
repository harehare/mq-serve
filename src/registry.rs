use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// A single running mq-serve instance, tracked in a shared registry file so
/// that any invocation of the CLI (regardless of cwd or port) can discover
/// every server currently running on the machine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryEntry {
    pub port: u16,
    pub pid: u32,
    pub bind: String,
    pub started_at: u64,
}

pub fn registry_file_path() -> PathBuf {
    std::env::temp_dir().join("mq-serve-registry.json")
}

fn read_all() -> Vec<RegistryEntry> {
    let Ok(content) = std::fs::read_to_string(registry_file_path()) else {
        return vec![];
    };
    serde_json::from_str(&content).unwrap_or_default()
}

fn write_all(entries: &[RegistryEntry]) {
    if let Ok(json) = serde_json::to_string_pretty(entries) {
        let _ = std::fs::write(registry_file_path(), json);
    }
}

#[cfg(unix)]
pub fn is_process_alive(pid: u32) -> bool {
    std::process::Command::new("kill")
        .args(["-0", &pid.to_string()])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(not(unix))]
pub fn is_process_alive(pid: u32) -> bool {
    std::process::Command::new("tasklist")
        .args(["/FI", &format!("PID eq {}", pid)])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
        .unwrap_or(false)
}

/// Registers (or re-registers) a running server.
pub fn register(port: u16, pid: u32, bind: &str) {
    let mut entries = read_all();
    entries.retain(|e| e.port != port);
    let started_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    entries.push(RegistryEntry {
        port,
        pid,
        bind: bind.to_string(),
        started_at,
    });
    write_all(&entries);
}

/// Removes a server from the registry (call before the owning process exits).
pub fn unregister(port: u16) {
    let mut entries = read_all();
    entries.retain(|e| e.port != port);
    write_all(&entries);
}

/// Returns all servers whose process is still alive, pruning stale entries
/// (crashed / killed processes) from the registry file as a side effect.
pub fn list_live() -> Vec<RegistryEntry> {
    let entries = read_all();
    let (live, dead): (Vec<_>, Vec<_>) = entries.into_iter().partition(|e| is_process_alive(e.pid));
    if !dead.is_empty() {
        write_all(&live);
    }
    live
}
