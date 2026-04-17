import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { WorkspacePackage } from "@/graph/types";
import type { ValidatedTokens } from "@/plugins/builtin/domain/design/types";
import {
  executeTokenGeneration,
  generateTokensModule,
} from "@/plugins/builtin/ecosystem/php/token-codegen";
import type { ExecutionContext } from "@/plugins/types";

// PHP codegen tests cover the idiom choices — `final class` with
// class constants, UPPER_SNAKE_CASE const names, theme-prefixed
// color constants, PSR-4 autoload scaffolding — plus the generated
// composer.json shape. Compile-check runs end-to-end under `php -l`.

function makeTokens(overrides?: Partial<ValidatedTokens>): ValidatedTokens {
  return {
    standard: {
      brand: {},
      color: {
        primary: { light: "#0066ff", dark: "#4488ff" },
        accentColor: { light: "#ff6600", dark: "#ffaa44" },
      },
      spacing: { xs: 4, mdLarge: 24 },
      radius: { sm: 4 },
      elevation: {},
      shadowCard: undefined,
      iconSize: { md: 24 },
      typography: undefined,
    },
    extensions: {},
    ...overrides,
  };
}

function makePkg(): WorkspacePackage {
  return {
    name: "php-tokens",
    path: "packages/php-tokens",
    ecosystem: "php",
    version: "1.0.0",
    dependencies: [],
    localDependencies: [],
  };
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "neutron-php-tok-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeContext(outputDir: string, tokens: ValidatedTokens, name = "tokens"): ExecutionContext {
  return {
    graph: { name: "ws", root, packages: new Map(), bridges: [] },
    packageManager: "bun",
    root,
    findEcosystemHandlers: async () => [],
    domainData: tokens,
    outputDir,
    sourceName: name,
  };
}

describe("generateTokensModule — PHP idioms", () => {
  test("opens with <?php tag and a namespace declaration", () => {
    const output = generateTokensModule(makeTokens(), "Ws\\Tokens");
    expect(output.startsWith("<?php")).toBe(true);
    expect(output).toContain("namespace Ws\\Tokens;");
  });

  test("emits final class Color with theme-prefixed UPPER_SNAKE_CASE constants", () => {
    const output = generateTokensModule(makeTokens(), "Ws\\Tokens");
    expect(output).toContain("final class Color");
    // camelCase → UPPER_SNAKE_CASE, with LIGHT_ / DARK_ theme prefix
    expect(output).toContain("public const LIGHT_PRIMARY = '#0066ff'");
    expect(output).toContain("public const DARK_PRIMARY = '#4488ff'");
    expect(output).toContain("public const LIGHT_ACCENT_COLOR = '#ff6600'");
    expect(output).toContain("public const DARK_ACCENT_COLOR = '#ffaa44'");
  });

  test("scalar sections get their own final classes with integer constants", () => {
    const output = generateTokensModule(makeTokens(), "Ws\\Tokens");
    expect(output).toContain("final class Spacing");
    expect(output).toContain("public const XS = 4");
    expect(output).toContain("public const MD_LARGE = 24");
    expect(output).toContain("final class Radius");
    expect(output).toContain("final class IconSize");
  });

  test("extensions produce one final class + theme-prefixed constants", () => {
    const tokens = makeTokens({
      extensions: {
        genres: {
          meta: { className: "GenreColors", getter: "genres" },
          fields: {
            fantasy: { light: "#aabbcc", dark: "#112233" },
          },
        },
      },
    });
    const output = generateTokensModule(tokens, "Ws\\Tokens");
    expect(output).toContain("final class GenreColors");
    expect(output).toContain("public const LIGHT_FANTASY = '#aabbcc'");
    expect(output).toContain("public const DARK_FANTASY = '#112233'");
  });

  test("classes are marked `final` — generated code isn't meant to be subclassed", () => {
    // The source of truth is tokens.json, not PHP inheritance. If a
    // consumer needs to extend Color, they write a wrapper, not a
    // subclass of the generated file.
    const output = generateTokensModule(makeTokens(), "Ws\\T");
    const classCount = (output.match(/^class /gm) ?? []).length;
    const finalClassCount = (output.match(/^final class /gm) ?? []).length;
    expect(finalClassCount).toBeGreaterThan(0);
    // No non-final classes.
    expect(classCount).toBe(0);
  });

  test("omits classes when the token section is empty", () => {
    const empty = makeTokens({
      standard: {
        brand: {},
        color: {},
        spacing: {},
        radius: {},
        elevation: {},
        shadowCard: undefined,
        iconSize: {},
        typography: undefined,
      },
    });
    const output = generateTokensModule(empty, "Ws\\T");
    expect(output).not.toContain("class Color");
    expect(output).not.toContain("class Spacing");
    expect(output).not.toContain("class Radius");
    expect(output).not.toContain("class IconSize");
  });
});

