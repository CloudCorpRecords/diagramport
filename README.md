# diagramport

diagramport generates Mermaid diagrams and charts from Mermaid
syntax. Give it a diagram — `graph TD; A-->B;` and friends — and it
hands back the form you asked for: the syntax itself, a shareable
mermaid.ink link, or a rendered image produced by a renderer command
you configure on your own machine.

Everything except rendering is local logic that always works: the
syntax is validated before anything else happens, and the share
links are built from the diagram text without any network call.

## Install

```bash
npx @reneturcios/diagramport generate --mermaid "graph TD; A-->B;" --output-type mermaid
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/diagramport
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead.

## CLI

```bash
# Validate syntax only (exit 1 with the reason when invalid)
diagramport validate --mermaid "graph TD; A-->B; A-->C; B-->D; C-->D;"

# Return the validated syntax
diagramport generate --mermaid "graph TD; A-->B;" --output-type mermaid

# Build a shareable mermaid.ink link (SVG or PNG)
diagramport generate --mermaid "graph TD; A-->B;" --output-type svg_url
diagramport generate --mermaid "graph TD; A-->B;" --output-type png_url

# Render an image (needs DIAGRAMPORT_RENDERER_COMMAND, see below)
diagramport generate --mermaid "graph TD; A-->B;" --output-type base64
diagramport generate --mermaid "graph TD; A-->B;" --output-type file

diagramport --version
```

Exit codes: `0` on success, `1` when the syntax is invalid or
rendering fails (the error names the problem), `2` for usage errors.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/diagramport mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "diagramport": {
      "command": "npx",
      "args": ["-y", "@reneturcios/diagramport", "mcp"]
    }
  }
}
```

### Tools

| Tool | Input | What it returns |
| --- | --- | --- |
| `generate_mermaid_diagram` | `mermaid` (string, required) — the mermaid diagram syntax; `theme` (string, optional, default `default`); `backgroundColor` (string, optional, default `white`); `outputType` (string, optional, default `base64`) — one of `base64`, `svg`, `mermaid`, `file`, `svg_url`, `png_url` | Depends on `outputType`: `mermaid` returns the validated syntax as text; `svg_url` / `png_url` return a public mermaid.ink link; `base64` returns the rendered PNG image as a base64 encoded string; `svg` returns the rendered SVG markup; `file` saves the rendered PNG image to disk and returns its path. |

## Validation

Syntax is checked locally before any output is produced. The first
non-empty line must start with a known diagram type (`graph`,
`flowchart`, `sequenceDiagram`, `classDiagram`, `stateDiagram`,
`stateDiagram-v2`, `erDiagram`, `journey`, `userJourney`, `gantt`,
`pie`, `gitGraph`, `mindmap`, `timeline`, `quadrantChart`,
`requirementDiagram`, `C4Context`), and quotes and brackets must be
balanced (brackets inside a double-quoted label do not count).
Invalid syntax is reported as an error naming the reason — it is
never passed on to a renderer or a link builder. This is a
structural sanity check, not a full Mermaid parse.

## Share links

For `svg_url` and `png_url`, diagramport builds the link locally:
the payload is the base64url encoding of the UTF-8 diagram text,
appended to `https://mermaid.ink/svg/` (SVG) or
`https://mermaid.ink/img/` (PNG). Anyone opening the link gets the
diagram rendered by mermaid.ink; diagramport itself makes no
network call to build it.

## Rendering

diagramport bundles **no** renderer — rendering a diagram to an
image needs a Mermaid engine and, typically, a headless browser,
which are deliberately left to the operator. The `base64`, `svg`,
and `file` output types render through a local command named by
the `DIAGRAMPORT_RENDERER_COMMAND` environment variable. The
command receives the diagram text on stdin and must write the
rendered image bytes to stdout:

```bash
export DIAGRAMPORT_RENDERER_COMMAND="my-mermaid-renderer --format png"
diagramport generate --mermaid "graph TD; A-->B;" --output-type base64
```

With no renderer configured, those output types return an error
naming `DIAGRAMPORT_RENDERER_COMMAND`. Image bytes are never
invented or stubbed. `file` output is written under
`DIAGRAMPORT_OUTPUT_DIR` when set, otherwise `./diagrams/`, with a
timestamped `.png` file name.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network, fake renderer only
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
