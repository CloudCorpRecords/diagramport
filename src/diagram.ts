/**
 * diagramport core: one tool, generate_mermaid_diagram.
 *
 * What is real, local logic:
 *   - a mermaid syntax validator (known diagram type on the first
 *     non-empty line; balanced quotes/brackets),
 *   - outputType "mermaid": returns the validated syntax,
 *   - outputType "svg_url" / "png_url": builds a mermaid.ink URL
 *     locally from the diagram text,
 *   - outputType "file": writes renderer bytes to disk.
 *
 * What is deliberately NOT faked: image rendering. No mermaid
 * renderer (and no headless browser) is bundled. Rendering goes
 * through an injectable RendererFn; the default renderer only runs
 * a local command the operator points DIAGRAMPORT_RENDERER_COMMAND
 * at — a command that receives the diagram on stdin and emits the
 * image bytes on stdout. When that variable is unset the default
 * renderer throws an honest error naming the variable. No image
 * bytes are ever invented.
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  GenerateDiagramOptions,
  GenerateDiagramResult,
  OutputType,
  RendererFn,
  ValidationResult,
} from "./types.js";

export const VERSION = "0.1.0";

/** Environment variable that points at a local renderer command. */
export const RENDERER_COMMAND_ENV = "DIAGRAMPORT_RENDERER_COMMAND";

/** Environment variable that overrides where "file" output is written. */
export const OUTPUT_DIR_ENV = "DIAGRAMPORT_OUTPUT_DIR";

/** Output types generate_mermaid_diagram accepts, as documented. */
export const OUTPUT_TYPES: readonly OutputType[] = [
  "base64",
  "svg",
  "mermaid",
  "file",
  "svg_url",
  "png_url",
];

/** Diagram type keywords a valid diagram may start with. */
export const DIAGRAM_TYPES: readonly string[] = [
  "graph",
  "flowchart",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "journey",
  "userJourney",
  "gantt",
  "pie",
  "gitGraph",
  "mindmap",
  "timeline",
  "quadrantChart",
  "requirementDiagram",
  "C4Context",
];

const OPEN_TO_CLOSE: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSERS = new Set(Object.values(OPEN_TO_CLOSE));

/**
 * Validate mermaid syntax locally. The first non-empty line must
 * start with a known diagram type keyword, and quotes/brackets must
 * be balanced (brackets inside a double-quoted string do not count).
 * This is a structural sanity check, not a full mermaid parse.
 */
export function validateMermaid(source: string): ValidationResult {
  if (typeof source !== "string" || source.trim() === "") {
    return { valid: false, diagramType: null, error: "mermaid syntax is empty" };
  }
  const firstLine = source
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "");
  const firstToken = (firstLine ?? "").split(/\s+/)[0] ?? "";
  if (!DIAGRAM_TYPES.includes(firstToken)) {
    return {
      valid: false,
      diagramType: null,
      error: `unknown diagram type: ${firstToken || "(none)"} (first line must start with one of ${DIAGRAM_TYPES.join(", ")})`,
    };
  }
  const stack: string[] = [];
  let inString = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch in OPEN_TO_CLOSE) {
      stack.push(OPEN_TO_CLOSE[ch]);
    } else if (CLOSERS.has(ch)) {
      if (stack.pop() !== ch) {
        return {
          valid: false,
          diagramType: firstToken,
          error: `unbalanced brackets: unexpected "${ch}" at offset ${i}`,
        };
      }
    }
  }
  if (inString) {
    return {
      valid: false,
      diagramType: firstToken,
      error: "unbalanced quotes: unterminated double-quoted string",
    };
  }
  if (stack.length > 0) {
    return {
      valid: false,
      diagramType: firstToken,
      error: `unbalanced brackets: missing closing "${stack[stack.length - 1]}"`,
    };
  }
  return { valid: true, diagramType: firstToken, error: null };
}

/**
 * Build a mermaid.ink URL for a diagram. Local contract (the simple
 * documented form): the payload is the base64url encoding of the
 * UTF-8 diagram text — https://mermaid.ink/svg/<payload> renders
 * SVG, https://mermaid.ink/img/<payload> renders a PNG image.
 */
