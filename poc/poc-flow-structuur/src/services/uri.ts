/**
 * @file Expands a codelist CURIE id to its full published URI.
 *
 * The concepts and schemes in the RIE-IEPR codelist are addressed throughout
 * the POC by compact CURIE ids (e.g. `installatie:fakkel`,
 * `installatie-eigenschappen:verwijderingsrendement`,
 * `conceptscheme:installatie_type`). The document's `@context` (captured in
 * `CodelistResult.prefixes` by `codelist-parse.ts`) maps each prefix to its
 * published URI base, so the full URI is `prefix-base + local-name`.
 *
 * These URIs are shown in a hover tooltip on the form label of every field
 * and on the selected type, so a reviewer can see exactly which concept a
 * rendered value or question refers to.
 */

import type { CodelistResult } from '../models/index.js'

/**
 * Expands one CURIE id to its full published URI.
 * @param result - The parsed codelist (provides the `@context` prefix map).
 * @param id - The CURIE id, e.g. `installatie:fakkel`.
 * @returns The full URI, or undefined when the id cannot be expanded
 *          (already an absolute URI, or an unknown/missing prefix).
 */
export function expandUri(result: CodelistResult, id: string): string | undefined {
  // Already absolute (http/https) — nothing to expand.
  if (/^https?:\/\//i.test(id)) return id

  const colon = id.indexOf(':')
  if (colon <= 0) return undefined

  const prefix = id.slice(0, colon)
  const base = result.prefixes[prefix]
  if (!base) return undefined

  return base + id.slice(colon + 1)
}
