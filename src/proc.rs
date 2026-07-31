use std::path::PathBuf;

pub fn pid_file_path(port: u16) -> PathBuf {
    std::env::temp_dir().join(format!("mq-serve-{}.pid", port))
}

pub fn write_pid_file(port: u16, pid: u32) {
    let _ = std::fs::write(pid_file_path(port), pid.to_string());
}

/// Spawns a new background server process and returns its PID.
/// The child always gets --foreground and --no-open so the caller owns browser-open.
#[allow(clippy::too_many_arguments)]
pub fn spawn_background(
    port: u16,
    bind: &str,
    no_watch: bool,
    paths: &[PathBuf],
    target: Option<String>,
    allow_remote_access: bool,
) -> u32 {
    let exe = std::env::current_exe().expect("failed to get current executable path");
    let mut args = vec![
        "--foreground".to_string(),
        "--no-open".to_string(),
        "-p".to_string(),
        port.to_string(),
        "-b".to_string(),
        bind.to_string(),
    ];
    if no_watch {
        args.push("--no-watch".to_string());
    }
    if let Some(target) = target {
        args.push("--target".to_string());
        args.push(target);
    }
    if allow_remote_access {
        args.push("--dangerously-allow-remote-access".to_string());
    }
    for p in paths {
        args.push(p.to_string_lossy().into_owned());
    }

    #[allow(clippy::zombie_processes)]
    let child = std::process::Command::new(&exe)
        .args(&args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .expect("failed to spawn background process");

    child.id()
}

pub fn kill_pid(pid: u32) {
    #[cfg(unix)]
    {
        let _ = std::process::Command::new("kill")
            .arg(pid.to_string())
            .status();
    }
    #[cfg(not(unix))]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .status();
    }
}
