import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
export const canonicalSource = resolve(repo, 'src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld')
const groundwater = 'conceptscheme:operationeel_grondwater'

/** Flatten the published supporting lists; replace reporting data with the current CSV. */
export function sourceSnapshot(publication = canonicalSource, source = resolve(repo, 'src/source/operationeel_grondwater.csv')) {
  const document = JSON.parse(readFileSync(publication, 'utf8'))
  const context = document['@context']
  const nodes = new Map()
  const idOf = value => typeof value === 'string' ? value : value?.id ?? value?.['@id']
  const flatten = value => {
    if (Array.isArray(value)) return value.map(flatten)
    if (!value || typeof value !== 'object') return value
    const id = idOf(value)
    const node = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, flatten(child)]))
    if (!id) return node
    nodes.set(id, { ...nodes.get(id), ...node })
    return { id }
  }
  flatten(document.graph ?? document['@graph'])
  const expand = id => {
    if (typeof id !== 'string') return ''
    const [prefix, ...rest] = id.split(':')
    return typeof context[prefix] === 'string' ? context[prefix] + rest.join(':') : id
  }
  const operation = expand('conceptscheme:operationeel_')
  const theme = expand('conceptscheme:thematypes')
  const oldTheme = expand('conceptscheme:thema_type')
  for (const [id, node] of nodes) {
    const scheme = expand(idOf(node.inScheme))
    if (expand(id).startsWith(operation) || scheme.startsWith(operation) ||
        [theme, oldTheme].includes(expand(id)) || [theme, oldTheme].includes(scheme)) nodes.delete(id)
  }
  // Selection lists are dependencies, not additional reporting flows.
  const misc = parse(readFileSync(resolve(dirname(source), 'operationeel_misc.csv'), 'utf8'), {
    columns: true, skip_empty_lines: true, relax_column_count: true, trim: true,
  })
  const rows = parse(readFileSync(source, 'utf8'), {
    columns: true, skip_empty_lines: true, relax_column_count: true, trim: true,
  })
  for (const [order, row] of [...misc, ...rows].entries()) {
    if (!row._id) continue
    const node = { id: row._id, _type: row._type, _table_order: order }
    for (const [key, value] of Object.entries(row)) {
      if (!value || ['_id', '_type', 'collections'].includes(key)) continue
      node[key] = /^(true|false)$/.test(value) ? value === 'true'
        : !['prefLabel', 'definition', 'note', '_table_workbook', '_table_sheet'].includes(key) && /[,|]/.test(value)
          ? value.split(/[,|]/).map(part => part.trim()) : value
    }
    nodes.set(row._id, node)
    if (row.collections) for (const collection of row.collections.split(/[,|]/)) {
      const owner = nodes.get(collection) ?? { id: collection, _type: 'skos:Collection' }
      owner.member = [...(owner.member ?? []), row._id]
      nodes.set(collection, owner)
    }
  }
  for (const node of nodes.values()) {
    const scheme = idOf(node.topConceptOf)
    if (scheme && nodes.has(scheme)) {
      const owner = nodes.get(scheme)
      owner.hasTopConcept = [...(owner.hasTopConcept ?? []), { id: idOf(node) }]
    }
  }
  const groups = new Map()
  for (const row of rows.filter(row => row._id)) {
    const key = row._table_sheet ? `${row._table_workbook}/${row._table_sheet}` : row.broaderPartitive || row.inScheme || row._id
    groups.set(key, [...(groups.get(key) ?? []), nodes.get(row._id)])
  }
  let order = 0
  for (const siblings of groups.values()) {
    const visiting = new Set()
    const done = new Set()
    const append = node => {
      if (done.has(node.id)) return
      if (visiting.has(node.id)) throw new Error(`Cyclic source UI ordering at ${node.id}.`)
      visiting.add(node.id)
      const previous = siblings.find(sibling => sibling.id === node._ui_after)
      if (previous) append(previous)
      visiting.delete(node.id)
      done.add(node.id)
      node._table_order = order++
    }
    for (const node of [...siblings.filter(node => node._ui_first === true), ...siblings]) append(node)
  }
  if (!nodes.has(groundwater)) throw new Error(`Missing ${groundwater} in ${source}.`)
  return JSON.stringify({
    'x-source-profile': 'groundwater-csv-v1',
    '@context': context,
    graph: [...nodes.values()],
  }, null, 2) + '\n'
}
