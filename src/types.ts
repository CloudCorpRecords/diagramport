/**
 * diagramport types.
 *
 * Rendering is described by a RendererFn so the engine is pluggable
 * and testable: it receives the validated diagram plus the requested
 * theme, background color, and image format, and resolves with the
 * rendered image bytes. No renderer is bundled with diagramport.
 */

/** The output types generate_mermaid_diagram accepts, as documented. */
export type OutputType = "base64" | "svg" | "mermaid" | "file" | "svg_url" | "png_url";

/** Image format a renderer is asked to produce for a given output type. */
export type RenderFormat = "png" | "svg";

/** What a renderer receives for one render request. */
export interface RenderRequest {
  mermaid: string;
  theme: string;
  backgroundColor: string;
  format: RenderFormat;
}

/** Renders a mermaid diagram to image bytes (PNG or SVG markup). */
export type RendererFn = (request: RenderRequest) => Promise<Buffer | Uint8Array>;

export interface GenerateDiagramOptions {
  mermaid: string;
  theme?: string;
  backgroundColor?: string;
  outputType?: string;
}

/** Outcome of validating mermaid syntax locally. */
export interface ValidationResult {
  valid: boolean;
  /** The diagram type keyword found on the first non-empty line, or null. */
  diagramType: string | null;
  /** Why the syntax was rejected, or null when it is valid. */
  error: string | null;
}

/**
 * Result of generate_mermaid_diagram. Exactly one payload field is
 * set, matching the requested output type: `mermaid` (the validated
 * syntax), `url` (a mermaid.ink link), `base64` (PNG bytes, base64),
 * `svg` (SVG markup), or `filePath` (where the PNG was written).
 */
export interface GenerateDiagramResult {
  outputType: OutputType;
  diagramType: string;
  theme: string;
  backgroundColor: string;
  mermaid?: string;
  url?: string;
  base64?: string;
  svg?: string;
  filePath?: string;
}
