use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=frontend/src");
    println!("cargo:rerun-if-changed=frontend/index.html");
    println!("cargo:rerun-if-changed=vite.config.ts");
    println!("cargo:rerun-if-changed=package.json");

    let pnpm = if cfg!(target_os = "windows") {
        "pnpm.cmd"
    } else {
        "pnpm"
    };

    // pnpm install (no-op if already up to date)
    let status = Command::new(pnpm)
        .args(["install"])
        .status()
        .unwrap_or_else(|e| {
            panic!("Failed to run `pnpm install`: {e}\nPlease install pnpm: npm install -g pnpm")
        });
    assert!(status.success(), "pnpm install failed");

    // Build frontend with Vite
    let status = Command::new(pnpm)
        .args(["run", "build"])
        .status()
        .unwrap_or_else(|e| panic!("Failed to run `pnpm run build`: {e}"));
    assert!(status.success(), "pnpm run build failed");
}
