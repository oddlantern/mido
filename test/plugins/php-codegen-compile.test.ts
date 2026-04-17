import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { WorkspacePackage } from "@/graph/types";
import type { ValidatedTokens } from "@/plugins/builtin/domain/design/types";
import { executeTokenGeneration } from "@/plugins/builtin/ecosystem/php/token-codegen";
import type { ExecutionContext } from "@/plugins/types";

// End-to-end: does the generated PHP actually parse?
// `php -l` is PHP's syntax-only lint mode (no execution, no class
// loading). Catches missing semicolons, unclosed braces, wrong
// namespace separators — anything the structural unit tests miss.

function hasPhp(): boolean {
  const r = spawnSync("php", ["--version"], { encoding: "utf-8" });
  return r.status === 0;
}

function makeTokens(): ValidatedTokens {
  return {
    standard: {
      brand: {},
      color: {
        primary: { light: "#0066ff", dark: "#4488ff" },
        accentColor: { light: "#ff6600", dark: "#ffaa44" },
      },
      spacing: { xs: 4, mdLarge: 24 },
      radius: { sm: 4, full: 9999 },
      elevation: {},
      shadowCard: undefined,
      iconSize: { md: 24 },
      typography: undefined,
    },
    extensions: {
      genres: {
        meta: { className: "GenreColors", getter: "genres" },
        fields: {
          fantasy: { light: "#aabbcc", dark: "#112233" },
        },
      },
    },
  };
}

function makePkg(): WorkspacePackage {
  return {
    name: "php-codegen-compile",
    path: "packages/compile-check",
    ecosystem: "php",
    version: "1.0.0",
    dependencies: [],
    localDependencies: [],
  };
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "neutron-php-compile-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeContext(outputDir: string): ExecutionContext {
  return {
    graph: { name: "ws", root, packages: new Map(), bridges: [] },
    packageManager: "bun",
    root,
    findEcosystemHandlers: async () => [],
    outputDir,
    sourceName: "compile-check",
    domainData: makeTokens(),
  };
}

const phpAvailable = hasPhp();

describe("php codegen compile-check — tokens", () => {
  test.skipIf(!phpAvailable)("generated Tokens.php parses under `php -l`", () => {
    const outDir = join(root, "out");
    const result = executeTokenGeneration(makePkg(), root, makeContext(outDir));
    expect(result.success).toBe(true);

    const lint = spawnSync("php", ["-l", join(outDir, "src", "Tokens.php")], {
      encoding: "utf-8",
      timeout: 10_000,
    });
    if (lint.status !== 0) {
      throw new Error(
        `php -l failed (exit ${String(lint.status)}):\n${lint.stdout ?? ""}\n${lint.stderr ?? ""}`,
      );
    }
    expect(lint.status).toBe(0);
  }, 15_000);
});
