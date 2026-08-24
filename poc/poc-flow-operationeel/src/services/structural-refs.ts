/**
 * Pure derivation helpers for the operationeel-fields component that resolve
 * structural / procedural picker concepts, multi-step `seeAlso` targets, and
 * "selecteer eerst" gate instructions from a parsed `CodelistResult`.
 *
 * Each function is a pure function of the parsed result (plus the concept or
 * scheme it operates on) — no Lit/DOM access — so they can be unit-tested
 * directly. Reference resolution is delegated to `concept-query`.
 */

import type { CodelistResult, Concept, Scheme } from '../models/index.js'
import * as query from './concept-query.js'
import { getMockInstances } from './mock-data.service.js'

/**
 * Resolve seeAlso to a target scheme id if present on a concept. Returns
 * undefined for external refs.
 * @param result - The parsed codelist result.
 * @param concept - The concept whose seeAlso refs to resolve.
 * @returns The target scheme id, or undefined when none resolves locally.
 */
export function resolveSeeAlsoTargetScheme(result: CodelistResult, concept: Concept): string | undefined {
  if (!concept.seeAlso) return undefined
  for (const refId of concept.seeAlso) {
    const target = result.schemes.get(refId)
    if (target) return target.id
  }
  return undefined
}

/**
 * Resolves relevantRiepr refs on a field to structural type concepts that can be used as pickers.
 * Filters out refs that don't resolve to local skos:Concept nodes or have no mock data available.
 * Also handles cases where the ref ID doesn't match any concept in result.concepts but still has
 * seeded mock data (e.g., "riepr:Installatie" which lacks a corresponding skos:Concept node).
 * @param result - The parsed codelist result.
 * @param field - The field concept whose relevantRiepr refs to resolve.
 * @returns Array of structural concepts that have seeded mock instances.
 */
export function getFieldStructuralRefs(result: CodelistResult, field: Concept): Concept[] {
  if (!field.relevantRiepr) return []
  const resolved: Concept[] = []
  for (const id of field.relevantRiepr) {
    // Try exact match first
    let concept = result.concepts.get(id)

    // If not found, check if it's a compacted URI reference and try expanded form
    if (!concept) {
      // Handle compacted prefixes like "riepr:Installatie" vs full URIs
      for (const [cid, c] of result.concepts.entries()) {
        const cidLocal = cid.split('#')[1]?.split('/').pop() ?? cid.split(':').pop()
        const refLocal = id.split('#')[1]?.split('/').pop() ?? id.split(':').pop()
        if (cidLocal && refLocal && cidLocal.toLowerCase() === refLocal.toLowerCase()) {
          concept = c
          break
        }
      }
    }

    if (concept && Array.isArray(concept.type) && concept.type.includes('skos:Concept')) {
      const instances = getMockInstances(concept.id, concept.prefLabel ?? concept.id)
      if (instances.length > 0) resolved.push(concept)
    } else {
      // Fallback: even without a matching Concept node, if mock data is seeded for this ID,
      // create a synthetic concept so the picker can still render.
      const instances = getMockInstances(id, id.split(':').pop() ?? id)
      if (instances.length > 0) {
        resolved.push({
          id,
          type: ['skos:Concept'],
          prefLabel: id.split(':').pop() ?? id,
        } as Concept)
      }
    }
  }
  return resolved
}

/**
 * Collects embedded procedural picker concept IDs from a composite field,
 * including grandchildren's relevantRiepr even when the field has direct children.
 * @param result - The parsed codelist result.
 * @param field - The composite field to inspect.
 * @returns Array of concept IDs that back an embedded procedural picker.
 */
