// @vitest-environment node
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataFactory, Parser, Store } from 'n3'
import { compileGroundwater, compileTheme } from '../../../poc-json-schema/tests/groundwater-csv-fixture.js'
import { sourceSnapshot } from '../../../poc-json-schema/scripts/source-snapshot.mjs'
import { demonstrationProcessGraph } from './demo-process-graph.js'
import { exportTurtle } from './turtle-export.js'
import { isObject, SchemaEditor } from './schema-editor.js'
import { resolveProcesses } from './process-graph.js'
import uriTemplates from '../generated/uri-templates.json'
import { reportingRecords, schemaObject } from 'codelijst-rie-iepr-poc-json-schema/browser'

const { namedNode } = DataFactory
const rdfType = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
const riepr = 'https://data.riepr.omgeving.vlaanderen.be/ns/riepr#'
const sosa = 'http://www.w3.org/ns/sosa/'
const example = (name: string) => JSON.parse(readFileSync(new URL(`../../../poc-json-schema/examples/grondwater/${name}.json`, import.meta.url), 'utf8'))
const section = (name: string) => compileGroundwater(JSON.parse(sourceSnapshot())).subSchemas.find(item => item.name === name)!.schema
const options = () => ({ year: 2024, created: '2024-01-04T00:00:00Z', issued: '2024-02-05T12:30:00Z', processes: demonstrationProcessGraph() })
const shapes = fileURLToPath(new URL('../../test/fixtures/riepr-shacl.ttl', import.meta.url))

function validateTurtle(turtle: string) {
  const validator = [
    'import sys',
    'from rdflib import Graph',
    'from pyshacl import validate',
    'data = Graph().parse(data=sys.stdin.read(), format="turtle")',
    'shapes = Graph().parse(sys.argv[1], format="turtle")',
    'conforms, _, report = validate(data, shacl_graph=shapes, do_owl_imports=False)',
    'print(report)',
    'sys.exit(0 if conforms else 1)',
  ].join('\n')
  const result = spawnSync('python3', ['-c', validator, shapes], { input: turtle, encoding: 'utf8' })
  expect(result.status, result.stderr + result.stdout).toBe(0)
  expect(result.stdout).toContain('Conforms: True')
}

