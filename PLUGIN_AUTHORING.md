# Authoring a neutron plugin

External plugins extend neutron with new ecosystems (languages) or new domains (artifact formats). A plugin is a regular npm package that `neutron` loads at runtime when it's listed in `neutron.yml.plugins`.

## Which kind to build

| Want to support… | Write a… | Example |
|---|---|---|
| A new language (lint / format / build / test / typecheck) | `EcosystemPlugin` | `neutron-plugin-zig`, `neutron-plugin-kotlin` |
| A new artifact format users' packages produce or consume | `DomainPlugin` | `neutron-plugin-graphql`, `neutron-plugin-protobuf` |

Check first whether the gap is really neither — e.g., an additional *framework* for an existing ecosystem (second Python framework, different Go OpenAPI stack) is a framework adapter that lives under `src/plugins/builtin/domain/openapi/adapters/`, not an external plugin. Open an issue for those.

## Package layout

```
neutron-plugin-<name>/
├── package.json
├── src/
│   └── index.ts       (or index.js — whatever you ship)
└── README.md
```

Three supported export shapes (pick whichever fits):

```ts
// Single plugin as default export — most common
export default myPlugin;

// Named export called `plugin`
export const plugin = myPlugin;

// Multiple plugins in one package
export const plugins = [ecoPlugin, domainPlugin];
```

## Minimum ecosystem plugin

```ts
import type { EcosystemPlugin } from "@oddlantern/neutron/plugins";

export default {
  type: "ecosystem",
  name: "zig",
  manifest: "build.zig",

  async detect(pkg) {
    return pkg.ecosystem === "zig";
  },

  async getWatchPatterns() {
    return ["src/**/*.zig", "build.zig"];
  },

  async getActions() {
    return ["build", "test", "format"];
  },

  async execute(action, pkg, root, context) {
    // Run the right command for each action name.
    // Return { success, duration, summary, output? }.
    // ...
  },
} satisfies EcosystemPlugin;
```

## Minimum domain plugin

```ts
import type { DomainPlugin } from "@oddlantern/neutron/plugins";

export default {
  type: "domain",
  name: "graphql",

  async detectBridge(artifact, root) {
    return artifact.endsWith(".graphql") || artifact.endsWith(".graphqls");
  },

  async exportArtifact(source, artifact, root, context) {
    // Produce or validate the artifact from the source package.
    // ...
  },

  async generateDownstream(artifact, targets, root, context) {
    // Find ecosystem plugins that can handle this domain, delegate.
    const handlers = await context.findEcosystemHandlers("graphql", artifact);
    // ...
  },
} satisfies DomainPlugin;
```

## Types you can import

All the public plugin API lives at the `./plugins` subpath:

```ts
import {
  type EcosystemPlugin,
  type DomainPlugin,
  type DomainCapability,
  type ExecutionContext,
  type ExecuteResult,
  type PipelineStep,
  type ExecutablePipelineStep,
  type PipelineResult,
  type PipelineStepResult,
  type WatchPathSuggestion,
  type EcosystemHandler,
  type NeutronPlugin,
  STANDARD_ACTIONS,
} from "@oddlantern/neutron/plugins";
```

The contract for these is documented in the neutron source at `src/plugins/types.ts`. Stability: pre-1.0 breaking changes allowed in minors; post-1.0 they require a major version bump.

## How users install your plugin

```bash
bun add -d neutron-plugin-zig
```

Then in `neutron.yml`:

```yaml
workspace: my-project
plugins:
  - neutron-plugin-zig
ecosystems:
  zig:
    manifest: build.zig
    packages:
      - apps/game-server
```

`neutron doctor` verifies the plugin loaded. Any command that walks the plugin registry (generate, dev, build, lint, fmt, test) will use it.

## Testing your plugin

Your package tests should cover:
- `detect` returns true/false correctly
- `execute` routes every action name from `getActions` to something real
- For domain plugins: `detectBridge` + `exportArtifact` handle malformed input gracefully

`neutron` doesn't sandbox plugins — your code runs in the same process. Errors thrown from plugin methods propagate to the user's CLI output, so throw with clear messages.

## Naming convention

- Package name: `neutron-plugin-<name>` (unscoped) or `@<scope>/neutron-plugin-<name>` (scoped).
- Plugin `name` field: short, lowercase, no spaces. Matches what users put in `neutron.yml.ecosystems` or in bridge artifact detection.

## Override semantics

If your plugin's `name` matches a built-in plugin (e.g., you ship `neutron-plugin-custom-typescript` with `name: "typescript"`), your plugin replaces the built-in in the registry. Users installed it deliberately; silently ignoring it on name collision would surprise more than replacing does.

## Getting help

- Look at the built-in plugins in `src/plugins/builtin/` for reference implementations.
- Bugs in the plugin API or docs: open an issue with the `area:plugins` label.
- Open-ended design questions: start a GitHub Discussion.
