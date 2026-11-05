// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { fingerprint, loadSchemaSnapshot } from './schema-snapshot.js'

const base = new URL('https://example.test/operationeel/')
/**
 * Creates a minimal fingerprinted snapshot and serves it through mocked fetch.
 * @returns Mutable resources and their index for integrity regression cases.
 */
async function fixture() {
  const codelist = '{"@context":{},"graph":[]}'
  const schema = JSON.stringify({ $id: 'https://example.test/report', type: 'object', properties: { label: { type: 'string' } } })
  const index = {
    version: 1, sourceSha256: await fingerprint(codelist),
    files: [{ path: 'new/report/schema.json', id: 'https://example.test/report', sha256: await fingerprint(schema), kind: 'section', theme: 'new' }],
    generation: {
      mode: 'allow-incomplete', complete: false,
      blockedSections: [{
        theme: 'New', themeConceptId: 'urn:theme', sectionConceptId: 'urn:blocked', sectionLabel: 'Blocked',
        issues: [{ code: 'missing-datatype', conceptId: 'urn:field', message: 'Missing datatype.' }],
      }],
    },
  }
  const content = new Map([
    ['schema/index.json', JSON.stringify(index)], ['schema/new/report/schema.json', schema], ['codelist.jsonld', codelist],
  ])
  const fetcher = vi.fn(async (url: URL) => {
    const text = content.get(url.href.slice(base.href.length))
    return new Response(text ?? '', { status: text === undefined ? 404 : 200 })
  })
  vi.stubGlobal('fetch', fetcher)
  return { index, content, fetcher }
}
afterEach(() => vi.unstubAllGlobals())

describe('Browser schema snapshot', () => {
  it('verifies snapshots over LAN HTTP without Web Crypto', async () => {
    const f = await fixture()
    vi.stubGlobal('crypto', {})
    for (const text of ['', 'abc', 'Grondwater \u00e9 \ud83d\udca7', 'x'.repeat(10000)]) {
      expect(await fingerprint(text)).toBe(createHash('sha256').update(text).digest('hex'))
    }
    expect((await loadSchemaSnapshot(base)).index).toEqual(f.index)
    f.content.set('schema/new/report/schema.json', '{}')
    await expect(loadSchemaSnapshot(base)).rejects.toThrow('Schema wijkt af')
  })

  it('verifies exact fingerprints and retains incomplete coverage under a deployment subpath', async () => {
    const f = await fixture()
    const snapshot = await loadSchemaSnapshot(base)
    expect(snapshot.index).toEqual(f.index)
    expect(snapshot.schemas.get('https://example.test/report')?.properties).toEqual({ label: { type: 'string' } })
    expect(f.fetcher.mock.calls.map(([url]) => url.href).sort()).toEqual([
      base.href + 'codelist.jsonld', base.href + 'schema/index.json', base.href + 'schema/new/report/schema.json',
    ])
  })

  it.each(['codelist.jsonld', 'schema/new/report/schema.json'])('rejects stale/edited input: %s', async path => {
    const f = await fixture()
    f.content.set(path, '{}')
    await expect(loadSchemaSnapshot(base)).rejects.toThrow(path === 'codelist.jsonld' ? 'komen niet overeen' : 'Schema wijkt af')
  })

  it('rejects invalid schemas even when their indexed hash is updated', async () => {
    const f = await fixture()
    const invalid = JSON.stringify({ $id: f.index.files[0].id, type: 'not-a-type' })
    f.content.set('schema/new/report/schema.json', invalid)
    f.index.files[0].sha256 = await fingerprint(invalid)
    f.content.set('schema/index.json', JSON.stringify(f.index))
    await expect(loadSchemaSnapshot(base)).rejects.toThrow('schema is invalid')
  })

  it('fails visibly for missing resources and malformed/contradictory coverage reports', async () => {
    const f = await fixture()
    f.content.delete('schema/new/report/schema.json')
    await expect(loadSchemaSnapshot(base)).rejects.toThrow('404')
    f.index.generation.complete = true
    f.content.set('schema/index.json', JSON.stringify(f.index))
    await expect(loadSchemaSnapshot(base)).rejects.toThrow('Invalid schema generation report')
  })
})
