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

    if let Some(parent) = std::path::Path::new(file_path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let mut file = File::create(file_path).map_err(|e| e.to_string())?;

    for item in items {
        let name = if item.name.chars().count() > 20 {
            let truncated: String = item.name.chars().take(20).collect();
            format!("{}...", truncated)
        } else {
            item.name.clone()
        };

        for _ in 0..item.qty {
            writeln!(file, "{},{},{},{}", item.code, name, item.price, item.barcode)
                .map_err(|e| e.to_string())?;
        }
    }

    Command::new("cmd")
        .args(["/C", "start", "", &config.template_file_path])
        .spawn()
        .map_err(|e| format!("Failed to open template: {}", e))?;

    Ok("Success".to_string())
}

#[tauri::command]
fn fetch_locations() -> Result<serde_json::Value, String> {
    let config = config::get_config()?;

    println!("Fetching locations from: {}", config.locations_api_url);

    let response = reqwest::blocking::get(&config.locations_api_url)
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = response.json().map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
fn login(
    name: String,
    password: String,
    location: Option<String>,
) -> Result<serde_json::Value, String> {
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

    let response = client
        .post(&config.login_api_url)
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let err_json: serde_json::Value = response.json().unwrap_or_default();
        let msg = err_json
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Login failed");
        return Err(msg.to_string());
    }

    let json: serde_json::Value = response.json().map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
fn search_products(
    term: &str,
    token: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let config = config::get_config()?;
    let url = format!("{}?search={}", config.search_api_url, term);

    println!("Searching products: {}", url);

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
        Ok(array.clone())
    } else if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
        Ok(data.clone())
    } else {
        Ok(vec![])
    }
}

fn parse_price_levels_response(
    response: reqwest::blocking::Response,
) -> Result<Vec<serde_json::Value>, String> {
    if !response.status().is_success() {
        return Err(format!("Request failed with status: {}", response.status()));
    }

    let json: serde_json::Value = response.json().map_err(|e| e.to_string())?;

    if let Some(array) = json.as_array() {
        Ok(array.clone())
    } else if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
        Ok(data.clone())
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
fn fetch_price_levels(
    token: Option<String>,
    prod_code: String,
) -> Result<Vec<serde_json::Value>, String> {
    let config = config::get_config()?;
    let client = reqwest::blocking::Client::new();
    let code = prod_code.trim();
    if code.is_empty() {
        return Err("prod_code is required".to_string());
    }

    let mut request_url = reqwest::Url::parse(&config.price_levels_api_url)
        .map_err(|e| format!("Invalid PRICE_LEVELS_API_URL: {}", e))?;
    request_url.set_query(None);
    request_url
        .query_pairs_mut()
        .append_pair("prod_code", code);

    println!("Fetching price levels from: {}", request_url);
    let mut request = client.get(request_url);

    if let Some(t) = token.as_deref() {
        request = request.bearer_auth(t);
    }

    let response = request.send().map_err(|e| e.to_string())?;

    parse_price_levels_response(response)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            let _ = config::get_config();
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            print_labels,
            search_products,
            fetch_locations,
            login,
            fetch_price_levels
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}