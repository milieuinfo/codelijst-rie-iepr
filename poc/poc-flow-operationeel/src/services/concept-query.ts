/**
 * Query helpers over a parsed `CodelistResult`. These operate on the typed
 * `Concept` / `Scheme` views (and, for the ref-resolution helpers, the
 * `relevantRiepr` / `seeAlso` id arrays already flattened onto them), never on
 * raw JSON-LD nodes. All functions are pure with respect to the result except
 * `getChildrenMerged` / `mergeRelatedGroup`, which register their synthetic
 * merged groups back into `result.concepts` so repeated calls stay consistent.
 */

import type { CodelistResult, Concept, Scheme } from '../models/index.js'

/**
 * All schemes in the parsed codelist.
 * @param result - The parsed codelist result.
 * @returns Array of all Scheme objects.
 */
export function getSchemes(result: CodelistResult): Scheme[] {
  return Array.from(result.schemes.values())
}

/**
 * Look up a single scheme by id.
 * @param result - The parsed codelist result.
 * @param id - The scheme id to look up.
 * @returns The matching Scheme, or undefined.
 */
export function getScheme(result: CodelistResult, id: string): Scheme | undefined {
  return result.schemes.get(id)
}

/**
 * Look up a single concept by id.
 * @param result - The parsed codelist result.
 * @param id - The concept id to look up.
 * @returns The matching Concept, or undefined.
 */
export function getConcept(result: CodelistResult, id: string): Concept | undefined {
  return result.concepts.get(id)
}

/**
 * All concepts declared `inScheme` of the given conceptscheme, in index order.
 * Includes both top-level and child concepts.
 * @param result - The parsed codelist result.
 * @param schemeId - The conceptscheme to collect concepts for.
 * @returns Array of the scheme's concepts, in index order.
 */
export function getConceptsForScheme(result: CodelistResult, schemeId: string): Concept[] {
  const concepts: Concept[] = []
  for (const concept of result.concepts.values()) {
    if (concept.inScheme === schemeId) concepts.push(concept)
  }
  return concepts
}

/**
 * All top-level concepts declared via `hasTopConcept` for the given scheme,
 * in the order they appear in the source data.
 * @param result - The parsed codelist result.
 * @param schemeId - The conceptscheme to collect top concepts for.
 * @returns Array of top concepts, in source order.
 */
export function getTopConceptsForScheme(result: CodelistResult, schemeId: string): Concept[] {
  return result.topConcepts.get(schemeId) || []
}

/**
 * Returns top-level (root) concepts for a scheme — i.e., hasTopConcept entries
 * that have no broaderPartitive reference. Composite children (fields with
 * `broaderPartitive` set) are excluded so they're only rendered as part of
 * their parent's group.
 * @param result - The parsed codelist result.
 * @param schemeId - The conceptscheme to return root concepts for.
 * @returns The root (non-child) concepts of the scheme.
 */
export function getTopLevelConcepts(result: CodelistResult, schemeId: string): Concept[] {
  return getTopConceptsForScheme(result, schemeId).filter(concept => !concept.broaderPartitive?.length)
}

/**
 * Returns the direct child concepts of the given concept, resolved from its
 * `hasPart` references, in the order they are listed.
 * @param result - The parsed codelist result.
 * @param concept - The parent concept whose children to resolve.
 * @returns Array of direct child concepts (empty when there are none).
 */
export function getChildren(result: CodelistResult, concept: Concept): Concept[] {
  if (!concept.hasPart) return []
  return concept.hasPart
    .map(id => result.concepts.get(id))
    .filter((c): c is Concept => c !== undefined)
}

/**
 * Returns children of a composite concept with mutually `related` concepts merged into
 * synthetic groups. For example, bestemmingsidentificatie-be/buitenland/none/werf are
 * replaced by one "Bestemmingsidentificatie" group whose children are deduped and ordered
 * by first appearance. The merge is driven entirely by the `related` annotation in the
 * codelist; no concept names are hardcoded here.
 * @param result - The parsed codelist result.
 * @param concept - The composite concept whose children to merge.
 * @returns The children, with related siblings merged into synthetic groups.
 */
