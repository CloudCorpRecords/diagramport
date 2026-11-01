# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- MCP server (`diagramport mcp`, stdio) with one tool:
  `generate_mermaid_diagram` — generate a mermaid diagram or chart
  from mermaid syntax, with optional `theme` (default `default`),
  `backgroundColor` (default `white`), and `outputType` (default
  `base64`).
- CLI: `diagramport generate --mermaid "<syntax>" [--theme t]
  [--background-color c] [--output-type t]` mirrors the tool, and
  `diagramport validate --mermaid "<syntax>"` runs only the local
  syntax check.
- Local mermaid syntax validation: the first non-empty line must
  start with a known diagram type and quotes/brackets must balance;
  invalid syntax is an error naming the reason.
- Output types `mermaid` (the validated syntax), `svg_url`, and
  `png_url` (mermaid.ink links built locally from the diagram text)
  need no renderer. Output types `base64`, `svg`, and `file` render
  through the local command named by `DIAGRAMPORT_RENDERER_COMMAND`;
  no renderer is bundled, and with none configured those output
  types return an honest error instead of invented image bytes.
