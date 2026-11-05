import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SchemaWriter, sha256 } from '../src/services/schema-writer.js'

const directories: string[] = []
const schema = (id: string) => ({ $id: `https://example.test/${id}`, type: 'object' as const })
const fingerprint = sha256('synthetic codelist')
async function directory() {
  const dir = await mkdtemp(path.join(tmpdir(), 'schema-writer-'))
  directories.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('Generated schema index and owned-file cleanup', () => {
  it('indexes exactly the current generated files with stable provenance and hashes', async () => {
    const dir = await directory()
    const writer = new SchemaWriter(dir)
    await writer.writeBase(schema('base'))
    await writer.writeTheme('New theme', schema('theme'), 'https://example.test/theme')
    await writer.writeSubSchema('New theme', 'nested', schema('nested'), 'https://example.test/theme')
    const index = await writer.finalize(fingerprint)
    expect(index.files.map(file => file.path)).toEqual([
      'new-theme/nested/schema.json', 'new-theme/schema.json', 'observatie.json',
    ])
    expect(index.files.map(file => file.kind)).toEqual(['section', 'theme', 'base'])
    expect(index.sourceSha256).toBe(fingerprint)
    for (const file of index.files) {
      expect(file.sha256).toBe(sha256(await readFile(path.join(dir, 'schema', file.path))))
    }
    expect(JSON.parse(await readFile(path.join(dir, 'schema/index.json'), 'utf8'))).toEqual(index)
  })

  it('removes only obsolete indexed files, preserving unrelated files and unindexed legacy output', async () => {
    const dir = await directory()
    const first = new SchemaWriter(dir)
    await first.writeTheme('Old', schema('old'))
    await first.finalize(fingerprint)
    await mkdir(path.join(dir, 'schema/legacy'), { recursive: true })
    await writeFile(path.join(dir, 'schema/legacy/schema.json'), 'legacy')
    await writeFile(path.join(dir, 'schema/notes.txt'), 'user notes')
    const next = new SchemaWriter(dir)
    await next.writeTheme('New', schema('new'))
    await next.finalize(fingerprint)
    await expect(readFile(path.join(dir, 'schema/old/schema.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(path.join(dir, 'schema/legacy/schema.json'), 'utf8')).toBe('legacy')
    expect(await readFile(path.join(dir, 'schema/notes.txt'), 'utf8')).toBe('user notes')
  })

  it('refuses to delete edited generated output before deleting any obsolete files', async () => {
    const dir = await directory()
    const first = new SchemaWriter(dir)
    await first.writeTheme('A', schema('a'))
    await first.writeTheme('B', schema('b'))
    await first.finalize(fingerprint)
    await writeFile(path.join(dir, 'schema/b/schema.json'), 'user edit')
    await expect(new SchemaWriter(dir).finalize(fingerprint)).rejects.toThrow('modified generated schema')
    expect(JSON.parse(await readFile(path.join(dir, 'schema/a/schema.json'), 'utf8')).$id).toBe(schema('a').$id)
  })

  it('rejects duplicate paths, duplicate schema IDs and unsafe names', async () => {
    const writer = new SchemaWriter(await directory())
    await writer.writeTheme('First', schema('shared'))
    await expect(writer.writeTheme('First', schema('other'))).rejects.toThrow('Duplicate generated schema path')
    await expect(writer.writeTheme('Second', schema('shared'))).rejects.toThrow('Duplicate generated schema $id')
    await expect(writer.writeSubSchema('First', '../outside', schema('other'))).rejects.toThrow('Unsafe')
    await expect(writer.writeTheme('!!!', schema('other'))).rejects.toThrow('Unsafe')
    await expect(writer.finalize('invalid')).rejects.toThrow('fingerprint')
  })

  it('rejects unsafe paths in a previous manifest without touching files outside its owned output', async () => {
    const dir = await directory()
    await mkdir(path.join(dir, 'schema'), { recursive: true })
    await writeFile(path.join(dir, 'outside.json'), 'keep')
    await writeFile(path.join(dir, 'schema/index.json'), JSON.stringify({
      version: 1, files: [{ path: '../outside.json', sha256: sha256('keep') }],
    }))
    await expect(new SchemaWriter(dir).finalize(fingerprint)).rejects.toThrow('Unsafe')
    expect(await readFile(path.join(dir, 'outside.json'), 'utf8')).toBe('keep')
  })
})
