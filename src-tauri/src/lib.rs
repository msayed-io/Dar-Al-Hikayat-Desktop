use tauri::webview::PageLoadEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let window = webview.window();
                let _ = window.show();
                let _ = window.set_focus();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Dar Al-Hikayat");
}