describe('Turtle export', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    ['Grondwater', 'peilmeting', 'grondwater/peilmeting'],
    ['Lucht', 'verbruikte-stof', 'lucht/verbruikte_stof'],
    ['Lucht', 'geproduceerde-stof', 'lucht/geproduceerde_stof'],
    ['Lucht', 'afvalproduct', 'lucht/afvalproduct'],
    ['Grondstoffen', 'inkomend', 'grondstoffen/inkomend'],
    ['Grondstoffen', 'grondstof', 'grondstoffen/grondstof'],
  ])('materializes the CSV-declared observed property for %s/%s without user input', (theme, name, path) => {
    const schema = compileTheme(JSON.parse(sourceSnapshot()), theme).subSchemas.find(item => item.name === name)!.schema
    const expected = JSON.parse(readFileSync(new URL(`../../../poc-json-schema/examples/${path}.json`, import.meta.url), 'utf8'))
    const draft: Record<string, unknown> = structuredClone(expected)
    for (const records of Object.values(draft)) {
      if (!Array.isArray(records)) continue
      for (const record of records) {
        if (!isObject(record)) throw new Error('Expected observation records in the example.')
        delete record.observedProperty
      }
    }
    const editor = new SchemaEditor(schema)
    editor.load(draft)
    expect(editor.project()).toEqual(expected)
  })

  it('omits the produced-materials UI flag when no materials were produced', () => {
    const schema = compileTheme(JSON.parse(sourceSnapshot()), 'Grondstoffen').subSchemas.find(item => item.name === 'grondstof')!.schema
    const turtle = exportTurtle(schema, { geproduceerd: false }, options())
    expect(new Parser().parse(turtle)).toHaveLength(0)
    expect(() => exportTurtle(schema, { geproduceerd: 'false' }, options())).toThrow('Ongeldige UI-sturing')
  })

  it('omits source-declared UI booleans beside reporting rows without using a hardcoded field name', () => {
    const schema = structuredClone(section('peilmeting'))
    const concept = 'urn:test:ui:include-readings'
    schema.properties!.toonMetingen = { type: 'boolean', 'x-source-concept': concept }
    schemaObject(schema.properties!.peilmeting)['x-visible-when'] = { sourceConcept: concept, values: [true] }
    const data = { toonMetingen: true, ...example('peilmeting') }
    const graph = new Store(new Parser().parse(exportTurtle(schema, data, options())))
    expect(graph.getSubjects(rdfType, namedNode(riepr + 'Observatie'), null)).toHaveLength(data.peilmeting.length)
    expect(graph.getQuads(null, null, DataFactory.literal('true', namedNode('http://www.w3.org/2001/XMLSchema#boolean')), null))
      .toHaveLength(0)
    const withoutCondition = structuredClone(schema)
    delete schemaObject(withoutCondition.properties!.peilmeting)['x-visible-when']
    expect(() => exportTurtle(withoutCondition, data, options())).toThrow('Ongeldige rapporteringsgroep: toonMetingen')
    schemaObject(schema.properties!.toonMetingen)['x-jsonld-id'] = 'urn:test:reported-flag'
    expect(() => exportTurtle(schema, data, options())).toThrow('Ongeldige rapporteringsgroep: toonMetingen')
    expect(() => exportTurtle(section('peilmeting'), { onbekend: false }, options()))
      .toThrow('Ongeldige rapporteringsgroep: onbekend')
  })

  it('resolves a reported fuel key to the same RDF resource as its own export, not an unattached key IRI', () => {
    const schemas = compileTheme(JSON.parse(sourceSnapshot()), 'Lucht').subSchemas
    const fuel = schemas.find(item => item.name === 'brandstof')!.schema
    const emission = schemas.find(item => item.name === 'emissie')!.schema
    const load = (name: string) => JSON.parse(readFileSync(new URL(`../../../poc-json-schema/examples/lucht/${name}.json`, import.meta.url), 'utf8'))
    const reports = [{ schema: fuel, data: load('brandstof'), year: 2024 }]
    const selected = reportingRecords(reports)[0].reference.id
    const data = load('emissie')
    data.emissie[0].used = [selected]
    const context = { ...options(), dependencies: schemas.map(item => item.schema), reports }
    const standalone = new Store(new Parser().parse(exportTurtle(fuel, reports[0].data, context)))
    const label = namedNode('http://www.w3.org/2000/01/rdf-schema#label')
    const subject = standalone.getSubjects(label, DataFactory.literal('Aardgas'), null)[0]
    expect(subject).toBeDefined()
    const turtle = exportTurtle(emission, data, context)
    const graph = new Store(new Parser().parse(turtle))
    expect(graph.getSubjects(namedNode('http://www.w3.org/ns/prov#used'), subject, null)).toHaveLength(1)
    expect(graph.getObjects(subject, namedNode(sosa + 'hasMember'), null).length).toBeGreaterThan(0)
    expect(graph.getQuads(null, null, namedNode(selected), null)).toHaveLength(0)
    validateTurtle(turtle)
    expect(() => exportTurtle(emission, data, options())).toThrow('Gerapporteerd record ontbreekt')
    expect(() => exportTurtle(emission, data, { ...context, year: 2025 })).toThrow('Gerapporteerd record ontbreekt')
  })

  it('writes grouped Turtle with prefixed terms and only used namespace declarations', () => {
    const turtle = exportTurtle(section('peilmeting'), example('peilmeting'), options())
    expect(turtle).toContain(`@prefix riepr: <${riepr}>.`)
    expect(turtle).toContain(`@prefix sosa: <${sosa}>.`)
    expect(turtle).toContain('a riepr:Observatie, sosa:Observation')
    expect(turtle).toMatch(/;\n\s+sosa:hasResult /)
    expect(turtle).toContain('^^xsd:dateTime')
    expect(turtle).not.toContain('_:report')
    expect(turtle).not.toContain('@prefix skos:')
    expect(turtle).not.toContain(`<${sosa}hasResult>`)
    expect(turtle).toMatch(/\.\n\n(?:<|[A-Za-z_:])/)
  })

  it('indents blank-node triples and leaves prefix declarations together', () => {
    const turtle = exportTurtle(section('kwaliteitsmeting'), example('kwaliteitsmeting'), options())
    expect(turtle).toMatch(/@prefix [^\n]+\.\n@prefix /)
    expect(turtle).not.toMatch(/@prefix [^\n]+\.\n\n@prefix /)
    expect(turtle).toContain(
      'prov:wasAssociatedWith [\n      a prov:Agent, riepr:Uitvoerder;\n      rdfs:label "Synthetisch laboratorium"\n    ];',
    )
  })

  it('mints distinct random and key-derived identifiers when LAN HTTP exposes only getRandomValues', () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
    const graph = new Store(new Parser().parse(exportTurtle(section('kwaliteitsmeting'), example('kwaliteitsmeting'), options())))
    const ids = graph.getObjects(null, namedNode(riepr + 'localId'), null).map(term => term.value)
    expect(ids.length).toBeGreaterThan(1)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.some(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4/.test(id))).toBe(true)
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[48][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('fails explicitly when no cryptographic random source is available', () => {
    vi.stubGlobal('crypto', undefined)
    expect(() => exportTurtle(section('peilmeting'), example('peilmeting'), options()))
      .toThrow('UUID-generatie is niet beschikbaar.')
  })

  it.each(['onttrekking', 'peilmeting', 'kwaliteitsmeting'])('serializes the %s example as RDF', name => {
    const schema = section(name)
    const graph = new Store(new Parser().parse(exportTurtle(schema, example(name), options())))
    const observations = graph.getSubjects(rdfType, namedNode(riepr + 'Observatie'), null)
    expect(observations.length).toBeGreaterThan(0)
    for (const observation of observations) {
      expect(graph.getObjects(observation, namedNode(sosa + 'hasFeatureOfInterest'), null)).toHaveLength(1)
      expect(graph.getObjects(observation, namedNode(sosa + 'hasResult'), null)).toHaveLength(1)
    }
    if (name === 'kwaliteitsmeting') {
      const sample = graph.getSubjects(rdfType, namedNode(riepr + 'Monster'), null)
      expect(sample).toHaveLength(1)
      expect(graph.has(sample[0], rdfType, namedNode(sosa + 'Sample'), null)).toBe(true)
      const sampling = graph.getObjects(sample[0], namedNode(sosa + 'isResultOf'), null)
      expect(sampling).toHaveLength(1)
      expect(graph.has(sampling[0], rdfType, namedNode(sosa + 'Sampling'), null)).toBe(true)
      expect(graph.getObjects(sampling[0], namedNode(sosa + 'hasUltimateFeatureOfInterest'), null))
        .toEqual([graph.getSubjects(rdfType, namedNode(riepr + 'Emissie'), null)[0]])
      expect(graph.getQuads(null, namedNode(sosa + 'ultimateFeatureOfInterest'), null, null)).toHaveLength(0)
      expect(graph.getSubjects(namedNode(sosa + 'hasMember'), sample[0], null)).toHaveLength(0)
      const features = graph.getSubjects(rdfType, namedNode(riepr + 'Emissie'), null)
      expect(graph.getObjects(features[0], namedNode('http://www.w3.org/ns/prov#wasDerivedFrom'), null).map(term => term.value).sort())
        .toEqual([...example(name)[name][0].hasFeatureOfInterest].sort())
    }
  })

  it('uses the ontology templates and matching RDF properties for reporting resources', () => {
    const graph = new Store(new Parser().parse(exportTurtle(section('kwaliteitsmeting'), example('kwaliteitsmeting'), options())))
    const definitions: Record<string, { template: string; mappings: Record<string, string> }> = uriTemplates
    for (const name of ['Emissie', 'Monster', 'Observatie', 'ObservatieVerzameling', 'Resultaat']) {
      const definition = definitions[riepr + name]
      const subjects = graph.getSubjects(rdfType, namedNode(riepr + name), null)
      expect(subjects.length, name).toBeGreaterThan(0)
      for (const subject of subjects) {
        expect(subject.termType).toBe('NamedNode')
        const expanded = definition.template.replace(/\{([a-z]+)\}/g, (_match, variable: string) => {
          const values = graph.getObjects(subject, namedNode(definition.mappings[variable]), null)
          expect(values, `${name}/${variable}`).toHaveLength(1)
          if (variable === 'jaar') expect(values[0].value).toBe('2024')
          if (variable === 'created') expect(values[0].value).toBe('2024-01-04T00:00:00.000Z')
          if (variable === 'issued') expect(values[0].value).toBe('2024-02-05T12:30:00.000Z')
          return encodeURIComponent(values[0].value)
        })
        expect(subject.value).toBe(expanded)
      }
    }
    const second = new Store(new Parser().parse(exportTurtle(section('kwaliteitsmeting'), example('kwaliteitsmeting'), options())))
    const firstIds = new Set(graph.getSubjects(rdfType, namedNode(riepr + 'Observatie'), null).map(subject => subject.value))
    expect(second.getSubjects(rdfType, namedNode(riepr + 'Observatie'), null).every(subject => !firstIds.has(subject.value))).toBe(true)
  })

  it('keeps directly selected process URIs and their implementation context instead of minting features', () => {
    const data = example('peilmeting')
    const graph = new Store(new Parser().parse(exportTurtle(section('peilmeting'), data, options())))
    const observation = graph.getSubjects(rdfType, namedNode(riepr + 'Observatie'), null)[0]
    expect(graph.getObjects(observation, namedNode(sosa + 'hasFeatureOfInterest'), null))
      .toEqual([namedNode(data.peilmeting[0].hasFeatureOfInterest)])
    const process = namedNode(data.peilmeting[0].hasFeatureOfInterest)
    expect(graph.has(process, rdfType, namedNode(riepr + 'Proces'), null)).toBe(true)
    expect(graph.getObjects(process, namedNode('http://www.w3.org/2000/01/rdf-schema#label'), null).map(term => term.value))
      .toEqual(['Peilfilter 1'])
    expect(graph.getObjects(process, namedNode('http://www.w3.org/ns/ssn/implementedBy'), null))
      .toEqual([namedNode('urn:test:filter:peil:1')])
  })

  it('rejects invalid submission timestamps', () => {
    for (const issued of ['2024-02-05', '2024-02-31T12:00:00Z', '2024-02-05T12:00:00+14:30']) {
      expect(() => exportTurtle(section('peilmeting'), example('peilmeting'), { ...options(), issued }))
        .toThrow('indieningsdatum')
    }
  })

  it('resolves exact selected processes even when one system implements several, and rejects systems or unknown processes', () => {
    const graph = new Store()
    expect(() => resolveProcesses(graph, [])).toThrow('procesgroepen')
    expect(() => resolveProcesses(graph, [[]])).toThrow('procesgroepen')
    expect(() => resolveProcesses(graph, [['urn:test:missing']])).toThrow('geen bekend proces')
    const implementedBy = namedNode('http://www.w3.org/ns/ssn/implementedBy')
    graph.addQuad(namedNode('urn:process:1'), implementedBy, namedNode('urn:system:1'))
    graph.addQuad(namedNode('urn:process:2'), implementedBy, namedNode('urn:system:1'))
    graph.addQuad(namedNode('urn:process:1'), rdfType, namedNode(riepr + 'Proces'))
    graph.addQuad(namedNode('urn:process:2'), rdfType, namedNode(riepr + 'Proces'))
    expect(() => resolveProcesses(graph, [['urn:system:1']])).toThrow('geen bekend proces')
    expect(resolveProcesses(graph, [['urn:process:2']]).derived).toEqual([namedNode('urn:process:2')])
  })

  it('exports the selected transport path and the systems it connects', () => {
    const schema = compileTheme(JSON.parse(sourceSnapshot()), 'Lucht').subSchemas.find(item => item.name === 'emissie')!.schema
    const data = JSON.parse(readFileSync(new URL('../../../poc-json-schema/examples/lucht/emissie.json', import.meta.url), 'utf8'))
    const graph = new Store(new Parser().parse(exportTurtle(schema, data, options())))
    const feature = graph.getSubjects(rdfType, namedNode(riepr + 'Emissie'), null)[0]
    const transport = graph.getObjects(feature, namedNode('http://www.w3.org/ns/prov#wasDerivedFrom'), null)[0]
    const previous = graph.getObjects(transport, namedNode('http://purl.org/net/p-plan#isPrecededBy'), null)
    const next = graph.getSubjects(namedNode('http://purl.org/net/p-plan#isPrecededBy'), transport, null)
    const implementedBy = namedNode('http://www.w3.org/ns/ssn/implementedBy')
    expect(graph.has(previous[0], implementedBy, namedNode('urn:test:installatie:1'), null)).toBe(true)
    expect(graph.has(next[0], implementedBy, namedNode('urn:test:emissiepunt:lucht:1'), null)).toBe(true)
  })

  it('rejects an observation without a result rather than creating one', () => {
    const data = example('peilmeting')
    delete data.peilmeting[0].hasResult
    expect(() => exportTurtle(section('peilmeting'), data, options())).toThrow('zonder resultaat')
  })

  it('keeps concentration and annual-load CSOR qualifiers on their own result', () => {
    const schema = compileTheme(JSON.parse(sourceSnapshot()), 'Water').subSchemas.find(item => item.name === 'lozing')!.schema
    const data = JSON.parse(readFileSync(new URL('../../../poc-json-schema/examples/water/lozing.json', import.meta.url), 'utf8'))
    const graph = new Store(new Parser().parse(exportTurtle(schema, data, options())))
    const aspect = namedNode('https://data.riepr.omgeving.vlaanderen.be/ns/vocab#kwantiteitsAspect')
    const resultAspects = graph.getSubjects(rdfType, namedNode(riepr + 'Resultaat'), null).flatMap(result =>
      graph.getObjects(result, aspect, null).map(item => item.value))
    expect(resultAspects).toContain('https://data.omgeving.vlaanderen.be/id/concept/csor/kwantificeerbaaraspect/KWA_1')
    expect(resultAspects).toContain('https://data.omgeving.vlaanderen.be/id/concept/csor/kwantificeerbaaraspect/KWA_2')
  })

  it('exports the self-control water variable and concentration qualifiers directly on the result', () => {
    const schema = compileTheme(JSON.parse(sourceSnapshot()), 'Zelfcontrole water').subSchemas[0].schema
    const data = JSON.parse(readFileSync(new URL('../../../poc-json-schema/examples/zelfcontrole-water/meting.json', import.meta.url), 'utf8'))
    const graph = new Store(new Parser().parse(exportTurtle(schema, data, options())))
    const vocab = 'https://data.riepr.omgeving.vlaanderen.be/ns/vocab#'
    const result = graph.getSubjects(namedNode(vocab + 'variabele'),
      namedNode('https://data.omgeving.vlaanderen.be/id/concept/csor/variabele/V_424'), null)
      .find(subject => graph.has(subject, rdfType, namedNode(riepr + 'Resultaat'), null))!
    expect(graph.has(result, namedNode(vocab + 'drager'),
      namedNode('https://data.omgeving.vlaanderen.be/id/concept/csor/drager/DR_1'), null)).toBe(true)
    expect(graph.has(result, namedNode(vocab + 'kwantiteitsAspect'),
      namedNode('https://data.omgeving.vlaanderen.be/id/concept/csor/kwantificeerbaaraspect/KWA_1'), null)).toBe(true)
    expect(graph.has(result, namedNode(vocab + 'soortWaartbepaling'),
      namedNode('https://data.omgeving.vlaanderen.be/id/concept/csor/soortwaardebepaling/SWB_1'), null)).toBe(true)
  })

  it.each([
    ['Lucht', 'emissie'],
    ['Water', 'lozing'],
  ])('copies each %s pollutant collection variable onto its own member results', (theme, name) => {
    const schema = compileTheme(JSON.parse(sourceSnapshot()), theme).subSchemas.find(item => item.name === name)!.schema
    const data = JSON.parse(readFileSync(new URL(
      `../../../poc-json-schema/examples/${theme.toLowerCase()}/${name}.json`, import.meta.url), 'utf8'))
    if (name === 'emissie') {
      const second = structuredClone(data.emissie[0].hasMember[1])
      second.variabele = 'https://data.omgeving.vlaanderen.be/id/concept/csor/variabele/V_1060'
      data.emissie[0].hasMember.push(second)
    }
    const graph = new Store(new Parser().parse(exportTurtle(schema, data, options())))
    const predicate = namedNode('https://data.riepr.omgeving.vlaanderen.be/ns/vocab#variabele')
    const variables = (subject: Parameters<Store['getObjects']>[0]) => graph.getObjects(subject, predicate, null)
    const collections = graph.getSubjects(rdfType, namedNode(riepr + 'ObservatieVerzameling'), null)
      .filter(collection => variables(collection).length)
    expect(collections.length).toBeGreaterThanOrEqual(2)
    for (const collection of collections) {
      const selected = variables(collection)
      expect(selected).toHaveLength(1)
      for (const observation of graph.getObjects(collection, namedNode(sosa + 'hasMember'), null)) {
        const [result] = graph.getObjects(observation, namedNode(sosa + 'hasResult'), null)
        expect(result).toBeDefined()
        expect(variables(result)).toEqual(selected)
      }
    }
  })

  it('rejects a missing ancestor variable instead of exporting unqualified quantity results', () => {
    const schema = compileTheme(JSON.parse(sourceSnapshot()), 'Lucht').subSchemas.find(item => item.name === 'emissie')!.schema
    const data = JSON.parse(readFileSync(new URL('../../../poc-json-schema/examples/lucht/emissie.json', import.meta.url), 'utf8'))
    delete data.emissie[0].hasMember[1].variabele
    expect(() => exportTurtle(schema, data, options())).toThrow('variabele')
  })

  it.each([
    ['Grondwater', 'onttrekking', 'grondwater/onttrekking'],
    ['Grondwater', 'peilmeting', 'grondwater/peilmeting'],
    ['Grondwater', 'kwaliteitsmeting', 'grondwater/kwaliteitsmeting'],
    ['Lucht', 'emissie', 'lucht/emissie'],
    ['Lucht', 'brandstof', 'lucht/brandstof'],
    ['Lucht', 'verbruikte-stof', 'lucht/verbruikte_stof'],
    ['Lucht', 'geproduceerde-stof', 'lucht/geproduceerde_stof'],
    ['Lucht', 'afvalproduct', 'lucht/afvalproduct'],
    ['Water', 'lozing', 'water/lozing'],
    ['Water', 'abnormale-lozing', 'water/abnormale-lozing'],
    ['Water', 'watergebruik', 'water/watergebruik'],
    ['Zelfcontrole lucht', 'meting', 'zelfcontrole-lucht/meting'],
    ['Zelfcontrole water', 'meting', 'zelfcontrole-water/meting'],
  ])('validates %s/%s offline against regenerated SHACL', (theme, name, path) => {
    const schema = compileTheme(JSON.parse(sourceSnapshot()), theme).subSchemas.find(item => item.name === name)!.schema
    const data = JSON.parse(readFileSync(new URL(`../../../poc-json-schema/examples/${path}.json`, import.meta.url), 'utf8'))
    const turtle = exportTurtle(schema, data, options())
    validateTurtle(turtle)
  })
})