export function getChildrenMerged(result: CodelistResult, concept: Concept): Concept[] {
  const rawChildren = getChildren(result, concept)
  if (rawChildren.length < 2) return rawChildren

  // Connected components among siblings via `related` (BFS restricted to the sibling set).
  const childIds = new Set(rawChildren.map(c => c.id))
  const components: Concept[][] = []
  const visited = new Set<string>()

  for (const child of rawChildren) {
    if (visited.has(child.id)) continue
    const component: Concept[] = [child]
    visited.add(child.id)
    const queue: string[] = [...(child.related ?? [])]
    while (queue.length > 0) {
      const neighborId = queue.shift()!
      if (!neighborId || !childIds.has(neighborId) || visited.has(neighborId)) continue
      visited.add(neighborId)
      const neighbor = result.concepts.get(neighborId)
      if (!neighbor) continue
      component.push(neighbor)
      for (const ref of neighbor.related ?? []) {
        if (childIds.has(ref) && !visited.has(ref)) queue.push(ref)
      }
    }
    components.push(component)
  }

  const out: Concept[] = []
  for (const component of components) {
    if (component.length === 1) {
      out.push(component[0])
    } else {
      out.push(mergeRelatedGroup(result, component))
    }
  }
  return out
}

/**
 * Merge a component of mutually `related` sibling composites into one synthetic group
 * concept. Children are the deduplicated union of the members' children; a child that
 * appears in multiple members is required only when ALL its appearances require it.
 * The synthetic group and its children are registered in `result.concepts` so that
 * `getChildren()` can resolve them on re-render.
 * @param result - The parsed codelist result (groups are registered here).
 * @param members - The mutually related sibling concepts to merge.
 * @returns The synthetic group Concept.
 */
function mergeRelatedGroup(result: CodelistResult, members: Concept[]): Concept {
  const ids = members.map(m => m.id)
  const first = members[0]

  // Merged id: longest common prefix of the local parts, scheme prefix restored once.
  const schemePrefix = ids[0].substring(0, ids[0].lastIndexOf(':') + 1)
  const localParts = ids.map(id => id.substring(schemePrefix.length))
  const commonLocal = longestCommonPrefix(localParts).replace(/-+$/, '')
  const mergedId = `${schemePrefix}${commonLocal}`

  const sharedConditionPath = members.find(m => m.conditionPath)?.conditionPath

  // Distinct union of condition values across members.
  const groupValues = new Set<string>()
  for (const m of members) {
    for (const cv of m.conditionValues ?? []) groupValues.add(cv)
    if (typeof m.conditionValue === 'string') groupValues.add(m.conditionValue)
  }

  // Dedupe children across members by (relation + lowercase prefLabel), tracking per-variant appearances.
  type Appearance = { conditionValue: string | undefined; required: boolean }
  const childByKey = new Map<string, { child: Concept; appearances: Appearance[] }>()
  for (const member of members) {
    const variantConditionValue = typeof member.conditionValue === 'string' ? member.conditionValue : undefined
    for (const gc of getChildren(result, member)) {
      const key = `${gc.relation ?? ''}::${(gc.prefLabel ?? '').trim().toLowerCase()}`
      const entry = childByKey.get(key)
      if (entry) {
        entry.appearances.push({ conditionValue: variantConditionValue, required: gc.isVerplicht === true })
      } else {
        childByKey.set(key, {
          child: gc,
          appearances: [{ conditionValue: variantConditionValue, required: gc.isVerplicht === true }],
        })
      }
    }
  }

  // Merged children, ordered by first appearance across members (data order).
  const mergedChildren: Concept[] = []
  for (const [key, { child, appearances }] of childByKey) {
    const values = new Set<string>()
    for (const a of appearances) if (a.conditionValue) values.add(a.conditionValue)
    const multiVariant = appearances.length > 1
    const allRequired = appearances.every(a => a.required)
    mergedChildren.push({
      id: `merged::${key}`,
      type: ['skos:Concept'],
      prefLabel: child.prefLabel,
      relation: child.relation,
      relevantDataType: child.relevantDataType,
      conditionPath: sharedConditionPath,
      conditionValues: [...values],
      // Shared children: required iff required in ALL appearances. Single-variant: its own flag.
      isVerplicht: multiVariant ? allRequired : appearances[0].required,
      uiFirst: child.uiFirst,
      uiAfter: child.uiAfter,
    })
  }

  // Register the synthetic group and its children so getChildren() can resolve them on re-render.
  const synthetic: Concept = {
    id: mergedId,
    type: ['skos:Concept'],
    prefLabel: first.prefLabel,
    definition: first.definition,
    hasPart: mergedChildren.map(c => c.id),
    conditionPath: sharedConditionPath,
    conditionValues: [...groupValues],
    isVerplicht: false,
    isMeervoudig: first.isMeervoudig,
    uiFirst: first.uiFirst,
    uiAfter: first.uiAfter,
  }
  for (const c of mergedChildren) result.concepts.set(c.id, c)
  result.concepts.set(synthetic.id, synthetic)
  return synthetic
}

