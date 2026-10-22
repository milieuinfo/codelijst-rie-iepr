/**
 * Reads and queries the RIE-IEPR SKOS codelists (rie-iepr.ttl).
 *
 * This class is a thin façade over two focused modules so the public API stays
 * stable for the components and the test suite:
 * - `codelist-parse.ts` — parses the Turtle document (properties matched by IRI)
 *   into a canonical id index and typed `Concept` / `Scheme` views (`parseCodelist`).
 * - `concept-query.ts` — pure query helpers over the parsed result (top-level
 *   concepts, children, `related`-group merging, and vervolgstap/relevantRiepr
 *   reference resolution for the multi-step flow).
 *
 * **vervolgstap-based navigation:** The updated codelist format uses `vervolgstap`
 * instead of `relevantRiepr` for theme→scheme navigation and for chaining
 * multi-step flows within operational schemes. Use `getVervolgstapRefs()` /
 * `resolveOperationeelSchemeId()` to resolve these links.
 */

import type { CodelistOptions, CodelistResult, Concept, Scheme } from '../models/index.js'
import { parseCodelist } from './codelist-parse.js'
import * as query from './concept-query.js'

export type { CodelistOptions, CodelistResult, RdfNode } from '../models/index.js'

export class CodelistService {
  private readonly resourcePath: string = 'resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/'
  private readonly fileName: string = 'rie-iepr.ttl'

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

    return this.parseData(await response.text(), normalizeBooleans)
  }

  /**
   * Parse a codelist Turtle document into a `CodelistResult` (delegates to `codelist-parse`).
   * @param turtle - The Turtle document.
   * @param normalizeBooleans - Whether to coerce flag fields to booleans.
   * @returns The parsed CodelistResult.
   */
  protected parseData(turtle: string, normalizeBooleans: boolean): CodelistResult {
    return parseCodelist(turtle, normalizeBooleans)
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

  getCodeListOptions(result: CodelistResult, concept: Concept): query.CodeListOption[] {
    return query.getCodeListOptions(result, concept)
  }

  describeVariabele(result: CodelistResult, concept: Concept, stofId?: string): string | undefined {
    return query.describeVariabele(result, concept, stofId)
  }

  getRelevantRieprRefs(result: CodelistResult, node: Scheme | Concept): (Scheme | Concept)[] {
    return query.getRelevantRieprRefs(result, node)
  }

  getVervolgstapRefs(result: CodelistResult, node: Scheme | Concept): (Scheme | Concept)[] {
    return query.getVervolgstapRefs(result, node)
  }

  resolveOperationeelSchemeId(result: CodelistResult, themeConcept: Concept): string | undefined {
    return query.resolveOperationeelSchemeId(result, themeConcept)
  }
}
