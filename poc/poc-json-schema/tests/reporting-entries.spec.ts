import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadReportingEntries, reportingEntriesPath } from '../../../scripts/reporting-entries.mjs'
import { sourceSnapshot, canonicalSource } from '../scripts/source-snapshot.mjs'

const root = resolve(import.meta.dirname, '../../..')
const temporary: string[] = []
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('Shared reporting entry declaration', () => {
  it('uses the same explicit entries as the MCP instead of deriving availability from filenames', () => {
    expect(JSON.parse(sourceSnapshot())['x-reporting-entries']).toEqual(
      loadReportingEntries(root).map(({ schemeId, slug, label }) => ({ schemeId, slug, label })),
    )
  })

  it('takes enabled themes, labels and slugs from the declaration', () => {
    const directory = mkdtempSync(join(tmpdir(), 'codelijst-snapshot-entries-'))
    temporary.push(directory)
    cpSync(join(root, 'src/source'), join(directory, 'src/source'), { recursive: true })
    mkdirSync(join(directory, 'poc'))
    const entry = { ...loadReportingEntries(root)[1], label: 'Luchtrapportering', slug: 'luchtrapportering' }
    writeFileSync(join(directory, reportingEntriesPath), JSON.stringify([entry]))
    const snapshot = JSON.parse(sourceSnapshot(canonicalSource, undefined, directory))
    expect(snapshot['x-reporting-entries']).toEqual([{
      schemeId: entry.schemeId, label: entry.label, slug: entry.slug,
    }])
    expect(snapshot.graph.some((node: { id: string }) => node.id === 'conceptscheme:operationeel_grondwater')).toBe(false)
    entry.schemeId = 'conceptscheme:operationeel_water'
    writeFileSync(join(directory, reportingEntriesPath), JSON.stringify([entry]))
    expect(() => sourceSnapshot(canonicalSource, undefined, directory)).toThrow('Missing or ambiguous reporting entry')
  })

  it('does not silently invent entries for unconfigured operational files', () => {
    expect(() => sourceSnapshot(canonicalSource, join(root, 'src/source/operationeel_contextueel.csv')))
      .toThrow('No reporting entry declared')
    expect(readFileSync(join(root, reportingEntriesPath), 'utf8')).toContain('operationeel_lucht.csv')
  })
})
