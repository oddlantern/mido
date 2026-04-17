import type { FrameworkAdapter } from "@/plugins/builtin/domain/openapi/adapters/types";

/**
 * Symfony + NelmioApiDocBundle — the canonical PHP OpenAPI stack.
 *
 * Nelmio reads OpenAPI metadata from Symfony route annotations / PHP
 * attributes and serves the spec. Default endpoint under nelmio's
 * routing config is /api/doc.json; applications frequently mount it
 * elsewhere (/api/doc is the HTML UI, /api/docs.json is another common
 * pattern), hence the fallback list.
 *
 * API Platform and Laravel + l5-swagger use different dep names and
 * different spec paths — they can ship as separate adapters later.
 */
export const symfonyAdapter: FrameworkAdapter = {
  name: "symfony",
  ecosystem: "php",

  detect(deps: Record<string, string>): boolean {
    return "symfony/framework-bundle" in deps;
  },

  openapiPlugins: ["nelmio/api-doc-bundle"],
  defaultSpecPath: "/api/doc.json",
  fallbackSpecPaths: ["/api/docs.json", "/docs.json", "/swagger.json"],
};
