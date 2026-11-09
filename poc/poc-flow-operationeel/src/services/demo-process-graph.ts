import { DataFactory, Store } from 'n3'
import { parseReferenceData } from 'codelijst-rie-iepr-poc-json-schema/browser'
import references from '../../../poc-json-schema/examples/refs.json'

const { namedNode, literal } = DataFactory
const rdfType = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
const processClass = namedNode('https://data.riepr.omgeving.vlaanderen.be/ns/riepr#Proces')
const systemClass = namedNode('http://www.w3.org/ns/ssn/System')
const implementedBy = namedNode('http://www.w3.org/ns/ssn/implementedBy')
const precededBy = namedNode('http://purl.org/net/p-plan#isPrecededBy')
const transportType = namedNode('https://data.omgeving.vlaanderen.be/id/concept/riepr/procedure-type/transport')
const dct = 'http://purl.org/dc/terms/'
const stamp = literal('2024-01-01T00:00:00Z', namedNode('http://www.w3.org/2001/XMLSchema#dateTime'))

/**
 * Build a fictional graph for the shared demonstration references, not a production lookup.
 * @returns Synthetic system and process relationships.
 */
export function demonstrationProcessGraph(): Store {
  const graph = new Store()
  const structural = parseReferenceData(references).filter(reference =>
    !reference.types.some(type => type.includes('/meetpunteigenschappen/')))
  const processes = new Map<string, ReturnType<typeof namedNode>>()
  const describeProcess = (id: string, label: string) => {
    const process = namedNode(id)
    graph.addQuad(process, rdfType, processClass)
    graph.addQuad(process, namedNode('http://www.w3.org/2000/01/rdf-schema#label'), literal(label))
    graph.addQuad(process, namedNode(dct + 'created'), stamp)
    graph.addQuad(process, namedNode(dct + 'modified'), stamp)
    return process
  }
  for (const reference of structural) {
    const process = describeProcess(`urn:demo:process:${encodeURIComponent(reference.id)}`, `Demonstratieproces ${reference.label}`)
    const system = namedNode(reference.id)
    graph.addQuad(system, rdfType, systemClass)
    graph.addQuad(process, implementedBy, system)
    processes.set(reference.id, process)
  }
  const installations = structural.filter(reference => reference.types.includes('https://data.riepr.omgeving.vlaanderen.be/ns/riepr#Installatie'))
  const points = structural.filter(reference => reference.types.some(type => type.includes('/emissiepunttype/')))
  graph.addQuad(transportType, rdfType, namedNode('http://www.w3.org/ns/sosa/Procedure'))
  for (const point of points) for (const installation of installations) {
    const connection = describeProcess(
      `urn:demo:transport:${encodeURIComponent(installation.id)}:${encodeURIComponent(point.id)}`,
      `Demonstratietransport ${installation.label} naar ${point.label}`,
    )
    graph.addQuad(connection, namedNode(dct + 'type'), transportType)
    graph.addQuad(connection, precededBy, processes.get(installation.id)!)
    graph.addQuad(processes.get(point.id)!, precededBy, connection)
  }
  return graph
}
