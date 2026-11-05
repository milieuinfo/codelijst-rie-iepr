import { parseGenerationReport, type GenerationReport } from './generation-report.js'

export interface SchemaIndexEntry {
  path: string
  id: string
  sha256: string
  kind: 'base' | 'theme' | 'section' | 'personalized'
  genericSchemaId?: string
  theme?: string
  themeConceptId?: string
}

export interface SchemaIndex {
  version: 1
  sourceSha256: string
  files: SchemaIndexEntry[]
  generation?: GenerationReport
}

function isEntry(value: unknown): value is SchemaIndexEntry {
  return !!value && typeof value === 'object' &&
    'path' in value && typeof value.path === 'string' &&
    'id' in value && typeof value.id === 'string' && value.id.length > 0 &&
    'sha256' in value && typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256) &&
    'kind' in value && (value.kind === 'base' || value.kind === 'theme' || value.kind === 'section' || value.kind === 'personalized') &&
    (value.kind !== 'personalized' || ('genericSchemaId' in value && typeof value.genericSchemaId === 'string')) &&
    (!('theme' in value) || typeof value.theme === 'string') &&
    (!('themeConceptId' in value) || typeof value.themeConceptId === 'string')
}

export function parseSchemaIndex(raw: unknown): SchemaIndex {
  if (!raw || typeof raw !== 'object' || !('version' in raw) || raw.version !== 1 ||
      !('sourceSha256' in raw) || typeof raw.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(raw.sourceSha256) ||
      !('files' in raw) || !Array.isArray(raw.files)) {
    throw new Error('Missing or incompatible schema index. Regenerate and sync schemas first.')
  }
  const generation = parseGenerationReport('generation' in raw ? raw.generation : undefined)
  const paths = new Set<string>()
  const ids = new Set<string>()
  const files: SchemaIndexEntry[] = []
  for (const entry of raw.files) {
    if (!isEntry(entry) || paths.has(entry.path) || ids.has(entry.id)) throw new Error('Invalid or duplicate schema index entry.')
    if (entry.path.startsWith('/') || entry.path.includes('\\') ||
        entry.path.split('/').some(part => !part || part === '.' || part === '..') ||
        !entry.path.endsWith('.json') || entry.path === 'index.json') {
      throw new Error(`Unsafe schema index path: ${entry.path}`)
    }
    if (entry.kind !== 'base' && (!entry.theme || entry.path.split('/')[0] !== entry.theme)) {
      throw new Error(`Schema path does not match indexed theme: ${entry.path}`)
    }
    paths.add(entry.path)
    ids.add(entry.id)
    files.push(entry)
  }
  for (const entry of files.filter(entry => entry.kind === 'personalized')) {
    if (!files.some(generic => generic.kind !== 'personalized' && generic.id === entry.genericSchemaId && generic.theme === entry.theme)) {
      throw new Error(`Missing generic schema for personalized variant: ${entry.path}`)
    }
  }
  return { version: 1, sourceSha256: raw.sourceSha256, files, ...(generation ? { generation } : {}) }
}
