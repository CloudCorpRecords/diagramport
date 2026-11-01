# diagramport — Build Report

MCP Rebuild 1000 program, Tranche #101+ Batch 1. Clean-room rebuild
of hustcc/mcp-mermaid (candidate `ai.smithery/hustcc-mcp-mermaid`,
rank 13, 646 stars). The spec source is docs-derived ONLY: the repo
README features plus the tool's documented input schema as listed
on its public server listings, retrieved 2026-10-26 — recorded in
the fixture `_source`. No original code was read or copied, and no
live original server was probed. Local build only — nothing pushed
or published.

Identity: repo `diagramport`, npm `@reneturcios/diagramport`,
MCP name `io.github.CloudCorpRecords/diagramport`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `diagramport: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Generate Mermaid diagrams and charts
  from Mermaid syntax, validated locally." = **76 chars** (≤100 ✓,
  verified programmatically); npm entry carries `version: 0.1.0`;
  OCI entry `ghcr.io/cloudcorprecords/diagramport:0.1.0` carries
  **no** `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/diagramport"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (`generate`, `validate`, `mcp`,
  `--version`; exit 2 usage / 1 processing or validation error),
  `src/mcp.ts`, `src/types.ts`, `src/diagram.ts` (core logic,
  `VERSION = "0.1.0"`)
- `test/diagram.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to diagramport)

## Tools implemented (1)

`generate_mermaid_diagram` — "Generate mermaid diagram and chart
with mermaid syntax dynamically." Inputs: `mermaid` (required),
`theme` (default `default`), `backgroundColor` (default `white`),
`outputType` (default `base64`; one of `base64`, `svg`, `mermaid`,
`file`, `svg_url`, `png_url`).

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with the spec's
  inputSchema as an explicit literal, per the standing fleet rule:
  `McpServer`'s zod-to-JSON-Schema conversion injects `$schema` /
  `additionalProperties` keys that are absent from the documented
  spec and break exact schema parity. Zod still validates every
  `tools/call`.
- Real local logic in `src/diagram.ts`:
  - **Validator** (`validateMermaid`): the first non-empty line must
    start with a known diagram type (`graph`, `flowchart`,
    `sequenceDiagram`, `classDiagram`, `stateDiagram`,
    `stateDiagram-v2`, `erDiagram`, `journey`, `userJourney`,
    `gantt`, `pie`, `gitGraph`, `mindmap`, `timeline`,
    `quadrantChart`, `requirementDiagram`, `C4Context`), and
    quotes/brackets must be balanced (brackets inside a
    double-quoted string do not count). Invalid syntax is an error
    naming the reason, raised before any rendering or link building.
  - **`mermaid`**: returns the validated syntax as text.
  - **`svg_url` / `png_url`**: builds a mermaid.ink URL locally —
    `https://mermaid.ink/svg/<payload>` or
    `https://mermaid.ink/img/<payload>`, where the payload is the
    base64url encoding of the UTF-8 diagram text (the simple
    documented form; see gaps).
  - **`base64` / `svg` / `file`**: rendered through an injectable
    `RendererFn`. `file` writes the returned PNG bytes to
    `DIAGRAMPORT_OUTPUT_DIR` or `./diagrams/<timestamp>.png` and
    returns the path.
- **Rendering is never faked.** No mermaid renderer is bundled.
  The default renderer only runs the local command named by
  `DIAGRAMPORT_RENDERER_COMMAND` (whitespace-split, spawned without
  a shell; the diagram goes to its stdin and the image bytes are
  read from its stdout). With the variable unset or blank it throws
  the honest error recorded verbatim in the live check below. No
  image bytes are ever invented.

