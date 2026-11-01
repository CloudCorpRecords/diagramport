import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createDefaultRenderer,
  generateMermaidDiagram,
  mermaidInkUrl,
  validateMermaid,
} from "../src/diagram.js";
import type { RenderRequest, RendererFn } from "../src/types.js";

const GRAPH = "graph TD; A-->B; A-->C; B-->D; C-->D;";

/** A fake renderer: records requests, returns canned bytes. Never real rendering. */
function fakeRenderer(bytes: Buffer): { fn: RendererFn; calls: RenderRequest[] } {
  const calls: RenderRequest[] = [];
  const fn: RendererFn = async (request) => {
    calls.push(request);
    return bytes;
  };
  return { fn, calls };
}

describe("validateMermaid", () => {
  it("accepts a graph and reports its diagram type", () => {
    const out = validateMermaid(GRAPH);
    assert.equal(out.valid, true);
    assert.equal(out.diagramType, "graph");
    assert.equal(out.error, null);
  });

  it("accepts flowchart, sequenceDiagram, and stateDiagram-v2 first lines", () => {
    assert.equal(validateMermaid("flowchart LR\n  A --> B").diagramType, "flowchart");
    assert.equal(
      validateMermaid("sequenceDiagram\n  Alice->>Bob: hi").diagramType,
      "sequenceDiagram",
    );
    assert.equal(validateMermaid("stateDiagram-v2\n  [*] --> Idle").diagramType, "stateDiagram-v2");
  });

  it("skips leading blank lines before the diagram type", () => {
    const out = validateMermaid("\n\n  pie title Pets\n  \"Dogs\" : 40");
    assert.equal(out.valid, true);
    assert.equal(out.diagramType, "pie");
  });

  it("rejects an unknown diagram type, naming it", () => {
    const out = validateMermaid("bananaDiagram\n  A --> B");
    assert.equal(out.valid, false);
    assert.match(out.error ?? "", /unknown diagram type: bananaDiagram/);
  });

  it("rejects empty syntax", () => {
    assert.equal(validateMermaid("").valid, false);
    assert.equal(validateMermaid("   \n  ").valid, false);
    assert.match(validateMermaid("").error ?? "", /empty/);
  });

  it("rejects unbalanced brackets", () => {
    const out = validateMermaid("graph TD; A[-->B;");
    assert.equal(out.valid, false);
    assert.match(out.error ?? "", /unbalanced brackets/);
  });

  it("rejects an unexpected closing bracket", () => {
    const out = validateMermaid("graph TD; A) --> B;");
    assert.equal(out.valid, false);
    assert.match(out.error ?? "", /unbalanced brackets/);
  });

  it("rejects an unterminated double-quoted string", () => {
    const out = validateMermaid('graph TD; A["oops] --> B;');
    assert.equal(out.valid, false);
    assert.match(out.error ?? "", /unbalanced quotes/);
  });

  it("ignores brackets inside double-quoted labels", () => {
    const out = validateMermaid('graph TD; A["x [ y ( z"] --> B;');
    assert.equal(out.valid, true);
  });
});

describe("mermaidInkUrl", () => {
  it("builds svg and img URLs with the base64url of the UTF-8 text", () => {
    const payload = Buffer.from(GRAPH, "utf8").toString("base64url");
    assert.equal(mermaidInkUrl(GRAPH, "svg"), `https://mermaid.ink/svg/${payload}`);
    assert.equal(mermaidInkUrl(GRAPH, "png"), `https://mermaid.ink/img/${payload}`);
  });
});