describe("executeTokenGeneration — file output", () => {
  test("writes src/Tokens.php + composer.json", () => {
    const outDir = join(root, "out");
    const result = executeTokenGeneration(
      makePkg(),
      root,
      makeContext(outDir, makeTokens(), "design-system"),
    );
    expect(result.success).toBe(true);
    expect(existsSync(join(outDir, "src", "Tokens.php"))).toBe(true);
    expect(existsSync(join(outDir, "composer.json"))).toBe(true);
  });

  test("composer.json declares PSR-4 autoload pointing at src/", () => {
    const outDir = join(root, "out");
    executeTokenGeneration(makePkg(), root, makeContext(outDir, makeTokens(), "design-system"));
    const composer = JSON.parse(readFileSync(join(outDir, "composer.json"), "utf-8")) as {
      name: string;
      autoload: { "psr-4": Record<string, string> };
    };
    // Package name is vendor/pkg lowercase-kebab.
    expect(composer.name).toBe("ws/design-system");
    // PSR-4 keys are namespace\\ (the trailing backslash) → directory.
    const psr4 = composer.autoload["psr-4"];
    const namespaceKey = Object.keys(psr4)[0];
    expect(namespaceKey).toMatch(/\\$/);
    expect(namespaceKey).toContain("Ws\\DesignSystem");
    expect(psr4[namespaceKey!]).toBe("src/");
  });

  test("uses the PSR-4 namespace in the generated php file", () => {
    const outDir = join(root, "out");
    executeTokenGeneration(makePkg(), root, makeContext(outDir, makeTokens(), "design-system"));
    const php = readFileSync(join(outDir, "src", "Tokens.php"), "utf-8");
    // The namespace declared in the file must match composer.json's
    // PSR-4 key (minus trailing backslash).
    expect(php).toContain("namespace Ws\\DesignSystem;");
  });

  test("composer.json requires php >=8.1 and nothing else", () => {
    const outDir = join(root, "out");
    executeTokenGeneration(makePkg(), root, makeContext(outDir, makeTokens()));
    const composer = JSON.parse(readFileSync(join(outDir, "composer.json"), "utf-8")) as {
      require: Record<string, string>;
    };
    expect(composer.require).toEqual({ php: ">=8.1" });
  });

  test("leaves an existing composer.json untouched", () => {
    const outDir = join(root, "out");
    const { mkdirSync, writeFileSync } = require("node:fs") as typeof import("node:fs");
    mkdirSync(outDir, { recursive: true });
    const custom = '{"name":"user/owned","version":"1.2.3"}\n';
    writeFileSync(join(outDir, "composer.json"), custom, "utf-8");
    executeTokenGeneration(makePkg(), root, makeContext(outDir, makeTokens()));
    expect(readFileSync(join(outDir, "composer.json"), "utf-8")).toBe(custom);
  });

  test("fails with clear message when domainData is missing", () => {
    const ctx: ExecutionContext = {
      graph: { name: "ws", root, packages: new Map(), bridges: [] },
      packageManager: "bun",
      root,
      findEcosystemHandlers: async () => [],
      outputDir: join(root, "out"),
    };
    const result = executeTokenGeneration(makePkg(), root, ctx);
    expect(result.success).toBe(false);
    expect(result.summary).toContain("validated tokens");
  });

  test("fails with clear message when outputDir is missing", () => {
    const ctx: ExecutionContext = {
      graph: { name: "ws", root, packages: new Map(), bridges: [] },
      packageManager: "bun",
      root,
      findEcosystemHandlers: async () => [],
      domainData: makeTokens(),
    };
    const result = executeTokenGeneration(makePkg(), root, ctx);
    expect(result.success).toBe(false);
    expect(result.summary).toContain("outputDir");
  });
});