export function getEmbeddedPickerIds(result: CodelistResult, field: Concept): string[] {
  const ids: string[] = []

  // Case A: No direct children → expand via relevantRiepr referenced concept
  const directChildren = query.getChildren(result, field)
  if (directChildren.length === 0 && field.relevantRiepr?.length) {
    const referencedConcept = field.relevantRiepr.map(id => result.concepts.get(id)).find((c): c is Concept => c !== undefined)
    if (referencedConcept) {
      const grandchildren = query.getChildren(result, referencedConcept)
      for (const gc of grandchildren) {
        for (const rieprId of gc.relevantRiepr ?? []) {
          const rieprConcept = result.concepts.get(rieprId)
          if (rieprConcept && (rieprConcept.type ?? []).includes('skos:Concept') && getMockInstances(rieprConcept.id, rieprConcept.prefLabel ?? rieprConcept.id).length > 0) {
            ids.push(rieprConcept.id)
          }
        }
      }
    }
  }

  // Case B: Has direct children → check grandchildren's relevantRiepr for procedural pickers
  for (const child of directChildren) {
    for (const rieprId of child.relevantRiepr ?? []) {
      const rieprConcept = result.concepts.get(rieprId)
      if (rieprConcept && (rieprConcept.type ?? []).includes('skos:Concept') && getMockInstances(rieprConcept.id, rieprConcept.prefLabel ?? rieprConcept.id).length > 0) {
        if (!ids.includes(rieprConcept.id)) {
          ids.push(rieprConcept.id)
        }
      }
    }
  }

  return ids
}

/**
 * Collects all structural concept IDs needed by this scheme — both
 * scheme-level relevantRiepr refs and root-field level embedded procedural pickers.
 * @param result - The parsed codelist result.
 * @param scheme - The operationeel scheme being rendered.
 * @param rootFields - The root fields of the scheme (post-expansion).
 * @returns Set of structural concept IDs that gate the fieldset.
 */
export function collectAllStructuralConceptIds(result: CodelistResult, scheme: Scheme, rootFields: Concept[]): Set<string> {
  const ids = new Set<string>()

  // Scheme-level relevantRiepr → structural concepts rendered at top
  for (const ref of query.getRelevantRieprRefs(result, scheme)) {
    if ((ref as Concept).type?.includes('skos:Concept')) {
      ids.add(ref.id)
    }
  }

  // Root fields with embedded procedural pickers via relevantRiepr → grandchildren's relevantRiepr
  for (const field of rootFields) {
    // Field-level relevantRiepr on non-composite fields → the field itself IS a picker
    const fieldRefs = getFieldStructuralRefs(result, field)
    if (fieldRefs.length > 0) {
      for (const ref of fieldRefs) {
        ids.add(ref.id)
      }
    }

    if (field.relevantRiepr?.length) {
      const referencedConcept = field.relevantRiepr.map(id => result.concepts.get(id)).find((c): c is Concept => c !== undefined)
      if (referencedConcept) {
        const grandchildren = query.getChildren(result, referencedConcept)
        for (const gc of grandchildren) {
          for (const rieprId of gc.relevantRiepr ?? []) {
            const rieprConcept = result.concepts.get(rieprId)
            if (rieprConcept && (rieprConcept.type ?? []).includes('skos:Concept')) {
              ids.add(rieprId)
            }
          }
        }
      }
    }
  }

  return ids
}

/**
 * Expands a scheme's relevantRiepr refs into synthetic field concepts when the scheme
 * has no hasTopConcept of its own. This handles "structural-only" schemes like
 * operationeel_zelfcontrole_lucht where content is driven entirely by type selection.
 *
 * For ConceptScheme refs: creates one synthetic picker field per type scheme that lists
 * all top concepts as dropdown options (e.g., "Kies emissiepunt type" → schoorsteen/lozingspunt).
 * For direct Concept refs: creates a synthetic field with narrowed children as sub-fields.
 * @param result - The parsed codelist result.
 * @param scheme - The structural-only scheme to expand.
 * @returns Array of synthetic Concept fields for rendering.
 */
