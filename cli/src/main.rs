mod api;
mod config;
mod output;

use anyhow::{anyhow, bail, Context, Result};
use api::ApiClient;
use clap::{Args, Parser, Subcommand};
use output::{print_value, OutputFormat};
use serde_json::{json, Map, Value};

use crate::config::load_config;

#[derive(Parser)]
#[command(name = "drydock")]
#[command(about = "CLI for the Drydock workbench API")]
struct Cli {
    #[arg(long, global = true, value_enum, default_value = "json")]
    format: OutputFormat,

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Items {
        #[command(subcommand)]
        command: ItemsCommand,
    },
    Tags {
        #[command(subcommand)]
        command: TagsCommand,
    },
    Runs {
        #[command(subcommand)]
        command: RunsCommand,
    },
    Init,
}

#[derive(Subcommand)]
enum ItemsCommand {
    List(ItemsListArgs),
    Get(ItemIdArgs),
    Create(CreateItemArgs),
    Update(UpdateItemArgs),
    Delete(ItemIdArgs),
    Children(ItemIdArgs),
    Changelog(ItemIdArgs),
}

#[derive(Subcommand)]
enum TagsCommand {
    List,
    Create(CreateTagArgs),
}

#[derive(Subcommand)]
enum RunsCommand {
    List(ItemIdArgs),
    Create(CreateRunArgs),
    Update(UpdateRunArgs),
}

#[derive(Args)]
struct ItemIdArgs {
    id: i64,
}

#[derive(Args)]
struct ItemsListArgs {
    #[arg(long)]
    status: Option<String>,

    #[arg(long)]
    priority: Option<String>,

    #[arg(long)]
    tag: Option<String>,

    #[arg(long)]
    parent: Option<i64>,

    #[arg(long = "created-by")]
    created_by: Option<String>,

    #[arg(long, default_value = "created_at")]
    sort: String,

    #[arg(long)]
    limit: Option<u64>,

    #[arg(long)]
    offset: Option<u64>,
}

#[derive(Args)]
struct CreateItemArgs {
    #[arg(long)]
    title: String,

    #[arg(long)]
    status: Option<String>,

    #[arg(long)]
    priority: Option<String>,

    #[arg(long)]
    description: Option<String>,

    #[arg(long)]
    parent: Option<i64>,

    #[arg(long = "tag")]
    tags: Vec<String>,
}

#[derive(Args)]
struct UpdateItemArgs {
    id: i64,

    #[arg(long)]
    title: Option<String>,

    #[arg(long)]
    status: Option<String>,

    #[arg(long)]
    priority: Option<String>,

    #[arg(long)]
    description: Option<String>,

    #[arg(long = "clear-description")]
    clear_description: bool,

    #[arg(long)]
    parent: Option<i64>,

    #[arg(long = "clear-parent")]
    clear_parent: bool,
}

#[derive(Args)]
struct CreateTagArgs {
    #[arg(long)]
    name: String,

    #[arg(long)]
    color: Option<String>,
}

#[derive(Args)]
struct CreateRunArgs {
    item_id: i64,

    #[arg(long)]
    agent: String,

    #[arg(long)]
    branch: Option<String>,
}

#[derive(Args)]
struct UpdateRunArgs {
    run_id: i64,

    #[arg(long)]
    status: Option<String>,

    #[arg(long = "pr-url")]
    pr_url: Option<String>,

    #[arg(long = "clear-pr-url")]
    clear_pr_url: bool,

    #[arg(long = "ci-status")]
    ci_status: Option<String>,

    #[arg(long)]
    notes: Option<String>,

    #[arg(long = "clear-notes")]
    clear_notes: bool,

    #[arg(long)]
    branch: Option<String>,

    #[arg(long = "clear-branch")]
    clear_branch: bool,
}

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("error: {error:#}");
        std::process::exit(1);
    }
}