describe("generateMermaidDiagram", () => {
  it("outputType mermaid returns the validated syntax without rendering", async () => {
    const { fn, calls } = fakeRenderer(Buffer.from("unused"));
    const out = await generateMermaidDiagram(fn, { mermaid: GRAPH, outputType: "mermaid" });
    assert.equal(out.mermaid, GRAPH);
    assert.equal(out.outputType, "mermaid");
    assert.equal(out.diagramType, "graph");
    assert.equal(out.theme, "default");
    assert.equal(out.backgroundColor, "white");
    assert.equal(calls.length, 0);
  });

  it("svg_url and png_url build mermaid.ink links without rendering", async () => {
    const { fn, calls } = fakeRenderer(Buffer.from("unused"));
    const payload = Buffer.from(GRAPH, "utf8").toString("base64url");
    const svg = await generateMermaidDiagram(fn, { mermaid: GRAPH, outputType: "svg_url" });
    assert.equal(svg.url, `https://mermaid.ink/svg/${payload}`);
    const png = await generateMermaidDiagram(fn, { mermaid: GRAPH, outputType: "png_url" });
    assert.equal(png.url, `https://mermaid.ink/img/${payload}`);
    assert.equal(calls.length, 0);
  });

  it("base64 returns the fake renderer's PNG bytes base64-encoded, with defaults forwarded", async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const { fn, calls } = fakeRenderer(pngBytes);
    const out = await generateMermaidDiagram(fn, { mermaid: GRAPH, outputType: "base64" });
    assert.equal(out.base64, pngBytes.toString("base64"));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].format, "png");
    assert.equal(calls[0].theme, "default");
    assert.equal(calls[0].backgroundColor, "white");
    assert.equal(calls[0].mermaid, GRAPH);
  });

  it("defaults outputType to base64 and forwards theme/backgroundColor overrides", async () => {
    const { fn, calls } = fakeRenderer(Buffer.from("x"));
    const out = await generateMermaidDiagram(fn, {
      mermaid: GRAPH,
      theme: "dark",
      backgroundColor: "black",
    });
    assert.equal(out.outputType, "base64");
    assert.equal(calls[0].theme, "dark");
    assert.equal(calls[0].backgroundColor, "black");
  });

  it("svg returns the fake renderer's bytes as SVG text", async () => {
    const { fn, calls } = fakeRenderer(Buffer.from("<svg>fake</svg>", "utf8"));
    const out = await generateMermaidDiagram(fn, { mermaid: GRAPH, outputType: "svg" });
    assert.equal(out.svg, "<svg>fake</svg>");
    assert.equal(calls[0].format, "svg");
  });

  it("file writes the fake renderer's bytes to the output dir and returns the path", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "diagramport-test-"));
    const pngBytes = Buffer.from("fake-png-bytes");
    const { fn } = fakeRenderer(pngBytes);
    const out = await generateMermaidDiagram(
      fn,
      { mermaid: GRAPH, outputType: "file" },
      { outputDir: dir, now: () => new Date("2026-10-26T12:00:00.000Z") },
    );
    assert.equal(out.filePath, path.join(dir, "diagram-2026-10-26T12-00-00-000Z.png"));
    assert.deepEqual(await readFile(out.filePath as string), pngBytes);
  });

  it("rejects invalid syntax before any rendering", async () => {
    const { fn, calls } = fakeRenderer(Buffer.from("x"));
    await assert.rejects(
      () => generateMermaidDiagram(fn, { mermaid: "nope TD; A-->B;", outputType: "base64" }),
      /invalid mermaid syntax: unknown diagram type/,
    );
    assert.equal(calls.length, 0);
  });

  it("rejects an unsupported outputType", async () => {
    const { fn } = fakeRenderer(Buffer.from("x"));
    await assert.rejects(
      () => generateMermaidDiagram(fn, { mermaid: GRAPH, outputType: "jpeg" }),
      /unsupported outputType: jpeg/,
    );
  });
});

describe("default renderer", () => {
  it("without configuration errors naming DIAGRAMPORT_RENDERER_COMMAND", async () => {
    const saved = process.env.DIAGRAMPORT_RENDERER_COMMAND;
    delete process.env.DIAGRAMPORT_RENDERER_COMMAND;
    try {
      const renderer = createDefaultRenderer();
      await assert.rejects(
        () =>
          renderer({
            mermaid: GRAPH,
            theme: "default",
            backgroundColor: "white",
            format: "png",
          }),
        /DIAGRAMPORT_RENDERER_COMMAND/,
      );
    } finally {
      if (saved !== undefined) process.env.DIAGRAMPORT_RENDERER_COMMAND = saved;
    }
  });
});