/**
 * Compute the longest common string prefix across an array of strings.
 * @param strings - The strings to compare.
 * @returns The longest common prefix (empty when there is none).
 */
function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return ''
  let prefix = strings[0]
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1)
      if (prefix === '') return ''
    }
  }
  return prefix
}

/**
 * Returns the parent concept of the given concept, resolved from its
 * `broaderPartitive` reference. Returns `null` if there is no parent (i.e., the
 * concept is a top-level concept).
 * @param result - The parsed codelist result.
 * @param concept - The concept whose parent to resolve.
 * @returns The parent Concept, or null when there is none.
 */
export function getParent(result: CodelistResult, concept: Concept): Concept | null {
  const parentId = concept.broaderPartitive?.[0]
  if (!parentId) return null
  return result.concepts.get(parentId) ?? null
}

/**
 * Resolves the conceptschemes referenced by a field's `relevantCodeList`.
 * Refs pointing outside this document (a different prefix, an external
 * URL, or a literal "TODO" placeholder) resolve to nothing rather than
 * throwing, per the POC's "silently ignore, still show a selection" rule.
 * @param result - The parsed codelist result containing schemes and concepts.
 * @param concept - The concept whose relevantCodeList refs to resolve.
 * @returns Array of resolved scheme objects for each valid ref.
 */
export function getCodeListSchemes(result: CodelistResult, concept: Concept): Scheme[] {
  if (!concept.relevantCodeList) return []
  return concept.relevantCodeList
    .map(id => result.schemes.get(id))
    .filter((s): s is Scheme => s !== undefined)
}

/**
 * Resolves a `relevantRiepr` ref list (on a scheme or a concept) to whatever node they point to.
 * Kept for backward compatibility with older codelist formats where relevantRiepr was used
 * for theme→scheme navigation. New format uses seeAlso instead.
 * @param result - The parsed codelist result containing schemes and concepts for lookup.
 * @param node - The scheme or concept whose relevantRiepr refs to resolve.
 * @returns Array of resolved scheme/concept objects for each valid ref.
 */
export function getRelevantRieprRefs(result: CodelistResult, node: Scheme | Concept): (Scheme | Concept)[] {
  if (!node.relevantRiepr) return []
  return node.relevantRiepr
    .map(id => result.schemes.get(id) ?? result.concepts.get(id))
    .filter((n): n is Scheme | Concept => n !== undefined)
}

/**
 * Resolves `seeAlso` references on a concept or scheme to their target nodes.
 * In the updated codelist format, `seeAlso` is used for:
 * - Theme → operationeel scheme navigation (replacing relevantRiepr for this purpose)
 * - Multi-step flow chaining within operational schemes (e.g., feature_bron → lucht_rapportering)
 *
 * External references (ADMS status URIs, etc.) that don't resolve to local
 * schemes or concepts are silently dropped.
 * @param result - The parsed codelist result containing schemes and concepts for lookup.
 * @param node - The scheme or concept whose seeAlso refs to resolve.
 * @returns Array of resolved scheme/concept objects for each valid ref.
 */
export function getSeeAlsoRefs(result: CodelistResult, node: Scheme | Concept): (Scheme | Concept)[] {
  if (!node.seeAlso) return []
  return node.seeAlso
    .map(id => result.schemes.get(id) ?? result.concepts.get(id))
    .filter((n): n is Scheme | Concept => n !== undefined)
}

/**
 * Resolves the operationeel scheme id from a thema concept using `seeAlso`.
 * Falls back to `relevantRiepr` for backward compatibility with older codelists.
 * @param result - The parsed codelist result.
 * @param themeConcept - The selected thema concept.
 * @returns The operationeel scheme id if found, otherwise undefined.
 */
export function resolveOperationeelSchemeId(result: CodelistResult, themeConcept: Concept): string | undefined {
  // Primary: use seeAlso (new format)
  const seeAlsoSchemes = getSeeAlsoRefs(result, themeConcept).filter(
    ref => ref.type?.includes('skos:ConceptScheme'),
  ) as Scheme[]
  if (seeAlsoSchemes.length > 0) return seeAlsoSchemes[0].id

  // Fallback: use relevantRiepr (old format)
  const rieprRefs = getRelevantRieprRefs(result, themeConcept)
  const scheme = rieprRefs.find(ref => ref.type?.includes('skos:ConceptScheme'))
  return scheme?.id
}
