//! The main window: a fixed 16:9 size, 90% of the screen's height, that cannot be resized.

use tauri::{LogicalPosition, LogicalSize, Runtime, WebviewWindow};

const ASPECT: f64 = 16.0 / 9.0;
const HEIGHT_SHARE: f64 = 0.9;
// On a screen narrower than 16:9 the height gives way, so the window still fits across.
const MAX_WIDTH_SHARE: f64 = 0.96;

/// Window size (width, height) in logical pixels for a screen of the given logical size.
pub fn fit_16_9(screen_width: f64, screen_height: f64) -> (f64, f64) {
    let mut height = screen_height * HEIGHT_SHARE;
    let mut width = height * ASPECT;
    let max_width = screen_width * MAX_WIDTH_SHARE;
    if width > max_width {
        width = max_width;
        height = width / ASPECT;
    }
    (width.round(), height.round())
}

/// Sizes and centres the window for the screen it is on, locks that size, then shows it.
///
/// The window starts hidden and resizable (see tauri.conf.json): hidden so it never appears at a
/// different size first, and resizable because GTK will not shrink a window created as fixed-size
/// below its starting size. It is locked once it has its final size.
pub fn fit_to_screen<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    if let Some(monitor) = window.current_monitor()? {
        let scale = monitor.scale_factor();
        let screen = monitor.size().to_logical::<f64>(scale);
        let origin = monitor.position().to_logical::<f64>(scale);
        let (width, height) = fit_16_9(screen.width, screen.height);
        let size = LogicalSize::new(width, height);

        window.set_size(size)?;
        // Some Linux window managers ignore `resizable`; equal min and max sizes hold it anyway.
        window.set_min_size(Some(size))?;
        window.set_max_size(Some(size))?;
        window.set_position(LogicalPosition::new(
            origin.x + (screen.width - width) / 2.0,
            origin.y + (screen.height - height) / 2.0,
        ))?;
    }
    window.set_resizable(false)?;
    window.set_maximizable(false)?;
    window.show()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn takes_90_percent_of_the_height_at_16_9() {
        assert_eq!(fit_16_9(1920.0, 1080.0), (1728.0, 972.0));
        assert_eq!(fit_16_9(2560.0, 1440.0), (2304.0, 1296.0));
    }

    #[test]
    fn keeps_16_9_on_a_narrow_screen_by_giving_up_height() {
        // 4:3: 90% of the height would make the window wider than the screen.
        let (width, height) = fit_16_9(1024.0, 768.0);
        assert!(width <= 1024.0 * MAX_WIDTH_SHARE + 0.5);
        assert!((width / height - ASPECT).abs() < 0.01);
        assert!(height < 768.0 * HEIGHT_SHARE);
    }

    #[test]
    fn is_always_16_9_and_fits() {
        for (w, h) in [(1366.0, 768.0), (1280.0, 1024.0), (3440.0, 1440.0), (1440.0, 900.0)] {
            let (width, height) = fit_16_9(w, h);
            assert!((width / height - ASPECT).abs() < 0.01, "{w}x{h}");
            assert!(width <= w && height <= h * HEIGHT_SHARE + 0.5, "{w}x{h}");
        }
    }
}
