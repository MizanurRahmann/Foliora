use serde::Serialize;
use serde::ser::{SerializeStruct, Serializer};
use serde_json::{Value, json};

/// An item that stops a shelf from being shrunk or deleted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockingItem {
    pub id: i64,
    pub title: Option<String>,
    pub start: i64,
    pub span: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("The shelf position is already occupied")]
    SlotOccupied,
    #[error("The item does not fit within the shelf")]
    ExceedsCapacity,
    // `min_capacity` is 0 when raised by the database trigger, which cannot say how much space is needed.
    #[error("{}", capacity_message(.min_capacity))]
    CapacityTooSmall {
        min_capacity: i64,
        blocking: Vec<BlockingItem>,
    },
    #[error("The shelf still holds {item_count} item(s). Move or remove them first")]
    ShelfNotEmpty { item_count: i64 },
    #[error("{0}")]
    Validation(String),
    #[error("{0} was not found")]
    NotFound(&'static str),
    #[error("{0}")]
    InvalidPdf(String),
    #[error("There is no free space on any shelf for this book")]
    NoSpace,
    #[error("The book would not fit where it stands. Free up the space next to it or move it first")]
    NoSpaceAtPosition,
    #[error("The book's PDF file could not be found")]
    FileMissing,
    #[error("This file is different from the one that was originally added")]
    FileChanged,
    #[error("The database change violates a data rule: {0}")]
    Constraint(String),
    #[error("Database error: {0}")]
    Database(String),
    #[error("File error: {0}")]
    Io(String),
    #[error("The library was created by a newer version of Foliora (schema {found}, supported {supported})")]
    DbTooNew { found: u32, supported: u32 },
}

pub type AppResult<T> = Result<T, AppError>;

fn capacity_message(min_capacity: &i64) -> String {
    if *min_capacity > 0 {
        format!("Capacity cannot be below {min_capacity} because items occupy up to slot {min_capacity}")
    } else {
        "The capacity is smaller than the space already in use".to_owned()
    }
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::SlotOccupied => "SLOT_OCCUPIED",
            AppError::ExceedsCapacity => "EXCEEDS_CAPACITY",
            AppError::CapacityTooSmall { .. } => "CAPACITY_TOO_SMALL",
            AppError::ShelfNotEmpty { .. } => "SHELF_NOT_EMPTY",
            AppError::Validation(_) => "VALIDATION",
            AppError::NotFound(_) => "NOT_FOUND",
            AppError::InvalidPdf(_) => "INVALID_PDF",
            AppError::NoSpace => "NO_SPACE",
            AppError::NoSpaceAtPosition => "NO_SPACE_AT_POSITION",
            AppError::FileMissing => "FILE_MISSING",
            AppError::FileChanged => "FILE_CHANGED",
            AppError::Constraint(_) => "CONSTRAINT",
            AppError::Database(_) => "DATABASE",
            AppError::Io(_) => "IO",
            AppError::DbTooNew { .. } => "DB_TOO_NEW",
        }
    }

    fn details(&self) -> Option<Value> {
        match self {
            AppError::CapacityTooSmall { min_capacity, blocking } if !blocking.is_empty() => {
                Some(json!({ "minCapacity": min_capacity, "items": blocking }))
            }
            AppError::ShelfNotEmpty { item_count } => Some(json!({ "itemCount": item_count })),
            _ => None,
        }
    }
}

// Messages raised by the triggers in migrations/0001_init.sql.
impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        if let rusqlite::Error::SqliteFailure(failure, message) = &err {
            let message = message.as_deref().unwrap_or_default();
            match message {
                "Shelf position is occupied" => return AppError::SlotOccupied,
                "Item exceeds shelf capacity" => return AppError::ExceedsCapacity,
                "Capacity is smaller than occupied space" => {
                    return AppError::CapacityTooSmall { min_capacity: 0, blocking: Vec::new() };
                }
                _ => {}
            }
            if failure.code == rusqlite::ErrorCode::ConstraintViolation {
                return AppError::Constraint(message.to_owned());
            }
        }
        AppError::Database(err.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err.to_string())
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let details = self.details();
        let mut state = serializer.serialize_struct("AppError", 2 + usize::from(details.is_some()))?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.to_string())?;
        if let Some(details) = &details {
            state.serialize_field("details", details)?;
        }
        state.end()
    }
}
