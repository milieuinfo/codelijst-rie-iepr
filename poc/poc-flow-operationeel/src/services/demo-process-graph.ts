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
  const shared = parseReferenceData(references)
  const structural = shared.filter(reference => !reference.types.includes(processClass.value))
  const processes = shared.filter(reference => reference.types.includes(processClass.value))
  const describeProcess = (id: string, label: string) => {
    const process = namedNode(id)
    graph.addQuad(process, rdfType, processClass)
    graph.addQuad(process, namedNode('http://www.w3.org/2000/01/rdf-schema#label'), literal(label))
    graph.addQuad(process, namedNode(dct + 'created'), stamp)
    graph.addQuad(process, namedNode(dct + 'modified'), stamp)
    return process
  }
  for (const reference of processes) {
    const process = describeProcess(reference.id, reference.label)
    const systems = reference.relations?.[implementedBy.value]
    if (!systems?.length) throw new Error(`Demonstratieproces zonder implementerend systeem: ${reference.id}.`)
    for (const id of systems) {
      if (!structural.some(system => system.id === id)) throw new Error(`Onbekend demonstratiesysteem: ${id}.`)
      const system = namedNode(id)
      graph.addQuad(system, rdfType, systemClass)
      graph.addQuad(process, implementedBy, system)
    }
  }
  const implementedTypes = (reference: typeof processes[number]) =>
    structural.filter(system => reference.relations?.[implementedBy.value]?.includes(system.id))
      .flatMap(system => system.types)
  const installations = processes.filter(reference => implementedTypes(reference).includes('https://data.riepr.omgeving.vlaanderen.be/ns/riepr#Installatie'))
  const points = processes.filter(reference => implementedTypes(reference).some(type => type.includes('/emissiepunttype/')))
  graph.addQuad(transportType, rdfType, namedNode('http://www.w3.org/ns/sosa/Procedure'))
  for (const point of points) for (const installation of installations) {
    const connection = describeProcess(
      `urn:demo:transport:${encodeURIComponent(installation.id)}:${encodeURIComponent(point.id)}`,
      `Transport ${installation.label} naar ${point.label}`,
    )
    graph.addQuad(connection, namedNode(dct + 'type'), transportType)
    graph.addQuad(connection, precededBy, namedNode(installation.id))
    graph.addQuad(namedNode(point.id), precededBy, connection)
  }
  return graph
}