async fn run() -> Result<()> {
    let cli = Cli::parse();
    let config = load_config()?;
    let client = ApiClient::new(config.clone())?;

    let output = match cli.command {
        Command::Items { command } => handle_items(&client, command).await?,
        Command::Tags { command } => handle_tags(&client, command).await?,
        Command::Runs { command } => handle_runs(&client, command).await?,
        Command::Init => handle_init(&client, &config.api_url).await?,
    };

    print_value(&output, cli.format)
}

async fn handle_items(client: &ApiClient, command: ItemsCommand) -> Result<Value> {
    match command {
        ItemsCommand::List(args) => {
            let mut query = Vec::new();
            push_query(&mut query, "status", args.status);
            push_query(&mut query, "priority", args.priority);
            push_query(&mut query, "tag", args.tag);
            push_query(&mut query, "parent_id", args.parent.map(|value| value.to_string()));
            push_query(&mut query, "created_by", args.created_by);
            push_query(&mut query, "sort", Some(args.sort));
            push_query(&mut query, "limit", args.limit.map(|value| value.to_string()));
            push_query(&mut query, "offset", args.offset.map(|value| value.to_string()));

            client.get_with_query("/items", &query).await
        }
        ItemsCommand::Get(args) => client.get(&format!("/items/{}", args.id)).await,
        ItemsCommand::Create(args) => {
            let mut body = Map::new();
            body.insert("title".to_string(), Value::String(args.title));

            if let Some(status) = args.status {
                body.insert("status".to_string(), Value::String(status));
            }

            if let Some(priority) = args.priority {
                body.insert("priority".to_string(), Value::String(priority));
            }

            if let Some(description) = args.description {
                body.insert("description".to_string(), Value::String(description));
            }

            if let Some(parent) = args.parent {
                body.insert("parent_id".to_string(), json!(parent));
            }

            let created = client.post("/items", Value::Object(body)).await?;
            let item_id = extract_data_id(&created)?;

            for tag_name in args.tags {
                let tag_id = ensure_tag_exists(client, &tag_name).await?;
                client
                    .post(
                        &format!("/items/{item_id}/tags"),
                        json!({
                            "tag_id": tag_id,
                        }),
                    )
                    .await?;
            }

            client.get(&format!("/items/{item_id}")).await
        }
        ItemsCommand::Update(args) => {
            if args.parent.is_some() && args.clear_parent {
                bail!("--parent and --clear-parent are mutually exclusive");
            }

            if args.description.is_some() && args.clear_description {
                bail!("--description and --clear-description are mutually exclusive");
            }

            let mut body = Map::new();

            if let Some(title) = args.title {
                body.insert("title".to_string(), Value::String(title));
            }

            if let Some(status) = args.status {
                body.insert("status".to_string(), Value::String(status));
            }

            if let Some(priority) = args.priority {
                body.insert("priority".to_string(), Value::String(priority));
            }

            if let Some(description) = args.description {
                body.insert("description".to_string(), Value::String(description));
            } else if args.clear_description {
                body.insert("description".to_string(), Value::Null);
            }

            if let Some(parent) = args.parent {
                body.insert("parent_id".to_string(), json!(parent));
            } else if args.clear_parent {
                body.insert("parent_id".to_string(), Value::Null);
            }

            if body.is_empty() {
                bail!("no item fields were provided to update");
            }

            client
                .patch(&format!("/items/{}", args.id), Value::Object(body))
                .await
        }
        ItemsCommand::Delete(args) => client.delete(&format!("/items/{}", args.id)).await,
        ItemsCommand::Children(args) => client.get(&format!("/items/{}/children", args.id)).await,
        ItemsCommand::Changelog(args) => {
            client.get(&format!("/items/{}/changelog", args.id)).await
        }
    }
}

async fn handle_tags(client: &ApiClient, command: TagsCommand) -> Result<Value> {
    match command {
        TagsCommand::List => client.get("/tags").await,
        TagsCommand::Create(args) => {
            let mut body = Map::new();
            body.insert("name".to_string(), Value::String(args.name));

            if let Some(color) = args.color {
                body.insert("color".to_string(), Value::String(color));
            }

            client.post("/tags", Value::Object(body)).await
        }
    }
}

