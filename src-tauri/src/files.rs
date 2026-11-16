//! Everything that touches PDF files on disk: inspection, the managed copy folder and cleanup.

use std::collections::HashSet;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Serialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfInfo {
    pub title: Option<String>,
    pub author: Option<String>,
    pub page_count: u32,
    pub size_bytes: u64,
    pub hash: String,
    pub file_name: String,
}

fn invalid(message: &str) -> AppError {
    AppError::InvalidPdf(message.to_owned())
}

/// Validates that `path` is a readable PDF and returns its metadata and content hash.
pub fn inspect(path: &Path) -> AppResult<PdfInfo> {
    if !path.is_absolute() {
        return Err(invalid("The file path must be absolute"));
    }
    let is_pdf_name = path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"));
    if !is_pdf_name {
        return Err(invalid("Only .pdf files can be added"));
    }

    let metadata = fs::metadata(path).map_err(|_| AppError::FileMissing)?;
    if !metadata.is_file() {
        return Err(invalid("This is not a file"));
    }

    let mut header = [0u8; 5];
    let is_pdf = File::open(path)?.read_exact(&mut header).is_ok() && &header == b"%PDF-";
    if !is_pdf {
        return Err(invalid("This file is not a PDF"));
    }

    let parsed = lopdf::Document::load_metadata(path).map_err(|_| {
        invalid("This PDF could not be read. It may be damaged or password-protected")
    })?;
    if parsed.page_count == 0 {
        return Err(invalid("This PDF has no pages"));
    }

    let clean = |value: Option<String>| value.map(|v| v.trim().to_owned()).filter(|v| !v.is_empty());
    Ok(PdfInfo {
        title: clean(parsed.title),
        author: clean(parsed.author),
        page_count: parsed.page_count,
        size_bytes: metadata.len(),
        hash: sha256_hex(path)?,
        file_name: path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default(),
    })
}

pub fn sha256_hex(path: &Path) -> AppResult<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect())
}

/// Resolves a stored file name inside the managed folder, refusing anything that could escape it.
pub fn managed_path(dir: &Path, name: &str) -> AppResult<PathBuf> {
    let is_plain_name = !name.is_empty()
        && name.ends_with(".pdf")
        && !name.contains(['/', '\\'])
        && !name.starts_with('.');
    if !is_plain_name {
        return Err(AppError::Validation("The stored file name is not valid".into()));
    }
    Ok(dir.join(name))
}

/// Copies `source` into `dir` under a generated name and returns that name. The file only appears
/// under its final name once it is complete.
pub fn copy_into(source: &Path, dir: &Path) -> AppResult<String> {
    fs::create_dir_all(dir)?;
    let name = format!("{}.pdf", Uuid::new_v4());
    let temp = dir.join(format!("{name}.tmp"));
    let target = dir.join(&name);

    let result = fs::copy(source, &temp).and_then(|_| fs::rename(&temp, &target));
    if let Err(err) = result {
        let _ = fs::remove_file(&temp);
        return Err(err.into());
    }
    Ok(name)
}

pub fn remove_managed(dir: &Path, name: &str) -> AppResult<()> {
    match fs::remove_file(managed_path(dir, name)?) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err.into()),
    }
}

/// Files the user chose to keep after removing a book start with this, so `sweep` skips them.
const KEPT_PREFIX: &str = "kept-";

/// Detaches a stored copy from its (removed) book without deleting it. Returns the new file name.
pub fn keep_managed(dir: &Path, name: &str) -> AppResult<Option<String>> {
    let kept = format!("{KEPT_PREFIX}{name}");
    match fs::rename(managed_path(dir, name)?, managed_path(dir, &kept)?) {
        Ok(()) => Ok(Some(kept)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.into()),
    }
}

/// Deletes leftovers of interrupted imports: temp files and files no book refers to.
/// Files kept after a book was removed (see `keep_managed`) are left alone.
pub fn sweep(dir: &Path, referenced: &HashSet<String>) -> AppResult<usize> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Ok(0);
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        let is_file = entry.file_type().is_ok_and(|kind| kind.is_file());
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_kept = name.starts_with(KEPT_PREFIX) && !name.ends_with(".tmp");
        if is_file && !is_kept && !referenced.contains(&name) && fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

