#!/usr/bin/env node
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
//#region src/version.ts
/** Absolute path to the mido package root directory. */
const MIDO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = join(MIDO_ROOT, "package.json");
const VERSION = JSON.parse(readFileSync(packageJsonPath, "utf-8")).version;
//#endregion
export { VERSION as n, MIDO_ROOT as t };

//# sourceMappingURL=version-WDd4fw5u.js.map