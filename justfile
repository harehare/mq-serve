# mq-serve build & dev commands

# Default: list available recipes
default:
    @just --list

# Install npm dependencies
install:
    pnpm install

# Build frontend (Vite) + Rust binary
build: install
    pnpm run build
    cargo build --release

# Build in debug mode (faster)
build-dev: install
    pnpm run build
    cargo build

# Build only the frontend
build-frontend: install
    pnpm run build

# Build only the Rust binary (assumes frontend is already built)
build-rust:
    cargo build --release

# Run in dev mode against the current directory
run *ARGS:
    cargo run -- {{ARGS}}

# Run the release binary
run-release *ARGS:
    cargo run --release -- {{ARGS}}

# Watch frontend changes and rebuild (for development)
watch-frontend:
    pnpm exec vite build --watch

# Run clippy
lint:
    cargo clippy

# Format Rust code
fmt:
    cargo fmt

# Clean build artifacts
clean:
    cargo clean
    rm -rf assets/dist

# Clean everything including node_modules
clean-all: clean
    rm -rf node_modules
