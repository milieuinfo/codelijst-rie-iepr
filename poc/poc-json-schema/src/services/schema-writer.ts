import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { JsonSchemaObject } from '../models/index.js'
import { parseGenerationReport, type GenerationReport } from './generation-report.js'
import type { SchemaIndex, SchemaIndexEntry } from './schema-index.js'
export type { SchemaIndex, SchemaIndexEntry } from './schema-index.js'

export const sha256 = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex')

export class SchemaWriter {
  private readonly entries = new Map<string, SchemaIndexEntry>()

  constructor(private readonly outDir: string) {}

  getEntries(): SchemaIndexEntry[] {
    return [...this.entries.values()].sort((a, b) => a.path.localeCompare(b.path))
  }

  async writeBase(schema: JsonSchemaObject): Promise<void> {
    await this.write('observatie.json', schema, { kind: 'base' })
  }

  async writeCollection(schema: JsonSchemaObject): Promise<void> {
    await this.write('observatie-verzameling.json', schema, { kind: 'base' })
  }

  async writeTheme(themeName: string, schema: JsonSchemaObject, themeConceptId?: string): Promise<void> {
    const theme = this.themeSlug(themeName)
    await this.write(`${theme}/schema.json`, schema, { kind: 'theme', theme, themeConceptId })
  }

  async writeSubSchema(themeName: string, subName: string, schema: JsonSchemaObject, themeConceptId?: string): Promise<void> {
    this.assertSegment(subName)
    const theme = this.themeSlug(themeName)
    await this.write(`${theme}/${subName}/schema.json`, schema, { kind: 'section', theme, themeConceptId })
  }

  /** Publish only this run; a filtered run is deliberately a filtered snapshot. */
  async finalize(sourceSha256: string, generation?: GenerationReport): Promise<SchemaIndex> {
    if (!/^[a-f0-9]{64}$/.test(sourceSha256)) throw new Error('Invalid source fingerprint.')
    parseGenerationReport(generation)
    const schemaDir = path.resolve(this.outDir, 'schema')
    const indexPath = path.join(schemaDir, 'index.json')
    let previous: unknown
    try {
      previous = JSON.parse(await fs.readFile(indexPath, 'utf-8'))
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }

    if (previous !== undefined) {
      if (!this.isIndex(previous)) throw new Error(`Invalid generated schema index: ${indexPath}`)
      parseGenerationReport(previous.generation)
      const obsolete: string[] = []
      for (const entry of previous.files) {
        this.assertRelativePath(entry.path)
      }
      for (const entry of previous.files) {
        if (this.entries.has(entry.path)) continue
        const obsoletePath = path.join(schemaDir, entry.path)
        try {
          const content = await fs.readFile(obsoletePath)
          if (sha256(content) !== entry.sha256) {
            throw new Error(`Refusing to remove modified generated schema: ${obsoletePath}`)
          }
          obsolete.push(obsoletePath)
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
        }
      }
      for (const file of obsolete) await fs.unlink(file)
    }

    const index: SchemaIndex = {
      version: 1,
      sourceSha256,
      files: this.getEntries(),
      ...(generation ? { generation } : {}),
    }
    await fs.mkdir(schemaDir, { recursive: true })
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf-8')
    return index
  }

  private async write(
    relativePath: string,
    schema: JsonSchemaObject,
    metadata: Pick<SchemaIndexEntry, 'kind' | 'theme' | 'themeConceptId'>,
  ): Promise<void> {
    this.assertRelativePath(relativePath)
    if (!schema.$id) throw new Error(`Generated schema has no $id: ${relativePath}`)
    if (this.entries.has(relativePath)) throw new Error(`Duplicate generated schema path: ${relativePath}`)
    if ([...this.entries.values()].some(entry => entry.id === schema.$id)) {
      throw new Error(`Duplicate generated schema $id: ${schema.$id}`)
    }
    const content = JSON.stringify(schema, null, 2) + '\n'
    const filePath = path.resolve(this.outDir, 'schema', relativePath)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
    this.entries.set(relativePath, {
      path: relativePath, id: schema.$id, sha256: sha256(content), ...metadata,
    })
  }

  private themeSlug(name: string): string {
    const slug = name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim()
    this.assertSegment(slug)
    return slug
  }

  private assertSegment(segment: string): void {
    if (!segment || segment === '.' || segment === '..' || /[/\\]/.test(segment)) {
      throw new Error(`Unsafe generated schema name: ${segment}`)
    }
  }

  private assertRelativePath(file: string): void {
    if (path.posix.isAbsolute(file) || file.includes('\\') || !file.endsWith('.json') || file === 'index.json') {
      throw new Error(`Unsafe generated schema path: ${file}`)
    }
    for (const segment of file.split('/')) this.assertSegment(segment)
  }

  private isIndex(value: unknown): value is SchemaIndex {
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 ||
        !('files' in value) || !Array.isArray(value.files)) return false
    return value.files.every(entry => entry && typeof entry.path === 'string' &&
      typeof entry.sha256 === 'string' && /^[a-f0-9]{64}$/.test(entry.sha256))
  }
}
