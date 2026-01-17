# jupyter-mynerva

[![Github Actions Status](https://github.com/yacchin1205/jupyter-mynerva/workflows/Build/badge.svg)](https://github.com/yacchin1205/jupyter-mynerva/actions/workflows/build.yml)
[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/yacchin1205/jupyter-mynerva/main?urlpath=lab)

A JupyterLab extension that provides an LLM-powered assistant with deep understanding of notebook structure.

## Why "Mynerva"?

The name derives from **Minerva**, the Roman goddess of wisdom. The spelling reflects **"My + Minerva"**—a personalized, notebook-centric intelligence.

As Jupyter reinterprets Jupiter, Mynerva reinterprets Minerva as an AI companion for computational notebooks.

## Concept: The Story Travels with the Code

A notebook is a computational narrative. Headings, code, and outputs form a coherent story. Existing AI assistants see only isolated snippets—the surrounding context gets lost.

jupyter-mynerva keeps the story intact. Section structure, explanatory markdown, and outputs travel together as logical units.

The LLM actively explores—requesting the table of contents, navigating sections, examining outputs. It pulls the context it needs, rather than waiting for users to push fragments.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ JupyterLab                                              │
│  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │  Active Notebook    │  │  Mynerva Panel (React)   │  │
│  │                     │  │  - Chat UI               │  │
│  │                     │  │  - Action confirmation   │  │
│  └─────────────────────┘  └────────────┬─────────────┘  │
│                                        │                │
│  ┌─────────────────────────────────────▼─────────────┐  │
│  │  Context Engine (TypeScript)                      │  │
│  │  - ToC / Section / Cell / Output extraction       │  │
│  │  - Notebook mutation handlers                     │  │
│  └─────────────────────────────────────┬─────────────┘  │
└────────────────────────────────────────┼────────────────┘
                                         │ REST
┌────────────────────────────────────────▼────────────────┐
│  Server Extension (Python)                              │
│  - LLM proxy (OpenAI API)                               │
│  - Session storage (.mynerva files)                     │
└─────────────────────────────────────────────────────────┘
```

**Mynerva Panel**: Chat interface in the right sidebar. Operates on the currently open notebook.

**Context Engine**: Extracts notebook structure—ToC from headings, sections as markdown+code units, outputs with type awareness. TypeScript implementation (port of nbq logic).

**Server Extension**: Proxies LLM API (no streaming). Sessions persisted in `.mynerva/` directory.

### Design Decisions

| Topic | Decision |
|-------|----------|
| Context extraction | TypeScript reimplementation of nbq |
| Privacy filter | TypeScript, reads `.nbfilterrc.toml` for consistency with nbfilter |
| Session storage | `.mynerva/*.mnchat` files, auto-named (timestamp + ID) |
| Session lifecycle | Independent of active notebook; explicit switch only |
| Streaming | Not supported |
| File access | Jupyter root directory only |
| Action confirmation | Batch confirmation supported; trust mode available |
| Mutation validation | Optimistic locking via `_hash`; must read before write |
| Error handling | API failure: retry with limit (3). Hash mismatch / user rejection: feedback to LLM, no retry count |
| LLM providers | OpenAI initially; extensible to Anthropic, etc. |

### UI

**Panel (right sidebar):**
- Session selector (dropdown + new)
- Chat messages
- Query preview (inline, with filter option)
- Mutate preview (modal, diff view)
- Trust mode toggle

**Settings (JupyterLab Settings):**
- Provider selection
- Model selection
- API key (per provider, Fernet-encrypted if secret key present)

## Actions

LLM communicates through structured actions. All actions require user confirmation.

Query actions show a preview before sending to LLM. Users can choose to apply privacy filters (nbfilter-style masking of IPs, domains, etc.) or send raw content.

### Query: Active Notebook

| Action | Parameters | Description |
|--------|------------|-------------|
| `getToc` | — | Heading structure of current notebook |
| `getSection` | `query` | Cells under matched heading |
| `getCells` | `query`, `count?` | Cell range from matched position |
| `getOutput` | `query` | Output of matched cell |

### Query: Other Files

| Action | Parameters | Description |
|--------|------------|-------------|
| `listNotebookFiles` | `path?` | List notebooks in directory |
| `getTocFromFile` | `path` | Heading structure of specified notebook |
| `getSectionFromFile` | `path`, `query` | Cells under matched heading |
| `getCellsFromFile` | `path`, `query`, `count?` | Cell range from matched position |
| `getOutputFromFile` | `path`, `query` | Output of matched cell |

### Query Syntax

```json
{ "match": "## Data" }    // regex against heading/content
{ "contains": "pandas" }  // substring match
{ "start": 5 }            // cell index
{ "id": "abc123" }        // cell ID
```

### Mutate: Active Notebook

| Action | Parameters | Description |
|--------|------------|-------------|
| `insertCell` | `position`, `cellType`, `content` | Insert above/below current cell |
| `replaceCell` | `query`, `content` | Replace cell content |
| `deleteCell` | `query` | Delete cell |
| `executeCell` | `query?` | Execute cell (default: current) |

### Help (no confirmation required)

| Action | Parameters | Description |
|--------|------------|-------------|
| `listHelp` | — | Show available actions (re-display system prompt) |
| `help` | `action` | Show details for specific action |

## System Prompt

LLM receives the following initial instruction:

```
You are Mynerva, a Jupyter notebook assistant.
- Always respond with JSON only. No text before or after.
- JSON structure:
  {
    "messages": [{ "role": "assistant", "content": "explanation" }],
    "actions": [{ "type": "...", "query": {...}, ... }]
  }
- "messages": natural language responses to user
- "actions": structured operations (can be empty array)

Available actions:

Query (active notebook):
  - getToc: {}
  - getSection: { query }
  - getCells: { query, count? }
  - getOutput: { query }

Query (other files):
  - listNotebookFiles: { path? }
  - getTocFromFile: { path }
  - getSectionFromFile: { path, query }
  - getCellsFromFile: { path, query, count? }
  - getOutputFromFile: { path, query }

Mutate (requires _hash from prior read):
  - insertCell: { position, cellType, content }
  - replaceCell: { query, content, _hash }
  - deleteCell: { query, _hash }
  - executeCell: { query? }

Query syntax: { match: "regex" } | { contains: "text" } | { start: N } | { id: "cellId" }

Help:
  - listHelp: {} - show this prompt again
  - help: { action } - show details for specific action
```

## Configuration

### Secret Key

`MYNERVA_SECRET_KEY` (env) or `c.Mynerva.secret_key` (traitlets)

Fernet key for encrypting API keys in JupyterLab Settings. If absent, warning logged and Settings UI shows alert; keys stored unencrypted (not recommended).

### API Key

| Method | Use case |
|--------|----------|
| JupyterLab Settings | User brings own key |
| `c.Mynerva.openai_api_key` | Default key for dev/shared environments |

## Requirements

- JupyterLab >= 4.0.0

## Install

```bash
pip install jupyter_mynerva
```

## Contributing

### Development install

```bash
# Clone the repo to your local environment
# Change directory to the jupyter_mynerva directory

# Set up a virtual environment and install package in development mode
python -m venv .venv
source .venv/bin/activate
pip install --editable "."

# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Server extension must be manually installed in develop mode
jupyter server extension enable jupyter_mynerva

# Rebuild extension Typescript source after making changes
jlpm build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm watch
# Run JupyterLab in another terminal
jupyter lab
```

### Packaging the extension

See [RELEASE](RELEASE.md)

## References

- [nbq](https://github.com/yacchin1205/nbq) - CLI for querying notebook structure (ToC, sections, cells, outputs)
- [nbfilter](https://github.com/yacchin1205/nbfilter) - Privacy filter for notebooks (masks IPs, domains, etc.)
