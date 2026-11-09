import { readFile, writeFile } from 'node:fs/promises'
import { DataFactory, Parser, Store } from 'n3'

const source = new URL('../../../../RIE-IEPR/src/main/resources/be/vlaanderen/omgeving/riepr/data/ns/riepr/riepr.ttl', import.meta.url)
const target = new URL('../src/generated/uri-templates.json', import.meta.url)
const { namedNode } = DataFactory
const graph = new Store(new Parser().parse(await readFile(source, 'utf8')))
const riepr = 'https://data.riepr.omgeving.vlaanderen.be/ns/riepr#'
const hydra = 'http://www.w3.org/ns/hydra/core#'
const only = (subject, predicate) => {
  const values = graph.getObjects(subject, namedNode(hydra + predicate), null)
  if (values.length !== 1) throw new Error(`Expected one ${predicate} for ${subject.value}.`)
  return values[0]
}
const templates = {}
for (const name of ['Emissie', 'Onttrekking', 'Verbruik', 'Monster', 'Observatie', 'ObservatieVerzameling', 'Resultaat']) {
  const resource = only(namedNode(riepr + name), 'search')
  const template = only(resource, 'template').value
  const mappings = {}
  for (const mapping of graph.getObjects(resource, namedNode(hydra + 'mapping'), null)) {
    const variable = only(mapping, 'variable').value
    if (mappings[variable] || only(mapping, 'required').value !== 'true') throw new Error(`Invalid mapping: ${name}/${variable}.`)
    mappings[variable] = only(mapping, 'property').value
  }
  const variables = [...template.matchAll(/\{([a-z]+)\}/g)].map(match => match[1])
  if (variables.length !== Object.keys(mappings).length || variables.some(variable => !mappings[variable])) {
    throw new Error(`Template variables and mappings do not match for ${name}.`)
  }
  templates[riepr + name] = { template, mappings }
}
await writeFile(target, JSON.stringify(templates, null, 2) + '\n')
console.log(`Synced URI templates from ${source.pathname}`)
