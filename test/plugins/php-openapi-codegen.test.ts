import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { WorkspacePackage } from "@/graph/types";
import { executeOpenapiModelGeneration } from "@/plugins/builtin/ecosystem/php/openapi-codegen";
import type { ExecutionContext } from "@/plugins/types";

// PHP OpenAPI codegen is types-only, matching Rust and Go. Tests
// cover the output layout and the error surfaces. Compile-check runs
// end-to-end under `php -l`.

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "neutron-php-oapi-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function makePkg(): WorkspacePackage {
  return {
    name: "php-client",
    path: "packages/php-client",
    ecosystem: "php",
    version: "1.0.0",
    dependencies: [],
    localDependencies: [],
  };
}

function makeContext(overrides: Partial<ExecutionContext>): ExecutionContext {
  return {
    graph: { name: "ws", root, packages: new Map(), bridges: [] },
    packageManager: "bun",
    root,
    findEcosystemHandlers: async () => [],
    ...overrides,
  };
}

function writeSpec(content: unknown): string {
  const path = "openapi.json";
  writeFileSync(join(root, path), JSON.stringify(content), "utf-8");
  return path;
}

describe("executeOpenapiModelGeneration — PHP output structure", () => {
  test("writes src/Models.php + composer.json", async () => {
    const artifactPath = writeSpec({
      components: {
        schemas: { User: { type: "object", properties: { id: { type: "string" } } } },
      },
    });
    const outDir = join(root, "out");

    const result = await executeOpenapiModelGeneration(
      makePkg(),
      root,
      makeContext({ artifactPath, outputDir: outDir, sourceName: "api" }),
    );
    expect(result.success).toBe(true);
    expect(result.summary).toContain("PHP class");
    // Types-only signal surfaces in CLI output — matches Rust/Go.
    expect(result.summary).toContain("models only");

    expect(existsSync(join(outDir, "src", "Models.php"))).toBe(true);
    expect(existsSync(join(outDir, "composer.json"))).toBe(true);
  });

  test("Models.php namespace matches the composer.json PSR-4 autoload key", async () => {
    // Drift between these two would break class autoloading —
    // consumers wouldn't find the generated classes. Lock the
    // contract.
    const artifactPath = writeSpec({
      components: { schemas: { U: { type: "object", properties: { id: { type: "string" } } } } },
    });
    const outDir = join(root, "out");
    await executeOpenapiModelGeneration(
      makePkg(),
      root,
      makeContext({ artifactPath, outputDir: outDir, sourceName: "api" }),
    );
    const php = readFileSync(join(outDir, "src", "Models.php"), "utf-8");
    const composer = JSON.parse(readFileSync(join(outDir, "composer.json"), "utf-8")) as {
      autoload: { "psr-4": Record<string, string> };
    };
    const psr4Key = Object.keys(composer.autoload["psr-4"])[0]!;
    // psr-4 key has a trailing backslash; namespace declaration doesn't.
    const namespaceFromPhp = php.match(/namespace\s+([^;]+);/)?.[1];
    expect(namespaceFromPhp + "\\").toBe(psr4Key);
  });

  test("generated file has declare(strict_types=1)", async () => {
    const artifactPath = writeSpec({
      components: { schemas: { U: { type: "object", properties: { id: { type: "string" } } } } },
    });
    const outDir = join(root, "out");
    await executeOpenapiModelGeneration(
      makePkg(),
      root,
      makeContext({ artifactPath, outputDir: outDir }),
    );
    const php = readFileSync(join(outDir, "src", "Models.php"), "utf-8");
    expect(php).toContain("declare(strict_types=1);");
  });

  test("generates a class for each components.schemas entry", async () => {
    const artifactPath = writeSpec({
      components: {
        schemas: {
          User: { type: "object", properties: { id: { type: "string" } } },
          Order: { type: "object", properties: { total: { type: "number" } } },
        },
      },
    });
    const outDir = join(root, "out");
    const result = await executeOpenapiModelGeneration(
      makePkg(),
      root,
      makeContext({ artifactPath, outputDir: outDir }),
    );
    expect(result.success).toBe(true);
    const php = readFileSync(join(outDir, "src", "Models.php"), "utf-8");
    expect(php).toContain("class User");
    expect(php).toContain("class Order");
  });

  test("composer.json has no runtime deps beyond php >=8.1", async () => {
    // Generated models rely only on language features — no Guzzle,
    // no Symfony components. Users wire those in themselves.
    const artifactPath = writeSpec({
      components: { schemas: { U: { type: "object", properties: { id: { type: "string" } } } } },
    });
    const outDir = join(root, "out");
    await executeOpenapiModelGeneration(
      makePkg(),
      root,
      makeContext({ artifactPath, outputDir: outDir }),
    );
    const composer = JSON.parse(readFileSync(join(outDir, "composer.json"), "utf-8")) as {
      require: Record<string, string>;
    };
    expect(composer.require).toEqual({ php: ">=8.1" });
  });
});

describe("executeOpenapiModelGeneration — error surfaces", () => {
  test("fails when artifactPath is not set", async () => {
    const result = await executeOpenapiModelGeneration(
      makePkg(),
      root,
      makeContext({ outputDir: join(root, "out") }),
    );
    expect(result.success).toBe(false);
    expect(result.summary).toContain("artifactPath");
  });

  test("fails when outputDir is not set", async () => {
    const result = await executeOpenapiModelGeneration(
      makePkg(),
      root,
      makeContext({ artifactPath: "openapi.json" }),
    );
    expect(result.success).toBe(false);
    expect(result.summary).toContain("outputDir");
  });

  test("fails when the spec file cannot be read", async () => {
    const result = await executeOpenapiModelGeneration(
      makePkg(),
      root,
      makeContext({ artifactPath: "missing.json", outputDir: join(root, "out") }),
    );
    expect(result.success).toBe(false);
    expect(result.summary).toContain("Failed to read OpenAPI spec");
  });

  test("preserves an existing composer.json", async () => {
    const artifactPath = writeSpec({
      components: { schemas: { U: { type: "object", properties: { id: { type: "string" } } } } },
    });
    const outDir = join(root, "out");
    mkdirSync(outDir, { recursive: true });
    const custom = '{"name":"user/owned","version":"9.9.9"}\n';
    writeFileSync(join(outDir, "composer.json"), custom, "utf-8");

    await executeOpenapiModelGeneration(
      makePkg(),
      root,
      makeContext({ artifactPath, outputDir: outDir }),
    );
    expect(readFileSync(join(outDir, "composer.json"), "utf-8")).toBe(custom);
  });
});
