import { z } from "zod";

/** Schema for npm registry version response (GET /{name}/{version}). */
const npmRepositorySchema = z.union([
  z.object({ type: z.string().optional(), url: z.string() }),
  z.string(),
]);

export const npmVersionResponseSchema = z.object({
  version: z.string(),
  deprecated: z.string().optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
  repository: npmRepositorySchema.optional(),
  dist: z
    .object({
      tarball: z.string(),
    })
    .optional(),
});

export type NpmVersionResponse = z.infer<typeof npmVersionResponseSchema>;

/** Schema for pub.dev package response (GET /api/packages/{name}). */
export const pubDevPackageSchema = z.object({
  latest: z.object({
    version: z.string(),
    pubspec: z
      .object({
        name: z.string().optional(),
        dependencies: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
  }),
});

export type PubDevPackageResponse = z.infer<typeof pubDevPackageSchema>;

/** Safely parse npm version response. Returns null on failure. */
export function parseNpmVersion(data: unknown): NpmVersionResponse | null {
  const result = npmVersionResponseSchema.safeParse(data);
  return result.success ? result.data : null;
}

/** Safely parse pub.dev package response. Returns null on failure. */
export function parsePubDevPackage(data: unknown): PubDevPackageResponse | null {
  const result = pubDevPackageSchema.safeParse(data);
  return result.success ? result.data : null;
}
