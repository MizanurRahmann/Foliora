use serde::ser::{Serialize, SerializeStruct, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("The shelf position is already occupied")]
    SlotOccupied,
    #[error("The item does not fit within the shelf")]
    ExceedsCapacity,
    #[error("The capacity is smaller than the space already in use")]
    CapacityTooSmall,
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

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::SlotOccupied => "SLOT_OCCUPIED",
            AppError::ExceedsCapacity => "EXCEEDS_CAPACITY",
            AppError::CapacityTooSmall => "CAPACITY_TOO_SMALL",
            AppError::Constraint(_) => "CONSTRAINT",
            AppError::Database(_) => "DATABASE",
            AppError::Io(_) => "IO",
            AppError::DbTooNew { .. } => "DB_TOO_NEW",
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
                "Capacity is smaller than occupied space" => return AppError::CapacityTooSmall,
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
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}
