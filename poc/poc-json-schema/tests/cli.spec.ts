import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SchemaIndex } from '../src/services/schema-writer.js'
import { operationalResult, operationalSource } from './operational-fixtures.js'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const relativeSource = 'resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld'
const directories: string[] = []
let root: string
let packageDir: string
let cli: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'schema-cli-build-'))
  packageDir = join(root, 'poc/poc-json-schema')
  cli = join(packageDir, 'dist/cli.js')
  await writeFile(join(root, 'package.json'), '{"type":"module"}')
  await symlink(join(packageRoot, 'node_modules'), join(root, 'node_modules'), 'dir')
  execFileSync(process.execPath, [
    join(packageRoot, 'node_modules/typescript/bin/tsc'), '--project', packageRoot,
    '--outDir', join(packageDir, 'dist'),
  ], { encoding: 'utf8' })
  await mkdir(dirname(join(packageDir, 'public', relativeSource)), { recursive: true })
  await mkdir(dirname(join(root, 'src/main', relativeSource)), { recursive: true })
}, 30000)

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }) })

async function fixture(source = operationalSource.toString()) {
  await writeFile(join(packageDir, 'public', relativeSource), source)
  await writeFile(join(root, 'src/main', relativeSource), source)
  const output = await mkdtemp(join(tmpdir(), 'schema-cli-output-'))
  directories.push(output)
  return {
    output,
    run: (...args: string[]) => spawnSync(process.execPath, [cli, '--out', output, ...args], { encoding: 'utf8' }),
    index: async (): Promise<SchemaIndex> => JSON.parse(await readFile(join(output, 'schema/index.json'), 'utf8')),
  }
}

const expand = (id: string) => operationalResult.expandCurie!(id)
const concept = (id: string, extra: Record<string, unknown> = {}) => ({
  id, _type: ['skos:Concept'], prefLabel: id, inScheme: 'x:step', ...extra,
})
function synthetic(extra: Record<string, unknown>[] = []) {
  return {
    '@context': {
      x: 'https://example.test/concept/', conceptscheme: 'https://example.test/scheme/',
      sosa: 'http://www.w3.org/ns/sosa/', xsd: 'http://www.w3.org/2001/XMLSchema#',
    },
    graph: [
      { id: 'conceptscheme:thematypes', _type: ['skos:ConceptScheme'] },
      concept('x:theme', { inScheme: 'conceptscheme:thematypes', prefLabel: 'Unrelated', vervolgstap: 'x:step' }),
      { id: 'x:step', _type: ['skos:ConceptScheme'] },
      concept('x:reading', { relevantClass: 'sosa:Observation', relevantDataType: 'xsd:decimal' }),
      concept('x:agent', { relevantClass: 'sosa:Sensor' }),
      concept('x:name', { broaderPartitive: 'x:agent', relevantDataType: 'xsd:string' }),
      concept('x:broken', { relevantClass: 'sosa:Observation' }),
      concept('x:untyped', { broaderPartitive: 'x:broken' }),
      ...extra,
    ],
  }
}

