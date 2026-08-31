fn main() {
    #[cfg(feature = "cm_ss13")]
    if std::env::var_os("TAURI_CONFIG").is_none() {
        if let Ok(config) = std::fs::read_to_string("tauri.cm.conf.json") {
            println!("cargo:warning=Applying CM-SS13 config overlay");
            std::env::set_var("TAURI_CONFIG", config);
        }
        println!("cargo:rerun-if-changed=tauri.cm.conf.json");
    }

    tauri_build::build();
}
