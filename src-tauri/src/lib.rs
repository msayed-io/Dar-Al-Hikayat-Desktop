use serde::Deserialize;
#[cfg(target_os = "windows")]
use std::process::Command;
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct WindowsPrayerTask {
    pub date: String,
    pub prayer_id: String,
    pub year: u32,
    pub month: u32,
    pub day: u32,
    pub hour: u32,
    pub minute: u32,
}

fn prayer_name(prayer_id: &str) -> &'static str {
    match prayer_id {
        "fajr" => "الفجر",
        "dhuhr" => "الظهر",
        "asr" => "العصر",
        "maghrib" => "المغرب",
        "isha" => "العشاء",
        _ => "الصلاة",
    }
}

#[cfg(target_os = "windows")]
fn task_name(task: &WindowsPrayerTask) -> String {
    format!("DarAlHikayat-Prayer-{}-{}", task.date, task.prayer_id)
}

#[cfg(target_os = "windows")]
fn refresh_task_name() -> &'static str {
    "DarAlHikayat-Prayer-Refresh"
}

#[cfg(target_os = "windows")]
fn run_schtasks(args: &[String]) -> Result<(), String> {
    let output = Command::new("schtasks.exe")
        .args(args)
        .output()
        .map_err(|error| format!("تعذر تشغيل Windows Task Scheduler: {error}"))?;
    if output.status.success() {
        return Ok(());
    }
    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
}

#[tauri::command]
fn sync_windows_prayer_tasks(tasks: Vec<WindowsPrayerTask>) -> Result<usize, String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = tasks;
        return Err("Windows Task Scheduler متاح فقط في نسخة Windows.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let exe = std::env::current_exe()
            .map_err(|error| format!("تعذر تحديد مسار التطبيق: {error}"))?
            .to_string_lossy()
            .replace('"', "\\\"");

        // Remove only this application's old one-shot tasks; unrelated user tasks are untouched.
        let query = Command::new("schtasks.exe")
            .args(["/Query", "/FO", "CSV", "/NH"])
            .output()
            .map_err(|error| format!("تعذر قراءة مهام Windows: {error}"))?;
        let query_text = String::from_utf8_lossy(&query.stdout);
        for line in query_text.lines() {
            let name = line.split(',').next().unwrap_or("").trim_matches('"');
            if name.contains("DarAlHikayat-Prayer-") {
                let _ = run_schtasks(&["/Delete".into(), "/TN".into(), name.into(), "/F".into()]);
            }
        }

        // A daily hidden refresh keeps the one-shot horizon alive even if the user never opens the UI.
        let refresh_action = format!("\"{}\" --dar-prayer-refresh", exe);
        run_schtasks(&[
            "/Create".into(), "/TN".into(), refresh_task_name().into(),
            "/TR".into(), refresh_action, "/SC".into(), "DAILY".into(),
            "/ST".into(), "00:05".into(), "/RL".into(), "LIMITED".into(), "/F".into(),
        ])?;

        let mut created = 0usize;
        for task in tasks {
            if task.month == 0 || task.month > 12 || task.day == 0 || task.day > 31 || task.hour > 23 || task.minute > 59 {
                continue;
            }
            let name = task_name(&task);
            let action = format!("\"{}\" --dar-prayer-notification {}", exe, task.prayer_id);
            // schtasks uses the interactive user's local Windows timezone and has one-minute granularity.
            let args = vec![
                "/Create".into(),
                "/TN".into(),
                name,
                "/TR".into(),
                action,
                "/SC".into(),
                "ONCE".into(),
                "/SD".into(),
                format!("{:02}/{:02}/{:04}", task.month, task.day, task.year),
                "/ST".into(),
                format!("{:02}:{:02}", task.hour, task.minute),
                "/RL".into(),
                "LIMITED".into(),
                "/F".into(),
            ];
            run_schtasks(&args)?;
            created += 1;
        }
        Ok(created)
    }
}

#[tauri::command]
fn is_prayer_notification_process() -> bool {
    std::env::args().any(|argument| argument == "--dar-prayer-notification")
}

#[tauri::command]
fn is_prayer_refresh_process() -> bool {
    std::env::args().any(|argument| argument == "--dar-prayer-refresh")
}

#[tauri::command]
fn is_silent_process() -> bool {
    std::env::args().any(|argument| argument == "--dar-prayer-notification" || argument == "--dar-prayer-refresh")
}

#[tauri::command]
fn exit_silent_process(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![sync_windows_prayer_tasks, is_prayer_notification_process, is_prayer_refresh_process, is_silent_process, exit_silent_process])
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            if let Some(index) = args.iter().position(|argument| argument == "--dar-prayer-notification") {
                let prayer_id = args.get(index + 1).map(String::as_str).unwrap_or("prayer");
                let title = format!("حان الآن وقت صلاة {}", prayer_name(prayer_id));
                let body = "تقبّل الله طاعتكم.";
                app.notification()
                    .builder()
                    .title(title)
                    .body(body)
                    .show()
                    .map_err(|error| format!("تعذر إرسال إشعار الصلاة: {error}"))?;
                // The notification plugin dispatches the Windows toast asynchronously.
                // Keep this short-lived worker alive long enough for the dispatch to complete.
                std::thread::sleep(Duration::from_millis(1_500));
                app.handle().exit(0);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Dar Al-Hikayat");
}