export function mermaidInkUrl(source: string, kind: "svg" | "png"): string {
  const payload = Buffer.from(source, "utf8").toString("base64url");
  return kind === "svg"
    ? `https://mermaid.ink/svg/${payload}`
    : `https://mermaid.ink/img/${payload}`;
}

/**
 * Run a renderer command: the diagram goes to its stdin and the
 * image bytes are read from its stdout. Failures are wrapped as
 * `diagram renderer failed: <msg>`, preferring the last lines of
 * stderr, which is where renderers explain themselves.
 */
export function runRendererCommand(
  command: string,
  args: string[],
  input: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", (err) => {
      reject(new Error(`diagram renderer failed: ${err.message}`));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        const detail =
          Buffer.concat(stderrChunks).toString("utf8").trim().split("\n").slice(-3).join("\n").trim() ||
          `renderer command exited with code ${code}`;
        reject(new Error(`diagram renderer failed: ${detail}`));
        return;
      }
      resolve(Buffer.concat(stdoutChunks));
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(input, "utf8");
  });
}

/**
 * The default renderer. There is no bundled engine: when
 * DIAGRAMPORT_RENDERER_COMMAND is unset or blank the returned
 * function throws an error naming the variable — it never invents
 * image bytes. When the variable is set, its whitespace-split
 * command and arguments are run with the diagram on stdin, and its
 * stdout is the rendered image.
 */
export function createDefaultRenderer(): RendererFn {
  return async ({ mermaid }) => {
    const raw = process.env[RENDERER_COMMAND_ENV];
    const commandLine = typeof raw === "string" ? raw.trim() : "";
    if (!commandLine) {
      throw new Error(
        "diagram renderer not configured: set DIAGRAMPORT_RENDERER_COMMAND to a local command that reads mermaid syntax on stdin and writes the rendered image bytes to stdout, then retry",
      );
    }
    const [command, ...args] = commandLine.split(/\s+/);
    return runRendererCommand(command, args, mermaid);
  };
}

export interface GenerateExtras {
  /** Directory for outputType "file"; defaults to DIAGRAMPORT_OUTPUT_DIR or ./diagrams. */
  outputDir?: string;
  /** Clock override, for deterministic file names in tests. */
  now?: () => Date;
}

/** Generate a mermaid diagram in the requested output form. */
export async function generateMermaidDiagram(
  renderer: RendererFn,
  options: GenerateDiagramOptions,
  extras: GenerateExtras = {},
): Promise<GenerateDiagramResult> {
  const mermaid = typeof options.mermaid === "string" ? options.mermaid : "";
  const validation = validateMermaid(mermaid);
  if (!validation.valid) {
    throw new Error(`invalid mermaid syntax: ${validation.error}`);
  }
  const outputType = (options.outputType ?? "base64") as OutputType;
  if (!OUTPUT_TYPES.includes(outputType)) {
    throw new Error(
      `unsupported outputType: ${options.outputType} (expected one of ${OUTPUT_TYPES.join(", ")})`,
    );
  }
  const theme = options.theme ?? "default";
  const backgroundColor = options.backgroundColor ?? "white";
  const base = {
    outputType,
    diagramType: validation.diagramType as string,
    theme,
    backgroundColor,
  };

  if (outputType === "mermaid") {
    return { ...base, mermaid };
  }
  if (outputType === "svg_url") {
    return { ...base, url: mermaidInkUrl(mermaid, "svg") };
  }
  if (outputType === "png_url") {
    return { ...base, url: mermaidInkUrl(mermaid, "png") };
  }
  if (outputType === "svg") {
    const bytes = await renderer({ mermaid, theme, backgroundColor, format: "svg" });
    return { ...base, svg: Buffer.from(bytes).toString("utf8") };
  }
  // "base64" and "file" both render a PNG.
  const bytes = await renderer({ mermaid, theme, backgroundColor, format: "png" });
  if (outputType === "base64") {
    return { ...base, base64: Buffer.from(bytes).toString("base64") };
  }
  const dir =
    extras.outputDir ??
    (process.env[OUTPUT_DIR_ENV] ? process.env[OUTPUT_DIR_ENV] : path.join(process.cwd(), "diagrams"));
  await mkdir(dir, { recursive: true });
  const stamp = (extras.now ? extras.now() : new Date()).toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(dir, `diagram-${stamp}.png`);
  await writeFile(filePath, bytes);
  return { ...base, filePath };
}