async fn handle_runs(client: &ApiClient, command: RunsCommand) -> Result<Value> {
    match command {
        RunsCommand::List(args) => client.get(&format!("/items/{}/runs", args.id)).await,
        RunsCommand::Create(args) => {
            client
                .post(
                    &format!("/items/{}/runs", args.item_id),
                    json!({
                        "agent": args.agent,
                        "branch": args.branch,
                    }),
                )
                .await
        }
        RunsCommand::Update(args) => {
            if args.pr_url.is_some() && args.clear_pr_url {
                bail!("--pr-url and --clear-pr-url are mutually exclusive");
            }

            if args.notes.is_some() && args.clear_notes {
                bail!("--notes and --clear-notes are mutually exclusive");
            }

            if args.branch.is_some() && args.clear_branch {
                bail!("--branch and --clear-branch are mutually exclusive");
            }

            let mut body = Map::new();

            if let Some(status) = args.status {
                body.insert("status".to_string(), Value::String(status));
            }

            if let Some(pr_url) = args.pr_url {
                body.insert("pr_url".to_string(), Value::String(pr_url));
            } else if args.clear_pr_url {
                body.insert("pr_url".to_string(), Value::Null);
            }

            if let Some(ci_status) = args.ci_status {
                body.insert("ci_status".to_string(), Value::String(ci_status));
            }

            if let Some(notes) = args.notes {
                body.insert("notes".to_string(), Value::String(notes));
            } else if args.clear_notes {
                body.insert("notes".to_string(), Value::Null);
            }

            if let Some(branch) = args.branch {
                body.insert("branch".to_string(), Value::String(branch));
            } else if args.clear_branch {
                body.insert("branch".to_string(), Value::Null);
            }

            if body.is_empty() {
                bail!("no run fields were provided to update");
            }

            client
                .patch(&format!("/runs/{}", args.run_id), Value::Object(body))
                .await
        }
    }
}

async fn handle_init(client: &ApiClient, api_url: &str) -> Result<Value> {
    let health = client.get("/health").await?;
    let default_tags = [
        "aissa",
        "agent-server",
        "personal",
        "prototype",
        "infrastructure",
    ];

    let mut seeded_tags = Vec::new();

    for name in default_tags {
        let before = find_tag_by_name(client, name).await?;
        let (tag_id, created) = if let Some(tag) = before {
            (extract_id_from_object(&tag)?, false)
        } else {
            let created = client.post("/tags", json!({ "name": name })).await?;
            (extract_data_id(&created)?, true)
        };

        seeded_tags.push(json!({
            "id": tag_id,
            "name": name,
            "created": created,
        }));
    }

    Ok(json!({
        "data": {
            "api_url": api_url,
            "health": health,
            "seeded_tags": seeded_tags,
        }
    }))
}

async fn ensure_tag_exists(client: &ApiClient, name: &str) -> Result<i64> {
    if let Some(tag) = find_tag_by_name(client, name).await? {
        return extract_id_from_object(&tag);
    }

    let created = client
        .post(
            "/tags",
            json!({
                "name": name,
            }),
        )
        .await
        .with_context(|| format!("failed to create tag {name}"))?;

    extract_data_id(&created)
}

async fn find_tag_by_name(client: &ApiClient, name: &str) -> Result<Option<Value>> {
    let tags = client.get("/tags").await?;
    let entries = tags
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("unexpected /tags response format"))?;

    Ok(entries.iter().find_map(|entry| {
        entry
            .get("name")
            .and_then(Value::as_str)
            .filter(|tag_name| *tag_name == name)
            .map(|_| entry.clone())
    }))
}

fn push_query(query: &mut Vec<(String, String)>, key: &str, value: Option<String>) {
    if let Some(value) = value {
        query.push((key.to_string(), value));
    }
}

fn extract_data_id(value: &Value) -> Result<i64> {
    let data = value
        .get("data")
        .ok_or_else(|| anyhow!("response missing data field"))?;

    extract_id_from_object(data)
}

fn extract_id_from_object(value: &Value) -> Result<i64> {
    value.get("id")
        .and_then(Value::as_i64)
        .ok_or_else(|| anyhow!("response missing integer id"))
}
