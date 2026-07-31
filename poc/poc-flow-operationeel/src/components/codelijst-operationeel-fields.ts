/**
 * @file Renders the operationeel-* conceptscheme an installation's
 * thema/sub-thema resolves to (steps 2-6 of the user flow): composite
 * (narrower) attribute groups, per-field input controls driven by
 * relevantDataType/relevantCodeList, required/repeatable markers, and a
 * structural-element picker when the scheme's relevantRiepr points at a
 * type such as `riepr-meetpunt-type:debietmeter`.
 *
 * Multi-step flows: when a concept has `seeAlso` pointing to another
 * conceptscheme, selecting a value for that concept triggers navigation
 * to the target scheme via `flow-navigate` custom event.
 *
 * Field-level relevantRiepr: when a root field concept has `relevantRiepr`
 * pointing at skos:Concept type nodes (e.g., feature_ep → schoorsteen), it
 * renders as a mock-data structural picker dropdown instead of a text input.
 * These are "structural selection" fields — once selected they may also chain
 * to sub-schemes via seeAlso.
 *
 * There is no backend and nothing is persisted (per the POC's non-functional
 * requirements), so field values are left uncontrolled - the only UI state
 * this component owns is how many repeated copies of an isMeervoudig field
 * are shown, and which mock structural instance is picked.
 *
 * Conditional visibility (`conditionPath`/`conditionValue`) requires tracking
 * live form-control values; `_fieldValues` stores the current value of every
 * rendered vl-* control keyed by its DOM id so that condition checks can read
 * back what the user has typed/selected without controlled-component plumbing.
 */

import { LitElement, html, css, nothing } from 'lit'
import { CodelistService } from '../services/codelist-service.js'
import type { CodelistResult } from '../services/codelist-service.js'
import { createControl, DataType } from '../services/field-control-factory.js'
import { getMockInstances } from '../services/mock-data.service.js'
import { resolveUnitLabel } from '../services/unit-labels.js'
import { vlMarginStyles } from '@domg-wc/styles/layout/margin/vl-margin.css.js'
import type { Concept, Scheme } from '../models/skos-models.js'

export class CodelijstOperationeelFields extends LitElement {
  static override styles = [
    css`
      :host {
        display: block;
      }

      /* ---- Group card styling (root-field wrappers) ---- */
      .codelijst-group {
        margin-bottom: 1.5rem;
        padding: 1.5rem;
        border: 1px solid #e0e0e0;
        border-radius: 0.3rem;
        background: var(--vl-color--white, #fff);
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .codelijst-repeatable-group {
        border-style: dashed;
        background: #f9fafb;
      }

      /* Spacing between control rows inside composite groups (fieldsets) */
      .codelijst-group__child {
        margin-bottom: 0.75rem;
      }
      .codelijst-group__child:last-child {
        margin-bottom: 0;
      }

      /* Ensure the last item in a group doesn't add extra space at bottom */
      .codelijst-group > *:last-child {
        margin-bottom: 0;
      }

      /* ---- Unit addon next to input fields ---- */
      .vl-input-group {
        display: flex;
        align-items: stretch;
      }
      .vl-input-addon {
        display: inline-flex;
        align-items: center;
        padding: 0.375rem 0.75rem;
        background: var(--vl-color--grey-100, #f7f9fc);
        border: 1px solid var(--vl-color--border, #cbd2da);
        border-radius: var(--vl-border--radius, 0.3rem);
        font-size: 0.875rem;
        color: var(--vl-color--text-alt, #687483);
        min-width: 48px;
        justify-content: center;
        user-select: none;
      }

      /* ---- SeeAlso navigation hint ---- */
      .seealso-hint {
        font-size: 0.8125rem;
        color: var(--vl-color--text-alt, #687483);
        margin-top: 0.25rem;
        font-style: italic;
      }
    `,
    vlMarginStyles,
  ]

  /** Number of repeated copies rendered per isMeervoudig root field, keyed by field id. */
  private repeatCounts = new Map<string, number>()
  /** Current value of every vl-* form control, keyed by its DOM id (for conditionPath/conditionValue evaluation). */
  private _fieldValues = new Map<string, unknown>()
  /** Tracks which structural/procedural concept IDs have been selected by the user. Key = structuralConceptId, Value = selected instance ID(s) or empty string/array. */
  private structuralSelections = new Map<string, string | string[]>()

  /** Previous schemeId to detect navigation between schemes and reset state. */
  private _prevSchemeId?: string

  result?: CodelistResult
  schemeId?: string
  codelistService?: CodelistService

  static override properties = {
    result: { attribute: false },
    schemeId: { attribute: false },
    codelistService: { attribute: false },
  }

