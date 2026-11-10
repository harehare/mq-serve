use std::path::Path;
use std::process::Command;

fn main() {
    // The published crate ships the prebuilt `assets/dist` and excludes the
    // frontend sources, so there is nothing to build (and build scripts must
    // not modify the source directory during `cargo publish` verification).
    if !Path::new("frontend").is_dir() {
        return;
    }

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
