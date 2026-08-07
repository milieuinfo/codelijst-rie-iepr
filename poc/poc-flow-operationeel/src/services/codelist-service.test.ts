import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CodelistService, type CodelistResult, type JsonLdNode } from './codelist-service.js'
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
   cachedResult = (service as any).parseData(data, true) as CodelistResult
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

    it('captures prefLabel for thema_type (fixed upstream, previously absent)', () => {
      const result = loadFixture()
      const themaScheme = result.schemes.get('conceptscheme:thema_type')
      expect(themaScheme!.prefLabel).toBe('Thematische stroom')
    })
  })

  describe('getTopConceptsForScheme()', () => {
    it('returns top concepts for operationeel_lucht scheme', () => {
      const result = loadFixture()
      const topConcepts = CodelistServiceMock.getTopConceptsForScheme(result, 'conceptscheme:operationeel_lucht')
      // In the updated codelist format, operationeel_lucht has feature_ep as its sole top concept.
      // feature_bron was moved to operationeel_lucht_bron scheme (accessed via seeAlso navigation).
      expect(topConcepts.length).toBeGreaterThanOrEqual(1)
      // Verify feature_ep is present
      const featureEp = topConcepts.find(c => c.id.includes('feature_ep'))
      expect(featureEp).toBeDefined()
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

  describe('isPartOf/hasPart — getChildren() and getParent()', () => {
    it('resolves children of a composite parent concept', () => {
      const result = loadFixture()
      const parent = result.concepts.get('riepr-operationeel-lucht:afvalproduct')
      expect(parent).toBeDefined()
      expect(parent!.hasPart).toBeDefined()
      expect(parent!.hasPart!.length).toBeGreaterThan(0)

      const children = CodelistServiceMock.getChildren(result, parent!)
      expect(children.length).toBeGreaterThan(0)
      // Each child should be resolvable from the concepts map
      for (const child of children) {
        expect(child.prefLabel).toBeTruthy()
        expect(child.isPartOf).toContain(parent!.id)
      }
    })

    it('resolves parent via isPartOf reference', () => {
      const result = loadFixture()
      const child = result.concepts.get('riepr-operationeel-lucht:afvalproduct_aard')
      expect(child).toBeDefined()
      expect(child!.isPartOf).toBeDefined()

      const parent = CodelistServiceMock.getParent(result, child!)
      expect(parent).not.toBeNull()
      expect(parent!.id).toBe('riepr-operationeel-lucht:afvalproduct')
    })

    it('returns empty array when concept has no hasPart refs', () => {
      const result = loadFixture()
      const leafConcept = result.concepts.get('riepr-operationeel-lucht:afvalproduct_aard')!
      expect(CodelistServiceMock.getChildren(result, leafConcept)).toEqual([])
    })

    it('returns null when concept has no isPartOf ref', () => {
      const result = loadFixture()
      const rootConcept = result.concepts.get('riepr-operationeel-lucht:afvalproduct')!
      expect(CodelistServiceMock.getParent(result, rootConcept)).toBeNull()
    })

    /**
     * In the updated codelist format, grondwater theme no longer has sub-themes via
     * hasPart at the thema level. Instead, the composite measurement types
     * (kwaliteitsmeting, peilmeting, onttrekking/infiltratie) live as top-level
     * concepts inside operationeel_grondwater scheme with their own hasPart children.
     */
    it('handles grondwater composite hierarchy inside operationeel_grondwater scheme', () => {
      const result = loadFixture()
      // Grondwater theme now uses seeAlso for navigation
      const grondwaterThema = result.concepts.get('riepr-thema-type:grondwater')
      expect(grondwaterThema).toBeDefined()
      expect(grondwaterThema!.seeAlso).toContain('conceptscheme:operationeel_grondwater')

      // The composite measurement types are inside the operationeel_grondwater scheme
      const peilmeting = result.concepts.get('riepr-operationeel-grondwater:peilmeting')
      expect(peilmeting).toBeDefined()
      expect(peilmeting!.hasPart).toBeDefined()
      expect(peilmeting!.hasPart!.length).toBeGreaterThan(0)

      const children = CodelistServiceMock.getChildren(result, peilmeting!)
      expect(children.length).toBeGreaterThan(1)
      const labels = children.map(c => c.prefLabel || '')
      // Datum and Diepte are known children of peilmeting
      expect(labels.some(l => l.includes('Datum'))).toBe(true)
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

    /**
     * In the updated codelist format, thema concepts use seeAlso instead of
     * relevantRiepr for scheme navigation. This test verifies that getSeeAlsoRefs
     * correctly resolves the link from a thema to its operationeel scheme.
     */
    it('getSeeAlsoRefs resolves theme → operationeel scheme navigation', () => {
      const result = loadFixture()
      // zelfcontrole-water's seeAlso points at operationeel_zelfcontrole_water scheme
      const concept = result.concepts.get('riepr-thema-type:zelfcontrole-water')
      expect(concept).toBeDefined()
      expect(concept!.seeAlso).toBeDefined()
      expect(concept!.seeAlso!).toContain('conceptscheme:operationeel_zelfcontrole_water')

      const refs = CodelistServiceMock.getSeeAlsoRefs(result, concept!)
      expect(refs.length).toBeGreaterThan(0)
      // The target should be a conceptscheme
      const targetScheme = refs.find(r => r.type?.includes('skos:ConceptScheme'))
      expect(targetScheme).toBeDefined()
      expect(targetScheme!.id).toBe('conceptscheme:operationeel_zelfcontrole_water')
    })

    /**
     * External seeAlso references (e.g., ADMS status URIs) are silently dropped
     * since they don't resolve to local schemes or concepts in this document.
     */
    it('getSeeAlsoRefs drops external URI references (ADMS status links)', () => {
      const result = loadFixture()
      // Status type concepts have seeAlso pointing at external ADMS URIs
      const concept = result.concepts.get('riepr-status-type:in_dienst')
      expect(concept).toBeDefined()
      expect(concept!.seeAlso).toBeDefined()

      const refs = CodelistServiceMock.getSeeAlsoRefs(result, concept!)
      // External URIs like http://purl.org/adms/status/Completed won't resolve locally
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

  describe('resolveOperationeelSchemeId()', () => {
    /**
     * The new codelist format uses seeAlso for theme→scheme navigation.
     * This helper method should resolve the operationeel scheme from a thema concept.
     */
    it('resolves operationeel scheme via seeAlso (new format)', () => {
      const result = loadFixture()
      const luchtThema = result.concepts.get('riepr-thema-type:lucht')!
      const schemeId = svc.resolveOperationeelSchemeId(result, luchtThema)
      expect(schemeId).toBe('conceptscheme:operationeel_lucht')
    })

    it('resolves operationeel scheme via seeAlso for grondstoffen', () => {
      const result = loadFixture()
      const grondstoffenThema = result.concepts.get('riepr-thema-type:grondstoffen')!
      const schemeId = svc.resolveOperationeelSchemeId(result, grondstoffenThema)
      expect(schemeId).toBe('conceptscheme:operationeel_grondstoffen')
    })

    it('returns undefined when no seeAlso or relevantRiepr points to a scheme', () => {
      const result = loadFixture()
      // A leaf concept without schema references
      const leafConcept = result.concepts.get('riepr-operationeel-lucht:afvalproduct_aard')!
      const schemeId = svc.resolveOperationeelSchemeId(result, leafConcept)
      expect(schemeId).toBeUndefined()
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
      const result = (service as any).parseData(data, true)

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

  /**
   * New properties from updated codelist format: seeAlso, isMultiselect, relevantClass.
   */
  describe('new codelist properties', () => {
    it('parses seeAlso on a concept that chains to a sub-scheme', () => {
      const result = loadFixture()
      // feature_bron has seeAlso → operationeel_lucht_rapportering
      const concept = result.concepts.get('riepr-operationeel-lucht:feature_bron')
      expect(concept).toBeDefined()
      expect(concept!.seeAlso).toContain('conceptscheme:operationeel_lucht_rapportering')
    })

    it('parses isMultiselect as boolean when normalizeBooleans is true', () => {
      const result = loadFixture()
      const concept = result.concepts.get('riepr-operationeel-lucht:feature_bron')
      expect(concept).toBeDefined()
      // isMultiselect: "true" in the source data → parsed as boolean true
      expect(concept!.isMultiselect).toBe(true)
    })

    it('parses relevantClass string property', () => {
      const result = loadFixture()
      const concept = result.concepts.get('riepr-operationeel-lucht:afvalproduct')
      expect(concept).toBeDefined()
      expect(concept!.relevantClass).toBe('sosa:Observation')
    })

    it('parses relevantClass for FeatureOfInterest concepts', () => {
      const result = loadFixture()
      const concept = result.concepts.get('riepr-operationeel-lucht:feature_ep')
      expect(concept).toBeDefined()
      expect(concept!.relevantClass).toBe('sosa:FeatureOfInterest')
    })
  })
})

describe('conditionPath / conditionValue parsing', () => {
    function makeNode(id: string, props: Record<string, unknown>): JsonLdNode {
      return { id, '@type': ['skos:Concept'], ...props }
    }

    function parse(nodes: JsonLdNode[]): CodelistResult {
      const service = new CodelistService()
      return (service as any).parseData({ graph: nodes }, true)
    }

    it('parses standard camelCase keys (conditionPath, conditionValue)', () => {
      const result = parse([makeNode('field-a', {}), makeNode('field-b', {
        conditionPath: 'field-a',
        conditionValue: 'some-value',
      })])
      const fieldB = result.concepts.get('field-b')!
      expect(fieldB.conditionPath).toBe('field-a')
      expect(fieldB.conditionValue).toBe('some-value')
    })

    it('parses snake_case key variants (condition_path, condition_value)', () => {
      const result = parse([makeNode('trigger-field', {}), makeNode('dependent-field', {
        condition_path: 'trigger-field',
        condition_value: 'triggered',
      })])
      const dep = result.concepts.get('dependent-field')!
      expect(dep.conditionPath).toBe('trigger-field')
      expect(dep.conditionValue).toBe('triggered')
    })

    it('extracts id from inline {@id: ...} object for conditionPath', () => {
      const result = parse([makeNode('ref-concept', {}), makeNode('dependent', {
        conditionPath: { '@id': 'ref-concept' },
        conditionValue: 'match',
      })])
      const dep = result.concepts.get('dependent')!
      expect(dep.conditionPath).toBe('ref-concept')
      expect(dep.conditionValue).toBe('match')
    })

    it('leaves both properties undefined when neither is present on a concept', () => {
      const result = parse([makeNode('plain-field', { prefLabel: 'Plain' })])
      const plain = result.concepts.get('plain-field')!
      expect(plain.conditionPath).toBeUndefined()
      expect(plain.conditionValue).toBeUndefined()
    })

    it('parses conditionValue as a plain string literal regardless of content', () => {
      const result = parse([makeNode('a', {}), makeNode('b', {
        conditionPath: 'a',
        conditionValue: '123',
      }), makeNode('c', {
        conditionPath: 'a',
        conditionValue: '',
      })])
      const b = result.concepts.get('b')!
      const c = result.concepts.get('c')!
      expect(b.conditionValue).toBe('123')
      expect(c.conditionValue).toBe('')
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
  getSeeAlsoRefs: (r: CodelistResult, n: Scheme | Concept) => svc.getSeeAlsoRefs(r, n),
}
