import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CodelistService, type CodelistResult } from './codelist-service.js'
import type { Concept, Scheme } from '../models/skos-models.js'

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld',
)

let cachedResult: CodelistResult | null = null

/**
 * Load and parse the real rie-iepr.jsonld fixture, caching the result for subsequent calls.
 * @returns The parsed codelist result object.
 */
function loadFixture(): CodelistResult {
  if (cachedResult) return cachedResult
  const raw = readFileSync(FIXTURE_PATH, 'utf-8')
  const data = JSON.parse(raw) as Record<string, unknown>
  const service = new CodelistService()
  // @ts-expect-error parseData is private — accessing via prototype for testing only
  cachedResult = service.parseData(data, true)
  return cachedResult
}

describe('CodelistService — fixture parsing', () => {
  describe('loading/parsing the codelist', () => {
    it('parses the real rie-iepr.jsonld without throwing', () => {
      const result = loadFixture()
      expect(result).toBeDefined()
      expect(result.nodesById.size).toBeGreaterThan(0)
      expect(result.schemes.size).toBeGreaterThan(0)
      expect(result.concepts.size).toBeGreaterThan(0)
    })

    it('indexes every graph node by id including deeply nested ones', () => {
      const result = loadFixture()
      // schema.org type definitions in @context are nodes too
      expect(result.nodesById.size).toBeGreaterThanOrEqual(result.concepts.size + result.schemes.size)
    })
  })

  describe('getSchemes()', () => {
    it('returns all concept schemes from the fixture', () => {
      const result = loadFixture()
      const schemes = Array.from(result.schemes.values())
      expect(schemes.length).toBeGreaterThan(15)

      // thema_type is a known scheme (even if prefLabel is empty per ISSUES.md)
      const themaScheme = result.schemes.get('conceptscheme:thema_type')
      expect(themaScheme).toBeDefined()
      expect(themaScheme!.id).toBe('conceptscheme:thema_type')
    })

    it('captures prefLabel, definition and note when present', () => {
      const result = loadFixture()
      const luchtScheme = result.schemes.get('conceptscheme:operationeel_lucht')
      expect(luchtScheme).toBeDefined()
      expect(luchtScheme!.prefLabel).toBeTruthy()
    })

    it('handles conceptscheme with no prefLabel gracefully', () => {
      const result = loadFixture()
      const themaScheme = result.schemes.get('conceptscheme:thema_type')
      expect(themaScheme!.prefLabel).toBeUndefined()
    })
  })

  describe('getTopConceptsForScheme()', () => {
    it('returns top concepts for operationeel_lucht scheme', () => {
      const result = loadFixture()
      const topConcepts = CodelistServiceMock.getTopConceptsForScheme(result, 'conceptscheme:operationeel_lucht')
      // hasTopConcept includes both roots AND composite children (ISSUES.md HASTOPCONCEPT-INCLUDES-CHILDREN)
      expect(topConcepts.length).toBeGreaterThan(5)
    })

    it('returns empty array for unknown scheme id', () => {
      const result = loadFixture()
      const topConcepts = CodelistServiceMock.getTopConceptsForScheme(
        result,
        'conceptscheme:this-does-not-exist',
      )
      expect(topConcepts).toEqual([])
    })
  })

  describe('broader/narrower — getChildren() and getParent()', () => {
    it('resolves children of a composite parent concept', () => {
      const result = loadFixture()
      const parent = result.concepts.get('riepr-operationeel-lucht:afvalproduct')
      expect(parent).toBeDefined()
      expect(parent!.narrower).toBeDefined()
      expect(parent!.narrower!.length).toBeGreaterThan(0)

      const children = CodelistServiceMock.getChildren(result, parent!)
      expect(children.length).toBeGreaterThan(0)
      // Each child should be resolvable from the concepts map
      for (const child of children) {
        expect(child.prefLabel).toBeTruthy()
        expect(child.broader).toContain(parent!.id)
      }
    })

    it('resolves parent via broader reference', () => {
      const result = loadFixture()
      const child = result.concepts.get('riepr-operationeel-lucht:afvalproduct_aard')
      expect(child).toBeDefined()
      expect(child!.broader).toBeDefined()

      const parent = CodelistServiceMock.getParent(result, child!)
      expect(parent).not.toBeNull()
      expect(parent!.id).toBe('riepr-operationeel-lucht:afvalproduct')
    })

    it('returns empty array when concept has no narrower refs', () => {
      const result = loadFixture()
      const leafConcept = result.concepts.get('riepr-operationeel-lucht:afvalproduct_aard')!
      expect(CodelistServiceMock.getChildren(result, leafConcept)).toEqual([])
    })

    it('returns null when concept has no broader ref', () => {
      const result = loadFixture()
      const rootConcept = result.concepts.get('riepr-operationeel-lucht:afvalproduct')!
      expect(CodelistServiceMock.getParent(result, rootConcept)).toBeNull()
    })

    it('handles grondwater theme hierarchy (parent with multiple children)', () => {
      const result = loadFixture()
      const grondwater = result.concepts.get('riepr-thema-type:grondwater')
      expect(grondwater).toBeDefined()
      expect(grondwater!.narrower).toBeDefined()

      const children = CodelistServiceMock.getChildren(result, grondwater!)
      expect(children.length).toBeGreaterThan(1)
      // Kwaliteitsmeting is one known child per ISSUES.md RELEVANTRIEPR-PLURALIZATION-TYPO
      const labels = children.map(c => c.prefLabel || '')
      expect(labels.some(l => l.includes('Kwaliteitsmeting'))).toBe(true)
    })
  })

  describe('unresolvable / dangling refs degrade gracefully', () => {
    it('getCodeListSchemes returns [] for external URL refs (ISSUES.md CODELIST-UNRESOLVABLE-REFS)', () => {
      const result = loadFixture()
      const concept = result.concepts.get('riepr-installatie-eigenschappen:verwijderingsrendement_stof')
      expect(concept).toBeDefined()
      const schemes = CodelistServiceMock.getCodeListSchemes(result, concept!)
      expect(schemes).toEqual([])
    })

    it('getCodeListSchemes returns [] for TODO placeholder refs', () => {
      const result = loadFixture()
      const concept = result.concepts.get('riepr-operationeel-water:lozing-meetfrequentie')
      expect(concept).toBeDefined()
      const schemes = CodelistServiceMock.getCodeListSchemes(result, concept!)
      expect(schemes).toEqual([])
    })

    it('getRelevantRieprRefs returns [] for pluralization-typo ref (ISSUES.md RELEVANTRIEPR-PLURALIZATION-TYPO)', () => {
      const result = loadFixture()
      // grondwater-kwaliteitsmeting references "operationeel_grondwater_kwaliteitsmeting**s**" with trailing s
      // but the actual scheme is singular — this dangling ref must not throw
      const concept = result.concepts.get('riepr-thema-type:grondwater-kwaliteitsmeting')
      expect(concept).toBeDefined()
      expect(concept!.relevantRiepr).toBeDefined()
      expect(concept!.relevantRiepr!).toContain('conceptscheme:operationeel_grondwater_kwaliteitsmetings')

      const refs = CodelistServiceMock.getRelevantRieprRefs(result, concept!)
      expect(refs).toEqual([])
    })

    it('getCodeListSchemes returns [] when all relevantCodeList refs are unresolvable', () => {
      const result = loadFixture()
      const concept = result.concepts.get('riepr-operationeel-water:lozing-stof')
      expect(concept).toBeDefined()
      const schemes = CodelistServiceMock.getCodeListSchemes(result, concept!)
      expect(schemes).toEqual([])
    })
  })

  describe('getConcept()', () => {
    it('returns a concept by id or undefined for unknown ids', () => {
      const result = loadFixture()
      const known = CodelistServiceMock.getConcept(result, 'riepr-operationeel-lucht:afvalproduct')
      expect(known).toBeDefined()
      expect(known!.prefLabel).toBe('Afvalproduct')

      const unknown = CodelistServiceMock.getConcept(result, 'nonexistent-concept-id')
      expect(unknown).toBeUndefined()
    })
  })

  describe('boolean normalization', () => {
    it('normalizes string "true"/"false" to booleans when normalizeBooleans is true (default)', () => {
      const raw = readFileSync(FIXTURE_PATH, 'utf-8')
      const data = JSON.parse(raw) as Record<string, unknown>
      const service = new CodelistService()
      // @ts-expect-error parseData is private — accessing via prototype for testing only
      const result = service.parseData(data, true)

      // Find any concept with boolean fields set in the fixture
      let foundBooleanField = false
      for (const concept of result.concepts.values()) {
        if (typeof concept.isVerplicht === 'boolean' || typeof concept.isMeervoudig === 'boolean') {
          foundBooleanField = true
          break
        }
      }
      // At least some concepts should have normalized booleans
      expect(foundBooleanField).toBe(true)
    })
  })
})

// Convenience wrapper so tests don't need to import CodelistService separately
const svc = new CodelistService()
const CodelistServiceMock = {
  getSchemes: (r: CodelistResult) => svc.getSchemes(r),
  getScheme: (r: CodelistResult, id: string) => svc.getScheme(r, id),
  getConcept: (r: CodelistResult, id: string) => svc.getConcept(r, id),
  getTopConceptsForScheme: (r: CodelistResult, id: string) => svc.getTopConceptsForScheme(r, id),
  getChildren: (r: CodelistResult, c: Concept) => svc.getChildren(r, c),
  getParent: (r: CodelistResult, c: Concept) => svc.getParent(r, c),
  getCodeListSchemes: (r: CodelistResult, c: Concept) => svc.getCodeListSchemes(r, c),
  getRelevantRieprRefs: (r: CodelistResult, n: Scheme | Concept) => svc.getRelevantRieprRefs(r, n),
}
