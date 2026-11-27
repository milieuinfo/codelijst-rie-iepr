import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { DataFactory, Parser, Store, Writer } from 'n3'
import { compileTheme } from '../../poc-json-schema/tests/groundwater-csv-fixture.js'
import { sourceSnapshot } from '../../poc-json-schema/scripts/source-snapshot.mjs'
import { demonstrationProcessGraph } from '../src/services/demo-process-graph.js'
import { exportTurtle } from '../src/services/turtle-export.js'
import lock from './linked-data.lock.json'
import ontologySource from './fixtures/linked-data/riepr-source.json'
import entries from '../../reporting-entries.json'

const cache = resolve(fileURLToPath(new URL('../.cache/linked-data/', import.meta.url)))
const ontology = fileURLToPath(new URL('./fixtures/linked-data/riepr.ttl', import.meta.url))
const shapes = fileURLToPath(new URL('./fixtures/linked-data/riepr-shapes.ttl', import.meta.url))
const profile = fileURLToPath(new URL('./fixtures/linked-data/operational-shapes.ttl', import.meta.url))
const rules = fileURLToPath(new URL('./fixtures/linked-data/inference.rules', import.meta.url))
const examples = [
  ['Grondwater', 'onttrekking', 'grondwater/onttrekking'],
  ['Grondwater', 'peilmeting', 'grondwater/peilmeting'],
  ['Grondwater', 'kwaliteitsmeting', 'grondwater/kwaliteitsmeting'],
  ['Lucht', 'emissie', 'lucht/emissie'],
  ['Lucht', 'brandstof', 'lucht/brandstof'],
  ['Lucht', 'verbruikte-stof', 'lucht/verbruikte_stof'],
  ['Lucht', 'geproduceerde-stof', 'lucht/geproduceerde_stof'],
  ['Lucht', 'afvalproduct', 'lucht/afvalproduct'],
  ['Water', 'lozing', 'water/lozing'],
  ['Water', 'watergebruik', 'water/watergebruik'],
  ['Zelfcontrole lucht', 'meting', 'zelfcontrole-lucht/meting'],
  ['Grondstoffen', 'inkomend', 'grondstoffen/inkomend'],
] as const
const rejectedExamples = [
  ['Water', 'abnormale-lozing', 'water/abnormale-lozing'],
  ['Zelfcontrole water', 'meting', 'zelfcontrole-water/meting'],
] as const

interface Finding {
  certainty: 'error' | 'suspect' | 'hint'
  code: string
  focusIri?: string
  pathIri?: string
  message: string
}

interface FileReport {
  file: string
  parseError?: string
  configuration: { problems: string[]; contentHash: string }
  steps: {
    kind: string
    status: string
    stats: { applied?: number; focusNodes?: number }
    findings: Finding[]
  }[]
}

interface ValidationReport {
  schemaVersion: string
  problems: string[]
  results: FileReport[]
  summary: { error: number; suspect: number; hint: number; parseErrors: number }
}

const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex')
const findings = (result: FileReport) => result.steps.flatMap(step => step.findings)
const reportFile = (report: ValidationReport, path: string): FileReport => {
  const result = report.results.find(result => result.file === path)
  if (!result) throw new Error(`Missing validation result for ${path}.`)
  return result
}
const diagnostic = (result: FileReport) => [
  basename(result.file),
  ...findings(result).filter(item => item.certainty === 'error').map(item =>
    `${item.code}: ${item.message}\n  ${item.focusIri ?? ''} ${item.pathIri ?? ''}`),
  `Full report: ${cache}/report.json`,
].join('\n')

function validate(paths: string[], name: string): ValidationReport {
  const context = Object.keys(lock).filter(path => path.startsWith('ontologies/'))
    .flatMap(path => ['--ontologies', `${cache}/${path}`])
  const result = spawnSync('java', [
    '-Xmx1g', '-jar', `${cache}/ld-mcp-vocab.jar`, 'validate', '--offline',
    ...context, '--ontologies', ontology,
    '--shapes', shapes, '--shapes', `${cache}/ssn-sosa-rules.ttl`, '--shapes', profile, '--rules', rules,
    '--format', 'json', '--fail-on', 'error', ...paths,
  ], { encoding: 'utf8', timeout: 110_000, maxBuffer: 20 * 1024 * 1024 })
  if (result.error) throw result.error
  writeFileSync(`${cache}/${name}.json`, result.stdout)
  writeFileSync(`${cache}/${name}.log`, result.stderr)
  expect([0, 1], result.stderr).toContain(result.status)
  const report: ValidationReport = JSON.parse(result.stdout)
  expect(report.schemaVersion).toBe('1.0')
  expect(report.problems).toEqual([])
  expect(report.results).toHaveLength(paths.length)
  expect(report.summary.parseErrors).toBe(0)
  expect(result.status).toBe(report.summary.error ? 1 : 0)
  for (const entry of report.results) {
    expect(entry.parseError).toBeUndefined()
    expect(entry.configuration.problems).toEqual([])
    expect(entry.steps.map(step => step.kind)).toEqual(['VOCAB', 'INFERENCE', 'DISJOINTNESS', 'SHACL'])
    expect(entry.steps.every(step => step.status !== 'SKIPPED')).toBe(true)
    const shacl = entry.steps.find(step => step.kind === 'SHACL')!
    expect(shacl.stats.applied).toBeGreaterThan(0)
    expect(shacl.stats.focusNodes).toBeGreaterThan(0)
  }
  return report
}

