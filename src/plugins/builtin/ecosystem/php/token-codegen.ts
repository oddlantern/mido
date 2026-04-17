import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { WorkspacePackage } from "@/graph/types";
import type { ValidatedTokens } from "@/plugins/builtin/domain/design/types";
import type { ExecuteResult, ExecutionContext } from "@/plugins/types";

const HEADER = "<?php\n\n// GENERATED — DO NOT EDIT. Changes will be overwritten.";

/** Convert camelCase / snake_case / kebab-case to UPPER_SNAKE_CASE (PHP const idiom). */
function toConstName(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toUpperCase();
}

/** Narrow unknown domainData to ValidatedTokens at the boundary. */
function isValidatedTokens(value: unknown): value is ValidatedTokens {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { standard?: { color?: unknown } };
  return (
    typeof candidate.standard === "object" &&
    candidate.standard !== null &&
    typeof candidate.standard.color === "object"
  );
}

/**
 * Generate a PHP module with design token constants.
 *
 * Shape:
 *   - `final class Color` with `public const LIGHT_PRIMARY = '#...'`
 *     style class constants. PHP 8.3+ supports typed class constants;
 *     we emit string/int without annotations to stay compatible with
 *     8.1 (the Symfony 7 minimum).
 *   - `final class Spacing`/`Radius`/`IconSize` with integer class
 *     constants.
 *   - One `final class <ExtensionName>` per custom extension section.
 *
 * `final` prevents consumer subclassing of generated code — the
 * source of truth is tokens.json, not inheritance.
 */
export function generateTokensModule(tokens: ValidatedTokens, namespace: string): string {
  const { color, spacing, radius, iconSize } = tokens.standard;
  const lines: string[] = [HEADER, "", `namespace ${namespace};`, ""];

  // Color — two theme-prefixed constants per key.
  if (Object.keys(color).length > 0) {
    lines.push("final class Color");
    lines.push("{");
    for (const theme of ["LIGHT", "DARK"] as const) {
      const key = theme.toLowerCase() as "light" | "dark";
      for (const [name, entry] of Object.entries(color)) {
        lines.push(`    public const ${theme}_${toConstName(name)} = '${entry[key]}';`);
      }
      lines.push("");
    }
    // Drop the trailing blank before the closing brace.
    if (lines[lines.length - 1] === "") lines.pop();
    lines.push("}");
    lines.push("");
  }

  // Scalar sections — one class per dimension.
  const scalarGroups = [
    { className: "Spacing", entries: Object.entries(spacing) },
    { className: "Radius", entries: Object.entries(radius) },
    { className: "IconSize", entries: Object.entries(iconSize) },
  ];
  for (const group of scalarGroups) {
    if (group.entries.length === 0) continue;
    lines.push(`final class ${group.className}`);
    lines.push("{");
    for (const [name, value] of group.entries) {
      lines.push(`    public const ${toConstName(name)} = ${String(value)};`);
    }
    lines.push("}");
    lines.push("");
  }

  // Extensions — one class per section, theme-prefixed constants.
  for (const [, ext] of Object.entries(tokens.extensions)) {
    const fieldNames = Object.keys(ext.fields);
    if (fieldNames.length === 0) continue;

    lines.push(`final class ${ext.meta.className}`);
    lines.push("{");
    for (const theme of ["LIGHT", "DARK"] as const) {
      const key = theme.toLowerCase() as "light" | "dark";
      for (const name of fieldNames) {
        const field = ext.fields[name];
        if (!field) continue;
        lines.push(`    public const ${theme}_${toConstName(name)} = '${field[key]}';`);
      }
      lines.push("");
    }
    if (lines[lines.length - 1] === "") lines.pop();
    lines.push("}");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Scaffold a PHP package:
 *   - composer.json with a neutron-generated package name + PSR-4
 *     autoloading pointing at src/
 *   - src/Tokens.php with the generated classes under the configured
 *     namespace
 */
export function executeTokenGeneration(
  _pkg: WorkspacePackage,
  _root: string,
  context: ExecutionContext,
): ExecuteResult {
  const start = performance.now();

  if (!isValidatedTokens(context.domainData)) {
    return { success: false, duration: 0, summary: "No validated tokens in context.domainData" };
  }

  const outDir = context.outputDir;
  if (!outDir) {
    return { success: false, duration: 0, summary: "No outputDir provided" };
  }

  const workspace = context.graph.name;
  const sourceName = context.sourceName ?? "tokens";

  // PSR-4 namespace: <Workspace>\\<SourceName>, PascalCased.
  const workspaceNs = toPascalNamespace(workspace || "Generated");
  const sourceNs = toPascalNamespace(sourceName);
  const namespace = `${workspaceNs}\\${sourceNs}`;

  const srcDir = join(outDir, "src");
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(
    join(srcDir, "Tokens.php"),
    generateTokensModule(context.domainData, namespace),
    "utf-8",
  );

  // composer.json scaffold. vendor/<pkg> format; no runtime deps.
  const composerPath = join(outDir, "composer.json");
  if (!existsSync(composerPath)) {
    const pkgVendor = toComposerSegment(workspace || "workspace");
    const pkgName = toComposerSegment(sourceName);
    const composer = {
      name: `${pkgVendor}/${pkgName}`,
      description: "Generated design tokens — do not edit",
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

  return {
    success: true,
    duration: Math.round(performance.now() - start),
    summary: `src/Tokens.php written to ${outDir}`,
  };
}

/** Convert an arbitrary name to a PHP PascalCase namespace segment. */
function toPascalNamespace(str: string): string {
  const parts = str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .split(/[^a-zA-Z0-9]+/)
    .filter((p) => p.length > 0);
  return (
    parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("") || "Generated"
  );
}

/** Convert a name to a composer.json package segment (lowercase kebab). */
function toComposerSegment(str: string): string {
  return (
    str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "generated"
  );
}
