import { DataFactory, Store, type Quad } from 'n3'

const { namedNode } = DataFactory
const implementedBy = namedNode('http://www.w3.org/ns/ssn/implementedBy')
const precededBy = namedNode('http://purl.org/net/p-plan#isPrecededBy')
const type = namedNode('http://purl.org/dc/terms/type')
const transport = namedNode('https://data.omgeving.vlaanderen.be/id/concept/riepr/procedure-type/transport')

/**
 * Resolve only processes explicitly present in the supplied reference graph.
 * @param graph - Structural reference and process relationships.
 * @param groups - Systems grouped by feature-construction input.
 * @returns The derived processes and the connecting process context.
 */
export function resolveProcesses(graph: Store, groups: string[][]): {
  derived: Quad['subject'][]; context: Quad['subject'][]
} {
  if (!groups.length || groups.some(group => group.length === 0)) {
    throw new Error('Kan de geselecteerde systeemgroepen niet aan processen koppelen.')
  }
  const processes = groups.map(group => group.map(system => {
    const candidates = graph.getSubjects(implementedBy, namedNode(system), null)
    if (candidates.length !== 1) throw new Error(`Verwacht één proces voor ${system}; gevonden: ${candidates.length}.`)
    return candidates[0]
  }))
  if (processes.length === 1) return { derived: processes[0], context: processes[0] }
  if (processes.length !== 2) {
    throw new Error('Kan de geselecteerde systeemgroepen niet aan transportprocessen koppelen.')
  }
  const paths = (start: Quad['subject'], end: Quad['subject']): Quad['subject'][][] => {
    const visit = (node: Quad['subject'], seen: Set<string>, found: Quad['subject'][]): Quad['subject'][][] => {
      if (node.equals(end)) return found.some(item => graph.has(item, type, transport, null)) ? [[...found, node]] : []
      if (seen.has(node.value)) return []
      const nextSeen = new Set(seen).add(node.value)
      return graph.getSubjects(precededBy, node, null).flatMap(next => {
        return visit(next, nextSeen, [...found, node])
      })
    }
    return visit(start, new Set(), [])
  }
  const results: Quad['subject'][] = []
  const context: Quad['subject'][] = []
  for (const left of processes[0]) for (const right of processes[1]) {
    const matches = [...paths(left, right), ...paths(right, left)]
    if (matches.length !== 1) {
      throw new Error(`Verwacht één transporttraject tussen ${left.value} en ${right.value}; gevonden: ${matches.length}.`)
    }
    context.push(...matches[0])
    results.push(...matches[0].filter(process => graph.has(process, type, transport, null)))
  }
  const unique = (items: Quad['subject'][]) => [...new Map(items.map(item => [item.value, item])).values()]
  return { derived: unique(results), context: unique(context) }
}
