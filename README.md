<h1 align="center">mq-serve</h1>

A browser-based Markdown viewer with [mq](https://github.com/harehare/mq) query support.
Start a local server from the CLI, open your Markdown files in the browser, and filter or transform them with mq queries in real time.

![demo](assets/image.jpg)

## Features

- Browser viewer: Renders Markdown in the browser with GitHub-style styling
- mq queries: Filter and transform Markdown with mq syntax (e.g. `.h`, `.code`)
- Mermaid diagrams: Renders ` ```mermaid ` code blocks as diagrams automatically
- Syntax highlighting: Code blocks highlighted
- File watch: Detects file changes and reloads the browser automatically

## Installation

### Quick Install

```bash
curl -sSL https://raw.githubusercontent.com/harehare/mq-serve/refs/heads/main/bin/install.sh | bash
```

The installer will:
- Download the latest mq binary for your platform
- Install it to `~/.local/bin/`
- Update your shell profile to add mq to your PATH

### Cargo

```sh
$ cargo install --git https://github.com/harehare/mq-serve.git
```

## Usage

`mq-serve` runs in the background by default — the command returns immediately and the shell is free straight away.

```bash
# Current directory (background, opens browser)
mq-serve

# Specific files or directories
mq-serve docs/ README.md

# Second call adds files to the already-running server
mq-serve CHANGELOG.md

# Pipe content from stdin
cat notes.md | mq-serve
some-command | mq-serve

# Custom port
mq-serve docs/ -p 8080

# Bind to all interfaces (e.g. inside Docker)
mq-serve docs/ --bind 0.0.0.0

# Run in the foreground (e.g. in a container or for debugging)
mq-serve docs/ --foreground
```

Open `http://localhost:7700` in your browser (opened automatically by default).

### Single server, multiple files

If a server is already running on the given port, subsequent `mq-serve` invocations add files to the existing session instead of starting a new one.

```bash
mq-serve README.md          # starts mq-serve in the background
mq-serve CHANGELOG.md       # adds the file to the running server
```

To use a completely separate session, use a different port:

```bash
mq-serve draft.md -p 7701
```

### Starting, stopping and restarting

```bash
mq-serve --status           # show running server info (URL, version, PID, file count)
mq-serve --stop             # stop the server on the default port
mq-serve --restart          # restart the server (session is preserved)
mq-serve --clear            # clear the saved session (restarts server if running)
mq-serve --stop -p 7701     # stop/restart/clear on a specific port
```

## Options

```
Arguments:
  [FILES_OR_DIRS]   Markdown files or directories to serve [default: current directory]

Options:
  -p, --port <PORT>   Port to listen on [default: 7700]
  -b, --bind <BIND>   Address to bind to [default: 127.0.0.1]
  --no-open           Do not automatically open the browser
  --no-watch          Disable file-change watching
  -f, --foreground    Run in the foreground instead of the background
  --stop              Stop the background server running on the given port
  --restart           Restart the background server running on the given port
  --status            Show the status of the server running on the given port
  --clear             Clear the saved session (restarts server if running)
  -h, --help          Print help
  -V, --version       Print version
```

## mq Query Examples

| Query            | Effect                                    |
| ---------------- | ----------------------------------------- |
| `.h`             | Extract all headings                      |
| `.code`          | Extract all code blocks                   |
| `.p`             | Extract all paragraphs                    |
| `.h \| upcase()` | Extract headings and convert to uppercase |

Enter a query in the bar at the top of the page and press Enter.
Click **Clear** to reset to the original content.

## Development

```bash
just build-dev
just run -- ../mq/docs
```

## License

MIT
