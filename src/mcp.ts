/**
 * diagramport MCP server. Tool: generate_mermaid_diagram.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys that
 * are not in this tool's public spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the spec's
 * exact input schema as an explicit literal, while zod still
 * validates every tools/call argument set.
 *
 * Rendering uses the default renderer, which is not configured by
 * default: the base64 / svg / file output types return an honest
 * isError naming DIAGRAMPORT_RENDERER_COMMAND until an operator
 * configures a local renderer command. The mermaid and *_url
 * output types are pure local logic and always work. No image
 * bytes are ever invented.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  createDefaultRenderer,
  generateMermaidDiagram,
  VERSION,
} from "./diagram.js";
import type { GenerateDiagramResult } from "./types.js";

const GenerateArgs = z.object({
  mermaid: z.string(),
  theme: z.string().optional(),
  backgroundColor: z.string().optional(),
  outputType: z.string().optional(),
});

const TOOLS = [
  {
    name: "generate_mermaid_diagram",
    description:
      "Generate mermaid diagram and chart with mermaid syntax dynamically.",
    inputSchema: {
      type: "object" as const,
      properties: {
        mermaid: {
          type: "string",
          description:
            "The mermaid diagram syntax used to be generated, such as, graph TD; A-->B; A-->C; B-->D; C-->D;.",
        },
        theme: {
          type: "string",
          description: "Theme for the diagram (optional). Default is 'default'.",
        },
        backgroundColor: {
          type: "string",
          description: "Background color for the diagram (optional). Default is 'white'.",
        },
        outputType: {
          type: "string",
          description:
            "The output type of the diagram. Can be 'base64', 'svg', 'mermaid', 'file', 'svg_url', or 'png_url'. Default is 'base64'. 'base64' returns PNG image as base64 encoded string. 'file' saves the PNG image to disk. The *_url options return public mermaid.ink links for remote-friendly sharing.",
        },
      },
      required: ["mermaid"],
    },
  },
];

/** The primary payload of a result is the text the caller asked for. */
function resultText(result: GenerateDiagramResult): string {
  if (result.mermaid !== undefined) return result.mermaid;
  if (result.url !== undefined) return result.url;
  if (result.base64 !== undefined) return result.base64;
  if (result.svg !== undefined) return result.svg;
  return JSON.stringify(result, null, 2);
}

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "diagramport", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === "generate_mermaid_diagram") {
      const parsed = GenerateArgs.parse(args ?? {});
      const result = await generateMermaidDiagram(createDefaultRenderer(), parsed);
      return textResult(resultText(result));
    }
  } catch (err) {
    return errorResult(err);
  }
  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