  /** Clear tracked form state when switching schemes so conditions don't carry over stale values. */
  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has('schemeId') && this._prevSchemeId !== this.schemeId) {
      this._fieldValues.clear()
      this.structuralSelections.clear()
      this.repeatCounts.clear()
      this._prevSchemeId = this.schemeId
    }
  }

  get _service(): CodelistService {
    return this.codelistService ??= new CodelistService()
  }

  /**
   * Sorts root fields so that fields with conditionPath dependencies
   * always render AFTER their trigger fields. This is necessary because
   * the codelist may define both the trigger and the conditional field
   * as top-level concepts (siblings in hasTopConcept), but the application
   * must enforce display order for conditions to work correctly.
   */
  private sortRootFieldsByConditionDependencies(fields: Concept[]): Concept[] {
    // Build a map of conditionPath → target concept id
    const conditionMap = new Map<string, string>() // conditionValueTargetId → conditionPathSourceId
    for (const f of fields) {
      if (f.conditionPath && f.conditionValue) {
        conditionMap.set(f.conditionPath, f.id)
      }
    }

    // Separate into dependency-free (can render first) and dependent fields
    const independent: Concept[] = []
    const dependent: Concept[] = []

    for (const f of fields) {
      if (!f.conditionPath || !conditionMap.has(f.conditionPath)) {
        independent.push(f)
      } else {
        dependent.push(f)
      }
    }

    // Dependent fields come after all independent ones
    return [...independent, ...dependent]
  }

   override render() {
    if (!this.result || !this.schemeId) return nothing

    const scheme = this.result.schemes.get(this.schemeId)
    if (!scheme) return nothing

    let rootFields = this._service.getTopLevelConcepts(this.result, this.schemeId!)
    
    // Handle schemes without hasTopConcept but with relevantRiepr pointing to type concepts/schemes.
    // These are "structural-only" schemes where the entire content is driven by type selection.
    // We expand any referenced type schemes into synthetic field groups for rendering.
    if (rootFields.length === 0 && scheme.relevantRiepr?.length) {
      rootFields = this.expandSchemeRelevantRieprToFields(scheme)
    }
    
    // Sort so conditional fields appear AFTER their trigger fields.
    rootFields = this.sortRootFieldsByConditionDependencies(rootFields)

    const structuralPicker = this.renderStructuralPicker(scheme)

    // Collect ALL structural concept IDs needed (scheme-level + field-level embedded pickers).
    // Only gate if at least one visible picker was rendered (pickers require seeded mock data).
    const hasVisiblePickers = structuralPicker !== nothing
    const allStructuralIds = new Set<string>()
    for (const id of this.collectAllStructuralConceptIds(scheme, rootFields)) {
      allStructuralIds.add(id)
    }
    const needsGating = hasVisiblePickers && allStructuralIds.size > 0

    // Graceful fallback: show a friendly message instead of an empty fieldset.
    if (!structuralPicker && rootFields.length === 0) {
      return html`<p class="vl-margin--small">Voor dit thema zijn geen operationele velden gedefinieerd in de codelist.</p>`
    }

    const renderedGroups = rootFields
      .map(field => this.renderRootFieldContent(field))
      // Filter out nothing (fields hidden by conditionPath/conditionValue or gating)
      .filter(group => group !== nothing)

    if (!structuralPicker && renderedGroups.length === 0) {
      return html`<p class="vl-margin--small">Voor dit thema zijn geen operationele velden gedefinieerd in de codelist.</p>`
    }

    // Gate children behind structural selection when relevantRiepr defines structural types.
    if (needsGating && !this.anyStructuralSelected()) {
      const gateMessage = this.getGateInstructionMessage(scheme, rootFields)
      return html`
        ${structuralPicker}
        <p class="vl-margin--small">${gateMessage}</p>
      `
    }

    return html`
      ${structuralPicker}
      ${renderedGroups.map(group => html`<div class="codelijst-group ${group.repeatable ? 'codelijst-repeatable-group' : ''}">${group.content}</div>`)}
    `

  }

  /**
   * Renders structural element picker dropdowns when the scheme's relevantRiepr points at type concepts.
   * @param scheme - The operationeel scheme whose relevantRiepr refs determine available structural types.
   * @returns HTML template with vl-select pickers, or nothing if no structural types are defined.
   */
  private renderStructuralPicker(scheme: Scheme) {
    if (!this.result) return nothing
    return this.renderPickersForRefs(this._service.getRelevantRieprRefs(this.result, scheme))
  }

  /**
   * Takes a list of scheme/concept refs and renders vl-select pickers for any that are skos:Concept nodes.
   * Used both by scheme-level structural pickers and root-field composite groups whose grandchildren
   * carry a shared relevantRiepr (e.g. multiple peilput-backed leaf fields sharing one "Kies Peilput").
   * @param refs - Array of resolved scheme or concept references to render pickers for.
   * @param parentFieldId - Optional parent field ID used for tracking structural selections in composite contexts.
   * @returns HTML template with vl-select pickers, or nothing if no structural concepts found.
   */
  private renderPickersForRefs(refs: (Scheme | Concept)[], parentFieldId?: string) {
    if (!this.result) return nothing
    const structuralConcepts = refs.filter((ref): ref is Concept => Array.isArray((ref as Concept).type) && (ref as Concept).type!.includes('skos:Concept'))
    // Only show pickers that have at least one seeded mock instance.
    // Empty dropdowns are confusing and indicate missing seed data.
    const viableConcepts = structuralConcepts.filter(
      c => getMockInstances(c.id, c.prefLabel ?? c.id).length > 0,
    )
    if (viableConcepts.length === 0) return nothing
    return html`
      ${viableConcepts.map(concept => {
        const label = concept.prefLabel ?? concept.id
        const domId = this.getPickerDomId(concept.id, parentFieldId)
        const fieldValue = String(this._fieldValues.get(domId) ?? '')
        const options = getMockInstances(concept.id, label).map(instance => ({ value: instance.id, label: instance.label, selected: instance.id === fieldValue }))
        const formLabel = html`<vl-form-label for="${domId}" label="Kies ${label}" block .annotation="${concept.definition ?? ''}"></vl-form-label>`
        const control = html`<vl-select id="${domId}" name="${domId}" label="Kies ${label}" placeholder="Selecteer ${label.toLowerCase()}..." .value="${fieldValue}" .options="${options}" @vl-input="${this._onControlInput}"></vl-select>`
        return html`${formLabel}${control}`
      })}
    `
  }

  /** Build a deterministic DOM id for a picker element. */
  private getPickerDomId(conceptId: string, parentFieldId?: string): string {
    return parentFieldId ? `${parentFieldId}__${conceptId}` : conceptId
  }

  /** Returns the rendered content for a root field (or nothing if hidden by conditions). */
  private renderRootFieldContent(field: Concept): { content: ReturnType<typeof html>; repeatable: boolean } | typeof nothing {
    if (!this.result) return nothing

    // Check composite group-level condition before rendering anything.
    // Root fields with narrower children (composite groups) still need their own
    // conditionPath/conditionValue evaluated — e.g., "Grondstof" group depends on
    // checkbox "Heeft u grondstoffen geproduceerd?".
    if (!this.matchesCondition(field)) return nothing

    let children = this._service.getChildren(this.result, field)
    let groupPicker: ReturnType<typeof html> | typeof nothing = nothing

    // Case A: No direct children but has relevantRiepr → check whether to expand or render as picker.
    // Only expand the referenced concept's narrower children into a composite group when at least one
    // grandchild carries meaningful form properties (relevantDataType, relevantCodeList). If all
    // grandchildren are pure type concepts (no form props), treat this field as a simple structural
    // picker instead — e.g., feature_ep → schoorsteen should show a "Kies Schoorsteen" dropdown,
    // not expand into "Schoorsteen met horizontale/verticale uitstroom" text inputs.
    if (children.length === 0 && field.relevantRiepr?.length) {
      const referencedConcepts = field.relevantRiepr.map(id => this.result!.concepts.get(id)).filter((c): c is Concept => c !== undefined)
      if (referencedConcepts.length > 0) {
        // Check if any grandchild has meaningful form properties worth expanding into a composite group
        let allGrandchildren = referencedConcepts.flatMap(rc => this._service.getChildren(this.result!, rc))
        const hasFormProperties = allGrandchildren.some(
          gc => gc.relevantDataType || gc.relevantCodeList || gc.relevantUnit || gc.isVerplicht !== undefined
        )

        if (hasFormProperties && allGrandchildren.length > 0) {
          children = allGrandchildren
          const structuralRefs = Array.from(new Set(allGrandchildren.flatMap(c => c.relevantRiepr ?? [])))
            .map(id => this.result!.concepts.get(id))
            .filter((c): c is Concept => c !== undefined)
          groupPicker = this.renderPickersForRefs(structuralRefs)
        }
        // If no grandchildren have form props, fall through to renderFieldControl which handles
        // the relevantRiepr as a structural type picker dropdown.
      }
    }

    // Case B: Has direct children → check for embedded procedural pickers on grandchildren
    const embeddedPickerIds = this.getEmbeddedPickerIds(field)
    if (embeddedPickerIds.length > 0 && !groupPicker) {
      // Render pickers for each embedded procedural concept
      groupPicker = html`
        ${embeddedPickerIds.map(pid => {
          const pc = this.result!.concepts.get(pid)
          if (!pc) return nothing
          const label = pc.prefLabel ?? pid
          const fieldValue = String(this._fieldValues.get(pid) ?? '')
          const options = getMockInstances(pid, label).map(instance => ({ value: instance.id, label: instance.label, selected: instance.id === fieldValue }))
          const formLabel = html`<vl-form-label for="${pid}" label="Kies ${label}" block></vl-form-label>`
          return html`${formLabel}<vl-select id="${pid}" name="${pid}" label="Kies ${label}" placeholder="Selecteer ${label.toLowerCase()}..." .value="${fieldValue}" .options="${options}" @vl-input="${this._onControlInput}"></vl-select>`
        })}
      `
    }

    const isComposite = children.length > 0
    const isRepeatable = field.isMeervoudig === true
    const count = isRepeatable ? this.repeatCounts.get(field.id) ?? 1 : 1

    // Check if this field has a seeAlso reference to another scheme (multi-step flow trigger)
    const targetSchemeId = this.resolveSeeAlsoTargetScheme(field)
    const isMultiselectField = field.isMultiselect === true

    // Render instances and filter out hidden ones (conditionPath/conditionValue)
    const visibleInstances: ReturnType<typeof html>[] = []
    for (let index = 0; index < count; index++) {
      const suffix = isRepeatable ? `#${index + 1}` : ''
      // Gate composite children behind embedded procedural picker selection.
      let hasEmbeddedSelection = false
      if (embeddedPickerIds.length > 0) {
        for (const pid of embeddedPickerIds) {
          if (this.structuralSelections.get(pid)) { hasEmbeddedSelection = true; break }
        }
      }

      const body = isComposite
        ? groupPicker !== nothing && !hasEmbeddedSelection
          ? html`
              <vl-fieldset>
                <span slot="legend">${field.prefLabel ?? field.id}${isRepeatable ? ` ${index + 1}` : ''}</span>
                ${groupPicker}
                <p class="vl-margin--small" style="font-size:0.875rem;color:var(--vl-color--text-alt,#687483);margin-top:0.5rem;margin-bottom:0;">${this.getFieldGateMessage(field)}</p>
              </vl-fieldset>
            `
          : html`
              <vl-fieldset>
                <span slot="legend">${field.prefLabel ?? field.id}${isRepeatable ? ` ${index + 1}` : ''}</span>
                ${groupPicker}
                ${children.map(child => html`<div class="codelijst-group__child">${this.renderFieldControl(child, suffix, field.id)}</div>`)}
                ${targetSchemeId && hasEmbeddedSelection ? html`<p class="seealso-hint">↑ Selecteer een item hierboven om verder te gaan met de gedetailleerde rapportering.</p>` : nothing}
              </vl-fieldset>
            `
        : this.renderFieldControl(field, suffix)

      // For non-composite fields with seeAlso, add navigation hint after selection
      const fieldWithHint = !isComposite && targetSchemeId
        ? html`
            ${body}
            ${this.hasValueForConcept(field.id)
              ? html`<p class="seealso-hint">Een waarde is geselecteerd — de volgende stap wordt automatisch geladen.</p>`
              : nothing}
          `
        : body

      // Skip if body is nothing (all children hidden by conditions)
      if (body === nothing && !isComposite) return nothing
      if (fieldWithHint !== nothing) {
        const removeButton =
          isRepeatable && count > 1
            ? html`<vl-button secondary @click="${() => this.removeInstance(field.id)}">Verwijder</vl-button>`
            : nothing
        visibleInstances.push(html`<div class="codelijst-group__item">${fieldWithHint}${removeButton}</div>`)
      }
    }

    // If all instances were hidden, return nothing so the wrapper group div isn't rendered
    if (visibleInstances.length === 0) return nothing

    const addButton = isRepeatable
      ? html`<vl-button secondary @click="${() => this.addInstance(field.id)}">+ Nog ${(field.prefLabel ?? 'item').toLowerCase()} toevoegen</vl-button>`
      : nothing

    return { content: html`${visibleInstances}${addButton}`, repeatable: isRepeatable }
  }

  /** Check if a concept has any stored value. */
  private hasValueForConcept(conceptId: string): boolean {
    const val = this._fieldValues.get(conceptId)
    if (val === undefined || val === '') return false
    // For multiselect fields, check array length
    if (Array.isArray(val)) return val.length > 0 && val.some(v => v !== '')
    return true
  }

  /** Resolve seeAlso to a target scheme id if present on a concept. Returns undefined for external refs. */
  private resolveSeeAlsoTargetScheme(concept: Concept): string | undefined {
    if (!this.result || !concept.seeAlso) return undefined
    for (const refId of concept.seeAlso) {
      const target = this.result.schemes.get(refId)
      if (target) return target.id
    }
    return undefined
  }

  /**
   * Resolves relevantRiepr refs on a field to structural type concepts that can be used as pickers.
   * Filters out refs that don't resolve to local skos:Concept nodes or have no mock data available.
   * Also handles cases where the ref ID doesn't match any concept in result.concepts but still has
   * seeded mock data (e.g., "riepr:Installatie" which lacks a corresponding skos:Concept node).
   */
  private getFieldStructuralRefs(field: Concept): Concept[] {
    if (!this.result || !field.relevantRiepr) return []
    const resolved: Concept[] = []
    for (const id of field.relevantRiepr) {
      // Try exact match first
      let concept = this.result!.concepts.get(id)
      
      // If not found, check if it's a compacted URI reference and try expanded form
      if (!concept) {
        // Handle compacted prefixes like "riepr:Installatie" vs full URIs
        for (const [cid, c] of this.result!.concepts.entries()) {
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

  private renderFieldControl(field: Concept, idSuffix: string, parentFieldId?: string) {
    if (!this.result) return nothing

    // Conditional visibility check — hide field when conditionPath is set but unmet.
    if (!this.matchesCondition(field)) return nothing

    const id = `${field.id}${idSuffix}`
    const required = field.isVerplicht === true
    const plainLabel = field.prefLabel ?? field.id

    // --- Handle relevantRiepr at the field level (structural type picker) ---
    // When a concept has relevantRiepr pointing to skos:Concept type nodes and NO
    // relevantDataType/relevantCodeList, it should render as a mock-data structural
    // picker dropdown instead of a text input. This covers feature concepts like
    // feature_ep (schoorsteen), kwaliteitsmeting_feature (peilput/pomp), etc.
    const structuralRefs = this.getFieldStructuralRefs(field)
    if (structuralRefs.length > 0 && !field.relevantDataType && !field.relevantCodeList) {
      const isMultiSelect = field.isMultiselect === true
      let pickerHtml: ReturnType<typeof html>

      if (isMultiSelect) {
        // Multiselect: single <vl-select-rich multiple> combining all instances from all refs.
        // This enables seeAlso flow navigation after selection.
        const domId = `${id}__multiselect`
        const selectedValues = (this._fieldValues.get(domId) as string[] | undefined) ?? []
        const allOptions = structuralRefs.flatMap(ref =>
          getMockInstances(ref.id, ref.prefLabel ?? ref.id).map(instance => ({
            value: instance.id,
            label: instance.label,
            selected: Array.isArray(selectedValues) ? selectedValues.includes(instance.id) : false,
          }))
        )
        pickerHtml = html`
          <vl-form-label for="${domId}" label="Kies ${plainLabel}" block .annotation="${field.definition ?? ''}"></vl-form-label>
          <vl-select-rich id="${domId}" name="${domId}" label="Kies ${plainLabel}" placeholder="Selecteer..." ?required="${required}" .multiple=${true} .value="${selectedValues}" .options="${allOptions}" @vl-input="${this._onStructuralPickerInput}" @vl-change="${this._onStructuralPickerInput}"></vl-select-rich>
        `
      } else {
        // Single select with one ref → single dropdown; multiple refs → first viable
        const ref = structuralRefs[0]
        const label = ref.prefLabel ?? ref.id
        const domId = this.getPickerDomId(ref.id, parentFieldId ?? id)
        const fieldValue = String(this._fieldValues.get(domId) ?? '')
        const options = getMockInstances(ref.id, label).map(instance => ({ value: instance.id, label: instance.label, selected: instance.id === fieldValue }))

        pickerHtml = html`
          <vl-form-label for="${domId}" label="Kies ${plainLabel}" block .annotation="${field.definition ?? ref.definition ?? ''}"></vl-form-label>
          <vl-select id="${domId}" name="${domId}" label="Kies ${plainLabel}" placeholder="Selecteer ${plainLabel.toLowerCase()}..." ?required="${required}" .value="${fieldValue}" .options="${options}" @vl-input="${this._onStructuralPickerInput}"></vl-select>
        `
      }

      return pickerHtml
    }

    // relevantCodeList takes priority — renders as a vl-select.
    if (field.relevantCodeList) {
      const codeListSchemes = this._service.getCodeListSchemes(this.result, field)
      const fieldValue = String(this._fieldValues.get(id) ?? '')
      const options = codeListSchemes.flatMap(codeListScheme =>
        this._service
          .getTopConceptsForScheme(this.result!, codeListScheme.id)
          .map(concept => ({ value: concept.id, label: concept.prefLabel ?? concept.id, selected: concept.id === fieldValue }))
      )
      const displayLabel = plainLabel + (required ? ' *' : '')
      const formLabel = html`<vl-form-label for="${id}" label="${displayLabel}" block .annotation="${field.definition ?? ''}"></vl-form-label>`
      const control = html`<vl-select id="${id}" name="${id}" label="${displayLabel}" placeholder="Selecteer..." ?required="${required}" .value="${fieldValue}" .options="${options}" @vl-input="${this._onControlInput}"></vl-select>`
      return html`${formLabel}${control}`
    }

    // Check whether relevantUnit resolves to a conceptscheme (multiple units → dropdown),
    // or a single concept, or falls back to local whitelist / raw ID fragments.
    const unitIds = field.relevantUnit ?? []
    let unitScheme: Scheme | undefined
    let singleUnitConcept: Concept | undefined
    let resolvedUnitId: string | undefined // raw unit ID used for whitelist lookup
    let fallbackUnitText: string | undefined
    let isUnitScheme = false

    if (unitIds.length > 0) {
      for (const uid of unitIds) {
        const maybeScheme = this.result.schemes.get(uid)
        if (maybeScheme) {
          unitScheme = maybeScheme
          isUnitScheme = true
          break
        }
        const maybeConcept = this.result.concepts.get(uid)
        if (maybeConcept && !isUnitScheme) {
          singleUnitConcept = maybeConcept
          resolvedUnitId = uid
        }
        // Build fallback text from unresolvable refs so the user sees something useful.
        if (!singleUnitConcept && !isUnitScheme) {
          fallbackUnitText = uid.split(':').pop() || uid
          resolvedUnitId = uid
        }
      }
    }

      // Unit scheme → render vl-select populated from that scheme's top concepts.
    if (isUnitScheme && unitScheme) {
      const fieldValue = String(this._fieldValues.get(id) ?? '')
      const options = this._service
        .getTopConceptsForScheme(this.result, unitScheme.id)
        .map(concept => ({ value: concept.id, label: concept.prefLabel ?? concept.id, selected: concept.id === fieldValue }))
      const displayLabel = plainLabel + (required ? ' *' : '')
      const formLabel = html`<vl-form-label for="${id}" label="${displayLabel}" block .annotation="${field.definition ?? ''}"></vl-form-label>`
      const control = html`<vl-select id="${id}" name="${id}" label="${displayLabel}" placeholder="Selecteer eenheid..." ?required="${required}" .value="${fieldValue}" .options="${options}" @vl-input="${this._onControlInput}"></vl-select>`
      return html`${formLabel}${control}`
    }

    // Boolean checkbox — explicit <vl-form-label> alongside control for consistent rendering
    if (field.relevantDataType === DataType.BOOLEAN) {
      const displayLabel = plainLabel + (required ? ' *' : '')
      const formLabel = html`<vl-form-label for="${id}" label="${displayLabel}" block .annotation="${field.definition ?? ''}"></vl-form-label>`
      return html`${formLabel}<vl-checkbox id="${id}" name="${id}" ?required="${required}" @vl-change="${this._onCheckboxChange}"></vl-checkbox>`
    }

    const control = createControl(id, id, plainLabel, required, field.relevantDataType, this._onControlInput)
    const displayLabel = plainLabel + (required ? ' *' : '')

    // build a <vl-form-label> with the asterisk baked into the label text
    const formLabel = html`<vl-form-label for="${id}" label="${displayLabel}" block .annotation="${field.definition ?? ''}"></vl-form-label>`
    return this.renderWithUnit(formLabel, control, singleUnitConcept, resolvedUnitId, fallbackUnitText)
  }

  /** Wraps a control + unit addon in an input-group container; label stays outside. */
  private renderWithUnit(
    formLabel: ReturnType<typeof html>,
    control: ReturnType<typeof html>,
    unitConcept: Concept | undefined,
    resolvedUnitId?: string,
    fallbackUnitText?: string,
  ) {
    let unitText: string | undefined
    if (unitConcept) {
      unitText = unitConcept.code ?? unitConcept.prefLabel ?? unitConcept.id
    } else {
      // Priority 1: check local whitelist for human-readable label
      if (resolvedUnitId) {
        const wlLabel = resolveUnitLabel(resolvedUnitId)
        if (wlLabel !== undefined && wlLabel !== '') {
          unitText = wlLabel
        }
      }
      // Priority 2: fall back to raw ID fragment from unresolvable ref
      if (!unitText && fallbackUnitText) {
        unitText = fallbackUnitText
      }
    }

    if (!unitText) return html`${formLabel}${control}`

    return html`
      ${formLabel}
      <div class="vl-input-group">
        ${control}
        <span class="vl-input-addon">${unitText}</span>
      </div>
    `
  }

  private addInstance(fieldId: string) {
    const current = this.repeatCounts.get(fieldId) ?? 1
    this.repeatCounts.set(fieldId, current + 1)
    this.requestUpdate()
  }

  private removeInstance(fieldId: string) {
    const current = this.repeatCounts.get(fieldId) ?? 1
    this.repeatCounts.set(fieldId, Math.max(1, current - 1))
    this.requestUpdate()
  }

  /**
   * Handles vl-input events from vl-select / vl-datepicker / vl-input-field controls.
   * The custom event detail carries { value } set by the component's internal handler.
   */
   private _onControlInput(event: CustomEvent<VlInputElementEventDetail>) {
      const component = event.currentTarget! as VlSelectElement | VlInputFieldElement | VlDatepickerElement
      const domId = component.id
      let value: unknown = event.detail?.value
      // Fallback — read directly from the component instance when detail.value is missing.
      if (value === undefined) {
        value = 'value' in component ? component.value : undefined
      }
      this._fieldValues.set(domId, value)

      // Track structural selections: a select whose DOM id matches or contains a concept ID
      // in the result map is a structural/procedural picker.
      if (this.result) {
        // Check exact match first
        if (this.result.concepts.has(domId)) {
          this.structuralSelections.set(domId, String(value ?? ''))
        } else {
          // For pickers with compound IDs (parent__child), extract the concept part
          for (const [conceptId] of this.result.concepts.entries()) {
            if (domId.includes(conceptId)) {
              this.structuralSelections.set(conceptId, String(value ?? ''))
              break
            }
          }
        }
      }

      this.requestUpdate()
    }

  /**
   * Handles vl-input events specifically from structural type pickers that may have seeAlso targets.
   * After storing the value, checks if the parent field has seeAlso pointing to another scheme
   * and emits flow-navigate event if so.
   *
   * Supports both single-select (<vl-select>) and multi-select (<vl-select-rich multiple>) values:
   * - Single select: string value stored as-is
   * - Multi-select: string[] array preserved (not coerced to "val1,val2")
   */
   private _structuralHandlerRunning = false

  /**
   * Handles vl-input events specifically from structural type pickers that may have seeAlso targets.
   * After storing the value, checks if the parent field has seeAlso pointing to another scheme
   * and emits flow-navigate event if so.
   *
   * Supports both single-select (<vl-select>) and multi-select (<vl-select-rich multiple>) values:
   * - Single select: string value stored as-is
   * - Multi-select: string[] array preserved (not coerced to "val1,val2")
   */
  private _onStructuralPickerInput(event: CustomEvent<VlInputElementEventDetail>) {
    // Guard against re-entrant calls causing infinite loops
    if (this._structuralHandlerRunning) return
    this._structuralHandlerRunning = true

    try {
      const component = event.currentTarget! as VlSelectElement | VlInputFieldElement | VlDatepickerElement | VlSelectRichElement
      const domId = component.id
      let value: unknown = event.detail?.value
      if (value === undefined) {
        value = 'value' in component ? component.value : undefined
      }
      this._fieldValues.set(domId, value)

      // Track structural selection using all possible key forms.
      // Preserve arrays from <vl-select-rich multiple>; coerce single values to strings.
      const normalisedValue = Array.isArray(value) ? value : String(value ?? '')
      if (this.result && this.hasSelection(normalisedValue)) {
        if (this.result.concepts.has(domId)) {
          this.structuralSelections.set(domId, normalisedValue)
        } else {
          for (const [conceptId] of this.result.concepts.entries()) {
            if (domId.includes(conceptId)) {
              this.structuralSelections.set(conceptId, normalisedValue)
              break
            }
          }
        }
      }

      // Check if any root-level concept with seeAlso was satisfied by this picker.
      // The picker's DOM id may contain the concept id it represents; we look up the
      // parent field from renderRootFieldContent context via embedded picker tracking.
      this.checkSeeAlsoForPickerDomId(domId, value)
    } finally {
      this.requestUpdate()
      this._structuralHandlerRunning = false
    }
  }

  /** Returns true when a stored structural value counts as "something selected". */
  private hasSelection(val: string | string[]): boolean {
    if (Array.isArray(val)) return val.some(v => v && v !== '')
    return val !== ''
  }

  /** When a structural picker gets a value, check if its owning field has seeAlso → flow-navigate. */
  private checkSeeAlsoForPickerDomId(domId: string, value: unknown): void {
    if (!this.result) return
    // Handle both string and array values (from <vl-select-rich multiple>)
    const hasValue = Array.isArray(value)
      ? value.some(v => v && v !== '')
      : !!value && String(value) !== ''
    if (!hasValue) return

    // Try exact match first
    const directConcept = this.result.concepts.get(domId)
    if (directConcept) {
      const targetSchemeId = this.resolveSeeAlsoTargetScheme(directConcept)
      if (targetSchemeId) {
        this.dispatchEvent(
          new CustomEvent('flow-navigate', {
            bubbles: true,
            composed: true,
            detail: { schemeId: targetSchemeId, triggerConceptId: directConcept.id },
          })
        )
        return
      }
    }

    // For compound IDs (parent__child), find any concept whose ID is contained in domId
    for (const [conceptId, concept] of this.result.concepts.entries()) {
      if (domId.includes(conceptId)) {
        const targetSchemeId = this.resolveSeeAlsoTargetScheme(concept)
        if (targetSchemeId) {
          this.dispatchEvent(
            new CustomEvent('flow-navigate', {
              bubbles: true,
              composed: true,
              detail: { schemeId: targetSchemeId, triggerConceptId: concept.id },
            })
          )
          return
        }
      }
    }
  }

  /** When a structural/feature field with seeAlso gets a value, emit flow-navigate event. */
  private checkSeeAlsoNavigation(conceptId: string, value: unknown): void {
    if (!this.result) return
    const hasValue = Array.isArray(value)
      ? value.some(v => v && v !== '')
      : !!value && String(value) !== ''
    if (!hasValue) return

    const concept = this.result.concepts.get(conceptId)
    if (!concept) return

    const targetSchemeId = this.resolveSeeAlsoTargetScheme(concept)
    if (!targetSchemeId) return

    // Emit flow-navigate event for the parent app to handle
    this.dispatchEvent(
      new CustomEvent('flow-navigate', {
        bubbles: true,
        composed: true,
        detail: { schemeId: targetSchemeId, triggerConceptId: concept.id },
      })
    )
  }

  /**
   * Returns true when any structural element has been selected by the user.
   */
  private anyStructuralSelected(): boolean {
    for (const val of this.structuralSelections.values()) {
      if (Array.isArray(val)) {
        if (val.some(v => v && v !== '')) return true
      } else if (val && val !== '') {
        return true
      }
    }
    return false
  }

  /**
   * Collects all structural concept IDs needed by this scheme — both
   * scheme-level relevantRiepr refs and root-field level embedded procedural pickers.
   */
  private collectAllStructuralConceptIds(scheme: Scheme, rootFields: Concept[]): Set<string> {
    const result = this.result!
    const ids = new Set<string>()

    // Scheme-level relevantRiepr → structural concepts rendered at top
    for (const ref of this._service.getRelevantRieprRefs(result, scheme)) {
      if ((ref as Concept).type?.includes('skos:Concept')) {
        ids.add(ref.id)
      }
    }

    // Root fields with embedded procedural pickers via relevantRiepr → grandchildren's relevantRiepr
    for (const field of rootFields) {
      // Field-level relevantRiepr on non-composite fields → the field itself IS a picker
      const fieldRefs = this.getFieldStructuralRefs(field)
      if (fieldRefs.length > 0) {
        for (const ref of fieldRefs) {
          ids.add(ref.id)
        }
      }

      if (field.relevantRiepr?.length) {
        const referencedConcept = field.relevantRiepr.map(id => result.concepts.get(id)).find((c): c is Concept => c !== undefined)
        if (referencedConcept) {
          const grandchildren = this._service.getChildren(result, referencedConcept)
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
   * Derives a "select first" instruction message from data rather than hardcoding.
   * Priority: (1) field's own selecteerEerstMessage, (2) relatedRiepr concept's definition,
   * (3) relatedRiepr concept's prefLabel, (4) scheme-level relatedRiepr info.
   */
  private getGateInstructionMessage(scheme: Scheme, rootFields: Concept[]): string {
    const result = this.result!

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
    for (const ref of this._service.getRelevantRieprRefs(result, scheme)) {
      if ((ref as Concept).type?.includes('skos:Concept')) {
        const c = ref as Concept
        if (c.definition) return c.definition
        if (c.prefLabel) return `Selecteer eerst een ${c.prefLabel.toLowerCase()}.`
      }
    }

    // Ultimate fallback — generic Dutch instruction derived from context
    return 'Selecteer eerst een type in de bovenstaande lijst.'
  }

  /** Derives the "select first" message for a specific field's embedded picker gating. */
  private getFieldGateMessage(field: Concept): string {
    // Field-level custom message takes priority
    if (field.selecteerEerstMessage?.trim()) return field.selecteerEerstMessage.trim()

    // Try relatedRiepr concepts on this field or its children for instructional text
    const result = this.result!
    for (const rid of field.relevantRiepr ?? []) {
      const ref = result.concepts.get(rid)
      if (ref?.definition) return ref.definition
      if (ref?.prefLabel) return `Selecteer eerst een ${ref.prefLabel.toLowerCase()} om deze velden te bekijken.`
    }
    // Check grandchildren too
    for (const child of this._service.getChildren(result, field)) {
      for (const rid of child.relevantRiepr ?? []) {
        const ref = result.concepts.get(rid)
        if (ref?.definition) return ref.definition
        if (ref?.prefLabel) return `Selecteer eerst een ${ref.prefLabel.toLowerCase()}.`
      }
    }

    return 'Selecteer eerst een type om de velden te bekijken.'
  }

  /**
   * Collects embedded procedural picker concept IDs from a composite field,
   * including grandchildren's relevantRiepr even when the field has direct children.
   */
  private getEmbeddedPickerIds(field: Concept): string[] {
    const result = this.result!
    const ids: string[] = []

    // Case A: No direct children → expand via relevantRiepr referenced concept
    const directChildren = this._service.getChildren(result, field)
    if (directChildren.length === 0 && field.relevantRiepr?.length) {
      const referencedConcept = field.relevantRiepr.map(id => result.concepts.get(id)).find((c): c is Concept => c !== undefined)
      if (referencedConcept) {
        const grandchildren = this._service.getChildren(result, referencedConcept)
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
   * Expands a scheme's relevantRiepr refs into synthetic field concepts when the scheme
   * has no hasTopConcept of its own. This handles "structural-only" schemes like
   * operationeel_zelfcontrole_lucht where content is driven entirely by type selection.
   *
   * For ConceptScheme refs: creates one synthetic picker field per type scheme that lists
   * all top concepts as dropdown options (e.g., "Kies emissiepunt type" → schoorsteen/lozingspunt).
   * For direct Concept refs: creates a synthetic field with narrowed children as sub-fields.
   */
  private expandSchemeRelevantRieprToFields(scheme: Scheme): Concept[] {
    if (!this.result || !scheme.relevantRiepr) return []
    const fields: Concept[] = []

    for (const refId of scheme.relevantRiepr) {
      // Try resolving as a Concept first
      let concept = this.result.concepts.get(refId)
      
      // If not found, check if it resolves to a ConceptScheme and create a unified type picker
      if (!concept) {
        const maybeScheme = this.result.schemes.get(refId)
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
        const children = this._service.getChildren(this.result, concept)
        fields.push({
          id: `${scheme.id}:${concept.id.split(':').pop() ?? concept.id}`,
          type: ['skos:Concept'],
          prefLabel: concept.prefLabel ?? concept.id,
          definition: concept.definition,
          relevantRiepr: [concept.id],
          narrower: children.length > 0 ? children.map(c => c.id) : undefined,
        })
      }
    }

    return fields
  }

  /**
   * Handles vl-change events from vl-checkbox controls.
   * Checkbox state is tracked via .checked since its form "value" attribute
   * does not reflect whether it is actually checked/unchecked.
   */
  private _onCheckboxChange(event: CustomEvent<VlChangeEventDetail>) {
    const component = event.currentTarget! as VlCheckboxElement
    const domId = component.id
    // Prefer explicit checked flag from event detail; fallback to component property.
    const checked = event.detail?.checked ?? component.checked
    // Store as lowercase string so it matches normalized conditionValue URIs like "concept:true" → "true"
    this._fieldValues.set(domId, String(checked).toLowerCase())

    // Also store under the base concept ID (without any suffix) for conditionPath lookups
    // that reference the original concept id directly.
    if (this.result) {
      for (const [conceptId] of this.result.concepts.entries()) {
        if (domId === conceptId || domId.startsWith(conceptId + '#')) {
          this._fieldValues.set(conceptId, String(checked).toLowerCase())
          break
        }
      }
    }

    this.requestUpdate()
  }

  /**
   * Checks whether a concept with conditionPath/conditionValue should be rendered.
   * If no condition is defined the field always shows; otherwise the referenced
   * field's current tracked value must equal `conditionValue`.
   *
   * Handles multiple value formats:
   * - Checkbox: "true" / "false"
   * - Select/code list: full concept ID like "riepr-operationeel-pomptoestand:rust"
   *   where conditionValue normalizes to just "rust"
   */
  private matchesCondition(field: Concept): boolean {
    if (!field.conditionPath || !field.conditionValue) return true
    const refId = field.conditionPath
    // Normalize condition value for case-insensitive comparison.
    const expected = field.conditionValue.toLowerCase().trim()

    // Direct id match first (exact control that was rendered).
    let stored = this._fieldValues.get(refId)
    if (stored !== undefined && this.valueMatchesExpected(String(stored), expected)) return true

    // Strip any instance suffix from the reference to get the base prefix.
    const basePrefix = refId.replace(/#\d+$/, '')

    // Check ALL stored values whose key starts with the base prefix,
    // so repeatable-fields on instances beyond #1 also satisfy conditions.
    for (const [key, val] of this._fieldValues.entries()) {
      if (key.startsWith(basePrefix) && this.valueMatchesExpected(String(val), expected)) {
        return true
      }
    }

    return false
  }

  /**
   * Checks whether a stored form-control value satisfies an expected condition value.
   * Handles:
   * - Exact string match (e.g. checkbox "true" === "true")
   * - Colon-prefixed concept IDs (e.g. "riepr-op:pomptoestand:rust" matches "rust")
   * - Hash fragments (e.g. "http://...#rust" matches "rust")
   */
  private valueMatchesExpected(stored: string, expected: string): boolean {
    const s = stored.toLowerCase().trim()
    // 1. Exact match (checkboxes, plain values)
    if (s === expected) return true
    // 2. Colon-suffix match: full concept ID like "prefix:rust" vs local name "rust"
    if (s.endsWith(`:${expected}`)) return true
    // 3. Hash fragment match: URI like "http://...#rust" vs local name "rust"
    if (s.endsWith(`#${expected}`)) return true
    // 4. Stored is the raw conditionValue with prefix (e.g. stored="concept:true", expected="true")
    if (s.includes(':') && s.split(':').pop()!.toLowerCase() === expected) return true
    return false
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'codelijst-operationeel-fields': CodelijstOperationeelFields
  }
}

customElements.define('codelijst-operationeel-fields', CodelijstOperationeelFields)
