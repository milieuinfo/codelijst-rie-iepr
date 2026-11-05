import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { syncCodelist } from '../scripts/sync-codelist.mjs'

const directories: string[] = []
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

it('fails instead of keeping a stale codelist when the canonical source is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'schema-codelist-sync-'))
  directories.push(dir)
  const destination = join(dir, 'copy.jsonld')
  writeFileSync(destination, 'stale')
  expect(() => syncCodelist(join(dir, 'missing.jsonld'), destination)).toThrow('Codelist source not found')
  expect(readFileSync(destination, 'utf8')).toBe('stale')
})