export function expandSchemeRelevantRieprToFields(result: CodelistResult, scheme: Scheme): Concept[] {
  if (!scheme.relevantRiepr) return []
  const fields: Concept[] = []

  for (const refId of scheme.relevantRiepr) {
    // Try resolving as a Concept first
    const concept = result.concepts.get(refId)

    // If not found, check if it resolves to a ConceptScheme and create a unified type picker
    if (!concept) {
      const maybeScheme = result.schemes.get(refId)
      if (maybeScheme) {
        // Create ONE synthetic field whose relevantCodeList points to the type scheme.
        // This renders as a vl-select populated from the scheme's top concepts.
        const label = maybeScheme.prefLabel ?? 'Type'
        fields.push({
          id: `${scheme.id}:type-picker-${refId.split(':').pop() ?? refId}`,
          type: ['skos:Concept'],
          prefLabel: `Kies ${label.toLowerCase()}`,
          definition: maybeScheme.definition,
          relevantCodeList: [refId],
        })
        continue
      }
    }

    // Direct concept ref — create synthetic field with its children expanded
    if (concept && Array.isArray(concept.type) && concept.type.includes('skos:Concept')) {
      const children = query.getChildren(result, concept)
      fields.push({
        id: `${scheme.id}:${concept.id.split(':').pop() ?? concept.id}`,
        type: ['skos:Concept'],
        prefLabel: concept.prefLabel ?? concept.id,
        definition: concept.definition,
        relevantRiepr: [concept.id],
        hasPart: children.length > 0 ? children.map(c => c.id) : undefined,
      })
    }
  }

  return fields
}

/**
 * Derives a "select first" instruction message from data rather than hardcoding.
 * Priority: (1) field's own selecteerEerstMessage, (2) relatedRiepr concept's definition,
 * (3) relatedRiepr concept's prefLabel, (4) scheme-level relatedRiepr info.
 * @param result - The parsed codelist result.
 * @param scheme - The operationeel scheme being rendered.
 * @param rootFields - The root fields of the scheme (post-expansion).
 * @returns The Dutch "selecteer eerst" instruction string.
 */
export function getGateInstructionMessage(result: CodelistResult, scheme: Scheme, rootFields: Concept[]): string {
  // Check if any composite field has its own message or relevantRiepr with useful definition
  for (const f of rootFields) {
    if (f.selecteerEerstMessage && f.selecteerEerstMessage.trim()) {
      return f.selecteerEerstMessage.trim()
    }
    // Use the relatedRiepr concept's definition as instructional text
    if (f.relevantRiepr?.length) {
      for (const rid of f.relevantRiepr) {
        const ref = result.concepts.get(rid)
        if (ref?.definition) return ref.definition
        if (ref?.prefLabel) return `Selecteer eerst een ${ref.prefLabel.toLowerCase()} om de velden te bekijken.`
      }
    }
  }

  // Fall back to scheme-level relatedRiepr info
  for (const ref of query.getRelevantRieprRefs(result, scheme)) {
    if ((ref as Concept).type?.includes('skos:Concept')) {
      const c = ref as Concept
      if (c.definition) return c.definition
      if (c.prefLabel) return `Selecteer eerst een ${c.prefLabel.toLowerCase()}.`
    }
  }

  // Ultimate fallback — generic Dutch instruction derived from context
  return 'Selecteer eerst een type in de bovenstaande lijst.'
}

/**
 * Derives the "select first" message for a specific field's embedded picker gating.
 * @param result - The parsed codelist result.
 * @param field - The field whose embedded picker is gating.
 * @returns The Dutch "selecteer eerst" instruction string.
 */
export function getFieldGateMessage(result: CodelistResult, field: Concept): string {
  // Field-level custom message takes priority
  if (field.selecteerEerstMessage?.trim()) return field.selecteerEerstMessage.trim()

  // Try relatedRiepr concepts on this field or its children for instructional text
  for (const rid of field.relevantRiepr ?? []) {
    const ref = result.concepts.get(rid)
    if (ref?.definition) return ref.definition
    if (ref?.prefLabel) return `Selecteer eerst een ${ref.prefLabel.toLowerCase()} om deze velden te bekijken.`
  }
  // Check grandchildren too
  for (const child of query.getChildren(result, field)) {
    for (const rid of child.relevantRiepr ?? []) {
      const ref = result.concepts.get(rid)
      if (ref?.definition) return ref.definition
      if (ref?.prefLabel) return `Selecteer eerst een ${ref.prefLabel.toLowerCase()}.`
    }
  }

  return 'Selecteer eerst een type om de velden te bekijken.'
}
