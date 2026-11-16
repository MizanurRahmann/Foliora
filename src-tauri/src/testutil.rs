//! Helpers shared by tests that need real files.

use std::path::{Path, PathBuf};
use lopdf::{Document, Object, Stream, dictionary};
use uuid::Uuid;

pub struct TempDir(pub PathBuf);

impl TempDir {
    pub fn new() -> Self {
        let path = std::env::temp_dir().join(format!("foliora-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&path).unwrap();
        TempDir(path)
    }

    pub fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Writes a small valid PDF with `pages` blank pages and returns its path.
pub fn make_pdf(dir: &Path, name: &str, pages: u32, title: Option<&str>, author: Option<&str>) -> PathBuf {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();

    let kids: Vec<Object> = (0..pages)
        .map(|index| {
            // The page text differs per file so documents with equal page counts still hash apart.
            let content = format!("BT /F1 12 Tf 10 10 Td ({name} {index}) Tj ET");
            let content_id = doc.add_object(Stream::new(dictionary! {}, content.into_bytes()));
            doc.add_object(dictionary! {
                "Type" => "Page",
                "Parent" => pages_id,
                "Contents" => content_id,
                "MediaBox" => vec![0.into(), 0.into(), 200.into(), 200.into()],
            })
            .into()
        })
        .collect();

    doc.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => kids,
            "Count" => pages,
        }),
    );
    let catalog_id = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    doc.trailer.set("Root", catalog_id);

    let mut info = lopdf::Dictionary::new();
    if let Some(title) = title {
        info.set("Title", Object::string_literal(title));
    }
    if let Some(author) = author {
        info.set("Author", Object::string_literal(author));
    }
    let info_id = doc.add_object(info);
    doc.trailer.set("Info", info_id);

    let path = dir.join(name);
    doc.save(&path).unwrap();
    path
}
