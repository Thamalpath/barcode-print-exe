use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppConfig {
    pub search_api_url: String,
    pub data_file_path: String,
    pub template_file_path: String,
    pub login_api_url: String,
    pub locations_api_url: String,
}

fn get_exe_dir_config_path() -> PathBuf {
    match std::env::current_exe() {
        Ok(exe_path) => {
            let mut path = exe_path;
            path.pop();
            path.join("config.txt")
        }
        Err(_) => PathBuf::from("config.txt"),
    }
}

pub fn get_config() -> Result<AppConfig, String> {
    let config_path = get_exe_dir_config_path();
    
    // Attempt to read and parse the file
    if let Ok(content) = fs::read_to_string(&config_path) {
        let mut config = AppConfig {
            search_api_url: String::new(),
            data_file_path: String::new(),
            template_file_path: String::new(),
            login_api_url: String::new(),
            locations_api_url: String::new(),
        };
        let mut count = 0;
        
        for line in content.lines() {
            let parts: Vec<&str> = line.splitn(2, '=').collect();
            if parts.len() == 2 {
                let key = parts[0].trim();
                let value = parts[1].trim();
                match key {
                    "SEARCH_API_URL" => { config.search_api_url = value.to_string(); count += 1; },
                    "DATA_FILE_PATH" => { config.data_file_path = value.to_string(); count += 1; },
                    "TEMPLATE_FILE_PATH" => { config.template_file_path = value.to_string(); count += 1; },
                    "LOGIN_API_URL" => { config.login_api_url = value.to_string(); count += 1; },
                    "LOCATIONS_API_URL" => { config.locations_api_url = value.to_string(); count += 1; },
                    _ => {}
                }
            }
        }
        
        // Return values ONLY if they were actually found in the file
        if count == 5 && !config.search_api_url.is_empty() {
            return Ok(config);
        }
    }

    // IF FILE IS MISSING OR INCOMPLETE:
    let template = "SEARCH_API_URL=https://venpaaapi.onimtaitsl.com/api/products/basic-search\n\
                    DATA_FILE_PATH=C:\\barcode\\venpaa_barcode.txt\n\
                    TEMPLATE_FILE_PATH=C:\\barcode\\STIC33X21.btw\n\
                    LOGIN_API_URL=https://venpaaapi.onimtaitsl.com/api/login\n\
                    LOCATIONS_API_URL=https://venpaaapi.onimtaitsl.com/api/locations";
    
    let _ = fs::write(&config_path, template);
    let _ = fs::create_dir_all(r"C:\barcode");

    Err("Configuration incomplete or file missing. A 'config.txt' has been created in the installation folder. Please verify the paths and restart the application.".to_string())
}
