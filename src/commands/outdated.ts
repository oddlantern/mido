import { loadConfig } from "../config/loader.js";
import { DiagnosticCollector, formatDiagnostics } from "../diagnostic.js";
import { buildWorkspaceGraph } from "../graph/workspace.js";
import type { ParserRegistry } from "../graph/workspace.js";
import { BOLD, DIM, RESET } from "../output.js";
import { collectDeps, buildWorkspaceDepsMap } from "../outdated/collect.js";
import {
  formatLevel1Results,
  formatLevel2Results,
  formatLevel3Results,
  formatJsonOutput,
} from "../outdated/display.js";
import { runLevel1 } from "../outdated/level1.js";
import { runLevel2 } from "../outdated/level2.js";
import { runLevel3 } from "../outdated/level3.js";
import type { OutdatedOptions } from "../outdated/types.js";
import { confirmAction } from "../prompt.js";

export type { OutdatedOptions };

const MAX_QUICK_CHECK_DEPS = 5;

/**
 * Check all workspace dependencies against their registries.
 *
 * Progressive analysis:
 *   Level 1 (always) — registry scan with deprecation, peer conflicts, risk scores
 *   Level 2 (--deep or prompt) — static API surface diff
 *   Level 3 (--verify or prompt) — live validation with typecheck + tests
 *
 * @returns exit code (0 = all up to date or success, 1 = outdated deps found in --json/--ci mode)
 */
export async function runOutdated(
  parsers: ParserRegistry,
  options: OutdatedOptions = {},
): Promise<number> {
  const { config, root } = await loadConfig();
  const graph = await buildWorkspaceGraph(config, root, parsers);

  const deps = collectDeps(graph.packages);
  if (deps.length === 0) {
    console.log(`${DIM}No production dependencies found.${RESET}`);
    return 0;
  }

  console.log(
    `\n${BOLD}mido outdated${RESET} ${DIM}\u2014 checking ${deps.length} dependencies...${RESET}\n`,
  );

  // ── Level 1: Registry scan ──────────────────────────────────────────
  const workspaceDeps = buildWorkspaceDepsMap(graph.packages);
  const diag = new DiagnosticCollector();
  const { outdated, skipped } = await runLevel1(deps, workspaceDeps);

  if (skipped > 0) {
    diag.warn(`${skipped} dep(s) could not be checked (registry timeout or error)`, {
      fix: "Re-run mido outdated or check your network connection",
    });
  }

  // Machine-readable exits: no prompts, exit code 1 if outdated
  if (options.json) {
    console.log(formatJsonOutput(outdated));
    return outdated.length > 0 ? 1 : 0;
  }

  if (options.ci) {
    formatLevel1Results(outdated);
    if (diag.hasIssues) {
      console.log(formatDiagnostics(diag));
    }
    return outdated.length > 0 ? 1 : 0;
  }

  formatLevel1Results(outdated);

  if (outdated.length === 0) {
    if (diag.hasIssues) {
      console.log(formatDiagnostics(diag));
    }
    return 0;
  }

  // ── Level 2: Static analysis ────────────────────────────────────────
  const shouldRunLevel2 =
    options.verify || options.deep || (await confirmAction(`Run static analysis on ${outdated.length} outdated dep(s)?`, false));

  if (shouldRunLevel2) {
    console.log(
      `\n${BOLD}mido outdated${RESET} ${DIM}\u2014 running static analysis...${RESET}\n`,
    );

    const level2Results = await runLevel2(outdated, root, graph.packages);
    formatLevel2Results(level2Results);

    // ── Level 3: Live validation ────────────────────────────────────
    const shouldRunLevel3 =
      options.verify || (await confirmAction("Run live validation (install + typecheck + tests)?", false));

    if (shouldRunLevel3) {
      console.log(
        `\n${BOLD}mido outdated${RESET} ${DIM}\u2014 running live validation...${RESET}\n`,
      );

      const level3Results = await runLevel3(outdated, root, graph.packages);
      formatLevel3Results(level3Results);
    }
  }

  if (diag.hasIssues) {
    console.log(formatDiagnostics(diag));
  }

  console.log(
    `${DIM}Use ${BOLD}mido upgrade${RESET} ${DIM}to update dependencies.${RESET}`,
  );
  console.log(
    `${DIM}Run ${BOLD}mido check${RESET} ${DIM}to verify version consistency.${RESET}\n`,
  );

  return 0;
}

/**
 * Quick one-liner check for mido dev startup.
 * Only checks the top shared deps (most impactful) via Level 1.
 * Returns a summary string or null if all up to date.
 */
export async function quickOutdatedCheck(
  parsers: ParserRegistry,
): Promise<string | null> {
  try {
    const { config, root } = await loadConfig();
    const graph = await buildWorkspaceGraph(config, root, parsers);
    const deps = collectDeps(graph.packages);

    const sharedDeps = deps.filter((d) => d.packages.length > 1).slice(0, MAX_QUICK_CHECK_DEPS);
    if (sharedDeps.length === 0) {
      return null;
    }

    const workspaceDeps = buildWorkspaceDepsMap(graph.packages);
    const { outdated } = await runLevel1(sharedDeps, workspaceDeps);

    if (outdated.length === 0) {
      return null;
    }

    return `${outdated.length} shared dep(s) have updates. Run \`mido outdated\` for details.`;
  } catch {
    return null;
  }
}
