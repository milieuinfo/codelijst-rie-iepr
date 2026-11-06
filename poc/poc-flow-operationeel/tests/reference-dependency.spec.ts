import { test, expect } from '@playwright/test'
import type { SchemaRichTable } from '../src/components/schema-rich-table.js'

test('filters connected choices per row without changing stale drafts or confusing option indexes', async ({ page }) => {
  await page.goto('/')
  await page.locator('select#productie-jaar').selectOption('2026')
  await expect(page.locator('select#thema')).toBeVisible()
  await page.evaluate(async () => {
    const editorPath = '/src/services/schema-editor.ts'
    const tablePath = '/src/components/schema-rich-table.ts'
    const { SchemaEditor } = await import(editorPath) as typeof import('../src/services/schema-editor.js')
    await import(tablePath)
    const relation = 'urn:connectedTo'
    const references = [
      { id: 'urn:p1', label: 'Point A', types: ['urn:point'] },
      { id: 'urn:p2', label: 'Point B', types: ['urn:point'] },
      { id: 'urn:s1', label: 'Source A', types: ['urn:source'], relations: { [relation]: ['urn:p1'] } },
      { id: 'urn:s2', label: 'Source B', types: ['urn:source'], relations: { [relation]: ['urn:p2'] } },
    ]
    const editor = new SchemaEditor({
      $id: 'https://example.test/flat-selections', type: 'object',
      properties: { rows: { type: 'array', items: {
        type: 'object', properties: {
          point: { type: 'string', title: 'Point', 'x-source-concept': 'urn:point-field', 'x-reference-types': ['urn:point'] },
          source: { type: 'string', title: 'Source', 'x-source-concept': 'urn:source-field', 'x-reference-types': ['urn:source'],
            'x-reference-dependency': { sourceConcept: 'urn:point-field', relation } },
        },
      } } },
    }, [], references)
    editor.set(['rows'], [{ point: 'urn:p1', source: 'urn:s1' }, { point: 'urn:p2' }, {}])
    const table = document.createElement('schema-rich-table') as SchemaRichTable
    table.id = 'dependency-table'
    table.editor = editor
    table.node = editor.schemaAt(['rows'])
    table.path = ['rows']
    table.label = value => references.find(reference => reference.id === value)?.label ?? String(value)
    table.addEventListener('schema-edit', () => { table.revision = editor.revision })
    document.body.append(table)
  })
  const table = page.locator('#dependency-table')
  const cell = (row: number, field: string) => table.locator(`td[data-instance-path="/rows/${row}/${field}"]`)
  await expect(cell(0, 'source').locator('option', { hasText: 'Source A' })).toHaveCount(1)
  await expect(cell(0, 'source').locator('option', { hasText: 'Source B' })).toHaveCount(0)
  await expect(cell(1, 'source').locator('option', { hasText: 'Source B' })).toHaveCount(1)
  await expect(cell(2, 'source').locator('option', { hasText: 'Source' })).toHaveCount(0)
  await cell(0, 'point').locator('select').selectOption({ label: 'Point B' })
  await expect(cell(0, 'source').locator('option', { hasText: 'Source A' })).toHaveCount(0)
  await expect(cell(0, 'source').locator('option', { hasText: 'Source B' })).toHaveCount(1)
  expect(await table.evaluate(element => (element as SchemaRichTable).editor.get(['rows', 0, 'source']))).toBe('urn:s1')
  expect(await table.evaluate(element => (element as SchemaRichTable).editor.validate().diagnostics))
    .toContainEqual(expect.objectContaining({ instancePath: '/rows/0/source' }))
  await cell(0, 'source').locator('select').selectOption({ label: 'Source B' })
  expect(await table.evaluate(element => (element as SchemaRichTable).editor.get(['rows', 0, 'source']))).toBe('urn:s2')
})
