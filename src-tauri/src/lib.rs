use std::fs::File;
use std::io::Write;
use std::process::Command;

mod config;

#[derive(serde::Deserialize)]
struct PrintItem {
    code: String,
    name: String,
    price: String,
    qty: i32,
    barcode: String,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn print_labels(items: Vec<PrintItem>) -> Result<String, String> {
    let config = config::get_config()?;
    let file_path = &config.data_file_path;
    
    // Create directory if it doesn't exist
    if let Some(parent) = std::path::Path::new(file_path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let mut file = File::create(file_path).map_err(|e| e.to_string())?;

    for item in items {
        // We write one line per item. If the user wants multiple copies, 
        // BarTender should be configured to use the 'Qty' column as the copy count.
        // Alternatively, we could loop item.qty times, but usually data sources have a Quantity field.
        let name = if item.name.chars().count() > 20 {
            let truncated: String = item.name.chars().take(20).collect();
            format!("{}...", truncated)
        } else {
            item.name.clone()
        };

        for _ in 0..item.qty {
             writeln!(file, "{},{},{},{}", item.code, name, item.price, item.barcode).map_err(|e| e.to_string())?;
        }
    }

    // Open the BarTender template
    Command::new("cmd")
        .args(["/C", "start", "", &config.template_file_path])
        .spawn()
        .map_err(|e| format!("Failed to open template: {}", e))?;

    Ok("Success".to_string())
}

#[derive(serde::Serialize, serde::Deserialize)]
struct Product {
    id: Option<i32>,
    prod_code: Option<String>,
    product_code: Option<String>,
    code: Option<String>,
    prod_name: Option<String>,
    product_name: Option<String>,
    product_name_en: Option<String>,
    name: Option<String>,
    selling_price: Option<String>,
    price: Option<String>,
    barcode: Option<String>,
}

#[tauri::command]
fn fetch_locations() -> Result<serde_json::Value, String> {
    let config = config::get_config()?;
    let response = reqwest::blocking::get(&config.locations_api_url)
        .map_err(|e| e.to_string())?;
    
    let json: serde_json::Value = response.json().map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
fn login(name: String, password: String, location: Option<String>) -> Result<serde_json::Value, String> {
    let config = config::get_config()?;
    let client = reqwest::blocking::Client::new();
    
    let mut body = serde_json::json!({
        "name": name,
        "password": password,
    });

    if let Some(loc) = location {
        if let Some(obj) = body.as_object_mut() {
            obj.insert("location".to_string(), serde_json::Value::String(loc.clone()));
            obj.insert("loca_code".to_string(), serde_json::Value::String(loc));
        }
    }

    let response = client.post(&config.login_api_url)
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let err_json: serde_json::Value = response.json().unwrap_or_default();
        let msg = err_json.get("message").and_then(|m| m.as_str()).unwrap_or("Login failed");
        return Err(msg.to_string());
    }

    let json: serde_json::Value = response.json().map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
fn search_products(term: &str, token: Option<String>) -> Result<Vec<Product>, String> {
    let config = config::get_config()?;
    let url = format!("{}?search={}", config.search_api_url, term);
    
    let client = reqwest::blocking::Client::new();
    let mut request = client.get(&url);
    
    if let Some(t) = token {
        request = request.bearer_auth(t);
    }

    let response = request.send().map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Request failed with status: {}", response.status()));
    }

    let json: serde_json::Value = response.json().map_err(|e| e.to_string())?;
    
    if let Some(array) = json.as_array() {
        serde_json::from_value(serde_json::Value::Array(array.clone())).map_err(|e| e.to_string())
    } else if let Some(data) = json.get("data") {
        serde_json::from_value(data.clone()).map_err(|e| e.to_string())
    } else {
        Ok(vec![])
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {let _ = config::get_config();
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, print_labels, search_products, fetch_locations, login])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
