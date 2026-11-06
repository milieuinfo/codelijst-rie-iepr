import { readFileSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'
import { loadReportingEntries } from '../../../scripts/reporting-entries.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
export const canonicalSource = resolve(repo, 'src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld')

/** Flatten the published supporting lists; replace reporting data with the current CSV. */
export function sourceSnapshot(publication = canonicalSource, source, root = repo) {
  const configured = loadReportingEntries(root)
  const files = source === undefined ? configured.map(entry => resolve(root, 'src/source', entry.file))
    : Array.isArray(source) ? source : [source]
  if (!files.length) throw new Error('At least one operational CSV is required.')
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
  const misc = parse(readFileSync(resolve(dirname(files[0]), 'operationeel_misc.csv'), 'utf8'), {
    columns: true, skip_empty_lines: true, relax_column_count: true, trim: true,
  })
  const rowsByFile = new Map(files.map(file => [file, parse(readFileSync(file, 'utf8'), {
    columns: true, skip_empty_lines: true, relax_column_count: true, trim: true,
  })]))
  const rows = [...rowsByFile.values()].flat()
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
    const key = row.broaderPartitive || row.inScheme || row._id
    groups.set(key, [...(groups.get(key) ?? []), nodes.get(row._id)])
  }
  const orderedGroups = new Map()
  for (const [key, siblings] of groups) {
    const ordered = []
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
      ordered.push(node)
    }
    for (const node of [...siblings.filter(node => node._ui_first === true), ...siblings]) append(node)
    orderedGroups.set(key, ordered)
  }
  // Keep singleton descendants beside their owning field when tables flatten them.
  let order = 0
  const assigned = new Set()
  const assign = node => {
    if (assigned.has(node.id)) return
    assigned.add(node.id)
    node._table_order = order++
    for (const child of orderedGroups.get(node.id) ?? []) assign(child)
  }
  for (const [key, siblings] of orderedGroups) {
    if (nodes.get(key)?._type === 'skos:ConceptScheme') siblings.forEach(assign)
  }
  for (const siblings of orderedGroups.values()) siblings.forEach(assign)
  const entries = files.map(file => {
    const entry = configured.find(entry => entry.file === basename(file))
    if (!entry) throw new Error(`No reporting entry declared for ${file}.`)
    const { schemeId, slug, label } = entry
    const sourceRows = rowsByFile.get(file).filter(row => row._id === schemeId && row._type === 'skos:ConceptScheme')
    if (sourceRows.length !== 1) {
      throw new Error(`Missing or ambiguous reporting entry ${schemeId} in ${file}.`)
    }
    return { schemeId, slug, label }
  })
  return JSON.stringify({
    'x-source-profile': 'operational-csv-v1',
    'x-reporting-entries': entries,
    '@context': context,
    graph: [...nodes.values()],
  }, null, 2) + '\n'
}
