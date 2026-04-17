import type { FrameworkAdapter } from "@/plugins/builtin/domain/openapi/adapters/types";

/**
 * Axum + utoipa — the current mainstream Rust setup for OpenAPI.
 *
 * The typical wiring is:
 *   1. Annotate handlers with `#[utoipa::path(...)]`
 *   2. Derive `OpenApi` on a struct listing all paths/components
 *   3. Serve `ApiDoc::openapi()` at `/api-docs/openapi.json`
 *
 * That endpoint path is a utoipa convention, not a framework default,
 * so plenty of apps mount it elsewhere — fallbacks cover common
 * alternatives, including `/swagger-ui/api-docs/openapi.json` which
 * `utoipa-swagger-ui` mounts automatically.
 *
 * actix-web also supports utoipa and shares the same endpoint
 * conventions, which is why this adapter only requires axum for now —
 * we add actix-web specifically if users ask for it.
 */
export const axumAdapter: FrameworkAdapter = {
  name: "axum",
  ecosystem: "rust",

  detect(deps: Record<string, string>): boolean {
    return "axum" in deps;
  },

  openapiPlugins: ["utoipa"],
  defaultSpecPath: "/api-docs/openapi.json",
  fallbackSpecPaths: ["/openapi.json", "/swagger-ui/api-docs/openapi.json", "/docs/openapi.json"],
};
