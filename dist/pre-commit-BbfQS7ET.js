#!/usr/bin/env node
import { c as PASS, i as FAIL } from "./output-MbJ98jNX.js";
import { n as runCheck } from "./check-qJ6B_1Uc.js";
import { runFmt } from "./fmt-CChJ8i2k.js";
import { runLint } from "./lint-BAk-7ZHC.js";
//#region src/commands/pre-commit.ts
/**
* Run the full pre-commit validation suite.
* Stops on first failure for fast feedback.
*
* Order: format check → lint → workspace check
*
* @returns exit code (0 = all pass, 1 = any failure)
*/
async function runPreCommit(parsers) {
	const steps = [
		{
			name: "format",
			run: () => runFmt(parsers, {
				check: true,
				quiet: true
			})
		},
		{
			name: "lint",
			run: () => runLint(parsers, { quiet: true })
		},
		{
			name: "workspace",
			run: () => runCheck(parsers, { quiet: true })
		}
	];
	for (const step of steps) {
		if (await step.run() !== 0) {
			console.log(`${FAIL} ${step.name}`);
			return 1;
		}
		console.log(`${PASS} ${step.name}`);
	}
	return 0;
}
//#endregion
export { runPreCommit };

//# sourceMappingURL=pre-commit-BbfQS7ET.js.map