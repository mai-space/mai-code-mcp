# mai-code-mcp

Index your code automatically and let AI agents use it via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

`mai-code-mcp` chunks your codebase, creates semantic embeddings, stores them in a vector database, and exposes a search interface through an MCP server. AI assistants (e.g. Claude Desktop) can then query your code with natural-language questions.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [One-liner install](#one-liner-install)
  - [Manual install](#manual-install)
  - [Run without installing](#run-without-installing-npx--tsx)
  - [Updating](#updating)
- [Configuration](#configuration)
- [Usage](#usage)
  - [Index a project](#index-a-project)
  - [Reindex a project](#reindex-a-project)
  - [Start the MCP server](#start-the-mcp-server)
  - [Manage projects](#manage-projects)
- [MCP server integration](#mcp-server-integration)
  - [Claude Desktop](#claude-desktop)
  - [Available MCP tools](#available-mcp-tools)
- [Docker](#docker)
- [Development](#development)

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js ≥ 20** | Required to run the CLI and MCP server |
| **A vector store** | [Qdrant](https://qdrant.tech/) (default) or [ChromaDB](https://www.trychroma.com/) |
| **An embedding provider** | [Ollama](https://ollama.com/) (default, local), [OpenAI](https://platform.openai.com/), or [Cohere](https://cohere.com/) |

### Quick-start: run Qdrant + Ollama locally with Docker

```bash
# Qdrant
docker run -d -p 6333:6333 -p 6334:6334 qdrant/qdrant

# Ollama (then pull an embedding model)
docker run -d -p 11434:11434 ollama/ollama
docker exec -it <ollama-container> ollama pull nomic-embed-text
```

---

## Installation

### One-liner install

Requires **git**, **Node.js ≥ 20**, and **npm**.

```bash
curl -fsSL https://raw.githubusercontent.com/mai-space/mai-code-mcp/main/install.sh | bash
```

> **Tip:** Before piping to bash you can review the script at the URL above.

This clones the repository to `~/.mai-code-mcp`, builds it, and installs the `mai-code` binary globally. Set `MAI_CODE_DIR` to override the install location:

```bash
MAI_CODE_DIR=/opt/mai-code-mcp curl -fsSL https://raw.githubusercontent.com/mai-space/mai-code-mcp/main/install.sh | bash
```

### Manual install

```bash
git clone https://github.com/mai-space/mai-code-mcp.git
cd mai-code-mcp
npm install
npm run build
npm install -g .
```

After installation the `mai-code` binary is available in your `PATH`.

### Run without installing (npx / tsx)

```bash
# Using compiled output
node dist/bin/mai-code.js <command>

# Using tsx during development
npx tsx bin/mai-code.ts <command>
```

### Updating

To update `mai-code` to the latest version, run:

```bash
mai-code update
```

This pulls the latest commits from the repository, rebuilds, and reinstalls the global binary in one step.

---

## Configuration

`mai-code` looks for a configuration file in the following locations (in order):

1. `.mai-coderc` in the current working directory
2. `.mai-coderc.json` in the current working directory
3. `~/.mai-coderc` (user home directory)
4. `~/.mai-coderc.json` (user home directory)

Copy the example file as a starting point:

```bash
cp .mai-coderc.example .mai-coderc
```

### Full configuration reference

```jsonc
{
  // Default embedding provider and model (format: "provider:model")
  // Supported providers: ollama | openai | cohere
  "defaultModel": "ollama:nomic-embed-text",

  // Default vector store (format: "provider:url")
  // Supported providers: qdrant | chroma
  "defaultStore": "qdrant:http://localhost:6333",

  // Chunk size in tokens (default: 512)
  "chunkSize": 512,

  // Number of overlapping tokens between consecutive chunks (default: 64)
  "chunkOverlap": 64,

  // Maximum number of files processed in parallel (default: 4)
  "concurrency": 8,

  // Glob patterns to exclude from indexing (supports .gitignore syntax)
  "ignore": ["**/*.test.*", "**/fixtures/**"],

  // Ollama settings (only needed when using ollama provider)
  "ollama": {
    "baseUrl": "http://localhost:11434"
  },

  // OpenAI settings (only needed when using openai provider)
  "openai": {
    "apiKey": "sk-..."
  },

  // Cohere settings (only needed when using cohere provider)
  "cohere": {
    "apiKey": "..."
  },

  // Qdrant settings (only needed when using qdrant store)
  "qdrant": {
    "url": "http://localhost:6333",
    "apiKey": ""           // leave empty for local instances
  },

  // ChromaDB settings (only needed when using chroma store)
  "chroma": {
    "path": "http://localhost:8000"
  }
}
```

### Embedding providers

| Provider | Format | Default model | Notes |
|---|---|---|---|
| Ollama | `ollama:<model>` | `nomic-embed-text` | Local, free |
| OpenAI | `openai:<model>` | `text-embedding-3-small` | Requires API key |
| Cohere | `cohere:<model>` | `embed-english-v3.0` | Requires API key |

### Vector stores

| Store | Format | Default URL |
|---|---|---|
| Qdrant | `qdrant:<url>` | `http://localhost:6333` |
| ChromaDB | `chroma:<url>` | `http://localhost:8000` |

---

## Usage

### Index a project

Scan a directory, create embeddings, and store them in the vector database.

```bash
mai-code index <path> --project <name> [options]
```

| Option | Description | Default |
|---|---|---|
| `--project <name>` | **(required)** Project name | — |
| `--model <provider:model>` | Embedding model | `defaultModel` from config |
| `--store <provider:url>` | Vector store | `defaultStore` from config |
| `--chunk-size <n>` | Chunk size in tokens | `512` |
| `--chunk-overlap <n>` | Overlap in tokens between chunks | `64` |
| `--concurrency <n>` | Number of parallel workers | `4` |
| `--tag <key=value>` | Arbitrary metadata tag (repeatable) | — |

**Examples**

```bash
# Index current directory using defaults from .mai-coderc
mai-code index . --project my-app

# Use OpenAI embeddings with a specific store
mai-code index ./src --project my-app \
  --model openai:text-embedding-3-small \
  --store qdrant:http://localhost:6333

# Add metadata tags
mai-code index . --project my-app --tag env=production --tag team=backend
```

### Reindex a project

Incrementally update an existing indexed project, processing only changed files.

```bash
mai-code reindex <path> --project <name> [--concurrency <n>]
```

The embedding model and vector store are automatically reused from the original `index` run.

```bash
mai-code reindex . --project my-app
```

### Start the MCP server

Start the MCP server that communicates over **stdio**. AI clients connect to this process.

```bash
mai-code serve
```

The server reads configuration from the `.mai-coderc` file and exposes all indexed projects to the connected AI client.

### Manage projects

```bash
# List all indexed projects
mai-code projects

# Show detailed status for a specific project
mai-code status --project my-app

# Delete a project's index from the vector store
mai-code purge --project my-app

# Delete all project indexes
mai-code purge --all

# Update mai-code to the latest version
mai-code update
```

---

## MCP server integration

### Claude Desktop

Add the following to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mai-code": {
      "command": "mai-code",
      "args": ["serve"]
    }
  }
}
```

If `mai-code` is not on your global `PATH`, use the full path to the binary:

```json
{
  "mcpServers": {
    "mai-code": {
      "command": "node",
      "args": ["/absolute/path/to/mai-code-mcp/dist/bin/mai-code.js", "serve"]
    }
  }
}
```

Restart Claude Desktop after updating the configuration. The MCP tools listed below will become available to the assistant automatically.

### Available MCP tools

| Tool | Description | Required inputs |
|---|---|---|
| `list_projects` | List all indexed projects with metadata | — |
| `search_code` | Semantic search within a single project | `query`, `project` |
| `search_code_multi` | Semantic search across multiple projects (must share the same model and store) | `query`, `projects[]` |
| `get_chunk` | Retrieve a specific code chunk by ID | `project`, `chunkId` |
| `list_files` | List all indexed files in a project | `project` |

**`search_code` optional inputs:** `topK` (default 10), `language`, `symbolKind`  
**`search_code_multi` optional inputs:** `topK` (default 10 per project)

---

## Docker

A `docker-compose.yml` is included that starts `mai-code-mcp` together with Qdrant and Ollama.

```bash
cd docker
docker compose up -d
```

This starts three services:

| Service | Port | Description |
|---|---|---|
| `mai-code-mcp` | — | MCP server (stdio) |
| `qdrant` | `6333`, `6334` | Vector database |
| `ollama` | `11434` | Local embedding model server |

To use OpenAI or Cohere instead, set the relevant environment variables before starting:

```bash
OPENAI_API_KEY=sk-... docker compose up -d
# or
COHERE_API_KEY=...   docker compose up -d
```

To build the image manually:

```bash
docker build -f docker/Dockerfile -t mai-code-mcp .
docker run --rm mai-code-mcp index /code --project my-app
```

---

## Development

```bash
# Install dependencies
npm install

# Run in development mode (no build step required)
npm run dev -- index . --project my-app

# Build
npm run build

# Run tests
npm test

# Watch mode for tests
npm run test:watch
```
