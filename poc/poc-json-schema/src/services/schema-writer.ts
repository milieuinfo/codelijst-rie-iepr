import fs from 'node:fs/promises'
import path from 'node:path'
import type { JsonSchemaObject } from '../models/index.js'

export class SchemaWriter {
  private readonly outDir: string

  constructor(outDir: string) {
    this.outDir = outDir
  }

  async writeBase(schema: JsonSchemaObject): Promise<void> {
    const dir = path.resolve(this.outDir, 'schema')
    await fs.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, 'observatie.json')
    await fs.writeFile(filePath, JSON.stringify(schema, null, 2) + '\n', 'utf-8')
  }

  async writeTheme(themeName: string, domainSchema: JsonSchemaObject): Promise<void> {
    const themeSlug = themeName.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()

    const dir = path.resolve(this.outDir, 'schema', themeSlug)
    await fs.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, 'schema.json')
    await fs.writeFile(filePath, JSON.stringify(domainSchema, null, 2) + '\n', 'utf-8')
  }

  async writeSubSchema(themeName: string, subName: string, schema: JsonSchemaObject): Promise<void> {
    const themeSlug = themeName.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()

    const dir = path.resolve(this.outDir, 'schema', themeSlug, subName)
    await fs.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, 'schema.json')
    await fs.writeFile(filePath, JSON.stringify(schema, null, 2) + '\n', 'utf-8')
  }
}
