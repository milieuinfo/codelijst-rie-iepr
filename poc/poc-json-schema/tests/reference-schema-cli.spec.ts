import { afterAll, beforeAll, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSchemaIndex } from '../src/services/schema-index.js'
import { SchemaValidator } from '../src/services/schema-validator.js'

const root = fileURLToPath(new URL('../', import.meta.url))
let output: string
beforeAll(async () => {
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc')], { cwd: root })
  output = await mkdtemp(join(tmpdir(), 'reference-schema-cli-'))
}, 30000)
afterAll(async () => { if (output) await rm(output, { recursive: true, force: true }) })
const run = (...args: string[]) => spawnSync(process.execPath, [
  join(root, 'dist/cli.js'), '--theme', 'Grondwater', '--out', output, ...args,
], { encoding: 'utf8' })
const index = async () => parseSchemaIndex(JSON.parse(await readFile(join(output, 'schema/index.json'), 'utf8')))

it('generates generic and personal schema pairs without changing generic bytes and safely removes obsolete variants', async () => {
  const generic = run()
  expect(generic.status, generic.stderr).toBe(0)
  const first = await index()
  const bytes = await Promise.all(first.files.map(entry => readFile(join(output, 'schema', entry.path), 'utf8')))
  const args = [
    '--references', join(root, 'examples/refs.json'),
    '--reference-context', join(root, 'examples/reference-context.json'),
  ]
  const personal = run(...args)
  expect(personal.status, personal.stderr).toBe(0)
  const second = await index()
  expect(second.files.filter(entry => entry.kind === 'personalized')).toHaveLength(4)
  expect(second.files.filter(entry => entry.kind !== 'personalized')).toEqual(first.files)
  expect(await Promise.all(first.files.map(entry => readFile(join(output, 'schema', entry.path), 'utf8')))).toEqual(bytes)
  for (const section of second.files.filter(entry => entry.kind === 'section')) {
    const variant = second.files.find(entry => entry.kind === 'personalized' && entry.genericSchemaId === section.id)!
    const schema = JSON.parse(await readFile(join(output, 'schema', variant.path), 'utf8'))
    const data = JSON.parse(await readFile(join(root, 'examples/grondwater', section.path.split('/')[1] + '.json'), 'utf8'))
    expect(new SchemaValidator().validateInstance(schema, data).valid).toBe(true)
  }
  expect(run(...args).status).toBe(0)
  expect(await index()).toEqual(second)
  expect(run().status).toBe(0)
  expect(await index()).toEqual(first)
  await expect(readFile(join(output, 'schema/grondwater/peilmeting/schema.personalized.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('rejects invalid personal reference input before publishing over an existing snapshot', async () => {
  expect(run().status).toBe(0)
  const before = await index()
  await writeFile(join(output, 'invalid-refs.json'), JSON.stringify([{ id: 'urn:broken' }]))
  expect(run('--references', join(output, 'invalid-refs.json')).status).toBe(1)
  expect(run('--reference-context', join(root, 'examples/reference-context.json')).status).toBe(1)
  expect(await index()).toEqual(before)
})
