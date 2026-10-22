import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CodelistService, type CodelistResult } from './codelist-service.js'
import type { Concept, Scheme } from '../models/index.js'
import { resolveUnitLabel } from './unit-labels.js'

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.ttl',
)

let cachedResult: CodelistResult | null = null

/**
 * Test helper: expose the protected parseData on CodelistService without `any` casts.
 */
interface AccessibleCodelistService {
  parseData(turtle: string, normalizeBooleans: boolean): CodelistResult
}

const access = (service: CodelistService): CodelistService & AccessibleCodelistService =>
  service as unknown as CodelistService & AccessibleCodelistService


/**
 * Load and parse the real rie-iepr.ttl fixture, caching the result for subsequent calls.
 * @returns The parsed codelist result object.
 */
function loadFixture(): CodelistResult {
  if (cachedResult) return cachedResult
  const service = new CodelistService()
  cachedResult = access(service).parseData(readFileSync(FIXTURE_PATH, 'utf-8'), true)
  return cachedResult
}

describe('CodelistService — fixture parsing', () => {
  describe('loading/parsing the codelist', () => {
    it('parses the real rie-iepr.ttl without throwing', () => {
      const result = loadFixture()
      expect(result).toBeDefined()
      expect(result.nodesById.size).toBeGreaterThan(0)
      expect(result.schemes.size).toBeGreaterThan(0)
      expect(result.concepts.size).toBeGreaterThan(0)
    })

    it('indexes every subject by id', () => {
      const result = loadFixture()
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
      // feature_bron was moved to operationeel_lucht_bron scheme (accessed via vervolgstap navigation).
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

  describe('broaderPartitive/hasPart — getChildren() and getParent()', () => {
    it('resolves children of a composite parent concept', () => {
      const result = loadFixture()
      const parent = result.concepts.get('lucht:afvalproduct')
      expect(parent).toBeDefined()
      expect(parent!.hasPart).toBeDefined()
      expect(parent!.hasPart!.length).toBeGreaterThan(0)

      const children = CodelistServiceMock.getChildren(result, parent!)
      expect(children.length).toBeGreaterThan(0)
      // Each child should be resolvable from the concepts map
      for (const child of children) {
        expect(child.prefLabel).toBeTruthy()
        expect(child.broaderPartitive).toContain(parent!.id)
      }
    })

    it('resolves parent via broaderPartitive reference', () => {
      const result = loadFixture()
      const child = result.concepts.get('lucht:afvalproduct_aard')
      expect(child).toBeDefined()
      expect(child!.broaderPartitive).toBeDefined()

      const parent = CodelistServiceMock.getParent(result, child!)
      expect(parent).not.toBeNull()
      expect(parent!.id).toBe('lucht:afvalproduct')
    })

    it('returns empty array when concept has no hasPart refs', () => {
      const result = loadFixture()
      const leafConcept = result.concepts.get('lucht:afvalproduct_aard')!
      expect(CodelistServiceMock.getChildren(result, leafConcept)).toEqual([])
    })

    it('returns null when concept has no broaderPartitive ref', () => {
      const result = loadFixture()
      const rootConcept = result.concepts.get('lucht:afvalproduct')!
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
      // Grondwater theme now uses vervolgstap for navigation
      const grondwaterThema = result.concepts.get('thema:grondwater')
      expect(grondwaterThema).toBeDefined()
      expect(grondwaterThema!.vervolgstap).toContain('conceptscheme:operationeel_grondwater')

      // The composite measurement types are inside the operationeel_grondwater scheme
      const peilmeting = result.concepts.get('grondwater:peilmeting')
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
      const concept = result.concepts.get('installatie-eigenschappen:verwijderingsrendement_stof')
      expect(concept).toBeDefined()
      const schemes = CodelistServiceMock.getCodeListSchemes(result, concept!)
      expect(schemes).toEqual([])
    })

    it('getCodeListSchemes returns [] for TODO placeholder refs', () => {
      const result = loadFixture()
      const concept = result.concepts.get('grondstoffen:grondstof_materiaalcode')
      expect(concept).toBeDefined()
      expect(concept!.relevantCodeList).toContain('http://TODO')
      const schemes = CodelistServiceMock.getCodeListSchemes(result, concept!)
      expect(schemes).toEqual([])
      expect(CodelistServiceMock.getCodeListOptions(result, concept!)).toEqual([])
    })

    /**
     * In the updated codelist format, thema concepts use vervolgstap instead of
     * relevantRiepr for scheme navigation. This test verifies that getVervolgstapRefs
     * correctly resolves the link from a thema to its operationeel scheme.
     */
    it('getVervolgstapRefs resolves theme → operationeel scheme navigation', () => {
      const result = loadFixture()
      // zelfcontrole-water's vervolgstap points at operationeel_zelfcontrole_water scheme
      const concept = result.concepts.get('thema:zelfcontrole-water')
      expect(concept).toBeDefined()
      expect(concept!.vervolgstap).toBeDefined()
      expect(concept!.vervolgstap!).toContain('conceptscheme:operationeel_zelfcontrole_water')

      const refs = CodelistServiceMock.getVervolgstapRefs(result, concept!)
      expect(refs.length).toBeGreaterThan(0)
      // The target should be a conceptscheme
      const targetScheme = refs.find(r => r.type?.includes('skos:ConceptScheme'))
      expect(targetScheme).toBeDefined()
      expect(targetScheme!.id).toBe('conceptscheme:operationeel_zelfcontrole_water')
    })

    /**
     * Only flow links are vervolgstap (qb:codeList). Status type concepts keep
     * their rdfs:seeAlso to ADMS status URIs, which is not a flow step.
     */
    it('getVervolgstapRefs returns [] for concepts without a vervolgstap (ADMS status links)', () => {
      const result = loadFixture()
      const concept = result.concepts.get('status-type:in_dienst')
      expect(concept).toBeDefined()
      expect(concept!.vervolgstap ?? []).toEqual([])
      expect(CodelistServiceMock.getVervolgstapRefs(result, concept!)).toEqual([])
    })

    it('getCodeListSchemes returns [] when all relevantCodeList refs are unresolvable', () => {
      const result = loadFixture()
      const concept = result.concepts.get('water:lozing-stof')
      expect(concept).toBeDefined()
      const schemes = CodelistServiceMock.getCodeListSchemes(result, concept!)
      expect(schemes).toEqual([])
    })
  })

  describe('resolveOperationeelSchemeId()', () => {
    /**
     * The new codelist format uses vervolgstap for theme→scheme navigation.
     * This helper method should resolve the operationeel scheme from a thema concept.
     */
    it('resolves operationeel scheme via vervolgstap (new format)', () => {
      const result = loadFixture()
      const luchtThema = result.concepts.get('thema:lucht')!
      const schemeId = svc.resolveOperationeelSchemeId(result, luchtThema)
      expect(schemeId).toBe('conceptscheme:operationeel_lucht')
    })

    it('resolves operationeel scheme via vervolgstap for grondstoffen', () => {
      const result = loadFixture()
      const grondstoffenThema = result.concepts.get('thema:grondstoffen')!
      const schemeId = svc.resolveOperationeelSchemeId(result, grondstoffenThema)
      expect(schemeId).toBe('conceptscheme:operationeel_grondstoffen')
    })

    it('returns undefined when no vervolgstap or relevantRiepr points to a scheme', () => {
      const result = loadFixture()
      // A leaf concept without schema references
      const leafConcept = result.concepts.get('lucht:afvalproduct_aard')!
      const schemeId = svc.resolveOperationeelSchemeId(result, leafConcept)
      expect(schemeId).toBeUndefined()
    })
  })

  describe('getConcept()', () => {
    it('returns a concept by id or undefined for unknown ids', () => {
      const result = loadFixture()
      const known = CodelistServiceMock.getConcept(result, 'lucht:afvalproduct')
      expect(known).toBeDefined()
      expect(known!.prefLabel).toBe('Afvalproduct')

      const unknown = CodelistServiceMock.getConcept(result, 'nonexistent-concept-id')
      expect(unknown).toBeUndefined()
    })
  })

  describe('boolean normalization', () => {
    it('normalizes string "true"/"false" to booleans when normalizeBooleans is true (default)', () => {
      const service = new CodelistService()
      const result = access(service).parseData(readFileSync(FIXTURE_PATH, 'utf-8'), true)

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
   * New properties from updated codelist format: vervolgstap, isMultiselect, relevantClass.
   */
  describe('new codelist properties', () => {
    it('parses vervolgstap on a concept that chains to a sub-scheme', () => {
      const result = loadFixture()
      // feature_bron has vervolgstap → operationeel_lucht_rapportering
      const concept = result.concepts.get('lucht:feature_bron')
      expect(concept).toBeDefined()
      expect(concept!.vervolgstap).toContain('conceptscheme:operationeel_lucht_rapportering')
    })

    it('parses isMultiselect as boolean when normalizeBooleans is true', () => {
      const result = loadFixture()
      const concept = result.concepts.get('lucht:feature_bron')
      expect(concept).toBeDefined()
      // isMultiselect: "true" in the source data → parsed as boolean true
      expect(concept!.isMultiselect).toBe(true)
    })

    it('parses relevantClass string property', () => {
      const result = loadFixture()
      const concept = result.concepts.get('lucht:afvalproduct')
      expect(concept).toBeDefined()
      expect(concept!.relevantClass).toBe('riepr:Observatie')
    })

    it('parses relevantClass for FeatureOfInterest concepts', () => {
      const result = loadFixture()
      const concept = result.concepts.get('lucht:feature_ep')
      expect(concept).toBeDefined()
      expect(concept!.relevantClass).toBe('sosa:FeatureOfInterest')
    })
  })

})

describe('CSOR collections and variabele', () => {
  it('indexes skos:Collection members', () => {
    const result = loadFixture()
    const members = result.collections.get('collectie:operationeel_stoffen_water')
    expect(members).toBeDefined()
    expect(members).toContain('csor_variabele:V_46')
  })

  it('getCodeListOptions resolves a collection of CSOR variabelen with their labels', () => {
    const result = loadFixture()
    const stof = result.concepts.get('water:lozing-stof')!
    expect(stof.relevantCodeList).toEqual(['collectie:operationeel_stoffen_water'])
    const options = CodelistServiceMock.getCodeListOptions(result, stof)
    expect(options).toContainEqual({ value: 'csor_variabele:V_46', label: 'Fosfor' })
    expect(options.every(o => o.label && !o.label.startsWith('V_'))).toBe(true)
  })

  it('getCodeListOptions still resolves a conceptscheme to its top concepts', () => {
    const result = loadFixture()
    const meetfrequentie = result.concepts.get('water:lozing-meetfrequentie')!
    const options = CodelistServiceMock.getCodeListOptions(result, meetfrequentie)
    const topConcepts = CodelistServiceMock.getTopConceptsForScheme(result, 'conceptscheme:operationeel_zelfcontrole_meetfrequentie')
    expect(options.map(o => o.value)).toEqual(topConcepts.map(c => c.id))
  })

  it('parses the CSOR semantics of a value field', () => {
    const result = loadFixture()
    const concentratie = result.concepts.get('water:lozing-concentratie')!
    expect(concentratie.kwantiteitsAspect).toBe('csor_kwantificeerbaaraspect:KWA_1')
    expect(concentratie.drager).toBe('csor_drager:DR_1')
    expect(concentratie.soortWaartbepaling).toBe('csor_soortwaardebepaling:SWB_1')
    expect(concentratie.variabele).toBe('water:lozing-stof')
  })

  it('describeVariabele names the measured variable, with or without a selected stof', () => {
    const result = loadFixture()
    const concentratie = result.concepts.get('water:lozing-concentratie')!
    expect(CodelistServiceMock.describeVariabele(result, concentratie)).toBe('Massaconcentratie van de verontreinigende stof in water')
    expect(CodelistServiceMock.describeVariabele(result, concentratie, 'csor_variabele:V_46')).toBe('Massaconcentratie van Fosfor in water')

    const afwijking = result.concepts.get('lucht:emissie_parameter_standaardafwijking')!
    expect(CodelistServiceMock.describeVariabele(result, afwijking, 'csor_variabele:V_1057')).toBe('Standaard deviatie van percentage van Stikstofoxiden in lucht')

    const naam = result.concepts.get('lucht:brandstof_naam')!
    expect(CodelistServiceMock.describeVariabele(result, naam)).toBeUndefined()
  })

  it('resolves CSOR eenheden to their symbol', () => {
    expect(resolveUnitLabel('csor_eenheid:E_1')).toBe('mg/L')
    expect(resolveUnitLabel('csor_eenheid:E_12')).toBe('kg/jr')
    expect(resolveUnitLabel('unit:DAY')).toBe('dag')
    expect(resolveUnitLabel('http://TODO')).toBeUndefined()
  })
})

/** Prefixes for the synthetic Turtle documents below; `ex:` holds the test concepts. */
const TEST_PREFIXES = `
@prefix ex: <https://example.org/> .
@prefix riepr-type: <https://example.org/riepr-type/> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix thes: <http://purl.org/iso25964/skos-thes#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix v: <https://data.riepr.omgeving.vlaanderen.be/ns/vocab#> .
`

/**
 * Parse a synthetic Turtle body (prefixes added) through the service.
 * @param body - Turtle statements using the TEST_PREFIXES.
 * @returns The parsed codelist.
 */
function parse(body: string): CodelistResult {
  return access(new CodelistService()).parseData(TEST_PREFIXES + body, true)
}

describe('IRI-based parsing', () => {
  it('reads properties by IRI, whatever prefix the document uses for them', () => {
    const result = parse(`
      @prefix other: <http://www.w3.org/2004/02/skos/core#> .
      @prefix cube: <http://purl.org/linked-data/cube#> .
      ex:a a other:Concept ; other:prefLabel "A"@nl ; cube:codeList ex:stap .
    `)
    const a = result.concepts.get('ex:a')!
    expect(a.prefLabel).toBe('A')
    expect(a.type).toEqual(['skos:Concept'])
    expect(a.vervolgstap).toEqual(['ex:stap'])
  })

  it('compacts the POC namespaces with its own prefixes, not the document\'s', () => {
    const result = parse(`
      @prefix cs: <https://data.omgeving.vlaanderen.be/id/conceptscheme/riepr/> .
      cs:thema_type a skos:ConceptScheme .
    `)
    expect(result.schemes.has('conceptscheme:thema_type')).toBe(true)
    expect(result.prefixes.conceptscheme).toBe('https://data.omgeving.vlaanderen.be/id/conceptscheme/riepr/')
    expect(result.prefixes.cs).toBeUndefined()
  })

  it('prefers the Dutch label', () => {
    const result = parse('ex:a a skos:Concept ; skos:prefLabel "A"@en, "B"@nl .')
    expect(result.concepts.get('ex:a')!.prefLabel).toBe('B')
  })
})

describe('conditionPath / conditionValue parsing', () => {
  it('parses sh:path and sh:hasValue', () => {
    const result = parse(`
      ex:field-a a skos:Concept .
      ex:field-b a skos:Concept ; sh:path ex:field-a ; sh:hasValue ex:some-value .
    `)
    const fieldB = result.concepts.get('ex:field-b')!
    expect(fieldB.conditionPath).toBe('ex:field-a')
    expect(fieldB.conditionValue).toBe('some-value')
  })

  it('accepts a literal conditionValue', () => {
    const result = parse(`
      ex:trigger a skos:Concept .
      ex:dependent a skos:Concept ; sh:path ex:trigger ; sh:hasValue "triggered" .
    `)
    expect(result.concepts.get('ex:dependent')!.conditionValue).toBe('triggered')
  })

  it('leaves both properties undefined when neither is present on a concept', () => {
    const result = parse('ex:plain-field a skos:Concept ; skos:prefLabel "Plain" .')
    const plain = result.concepts.get('ex:plain-field')!
    expect(plain.conditionPath).toBeUndefined()
    expect(plain.conditionValue).toBeUndefined()
  })

  it('parses conditionValue as a plain string literal regardless of content', () => {
    const result = parse(`
      ex:a a skos:Concept .
      ex:b a skos:Concept ; sh:path ex:a ; sh:hasValue "123" .
      ex:c a skos:Concept ; sh:path ex:a ; sh:hasValue "" .
    `)
    expect(result.concepts.get('ex:b')!.conditionValue).toBe('123')
    expect(result.concepts.get('ex:c')!.conditionValue).toBe('')
  })
})

describe('related / conditionValues array parsing', () => {
  it('parses related as string[]', () => {
    const result = parse('ex:a a skos:Concept . ex:b a skos:Concept ; skos:related ex:a .')
    expect(result.concepts.get('ex:b')!.related).toEqual(['ex:a'])
  })

  it('leaves related undefined when not present', () => {
    const result = parse('ex:plain a skos:Concept .')
    expect(result.concepts.get('ex:plain')!.related).toBeUndefined()
  })

  it('parses multiple conditionValues into an array', () => {
    const result = parse(`
      ex:trigger a skos:Concept .
      ex:dependent a skos:Concept ; sh:path ex:trigger ; sh:hasValue riepr-type:belgisch, riepr-type:buitenlands .
    `)
    const dep = result.concepts.get('ex:dependent')!
    expect(dep.conditionValues).toEqual(['belgisch', 'buitenlands'])
    // Single value path still works for backward compat
    expect(dep.conditionValue).toBe('belgisch')
  })

  it('conditionValues contains one element when only a single conditionValue exists', () => {
    const result = parse(`
      ex:trigger a skos:Concept .
      ex:dependent a skos:Concept ; sh:path ex:trigger ; sh:hasValue "single-value" .
    `)
    const dep = result.concepts.get('ex:dependent')!
    expect(dep.conditionValues).toEqual(['single-value'])
    expect(dep.conditionValue).toBe('single-value')
  })
})

describe('getChildrenMerged()', () => {
  /**
   * A composite child in Turtle.
   * @param id - Local name of the child.
   * @param label - Its prefLabel.
   * @param verplicht - Its isVerplicht flag.
   * @returns The Turtle statements.
   */
  function child(id: string, label: string, verplicht: boolean): string {
    return `ex:${id} a skos:Concept ; thes:broaderPartitive ex:parent ; skos:inScheme ex:test ;
      skos:prefLabel "${label}"@nl ; dcterms:relation rdfs:label ;
      v:isVerplicht ${verplicht} ; v:relevantDataType xsd:string .`
  }

  it('returns empty array when concept has no children', () => {
    const result = parse('ex:leaf a skos:Concept .')
    expect(svc.getChildrenMerged(result, result.concepts.get('ex:leaf')!)).toEqual([])
  })

  it('returns original children when no member has related refs (no merge needed)', () => {
    const result = parse(`
      ex:parent a skos:Concept ; skos:prefLabel "Parent"@nl ; dcterms:hasPart ex:child-a, ex:child-b .
      ex:child-a a skos:Concept ; thes:broaderPartitive ex:parent ; skos:prefLabel "A"@nl .
      ex:child-b a skos:Concept ; thes:broaderPartitive ex:parent ; skos:prefLabel "B"@nl .
    `)
    const parentConcept = result.concepts.get('ex:parent')!
    expect(parentConcept.hasPart).toHaveLength(2)
    expect(svc.getChildrenMerged(result, parentConcept)).toHaveLength(2)
  })

  it('merges two related children into one synthetic group with deduped children', () => {
    const result = parse(`
      ex:parent a skos:Concept ; dcterms:hasPart ex:variant-a, ex:variant-b .
      ex:variant-a a skos:Concept ; thes:broaderPartitive ex:parent ; skos:inScheme ex:test ;
        skos:prefLabel "Variant A (Belgisch)"@nl ; skos:related ex:variant-b ;
        dcterms:hasPart ex:variant-a-child-naam, ex:variant-a-child-on ;
        sh:path ex:trigger-field ; sh:hasValue riepr-type:belgisch .
      ex:variant-b a skos:Concept ; thes:broaderPartitive ex:parent ; skos:inScheme ex:test ;
        skos:prefLabel "Variant B (Buitenlands)"@nl ; skos:related ex:variant-a ;
        dcterms:hasPart ex:variant-b-child-naam, ex:variant-b-child-btw ;
        sh:path ex:trigger-field ; sh:hasValue riepr-type:buitenlands .
      ${child('variant-a-child-naam', 'Naam', false)}
      ${child('variant-a-child-on', 'Ondernemingsnummer', true)}
      ${child('variant-b-child-naam', 'Naam', false)}
      ${child('variant-b-child-btw', 'BTW-nummer', true)}
    `)
    const merged = svc.getChildrenMerged(result, result.concepts.get('ex:parent')!)

    // One synthetic group replacing the two variants.
    expect(merged).toHaveLength(1)
    expect(merged[0].prefLabel).toBe('Variant A (Belgisch)')
    expect(merged[0].id).toBe('ex:variant')

    // Children deduped: naam (shared), on (belgisch), btw (buitenlands).
    expect(merged[0].hasPart).toHaveLength(3)

    const naam = result.concepts.get(merged[0].hasPart![0])!
    expect(naam.conditionValues).toEqual(['belgisch', 'buitenlands'])
    // Shared child required only when required in ALL appearances → naam is optional.
    expect(naam.isVerplicht).toBe(false)

    const on = result.concepts.get(merged[0].hasPart![1])!
    expect(on.conditionValues).toEqual(['belgisch'])
    expect(on.isVerplicht).toBe(true)
  })

  it('deduplicates children by relation::prefLabel across variants', () => {
    const result = parse(`
      ex:parent a skos:Concept ; dcterms:hasPart ex:v-a, ex:v-b .
      ex:v-a a skos:Concept ; thes:broaderPartitive ex:parent ; skos:inScheme ex:test ;
        skos:prefLabel "Variant A"@nl ; skos:related ex:v-b ;
        dcterms:hasPart ex:v-a-c1, ex:v-a-c2 ; sh:hasValue riepr-type:a .
      ex:v-b a skos:Concept ; thes:broaderPartitive ex:parent ; skos:inScheme ex:test ;
        skos:prefLabel "Variant B"@nl ; skos:related ex:v-a ;
        dcterms:hasPart ex:v-b-c3, ex:v-b-c4 ; sh:hasValue riepr-type:b .
      ${child('v-a-c1', 'Naam', false)}
      ${child('v-a-c2', 'Nummer', true)}
      ${child('v-b-c3', 'Naam', true)}
      ${child('v-b-c4', 'Adres', true)}
    `)
    const merged = svc.getChildrenMerged(result, result.concepts.get('ex:parent')!)

    expect(merged).toHaveLength(1)

    // Naam appears in BOTH variants (required in v-b only) → not required per the all-appearances rule.
    const children = merged[0].hasPart!.map(id => result.concepts.get(id)!)
    const naam = children.find(c => c.prefLabel === 'Naam')!
    expect(naam.conditionValues).toEqual(['a', 'b'])
    expect(naam.isVerplicht).toBe(false)
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
  getChildrenMerged: (r: CodelistResult, c: Concept) => svc.getChildrenMerged(r, c),
  getParent: (r: CodelistResult, c: Concept) => svc.getParent(r, c),
  getCodeListSchemes: (r: CodelistResult, c: Concept) => svc.getCodeListSchemes(r, c),
  getCodeListOptions: (r: CodelistResult, c: Concept) => svc.getCodeListOptions(r, c),
  describeVariabele: (r: CodelistResult, c: Concept, stofId?: string) => svc.describeVariabele(r, c, stofId),
  getRelevantRieprRefs: (r: CodelistResult, n: Scheme | Concept) => svc.getRelevantRieprRefs(r, n),
  getVervolgstapRefs: (r: CodelistResult, n: Scheme | Concept) => svc.getVervolgstapRefs(r, n),
}