describe('Strict and explicitly incomplete schema generation', () => {
  it('keeps strict default failure explicit and publishes no snapshot on source errors', async () => {
    const f = await fixture()
    const run = f.run()
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('Unresolved unit references')
    await expect(access(join(f.output, 'schema'))).rejects.toThrow()
  })

  it('generates exactly eight current sections, reports all five blockers and is deterministic', async () => {
    const f = await fixture()
    const run = f.run('--allow-incomplete')
    expect(run.status, run.stderr).toBe(0)
    expect(run.stderr).toContain('INCOMPLETE schema snapshot: 5 blocked section(s)')
    const index = await f.index()
    expect(index.files).toHaveLength(10)
    expect(index.files.filter(file => file.kind === 'theme')).toEqual([])
    expect(index.files.filter(file => file.kind === 'section').map(file => file.path)).toEqual([
      'grondwater/kwaliteitsmeting/schema.json', 'grondwater/onttrekking/schema.json', 'grondwater/peilmeting/schema.json',
      'lucht/brandstof/schema.json', 'lucht/emissie/schema.json', 'water/abnormale-lozing/schema.json',
      'water/lozing/schema.json', 'zelfcontrole-water/meting/schema.json',
    ])
    expect(index.generation).toMatchObject({ mode: 'allow-incomplete', complete: false })
    expect(index.generation!.blockedSections.map(section => section.sectionConceptId)).toEqual([
      'grondstoffen:grondstof', 'lucht:afvalproduct', 'lucht:geproduceerde_stof',
      'lucht:verbruikte_stof', 'zelfcontrole-lucht:meting',
    ].map(expand))
    expect(index.generation!.blockedSections[0].issues.map(issue => [issue.code, issue.conceptId])).toEqual([
      ['unresolved-unit', expand('grondstoffen:grondstof_hoeveelheid')],
      ['unresolved-code-list', expand('grondstoffen:grondstof_materiaalcode')],
    ])
    expect(f.run('--allow-incomplete').status).toBe(0)
    expect(await f.index()).toEqual(index)
    const contents = await Promise.all(index.files.map(file => readFile(join(f.output, 'schema', file.path), 'utf8')))
    expect(f.run().status).toBe(1)
    expect(await f.index()).toEqual(index)
    expect(await Promise.all(index.files.map(file => readFile(join(f.output, 'schema', file.path), 'utf8')))).toEqual(contents)
  })

  it('records complete requested-theme scope and safely replaces a strict snapshot', async () => {
    const f = await fixture()
    const strict = f.run('--theme', 'Grondwater')
    expect(strict.status, strict.stderr).toBe(0)
    expect((await f.index()).generation).toEqual({ mode: 'strict', complete: true, theme: 'Grondwater', blockedSections: [] })
    await writeFile(join(f.output, 'schema/notes.txt'), 'unindexed notes')
    const partial = f.run('--theme', 'Grondwater', '--allow-incomplete')
    expect(partial.status, partial.stderr).toBe(0)
    expect(partial.stderr).not.toContain('INCOMPLETE')
    const index = await f.index()
    expect(index.files).toHaveLength(5)
    expect(index.generation).toEqual({ mode: 'allow-incomplete', complete: true, theme: 'Grondwater', blockedSections: [] })
    await expect(access(join(f.output, 'schema/grondwater/schema.json'))).rejects.toThrow()
    expect(await readFile(join(f.output, 'schema/notes.txt'), 'utf8')).toBe('unindexed notes')
  })

  it.each(['grondwater:peilmeting', expand('grondwater:peilmeting')])('selects a section by CURIE or full IRI: %s', async section => {
    const f = await fixture()
    const run = f.run('--theme', 'Grondwater', '--section', section, '--allow-incomplete')
    expect(run.status, run.stderr).toBe(0)
    const index = await f.index()
    expect(index.files.filter(file => file.kind === 'section').map(file => file.path)).toEqual(['grondwater/peilmeting/schema.json'])
    expect(index.generation).toEqual({
      mode: 'allow-incomplete', complete: true, theme: 'Grondwater', sectionConceptId: expand('grondwater:peilmeting'), blockedSections: [],
    })
  })

  it('reports the requested incomplete theme without including unrelated blockers', async () => {
    const f = await fixture()
    const run = f.run('--theme', 'Lucht', '--allow-incomplete')
    expect(run.status, run.stderr).toBe(0)
    const index = await f.index()
    expect(index.files.filter(file => file.kind === 'section')).toHaveLength(2)
    expect(index.generation).toMatchObject({ theme: 'Lucht', complete: false })
    expect(index.generation!.blockedSections).toHaveLength(3)
  })

  it.each([
    ['--theme', 'Grondstoffen'],
    ['--theme', 'Lucht', '--section', 'lucht:afvalproduct'],
  ])('fails without an empty success index when the selection is entirely blocked: %j', async (...args) => {
    const f = await fixture()
    const run = f.run('--allow-incomplete', ...args)
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('No usable reporting sections')
    expect(run.stderr).toContain('Unresolved unit references')
    await expect(access(join(f.output, 'schema/index.json'))).rejects.toThrow()
  })

  it.each([
    ['--theme', 'Unknown'],
    ['--section', 'lucht:brandstof'],
    ['--theme', 'Lucht', '--section', 'lucht:brandstof_zwavel'],
    ['--unexpected'],
  ])('rejects invalid selection/options instead of calling them source blockers: %j', async (...args) => {
    const f = await fixture()
    const run = f.run('--allow-incomplete', ...args)
    expect(run.status).toBe(1)
    expect(run.stderr).not.toContain('Blocked ')
    await expect(access(join(f.output, 'schema/index.json'))).rejects.toThrow()
  })

  it('discovers synthetic observation and non-observational sections without a whitelist', async () => {
    const f = await fixture(JSON.stringify(synthetic([
      { id: 'x:unreachable', _type: ['skos:ConceptScheme'] },
      concept('x:ignored', { inScheme: 'x:unreachable' }),
    ])))
    const run = f.run('--allow-incomplete')
    expect(run.status, run.stderr).toBe(0)
    const index = await f.index()
    expect(index.files.filter(file => file.kind === 'section').map(file => file.path)).toEqual([
      'theme/agent/schema.json', 'theme/reading/schema.json',
    ])
    expect(index.generation!.blockedSections).toHaveLength(1)
    expect(index.generation!.blockedSections[0].issues[0]).toMatchObject({
      code: 'missing-datatype', conceptId: 'https://example.test/concept/untyped',
    })
  })

  it.each([
    [concept('x:next', { vervolgstap: 'x:missing', relevantDataType: 'xsd:string' }), 'Unresolved vervolgstap'],
    [concept('x:bad-owner', { broaderPartitive: ['x:broken', 'x:agent'] }), 'Ambiguous ownership'],
    [concept('x:orphan', { broaderPartitive: 'x:missing' }), 'Missing parent'],
    [concept('x:cycle', { broaderPartitive: 'x:cycle' }), 'Ownership cycle'],
    [concept('x:invalid', {
      broaderPartitive: 'x:agent', relevantDataType: 'xsd:string',
      relation: 'http://qudt.org/schema/qudt/numericValue', relevantUnit: 'https://example.test/unit/U',
    }), 'unit-bearing qudt:numericValue must be a scalar number'],
  ])('keeps invalid graphs/schemas fatal even alongside a metadata blocker', async (extra, message) => {
    const f = await fixture(JSON.stringify(synthetic([extra])))
    const run = f.run('--allow-incomplete')
    expect(run.status).toBe(1)
    expect(run.stderr).toContain(message)
    await expect(access(join(f.output, 'schema/index.json'))).rejects.toThrow()
  })

  it.each([
    ['schema-validator.js', "\nthrow new Error('Synthetic compiler failure')\n", 'Synthetic compiler failure'],
    ['base-schema-generator.js', "\nBaseSchemaGenerator.prototype.generate = () => ({ $id: 'urn:invalid', type: 'not-a-type' })\n", 'schema is invalid'],
  ])('does not downgrade unexpected compiler exceptions or invalid JSON Schemas: %s', async (module, fault, message) => {
    const f = await fixture(JSON.stringify(synthetic()))
    const file = join(packageDir, 'dist/services', module)
    const original = await readFile(file, 'utf8')
    let run: ReturnType<typeof f.run>
    try {
      await writeFile(file, original + fault)
      run = f.run('--allow-incomplete')
    } finally { await writeFile(file, original) }
    expect(run.status).toBe(1)
    expect(run.stderr).toContain(message)
    await expect(access(join(f.output, 'schema/index.json'))).rejects.toThrow()
  })

  it('does not downgrade stale input to a source-metadata warning', async () => {
    const f = await fixture()
    await writeFile(join(root, 'src/main', relativeSource), '{}')
    const run = f.run('--allow-incomplete')
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('Stale codelist input')
    await expect(access(join(f.output, 'schema/index.json'))).rejects.toThrow()
  })
})
