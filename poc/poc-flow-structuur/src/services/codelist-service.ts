/**
 * Reads the RIE-IEPR SKOS codelist (`rie-iepr.jsonld`) and parses it into a
 * `CodelistResult`. Querying is done by the pure functions in
 * `structuur-service.ts`; this class only owns loading and parsing.
 */

import type { CodelistOptions, CodelistResult } from '../models/index.js'
import { parseCodelist } from './codelist-parse.js'

export type { CodelistOptions, CodelistResult, JsonLdNode } from '../models/index.js'

export class CodelistService {
  private readonly resourcePath = 'resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/'
  private readonly fileName = 'rie-iepr.jsonld'

  /**
   * Resolves the app base from the page URL (e.g. "/" locally, "/codelijst-rie-iepr-poc-structuur/" on GitHub Pages).
   * @returns The base path string.
   */
  private getAppBase(): string {
    const p = window.location.pathname
    const idx = p.lastIndexOf('/')
    return p.substring(0, idx + 1) || '/'
  }

  /**
   * Fetches and parses the codelist that was copied into `public/` by `scripts/sync-codelist.mjs`.
   * @param options - Parsing options.
   * @returns The parsed codelist.
   */
  async loadCodelist(options: CodelistOptions = {}): Promise<CodelistResult> {
    const normalizeBooleans = options.normalizeBooleans ?? true

    const url = this.getAppBase() + this.resourcePath + this.fileName
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Kon de codelijst niet ophalen: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as Record<string, unknown>

    return this.parseData(data, normalizeBooleans)
  }

  /**
   * Parse a raw codelist JSON-LD document into a `CodelistResult` (delegates to `codelist-parse`).
   * @param data - The raw JSON-LD document.
   * @param normalizeBooleans - Ignored; booleans are always normalized. Kept for API symmetry.
   * @returns The parsed CodelistResult.
   */
  parseData(data: Record<string, unknown>, normalizeBooleans = true): CodelistResult {
    void normalizeBooleans
    return parseCodelist(data)
  }
}