function saveGraph(graph: Store, path: string): void {
  const writer = new Writer()
  writer.addQuads(graph.getQuads(null, null, null, null))
  writer.end((error, turtle) => {
    if (error) throw error
    if (turtle === undefined) throw new Error('Turtle serialization did not produce output.')
    writeFileSync(path, turtle)
  })
}

describe('Operational Turtle linked-data validation', () => {
  let report: ValidationReport
  let paths: string[]
  let compiled: Map<string, ReturnType<typeof compileTheme>>
  const { namedNode, literal } = DataFactory
  const type = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
  const sosa = (name: string) => namedNode(`http://www.w3.org/ns/sosa/${name}`)
  const inheritObservedProperty = (graph: Store) => {
    const member = graph.getQuads(null, sosa('hasMember'), null, null)[0]
    if (member.object.termType !== 'NamedNode') throw new Error('Expected a named Observation member.')
    const property = graph.getObjects(member.object, sosa('observedProperty'), null)[0]
    expect(property).toBeDefined()
    graph.removeQuads(graph.getQuads(member.subject, sosa('hasMember'), null, null))
    graph.addQuad(member)
    graph.addQuad(member.subject, sosa('observedProperty'), property)
    graph.removeQuads(graph.getQuads(member.object, sosa('observedProperty'), null, null))
    return member.object
  }
  const mutations: [string, string, (graph: Store) => void][] = [
    ['unknown-predicate', 'Unknown property', graph => {
      graph.addQuad(namedNode('urn:negative:observation'), sosa('hasResults'), namedNode('urn:negative:result'))
    }],
    ['missing-observed-property', 'R2: a sosa:Observation needs sosa:observedProperty', graph => {
      graph.removeQuads(graph.getQuads(null, sosa('observedProperty'), null, null))
    }],
    ['riepr-observed-property-only-on-collection', 'sosa:observedProperty needs at least 1 value(s)', graph => {
      inheritObservedProperty(graph)
    }],
    ['missing-result-on-subclass', 'R2: a sosa:Observation needs sosa:hasResult', graph => {
      graph.removeQuads(graph.getQuads(null, type, sosa('Observation'), null))
      graph.removeQuads(graph.getQuads(null, sosa('hasResult'), null, null))
    }],
    ['literal-result', 'R16: the object of sosa:hasResult is a prov:Entity, not a literal', graph => {
      const link = graph.getQuads(null, sosa('hasResult'), null, null)[0]
      graph.removeQuad(link)
      graph.addQuad(link.subject, link.predicate, literal('12.5'))
    }],
    ['multiple-results', 'sosa:hasResult needs at least 1 value(s); at most 1 value(s)', graph => {
      const links = graph.getQuads(null, sosa('hasResult'), null, null)
      const other = links.find(link => !link.object.equals(links[0].object))
      if (!other) throw new Error('Expected distinct observation results in the regression fixture.')
      graph.addQuad(links[0].subject, links[0].predicate, other.object)
    }],
    ['sample-as-member', 'An ObservationCollection contains Observations', graph => {
      const link = graph.getQuads(null, sosa('hasMember'), null, null)[0]
      const sample = namedNode('urn:negative:sample')
      graph.addQuad(sample, type, sosa('Sample'))
      graph.removeQuad(link)
      graph.addQuad(link.subject, link.predicate, sample)
    }],
    ['conflicting-collection-feature', 'A member conflicts with the shared observation context', graph => {
      const member = graph.getQuads(null, sosa('hasMember'), null, null)[0].object
      if (member.termType !== 'NamedNode') throw new Error('Expected a named Observation member.')
      graph.removeQuads(graph.getQuads(member, sosa('hasFeatureOfInterest'), null, null))
      const feature = namedNode('urn:negative:feature')
      graph.addQuad(feature, type, sosa('FeatureOfInterest'))
      graph.addQuad(member, sosa('hasFeatureOfInterest'), feature)
    }],
    ['result-is-inferred-activity', 'disjointness', graph => {
      const result = graph.getSubjects(type, namedNode('https://data.riepr.omgeving.vlaanderen.be/ns/riepr#Resultaat'), null)[0]
      graph.addQuad(result, namedNode('http://www.w3.org/ns/prov#used'), namedNode('urn:negative:input'))
    }],
  ]

  beforeAll(() => {
    for (const [path, artifact] of Object.entries(lock)) {
      const file = `${cache}/${path}`
      if (!existsSync(file)) throw new Error(`Missing ${path}. Run npm run setup:linked-data first.`)
      expect(hash(readFileSync(file)), `Checksum mismatch: ${path}`).toBe(artifact.sha256)
    }
    expect(hash(readFileSync(ontology))).toBe(ontologySource.sha256)
    expect(hash(readFileSync(shapes))).toBe(ontologySource.shapesSha256)
    const input = JSON.parse(sourceSnapshot())
    compiled = new Map(entries.map(entry => [entry.label, compileTheme(input, entry.label)]))
    mkdirSync(`${cache}/exports`, { recursive: true })
    paths = examples.map(([theme, name, path]) => {
      const schema = compiled.get(theme)!.subSchemas.find(item => item.name === name)?.schema
      if (!schema) throw new Error(`Missing operational schema: ${theme}/${name}.`)
      const data = JSON.parse(readFileSync(new URL(`../../poc-json-schema/examples/${path}.json`, import.meta.url), 'utf8'))
      const turtle = exportTurtle(schema, data, {
        report: 'urn:test:aangifte:1',
        year: 2024, created: '2024-01-04T00:00:00Z', issued: '2024-02-05T12:30:00Z',
        processes: demonstrationProcessGraph(),
      })
      const target = `${cache}/exports/${path.replaceAll('/', '-')}.ttl`
      writeFileSync(target, turtle)
      return target
    })
    report = validate(paths, 'report')
    console.info(`Linked data: ${examples.length} exports, ${report.summary.error} errors, ` +
      `${report.summary.suspect} warnings/suspects. Full report: ${cache}/report.json`)
    for (const message of new Set(report.results.flatMap(findings).filter(item => item.certainty !== 'error')
      .map(item => item.message))) console.info(`Non-blocking: ${message}`)
  })

  it('covers every active section with an export fixture or an explicit unsupported-export declaration', () => {
    const active = [...compiled].flatMap(([theme, result]) => result.subSchemas.map(section => `${theme}/${section.name}`))
    // The production flag is UI-only; produced-material observations still have no feature mapping.
    const covered = [...[...examples, ...rejectedExamples].map(([theme, name]) => `${theme}/${name}`), 'Grondstoffen/grondstof']
    expect(covered.sort()).toEqual(active.sort())
  })

  it.each(examples)('validates %s/%s against the ontology and SOSA 2023', (_theme, _name, _path) => {
    const index = examples.findIndex(example => example[2] === _path)
    const result = reportFile(report, paths[index])
    expect(findings(result).filter(item => item.certainty === 'error'), diagnostic(result)).toEqual([])
  })

  it.each(rejectedExamples)('rejects %s/%s examples containing results without a numeric measure', (theme, name, path) => {
    const schema = compiled.get(theme)!.subSchemas.find(item => item.name === name)!.schema
    const data = JSON.parse(readFileSync(new URL(`../../poc-json-schema/examples/${path}.json`, import.meta.url), 'utf8'))
    expect(() => exportTurtle(schema, data, {
      report: 'urn:test:aangifte:1', year: 2024,
      created: '2024-01-04T00:00:00Z', issued: '2024-02-05T12:30:00Z', processes: demonstrationProcessGraph(),
    })).toThrow('numerieke meetwaarde; RDF Cube-export is geblokkeerd')
  })

  describe('validator regressions', () => {
    let regressionReport: ValidationReport
    let regressionPaths: string[]
    const inheritedPath = `${cache}/regressions/inherited-context.ttl`

    beforeAll(() => {
      const turtle = readFileSync(paths[0], 'utf8')
      mkdirSync(`${cache}/regressions`, { recursive: true })
      const inherited = new Store(new Parser().parse(turtle))
      const observation = inheritObservedProperty(inherited)
      inherited.removeQuad(observation, type, namedNode('https://data.riepr.omgeving.vlaanderen.be/ns/riepr#Observatie'))
      for (const subject of inherited.getSubjects(type, sosa('Observation'), null)) {
        if (!subject.equals(observation)) inherited.removeQuad(subject, type, sosa('Observation'))
      }
      saveGraph(inherited, inheritedPath)
      regressionPaths = mutations.map(([name, , mutate]) => {
        const graph = new Store(new Parser().parse(turtle))
        mutate(graph)
        const path = `${cache}/regressions/${name}.ttl`
        saveGraph(graph, path)
        return path
      })
      regressionReport = validate([inheritedPath, ...regressionPaths], 'regression-report')
    })

    it('accepts inherited context for generic SOSA observations and targets RIE-IEPR subclasses without redundant types', () => {
      const result = reportFile(regressionReport, inheritedPath)
      expect(findings(result).filter(item => item.certainty === 'error'), diagnostic(result)).toEqual([])
    })

    it.each(mutations)('rejects %s', (name, expected) => {
      const index = mutations.findIndex(mutation => mutation[0] === name)
      const result = reportFile(regressionReport, regressionPaths[index])
      expect(findings(result).some(item => item.certainty === 'error' &&
        (item.message.includes(expected) || item.code === expected)), diagnostic(result)).toBe(true)
    })
  })
})
