#!/usr/bin/env node
/**
 * diagramport CLI.
 *
 *   diagramport generate --mermaid "<syntax>" [--theme t]
 *                        [--background-color c] [--output-type t]
 *   diagramport validate --mermaid "<syntax>"
 *   diagramport mcp
 *   diagramport --version
 *
 * The mermaid and *_url output types are pure local logic. The
 * base64 / svg / file output types render through the local command
 * named by DIAGRAMPORT_RENDERER_COMMAND; with none configured they
 * fail naming that variable. "file" writes under
 * DIAGRAMPORT_OUTPUT_DIR or ./diagrams.
 * Exit codes: 0 success, 1 processing/validation error, 2 usage error.
 */
import {
  createDefaultRenderer,
  generateMermaidDiagram,
  validateMermaid,
  VERSION,
} from "./diagram.js";
import type { GenerateDiagramResult } from "./types.js";

function usage(): never {
  console.error(`Usage:
  diagramport generate --mermaid "<syntax>" [--theme t] [--background-color c] [--output-type t]
  diagramport validate --mermaid "<syntax>"
  diagramport mcp
  diagramport --version`);
  process.exit(2);
}

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function resultText(result: GenerateDiagramResult): string {
  if (result.mermaid !== undefined) return result.mermaid;
  if (result.url !== undefined) return result.url;
  if (result.base64 !== undefined) return result.base64;
  if (result.svg !== undefined) return result.svg;
  return JSON.stringify(result, null, 2);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (cmd !== "generate" && cmd !== "validate") usage();
  const mermaid = flagValue(rest, "--mermaid");
  if (mermaid === undefined) usage();
  try {
    if (cmd === "validate") {
      const result = validateMermaid(mermaid);
      console.log(JSON.stringify(result, null, 2));
      if (!result.valid) process.exit(1);
      return;
    }
    const result = await generateMermaidDiagram(createDefaultRenderer(), {
      mermaid,
      theme: flagValue(rest, "--theme"),
      backgroundColor: flagValue(rest, "--background-color"),
      outputType: flagValue(rest, "--output-type"),
    });
    console.log(resultText(result));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
