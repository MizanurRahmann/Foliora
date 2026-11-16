use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;

use crate::error::{AppError, AppResult};

pub struct Db(pub Mutex<Connection>);

// Each entry is applied in its own transaction; `user_version` equals the number of applied entries.
const MIGRATIONS: &[&str] = &[include_str!("../../migrations/0001_init.sql")];

pub const SCHEMA_VERSION: u32 = MIGRATIONS.len() as u32;

const PRAGMAS: &str = "
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
";

pub fn open(path: &Path) -> AppResult<Connection> {
    let mut conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode = WAL;")?;
    conn.execute_batch(PRAGMAS)?;
    migrate(&mut conn, Some(path))?;
    Ok(conn)
}

#[cfg(test)]
pub fn open_in_memory() -> AppResult<Connection> {
    let mut conn = Connection::open_in_memory()?;
    conn.execute_batch(PRAGMAS)?;
    migrate(&mut conn, None)?;
    Ok(conn)
}

pub fn schema_version(conn: &Connection) -> AppResult<u32> {
    Ok(conn.query_row("PRAGMA user_version", [], |row| row.get(0))?)
}

/// `path` is the database file; when given, an existing library is backed up before it is migrated.
pub fn migrate(conn: &mut Connection, path: Option<&Path>) -> AppResult<()> {
    let current = schema_version(conn)?;

    if current > SCHEMA_VERSION {
        return Err(AppError::DbTooNew {
            found: current,
            supported: SCHEMA_VERSION,
        });
    }
    if current == SCHEMA_VERSION {
        return Ok(());
    }

    if let (true, Some(path)) = (current > 0, path) {
        backup(conn, path)?;
    }

    for (index, sql) in MIGRATIONS.iter().enumerate().skip(current as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        // `PRAGMA user_version = N` takes no bound parameters; N is a trusted index.
        tx.execute_batch(&format!("PRAGMA user_version = {}", index + 1))?;
        tx.commit()?;
    }
    Ok(())
}

fn backup(conn: &Connection, path: &Path) -> AppResult<()> {
    let mut backup_path = path.as_os_str().to_owned();
    backup_path.push(".bak");
    let backup_path = Path::new(&backup_path);

    // VACUUM INTO refuses to overwrite an existing file.
    if backup_path.exists() {
        std::fs::remove_file(backup_path)?;
    }
    conn.execute("VACUUM INTO ?1", [backup_path.to_string_lossy()])?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Health {
    pub schema_version: u32,
    pub shelf_count: u32,
}

pub fn health(conn: &Connection) -> AppResult<Health> {
    Ok(Health {
        schema_version: schema_version(conn)?,
        shelf_count: conn.query_row("SELECT COUNT(*) FROM shelves", [], |row| row.get(0))?,
    })
}

#[cfg(test)]
pub(crate) mod tests;
