/**
 * Reads and queries the RIE-IEPR SKOS codelists (rie-iepr.jsonld).
 *
 * This class is a thin façade over two focused modules so the public API stays
 * stable for the components and the test suite:
 * - `codelist-parse.ts` — flattens the JSON-LD document into a canonical id index
 *   and maps it to typed `Concept` / `Scheme` views (`parseCodelist`).
 * - `concept-query.ts` — pure query helpers over the parsed result (top-level
 *   concepts, children, `related`-group merging, and seeAlso/relevantRiepr
 *   reference resolution for the multi-step flow).
 *
 * **seeAlso-based navigation:** The updated codelist format uses `seeAlso`
 * instead of `relevantRiepr` for theme→scheme navigation and for chaining
 * multi-step flows within operational schemes. Use `getSeeAlsoRefs()` /
 * `resolveOperationeelSchemeId()` to resolve these links.
 */

import type { CodelistOptions, CodelistResult, Concept, Scheme } from '../models/index.js'
import { parseCodelist } from './codelist-parse.js'
import * as query from './concept-query.js'

export type { CodelistOptions, CodelistResult, JsonLdNode } from '../models/index.js'

export class CodelistService {
  private readonly resourcePath: string = 'resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/'
  private readonly fileName: string = 'rie-iepr.jsonld'

  /**
   * Resolves the app base from the page URL (e.g. "/" locally, "/codelijst-rie-iepr/" on GitHub Pages).
   * @returns The base path string.
   */
  private getAppBase(): string {
    const p = window.location.pathname
    const idx = p.lastIndexOf('/')
    return p.substring(0, idx + 1) || '/'
  }

  async loadCodelist(options: CodelistOptions = {}): Promise<CodelistResult> {
    const normalizeBooleans = options.normalizeBooleans ?? true

    const url = this.getAppBase() + this.resourcePath + this.fileName
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Failed to fetch codelist: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as Record<string, unknown>

    return this.parseData(data, normalizeBooleans)
  }

  /**
   * Parse a raw codelist JSON-LD document into a `CodelistResult` (delegates to `codelist-parse`).
   * @param data - The raw JSON-LD document.
   * @param normalizeBooleans - Whether to coerce flag fields to booleans.
   * @returns The parsed CodelistResult.
   */
  protected parseData(data: Record<string, unknown>, normalizeBooleans: boolean): CodelistResult {
    return parseCodelist(data, normalizeBooleans)
  }

  getSchemes(result: CodelistResult): Scheme[] {
    return query.getSchemes(result)
  }

  getScheme(result: CodelistResult, id: string): Scheme | undefined {
    return query.getScheme(result, id)
  }

  getConcept(result: CodelistResult, id: string): Concept | undefined {
    return query.getConcept(result, id)
  }

  getConceptsForScheme(result: CodelistResult, schemeId: string): Concept[] {
    return query.getConceptsForScheme(result, schemeId)
  }

  getTopConceptsForScheme(result: CodelistResult, schemeId: string): Concept[] {
    return query.getTopConceptsForScheme(result, schemeId)
  }

  getTopLevelConcepts(result: CodelistResult, schemeId: string): Concept[] {
    return query.getTopLevelConcepts(result, schemeId)
  }

  getChildren(result: CodelistResult, concept: Concept): Concept[] {
    return query.getChildren(result, concept)
  }

  getChildrenMerged(result: CodelistResult, concept: Concept): Concept[] {
    return query.getChildrenMerged(result, concept)
  }

  getParent(result: CodelistResult, concept: Concept): Concept | null {
    return query.getParent(result, concept)
  }

  getCodeListSchemes(result: CodelistResult, concept: Concept): Scheme[] {
    return query.getCodeListSchemes(result, concept)
  }

  getRelevantRieprRefs(result: CodelistResult, node: Scheme | Concept): (Scheme | Concept)[] {
    return query.getRelevantRieprRefs(result, node)
  }

  getSeeAlsoRefs(result: CodelistResult, node: Scheme | Concept): (Scheme | Concept)[] {
    return query.getSeeAlsoRefs(result, node)
  }

  resolveOperationeelSchemeId(result: CodelistResult, themeConcept: Concept): string | undefined {
    return query.resolveOperationeelSchemeId(result, themeConcept)
  }
}