/// Tauri state holding the managed folder for copied PDFs.
pub struct Storage(pub PathBuf);

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::{TempDir, make_pdf};

    #[test]
    fn inspects_a_pdf() {
        let dir = TempDir::new();
        let path = make_pdf(dir.path(), "book.pdf", 3, Some("  My Book "), Some("Ann Author"));

        let info = inspect(&path).unwrap();
        assert_eq!(info.title.as_deref(), Some("My Book"));
        assert_eq!(info.author.as_deref(), Some("Ann Author"));
        assert_eq!(info.page_count, 3);
        assert_eq!(info.file_name, "book.pdf");
        assert_eq!(info.size_bytes, fs::metadata(&path).unwrap().len());
        assert_eq!(info.hash.len(), 64);
    }

    #[test]
    fn missing_metadata_is_none() {
        let dir = TempDir::new();
        let path = make_pdf(dir.path(), "plain.pdf", 1, None, None);

        let info = inspect(&path).unwrap();
        assert_eq!((info.title, info.author), (None, None));
    }

    #[test]
    fn same_content_gives_the_same_hash_and_different_content_does_not() {
        let dir = TempDir::new();
        let a = make_pdf(dir.path(), "a.pdf", 2, None, None);
        let copy = dir.path().join("copy.pdf");
        fs::copy(&a, &copy).unwrap();
        let other = make_pdf(dir.path(), "other.pdf", 2, None, None);

        assert_eq!(inspect(&a).unwrap().hash, inspect(&copy).unwrap().hash);
        assert_ne!(inspect(&a).unwrap().hash, inspect(&other).unwrap().hash);
    }

    #[test]
    fn sha256_matches_a_known_value() {
        let dir = TempDir::new();
        let path = dir.path().join("abc.txt");
        fs::write(&path, "abc").unwrap();
        assert_eq!(
            sha256_hex(&path).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn rejects_files_that_are_not_pdfs() {
        let dir = TempDir::new();
        let text = dir.path().join("fake.pdf");
        fs::write(&text, "just some text").unwrap();
        let wrong_ext = dir.path().join("book.txt");
        fs::write(&wrong_ext, "%PDF-1.5").unwrap();
        let truncated = dir.path().join("broken.pdf");
        fs::write(&truncated, "%PDF-1.5\n1 0 obj << /Broken").unwrap();

        for path in [text, wrong_ext, truncated, dir.path().to_path_buf()] {
            let err = inspect(&path).unwrap_err();
            assert!(matches!(err, AppError::InvalidPdf(_)), "{path:?}: {err:?}");
        }
    }

    #[test]
    fn rejects_relative_and_missing_paths() {
        assert!(matches!(inspect(Path::new("book.pdf")).unwrap_err(), AppError::InvalidPdf(_)));

        let dir = TempDir::new();
        let err = inspect(&dir.path().join("gone.pdf")).unwrap_err();
        assert!(matches!(err, AppError::FileMissing));
    }

    #[test]
    fn copy_into_creates_the_final_file_and_no_temp_file() {
        let dir = TempDir::new();
        let source = make_pdf(dir.path(), "book.pdf", 1, None, None);
        let managed = dir.path().join("books");

        let name = copy_into(&source, &managed).unwrap();
        assert!(name.ends_with(".pdf"));
        assert_eq!(fs::read(managed.join(&name)).unwrap(), fs::read(&source).unwrap());

        let entries: Vec<_> = fs::read_dir(&managed).unwrap().flatten().collect();
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn failed_copy_leaves_nothing_behind() {
        let dir = TempDir::new();
        let managed = dir.path().join("books");

        assert!(copy_into(&dir.path().join("nope.pdf"), &managed).is_err());
        assert_eq!(fs::read_dir(&managed).unwrap().count(), 0);
    }

    #[test]
    fn managed_path_refuses_names_that_could_escape() {
        let dir = Path::new("/data/books");
        for bad in ["", "../x.pdf", "a/b.pdf", "a\\b.pdf", "/etc/passwd", ".hidden.pdf", "book.txt"] {
            assert!(managed_path(dir, bad).is_err(), "{bad:?}");
        }
        assert_eq!(managed_path(dir, "abc.pdf").unwrap(), dir.join("abc.pdf"));
    }

    #[test]
    fn remove_managed_is_idempotent() {
        let dir = TempDir::new();
        let source = make_pdf(dir.path(), "book.pdf", 1, None, None);
        let name = copy_into(&source, &dir.path().join("books")).unwrap();

        remove_managed(&dir.path().join("books"), &name).unwrap();
        remove_managed(&dir.path().join("books"), &name).unwrap();
        assert!(!dir.path().join("books").join(&name).exists());
    }

    #[test]
    fn sweep_removes_temp_and_unreferenced_files_only() {
        let dir = TempDir::new();
        let managed = dir.path();
        fs::write(managed.join("keep.pdf"), "x").unwrap();
        fs::write(managed.join("orphan.pdf"), "x").unwrap();
        fs::write(managed.join("half.pdf.tmp"), "x").unwrap();

        let keep = HashSet::from(["keep.pdf".to_owned()]);
        assert_eq!(sweep(managed, &keep).unwrap(), 2);

        assert!(managed.join("keep.pdf").exists());
        assert!(!managed.join("orphan.pdf").exists());
        assert!(!managed.join("half.pdf.tmp").exists());
    }

    #[test]
    fn kept_files_survive_the_sweep() {
        let dir = TempDir::new();
        let source = make_pdf(dir.path(), "book.pdf", 1, None, None);
        let managed = dir.path().join("books");
        let name = copy_into(&source, &managed).unwrap();

        let kept = keep_managed(&managed, &name).unwrap().unwrap();
        assert!(!managed.join(&name).exists());
        assert!(managed.join(&kept).exists());

        sweep(&managed, &HashSet::new()).unwrap();
        assert!(managed.join(&kept).exists());
        assert_eq!(keep_managed(&managed, &name).unwrap(), None);
    }

    #[test]
    fn sweep_ignores_a_missing_folder() {
        let dir = TempDir::new();
        assert_eq!(sweep(&dir.path().join("none"), &HashSet::new()).unwrap(), 0);
    }
}
