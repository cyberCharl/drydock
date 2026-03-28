use anyhow::Result;
use clap::ValueEnum;
use serde_json::{Map, Value};

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum OutputFormat {
    Json,
    Table,
    Quiet,
}

pub fn print_value(value: &Value, format: OutputFormat) -> Result<()> {
    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(value)?);
        }
        OutputFormat::Table => {
            print_table_value(value);
        }
        OutputFormat::Quiet => {
            print_quiet_value(value);
        }
    }

    Ok(())
}

fn print_table_value(value: &Value) {
    if let Some(data) = value.get("data") {
        render_value(data);

        if let Some(pagination) = value.get("pagination").and_then(Value::as_object) {
            let limit = pagination.get("limit").unwrap_or(&Value::Null);
            let offset = pagination.get("offset").unwrap_or(&Value::Null);
            let total = pagination.get("total").unwrap_or(&Value::Null);

            println!(
                "\nlimit={} offset={} total={}",
                stringify_cell(limit),
                stringify_cell(offset),
                stringify_cell(total)
            );
        }

        return;
    }

    render_value(value);
}

fn render_value(value: &Value) {
    match value {
        Value::Null => {}
        Value::Bool(_) | Value::Number(_) | Value::String(_) => {
            println!("{}", stringify_cell(value));
        }
        Value::Array(rows) => render_array(rows),
        Value::Object(map) => render_object(map),
    }
}

fn render_array(rows: &[Value]) {
    if rows.is_empty() {
        println!("(empty)");
        return;
    }

    let Some(first) = rows.first().and_then(Value::as_object) else {
        for row in rows {
            println!("{}", stringify_cell(row));
        }
        return;
    };

    let mut headers = Vec::new();
    for key in first.keys() {
        headers.push(key.clone());
    }

    for row in rows.iter().skip(1) {
        if let Some(map) = row.as_object() {
            for key in map.keys() {
                if !headers.iter().any(|header| header == key) {
                    headers.push(key.clone());
                }
            }
        }
    }

    let body = rows
        .iter()
        .map(|row| {
            headers
                .iter()
                .map(|header| {
                    row.get(header)
                        .map(stringify_cell)
                        .unwrap_or_else(String::new)
                })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    print_grid(&headers, &body);
}

fn render_object(map: &Map<String, Value>) {
    if map.is_empty() {
        println!("(empty)");
        return;
    }

    let rows = map
        .iter()
        .map(|(key, value)| vec![key.clone(), stringify_cell(value)])
        .collect::<Vec<_>>();

    print_grid(&["field".to_string(), "value".to_string()], &rows);
}

fn print_grid(headers: &[String], rows: &[Vec<String>]) {
    let mut widths = headers
        .iter()
        .map(|header| header.len())
        .collect::<Vec<_>>();

    for row in rows {
        for (index, cell) in row.iter().enumerate() {
            widths[index] = widths[index].max(cell.len());
        }
    }

    let header_row = headers
        .iter()
        .enumerate()
        .map(|(index, header)| format!("{:<width$}", header, width = widths[index]))
        .collect::<Vec<_>>()
        .join(" | ");
    println!("{header_row}");

    let separator = widths
        .iter()
        .map(|width| "-".repeat(*width))
        .collect::<Vec<_>>()
        .join("-+-");
    println!("{separator}");

    for row in rows {
        let line = row
            .iter()
            .enumerate()
            .map(|(index, cell)| format!("{:<width$}", cell, width = widths[index]))
            .collect::<Vec<_>>()
            .join(" | ");
        println!("{line}");
    }
}

fn print_quiet_value(value: &Value) {
    let target = value.get("data").unwrap_or(value);

    match target {
        Value::Array(items) => {
            for item in items {
                if let Some(id) = item.get("id") {
                    println!("{}", stringify_cell(id));
                }
            }
        }
        Value::Object(map) => {
            if let Some(id) = map.get("id") {
                println!("{}", stringify_cell(id));
            }
        }
        Value::Null => {}
        _ => println!("{}", stringify_cell(target)),
    }
}

fn stringify_cell(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::Bool(boolean) => boolean.to_string(),
        Value::Number(number) => number.to_string(),
        Value::String(string) => string.clone(),
        _ => serde_json::to_string(value).unwrap_or_else(|_| "<invalid json>".to_string()),
    }
}
