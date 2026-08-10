import type { Concept } from '../models/skos-models.js'

/**
 * Sorts a group of concept fields by their relative UI ordering annotations
 * (_uiFirst, _uiAfter) using topological sort. Respects hierarchy levels:
 * a child can only reference another child within the same group, never its
 * parent or a field outside the group.
 *
 * @param fields - Array of concepts at the same hierarchy level (siblings).
 * @returns Sorted array with uiFirst fields first, then fields respecting
 *          _uiAfter constraints, then remaining unconstrained fields.
 */
export function sortByUiOrder(fields: Concept[]): Concept[] {
  if (fields.length <= 1) return [...fields]

  const fieldIds = new Set(fields.map(f => f.id))
  const byId = new Map(fields.map(f => [f.id, f]))

  // Separate into three categories
  const firstFields: Concept[] = []
  const orderedFields: Concept[] = []
  const freeFields: Concept[] = []

  for (const f of fields) {
    if (f.uiFirst === true) {
      firstFields.push(f)
    } else if (f.uiAfter && fieldIds.has(f.uiAfter)) {
      orderedFields.push(f)
    } else {
      freeFields.push(f)
    }
  }

  // Sort fields with _uiAfter using Kahn's algorithm (BFS topological sort)
  const sorted = topologicalSort(orderedFields, byId, fieldIds)

  // Stable order: uiFirst first, then topologically sorted, then unconstrained
  return [...firstFields, ...sorted, ...freeFields]
}

/**
 * Topologically sorts fields that have _uiAfter constraints.
 * Uses Kahn's algorithm with cycle detection.
 */
function topologicalSort(
  fields: Concept[],
  byId: Map<string, Concept>,
  validIds: Set<string>,
): Concept[] {
  if (fields.length === 0) return []

  const result: Concept[] = []
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>() // afterTarget -> [field ids that come after it]

  for (const f of fields) {
    inDegree.set(f.id, 0)
    if (!dependents.has(f.id)) dependents.set(f.id, [])
  }

  // Build graph from _uiAfter constraints
  for (const f of fields) {
    if (!f.uiAfter) continue
    const targetId = f.uiAfter

    // Only count edges where both nodes are in the set
    if (!validIds.has(targetId)) continue

    // If target is also in orderedFields, it's an edge within the constrained set
    if (inDegree.has(targetId)) {
      inDegree.set(f.id, (inDegree.get(f.id) ?? 0) + 1)
      dependents.get(targetId)?.push(f.id)
    }
  }

  // Also track order of original array for stable sort among equal-indegree
  const originalOrder = new Map(fields.map((f, i) => [f.id, i]))

  // Kahn's algorithm
  const queue: Concept[] = []
  for (const f of fields) {
    if ((inDegree.get(f.id) ?? 0) === 0) {
      queue.push(f)
    }
  }

  // Sort initial queue by original order for determinism
  queue.sort((a, b) => (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0))

  while (queue.length > 0) {
    const current = queue.shift()!
    result.push(current)

    const deps = dependents.get(current.id) ?? []
    for (const depId of deps) {
      inDegree.set(depId, (inDegree.get(depId) ?? 1) - 1)
      if (inDegree.get(depId) === 0) {
        const depField = byId.get(depId)
        if (depField) queue.push(depField)
      }
    }

    // Re-sort queue to maintain stable ordering among newly freed nodes
    queue.sort((a, b) => (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0))
  }

  // If result is shorter than input, there's a cycle — append remaining in original order
  if (result.length < fields.length) {
    const sortedIds = new Set(result.map(f => f.id))
    const cycled = fields.filter(f => !sortedIds.has(f.id))
    console.warn(`Circular _uiAfter dependency detected among: ${cycled.map(f => f.id).join(', ')}`)
    result.push(...cycled)
  }

  return result
}
