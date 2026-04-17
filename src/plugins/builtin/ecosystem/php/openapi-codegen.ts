import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { WorkspacePackage } from "@/graph/types";
import { isRecord } from "@/guards";
import { generatePhp } from "@/plugins/builtin/ecosystem/php/schema-codegen";
import { validateSchema } from "@/plugins/builtin/domain/schema/plugin";
import type { ExecuteResult, ExecutionContext } from "@/plugins/types";

/**
 * Header shipped with every generated file — same framing as Rust and
 * Go. Keeps the "why no full client" rationale visible in the code.
 */
const MODELS_HEADER = [
  "<?php",
  "",
  "// GENERATED — DO NOT EDIT. Changes will be overwritten.",
  "//",
  "// PHP OpenAPI codegen is types-only: we emit the classes from",
  "// components.schemas and leave the HTTP client to you. This matches",
  "// how the PHP ecosystem consumes APIs — thin wrappers over Guzzle,",
  "// Symfony HttpClient, or Saloon that you write once and own",
  "// end-to-end, rather than a generated client that locks you into",
  "// someone else's abstractions.",
  "//",
  "// If you need a full client generator, openapi-generator-cli or",
  "// jane-php/openapi cover that use case separately.",
  "",
  "declare(strict_types=1);",
  "",
].join("\n");

/**
 * Generate a PHP `Models.php` file from an OpenAPI spec's
 * components.schemas section. Reuses the JSON Schema validator
 * because components.schemas is JSON Schema under a different key.
 */
export async function executeOpenapiModelGeneration(
  _pkg: WorkspacePackage,
  root: string,
  context: ExecutionContext,
): Promise<ExecuteResult> {
  const start = performance.now();

  const artifactPath = context.artifactPath;
  if (!artifactPath) {
    return {
      success: false,
      duration: 0,
      summary: "No artifactPath set — openapi domain must run before codegen",
    };
  }

  const outDir = context.outputDir;
  if (!outDir) {
    return { success: false, duration: 0, summary: "No outputDir provided" };
  }

  const specPath = resolve(root, artifactPath);
  let spec: unknown;
  try {
    const raw = await readFile(specPath, "utf-8");
    spec = JSON.parse(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      duration: Math.round(performance.now() - start),
      summary: `Failed to read OpenAPI spec: ${msg}`,
    };
  }

  if (!isRecord(spec)) {
    return {
      success: false,
      duration: Math.round(performance.now() - start),
      summary: "OpenAPI spec must be a JSON object",
    };
  }

  const components = isRecord(spec["components"]) ? spec["components"] : null;
  const schemas = components && isRecord(components["schemas"]) ? components["schemas"] : {};

  const validation = validateSchema({ $defs: schemas });
  if (!validation.success || !validation.data) {
    const errorLines = validation.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
    return {
      success: false,
      duration: Math.round(performance.now() - start),
      summary: `OpenAPI components.schemas failed validation (${String(validation.errors.length)} errors)`,
      output: errorLines,
    };
  }

  const srcDir = join(outDir, "src");
  mkdirSync(srcDir, { recursive: true });

  // Build the namespace the same way the token codegen does so
  // consumers can mix-and-match tokens and models from one project.
  const workspaceNs = toPascalNamespace(context.graph.name || "Generated");
  const sourceNs = toPascalNamespace(context.sourceName ?? "client");
  const namespace = `${workspaceNs}\\${sourceNs}`;

  // generatePhp emits its own header. Prepend ours, add namespace,
  // strip the schema-codegen header.
  const classesOnly = generatePhp(validation.data)
    .replace(/^<\?php[\s\S]*?declare\(strict_types=1\);\n/, "")
    .trim();

  writeFileSync(
    join(srcDir, "Models.php"),
    MODELS_HEADER + `namespace ${namespace};\n\n` + classesOnly + "\n",
    "utf-8",
  );

  // composer.json scaffold — same shape as token codegen.
  const composerPath = join(outDir, "composer.json");
  if (!existsSync(composerPath)) {
    const pkgVendor = toComposerSegment(context.graph.name || "workspace");
    const pkgName = toComposerSegment(context.sourceName ?? "client");
    const composer = {
      name: `${pkgVendor}/${pkgName}`,
      description: "Generated OpenAPI models (types only) — do not edit",
      type: "library",
      require: { php: ">=8.1" },
      autoload: {
        "psr-4": {
          [`${namespace}\\`]: "src/",
        },
      },
    };
    writeFileSync(composerPath, JSON.stringify(composer, null, 2) + "\n", "utf-8");
  }

  const count = validation.data.definitions.length;
  return {
    success: true,
    duration: Math.round(performance.now() - start),
    summary: `${String(count)} PHP class(es) generated — models only (write a thin client over Guzzle or Symfony HttpClient)`,
  };
}

function toPascalNamespace(str: string): string {
  const parts = str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .split(/[^a-zA-Z0-9]+/)
    .filter((p) => p.length > 0);
  return (
    parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("") || "Generated"
  );
}

function toComposerSegment(str: string): string {
  return (
    str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "generated"
  );
}