## Verification (foreground, exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc
tsc exit=0
```
`dist/` produced, including `dist/cli.js` with `.d.ts` / `.js.map`.

### 2. Tests
```
$ ./node_modules/.bin/tsx --test test/*.test.ts
ℹ tests 19
ℹ pass 19
ℹ fail 0
```
Fake `RendererFn` only — no live rendering. Covers: validator
accepts `graph` / `flowchart` / `sequenceDiagram` /
`stateDiagram-v2` / `pie` (with leading blank lines), reports the
diagram type, rejects unknown type (named), empty syntax,
unbalanced brackets (missing and unexpected closers), unterminated
quote, and ignores brackets inside quoted labels; mermaid.ink URL
payload equals base64url of the UTF-8 text for both `/svg/` and
`/img/`; `mermaid` output returns the syntax with zero renderer
calls; `svg_url` / `png_url` build links with zero renderer calls;
`base64` returns the fake PNG bytes base64-encoded and forwards
defaults (`theme: "default"`, `backgroundColor: "white"`,
`format: "png"`); default outputType is `base64` and
theme/backgroundColor overrides reach the renderer; `svg` returns
the fake bytes as text with `format: "svg"`; `file` writes the
fake bytes to a temp output dir at the deterministic timestamped
path and the bytes read back identical; invalid syntax rejects
before any renderer call; unsupported outputType rejects; the
default renderer without the env var rejects naming
`DIAGRAMPORT_RENDERER_COMMAND`.

### 3. CLI / MCP smoke
`--version` → `0.1.0`; unknown command exits 2 with Usage;
`validate` on a valid graph prints
`{"valid": true, "diagramType": "graph", "error": null}` and exits
0; `validate` on invalid input exits 1. MCP `initialize` over
stdio → `serverInfo: {"name": "diagramport", "version": "0.1.0"}`.

### 4. Live checks (stdio tools/call, exact results)

Call 1 — `generate_mermaid_diagram` with
`{"mermaid": "graph TD; A-->B; A-->C; B-->D; C-->D;", "outputType": "mermaid"}`:
```json
{"content": [{"type": "text", "text": "graph TD; A-->B; A-->C; B-->D; C-->D;"}]}
```
Success, no `isError` — the validated syntax returned as text.

Call 2 — `generate_mermaid_diagram` with
`{"mermaid": "graph TD; A-->B;", "outputType": "base64"}` and
`DIAGRAMPORT_RENDERER_COMMAND` unset:
```json
{"content": [{"type": "text", "text": "diagram renderer not configured: set DIAGRAMPORT_RENDERER_COMMAND to a local command that reads mermaid syntax on stdin and writes the rendered image bytes to stdout, then retry"}], "isError": true}
```
The honest not-configured error, exactly as designed.

Call 3 (bonus) — `outputType: "svg_url"` on the same graph:
```json
{"content": [{"type": "text", "text": "https://mermaid.ink/svg/Z3JhcGggVEQ7IEEtLT5COw"}]}
```

### 5. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/mcp-mermaid-tools-original.json \
    --rebuild "stdio:node /home/hatch/workspace/mcp-rebuild-100/builds/diagramport/dist/cli.js mcp" \
    --out /home/hatch/workspace/mcp-rebuild-100/builds/diagramport/parity-out
verdict=PASS parity_pct=100.0 original_tools=1 rebuild_tools=1 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
Original side is tools-file mode, so `fixture_results` records
`SKIPPED-TOOLS-FILE-MODE` — expected harness semantics, not an
error.

## Lockfile status

Clean lockfile generated via **Route 3** of LOCKFILE-ROUTE.md:
`package.json` alone was copied into a fresh `/tmp/diagramport-lock/`
(no `node_modules` present) and
`npm install --package-lock-only --ignore-scripts --offline`
produced a `package-lock.json` that parses, has top-level
`name == "@reneturcios/diagramport"`, `version == "0.1.0"`,
`lockfileVersion == 3`, and 128 package entries. The verified
lockfile was placed in this build dir — this is a genuinely clean
lockfile, not a copied-and-edited one. `node_modules` in this build
dir is a `cp -r` copy of clockport's (local build only,
gitignored).

## Gaps / honest notes

- **No bundled mermaid/Chromium renderer.** Rendering a diagram to
  PNG/SVG bytes needs a Mermaid engine and typically a headless
  browser; none is bundled — the same class as the fleet's browser
  gaps (e.g. audioport's missing container ffmpeg). The `base64`,
  `svg`, and `file` output types work only when an operator
  configures `DIAGRAMPORT_RENDERER_COMMAND`. No live rendering was
  performed or claimed; those paths are covered by fake-renderer
  tests plus the configured-command stdin/stdout contract.
- **URL payload is the simple base64 form.** The `svg_url` /
  `png_url` links encode the raw diagram text as base64url. This
  is the local contract documented for this rebuild; richer
  mermaid.ink payload forms (e.g. a JSON state object carrying
  theme/background) are not reproduced, so `theme` and
  `backgroundColor` do not affect the `*_url` outputs.
- The validator is a structural sanity check (diagram-type first
  token + balanced quotes/brackets), not a full Mermaid grammar
  parse; syntactically odd but structurally balanced diagrams can
  pass it and would only fail at a real renderer.
- Spec is docs-derived only (README + public tool listing schema,
  retrieved 2026-10-26), per the fixture `_source`; the original
  server was not hand-probed, so behavioural parity beyond the
  documented schema is not claimed.
- The container image bundles no renderer either; containerised
  diagramport serves the `mermaid` and `*_url` output types and
  the honest not-configured error for the rest, unless a derived
  image adds a renderer and sets `DIAGRAMPORT_RENDERER_COMMAND`.
- mcpaudit / mcpvet / shipcheck pre-publish gate not run — publish
  wave scope, not claimed here.
