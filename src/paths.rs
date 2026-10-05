//! Helpers for session roots, which are either plain files/directories or glob
//! patterns such as `/work/docs/**/*.md`.
//!
//! A pattern is stored as an absolute `PathBuf` whose non-glob prefix (the
//! "base") has been canonicalized, so it can live next to ordinary roots in the
//! session without any extra bookkeeping.

use std::path::{Component, Path, PathBuf};

use globset::{GlobBuilder, GlobMatcher};

fn has_glob_chars(s: &str) -> bool {
    s.contains(['*', '?', '[', '{'])
}

/// True when `path` is a glob pattern rather than an existing file or directory.
pub fn is_pattern(path: &Path) -> bool {
    has_glob_chars(&path.to_string_lossy()) && !path.exists()
}

/// Splits a pattern into its leading non-glob components and the remainder.
fn split_pattern(pattern: &Path) -> (PathBuf, PathBuf) {
    let mut base = PathBuf::new();
    let mut rest = PathBuf::new();
    for comp in pattern.components() {
        if !rest.as_os_str().is_empty() || has_glob_chars(&comp.as_os_str().to_string_lossy()) {
            rest.push(comp);
        } else {
            base.push(comp);
        }
    }
    (base, rest)
}

/// The directory a pattern is rooted at (its longest non-glob prefix).
pub fn pattern_base(pattern: &Path) -> PathBuf {
    split_pattern(pattern).0
}

/// Makes a CLI/API path comparable with the paths held in the session:
/// existing paths are canonicalized, patterns are made absolute and their base
/// is canonicalized. Anything else is returned unchanged.
pub fn normalize(path: &Path) -> PathBuf {
    if let Ok(canonical) = path.canonicalize() {
        return canonical;
    }
    if !has_glob_chars(&path.to_string_lossy()) {
        return path.to_path_buf();
    }

    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().unwrap_or_default().join(path)
    };
    let (base, rest) = split_pattern(&absolute);
    let base = base.canonicalize().unwrap_or_else(|_| lexical_clean(&base));
    base.join(rest)
}

/// Resolves `.` and `..` without touching the filesystem.
fn lexical_clean(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other),
        }
    }
    out
}

/// A root can be served if it exists, or if it is a pattern whose base exists.
pub fn is_live(path: &Path) -> bool {
    path.exists() || (is_pattern(path) && pattern_base(path).is_dir())
}

/// The directory to hand to the file watcher for a root.
pub fn watch_target(root: &Path) -> PathBuf {
    if is_pattern(root) {
        pattern_base(root)
    } else {
        root.to_path_buf()
    }
}

/// Compiles a pattern. `*` does not cross `/`; `**` does.
pub fn matcher(pattern: &Path) -> Option<GlobMatcher> {
    GlobBuilder::new(&pattern.to_string_lossy())
        .literal_separator(true)
        .build()
        .ok()
        .map(|g| g.compile_matcher())
}

/// Label for a root in the sidebar when no `--target` name was given.
pub fn display_name(root: &Path) -> Option<String> {
    if is_pattern(root) {
        let base = pattern_base(root);
        let parent = base.parent().unwrap_or(&base);
        return root
            .strip_prefix(parent)
            .ok()
            .map(|p| p.to_string_lossy().into_owned());
    }
    root.file_name().map(|n| n.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_pattern_at_first_glob_component() {
        let (base, rest) = split_pattern(Path::new("/work/docs/**/*.md"));
        assert_eq!(base, PathBuf::from("/work/docs"));
        assert_eq!(rest, PathBuf::from("**/*.md"));
    }

    #[test]
    fn plain_path_has_no_pattern() {
        assert!(!is_pattern(Path::new("/definitely/not/here.md")));
    }

    #[test]
    fn matcher_respects_separators() {
        let m = matcher(Path::new("/w/docs/*.md")).unwrap();
        assert!(m.is_match("/w/docs/a.md"));
        assert!(!m.is_match("/w/docs/sub/a.md"));
        let m = matcher(Path::new("/w/docs/**/*.md")).unwrap();
        assert!(m.is_match("/w/docs/sub/a.md"));
        assert!(m.is_match("/w/docs/a.md"));
    }

    #[test]
    fn normalize_makes_relative_pattern_absolute() {
        let n = normalize(Path::new("./src/**/*.rs"));
        assert!(n.is_absolute());
        assert!(n.ends_with("**/*.rs"));
        assert!(!n.to_string_lossy().contains("/./"));
    }

    #[test]
    fn display_name_uses_pattern_relative_to_base_parent() {
        assert_eq!(
            display_name(Path::new("/work/docs/**/*.md")).as_deref(),
            Some("docs/**/*.md")
        );
    }
}
