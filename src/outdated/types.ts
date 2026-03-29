/** Shared types for the outdated analysis subsystem. */

/** A workspace dependency grouped by name + ecosystem. */
export interface DepUsage {
  readonly name: string;
  readonly ecosystem: string;
  readonly range: string;
  readonly packages: readonly string[];
}

/** Enriched metadata from the package registry. */
export interface RegistryMetadata {
  readonly latest: string;
  readonly deprecated: string | undefined;
  readonly peerDependencies: Readonly<Record<string, string>> | undefined;
  readonly repositoryUrl: string | undefined;
  readonly tarballUrl: string | undefined;
  readonly changelogUrl: string | undefined;
}

/** A peer dependency conflict between the updated package and the workspace. */
export interface PeerConflict {
  readonly peerName: string;
  readonly requiredRange: string;
  readonly workspaceRange: string;
  readonly conflicting: boolean;
}

/** Composite risk score for an outdated dependency (0–100). */
export interface RiskScore {
  readonly total: number;
  readonly severity: number;
  readonly affectedCount: number;
  readonly deprecation: number;
  readonly peerConflicts: number;
}

/** An outdated dependency with enriched metadata and risk assessment. */
export interface OutdatedDep {
  readonly name: string;
  readonly ecosystem: string;
  readonly workspaceRange: string;
  readonly packages: readonly string[];
  readonly latest: string;
  readonly severity: "major" | "minor" | "patch";
  readonly metadata: RegistryMetadata;
  readonly peerConflicts: readonly PeerConflict[];
  readonly risk: RiskScore;
}

/** Diff between current and latest exported API surface. */
export interface TypeDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
}

/** Level 2 static analysis result for a single dependency. */
export interface StaticAnalysisResult {
  readonly dep: OutdatedDep;
  readonly typeDiff: TypeDiff | undefined;
  readonly usedRemovedExports: readonly string[];
  readonly usedChangedExports: readonly string[];
}

/** Level 3 live validation result for a single dependency. */
export interface ValidationResult {
  readonly dep: OutdatedDep;
  readonly typecheckPassed: boolean;
  readonly testsPassed: boolean;
  readonly typecheckOutput: string | undefined;
  readonly testOutput: string | undefined;
}

/** Options for the outdated command. */
export interface OutdatedOptions {
  readonly json?: boolean | undefined;
  readonly deep?: boolean | undefined;
  readonly verify?: boolean | undefined;
  readonly ci?: boolean | undefined;
}

/** Options for the upgrade command. */
export interface UpgradeOptions {
  readonly all?: boolean | undefined;
  readonly verify?: boolean | undefined;
  readonly dryRun?: boolean | undefined;
}
