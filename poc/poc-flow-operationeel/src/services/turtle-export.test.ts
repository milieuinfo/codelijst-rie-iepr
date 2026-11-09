// @vitest-environment node
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DataFactory, Parser, Store } from 'n3'
import { compileGroundwater, compileTheme } from '../../../poc-json-schema/tests/groundwater-csv-fixture.js'
import { sourceSnapshot } from '../../../poc-json-schema/scripts/source-snapshot.mjs'
import { demonstrationProcessGraph } from './demo-process-graph.js'
import { exportTurtle } from './turtle-export.js'
import { resolveProcesses } from './process-graph.js'
import uriTemplates from '../generated/uri-templates.json'

const { namedNode } = DataFactory
const rdfType = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
const riepr = 'https://data.riepr.omgeving.vlaanderen.be/ns/riepr#'
const sosa = 'http://www.w3.org/ns/sosa/'
const example = (name: string) => JSON.parse(readFileSync(new URL(`../../../poc-json-schema/examples/grondwater/${name}.json`, import.meta.url), 'utf8'))
const section = (name: string) => compileGroundwater(JSON.parse(sourceSnapshot())).subSchemas.find(item => item.name === name)!.schema
const options = () => ({ year: 2024, created: '2024-01-04T00:00:00Z', issued: '2024-02-05T12:30:00Z', processes: demonstrationProcessGraph() })
const shapes = fileURLToPath(new URL('../../test/fixtures/riepr-shacl.ttl', import.meta.url))

describe('Turtle export', () => {
  it.each(['onttrekking', 'peilmeting', 'kwaliteitsmeting'])('serializes the %s example as RDF', name => {
    const graph = new Store(new Parser().parse(exportTurtle(section(name), example(name), options())))
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
      expect(graph.getSubjects(namedNode(sosa + 'hasMember'), sample[0], null)).toHaveLength(0)
      const features = graph.getSubjects(rdfType, namedNode(riepr + 'Emissie'), null)
      expect(graph.getObjects(features[0], namedNode('http://www.w3.org/ns/prov#wasDerivedFrom'), null)).toHaveLength(2)
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

  it('keeps directly selected system URIs instead of minting features for them', () => {
    const data = example('peilmeting')
    const graph = new Store(new Parser().parse(exportTurtle(section('peilmeting'), data, options())))
    const observation = graph.getSubjects(rdfType, namedNode(riepr + 'Observatie'), null)[0]
    expect(graph.getObjects(observation, namedNode(sosa + 'hasFeatureOfInterest'), null))
      .toEqual([namedNode(data.peilmeting[0].hasFeatureOfInterest)])
  })

  it('rejects invalid submission timestamps', () => {
    for (const issued of ['2024-02-05', '2024-02-31T12:00:00Z', '2024-02-05T12:00:00+14:30']) {
      expect(() => exportTurtle(section('peilmeting'), example('peilmeting'), { ...options(), issued }))
        .toThrow('indieningsdatum')
    }
  })

  it('rejects missing and ambiguous system processes instead of inventing them', () => {
    const graph = new Store()
    expect(() => resolveProcesses(graph, [])).toThrow('systeemgroepen')
    expect(() => resolveProcesses(graph, [[]])).toThrow('systeemgroepen')
    expect(() => resolveProcesses(graph, [['urn:test:missing']])).toThrow('gevonden: 0')
    const implementedBy = namedNode('http://www.w3.org/ns/ssn/implementedBy')
    graph.addQuad(namedNode('urn:process:1'), implementedBy, namedNode('urn:system:1'))
    graph.addQuad(namedNode('urn:process:2'), implementedBy, namedNode('urn:system:1'))
    expect(() => resolveProcesses(graph, [['urn:system:1']])).toThrow('gevonden: 2')
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
    const additional = namedNode('https://schema.org/additionalProperty')
    const propertyID = namedNode('https://schema.org/propertyID')
    const value = namedNode('https://schema.org/value')
    const aspect = namedNode('https://data.riepr.omgeving.vlaanderen.be/ns/vocab#kwantiteitsAspect')
    const resultAspects = graph.getSubjects(rdfType, namedNode(riepr + 'Resultaat'), null).flatMap(result =>
      graph.getObjects(result, additional, null).flatMap(property =>
        graph.has(property, propertyID, aspect, null) ? graph.getObjects(property, value, null).map(item => item.value) : []))
    expect(resultAspects).toContain('https://data.omgeving.vlaanderen.be/id/concept/csor/kwantificeerbaaraspect/KWA_1')
    expect(resultAspects).toContain('https://data.omgeving.vlaanderen.be/id/concept/csor/kwantificeerbaaraspect/KWA_2')
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
    ['Zelfcontrole lucht', 'meting', 'zelfcontrole-lucht/meting'],
    ['Zelfcontrole water', 'meting', 'zelfcontrole-water/meting'],
  ])('validates %s/%s offline against regenerated SHACL', (theme, name, path) => {
    const schema = compileTheme(JSON.parse(sourceSnapshot()), theme).subSchemas.find(item => item.name === name)!.schema
    const data = JSON.parse(readFileSync(new URL(`../../../poc-json-schema/examples/${path}.json`, import.meta.url), 'utf8'))
    const turtle = exportTurtle(schema, data, options())
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
    const result = spawnSync('python3', ['-c', validator, shapes], {
      input: turtle, encoding: 'utf8',
    })
    expect(result.status, result.stderr + result.stdout).toBe(0)
    expect(result.stdout).toContain('Conforms: True')
  })
})
