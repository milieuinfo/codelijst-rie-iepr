/**
 * @file Renders the operationeel-* conceptscheme an installation's
 * thema/sub-thema resolves to (steps 2-6 of the user flow): composite
 * (narrower) attribute groups, per-field input controls driven by
 * relevantDataType/relevantCodeList, required/repeatable markers, and a
 * structural-element picker when the scheme's relevantRiepr points at a
 * type such as `riepr-meetpunt-type:debietmeter`.
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


    `,
    vlMarginStyles,
  ]

  /** Number of repeated copies rendered per isMeervoudig root field, keyed by field id. */
  private repeatCounts = new Map<string, number>()
  /** Current value of every vl-* form control, keyed by its DOM id (for conditionPath/conditionValue evaluation). */
  private _fieldValues = new Map<string, unknown>()
  /** Tracks which structural/procedural concept IDs have been selected by the user. Key = structuralConceptId, Value = selected instance ID or empty string. */
  private structuralSelections = new Map<string, string>()

  result?: CodelistResult
  schemeId?: string
  codelistService?: CodelistService

  static override properties = {
    result: { attribute: false },
    schemeId: { attribute: false },
    codelistService: { attribute: false },
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
   * @returns HTML template with vl-select pickers, or nothing if no structural concepts found.
   */
  private renderPickersForRefs(refs: (Scheme | Concept)[]) {
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
        const fieldValue = String(this._fieldValues.get(concept.id) ?? '')
        const options = getMockInstances(concept.id, label).map(instance => ({ value: instance.id, label: instance.label, selected: instance.id === fieldValue }))
        const formLabel = html`<vl-form-label for="${concept.id}" label="Kies ${label}" block .annotation="${concept.definition ?? ''}"></vl-form-label>`
        const control = html`<vl-select id="${concept.id}" name="${concept.id}" label="Kies ${label}" placeholder="Selecteer ${label.toLowerCase()}..." .value="${fieldValue}" .options="${options}" @vl-input="${this._onControlInput}"></vl-select>`
        return html`${formLabel}${control}`
      })}
    `
  }

  /** Returns the rendered content for a root field (or nothing if hidden by conditions). */
  private renderRootFieldContent(field: Concept): { content: ReturnType<typeof html>; repeatable: boolean } | typeof nothing {
    if (!this.result) return nothing

    let children = this._service.getChildren(this.result, field)
    let groupPicker: ReturnType<typeof html> | typeof nothing = nothing

    // Case A: No direct children but has relevantRiepr → expand via referenced concept's children
    if (children.length === 0 && field.relevantRiepr?.length) {
      const referencedConcept = field.relevantRiepr.map(id => this.result!.concepts.get(id)).find((c): c is Concept => c !== undefined)
      if (referencedConcept) {
        const grandchildren = this._service.getChildren(this.result, referencedConcept)
        if (grandchildren.length > 0) {
          children = grandchildren
          const structuralRefs = Array.from(new Set(grandchildren.flatMap(c => c.relevantRiepr ?? [])))
            .map(id => this.result!.concepts.get(id))
            .filter((c): c is Concept => c !== undefined)
          groupPicker = this.renderPickersForRefs(structuralRefs)
        }
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
                ${children.map(child => html`<div class="codelijst-group__child">${this.renderFieldControl(child, suffix)}</div>`)}
              </vl-fieldset>
            `
        : this.renderFieldControl(field, suffix)

      // Skip if body is nothing (all children hidden by conditions)
      if (body === nothing && !isComposite) return nothing
      if (body !== nothing) {
        const removeButton =
          isRepeatable && count > 1
            ? html`<vl-button secondary @click="${() => this.removeInstance(field.id)}">Verwijder</vl-button>`
            : nothing
        visibleInstances.push(html`<div class="codelijst-group__item">${body}${removeButton}</div>`)
      }
    }

    // If all instances were hidden, return nothing so the wrapper group div isn't rendered
    if (visibleInstances.length === 0) return nothing

    const addButton = isRepeatable
      ? html`<vl-button secondary @click="${() => this.addInstance(field.id)}">+ Nog ${(field.prefLabel ?? 'item').toLowerCase()} toevoegen</vl-button>`
      : nothing

    return { content: html`${visibleInstances}${addButton}`, repeatable: isRepeatable }
  }

  private renderFieldControl(field: Concept, idSuffix: string) {
    if (!this.result) return nothing

    // Conditional visibility check — hide field when conditionPath is set but unmet.
    if (!this.matchesCondition(field)) return nothing

    const id = `${field.id}${idSuffix}`
    const required = field.isVerplicht === true
    const plainLabel = field.prefLabel ?? field.id
    const codeListSchemes = this._service.getCodeListSchemes(this.result, field)

    // relevantCodeList takes priority — renders as a vl-select.
    if (field.relevantCodeList) {
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
      const id = component.id
      let value: unknown = event.detail?.value
      // Fallback — read directly from the component instance when detail.value is missing.
      if (value === undefined) {
        value = 'value' in component ? component.value : undefined
      }
      this._fieldValues.set(id, value)

      // Track structural selections: a select whose DOM id matches a concept ID
      // in the result map is a structural/procedural picker.
      if (this.result && this.result.concepts.has(id)) {
        this.structuralSelections.set(id, String(value ?? ''))
      }

      this.requestUpdate()
    }

  /**
    * Returns true when any structural element has been selected by the user.
    */
  private anyStructuralSelected(): boolean {
    for (const val of this.structuralSelections.values()) {
      if (val && val !== '') return true
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
    * Handles vl-change events from vl-checkbox controls.
   * Checkbox state is tracked via .checked since its form "value" attribute
   * does not reflect whether it is actually checked/unchecked.
   */
  private _onCheckboxChange(event: CustomEvent<VlChangeEventDetail>) {
    const component = event.currentTarget! as VlCheckboxElement
    const id = component.id
    // Prefer explicit checked flag from event detail; fallback to component property.
    const checked = event.detail?.checked ?? component.checked
    // Store as lowercase string so it matches normalized conditionValue URIs like "concept:true" → "true"
    this._fieldValues.set(id, String(checked).toLowerCase())
    this.requestUpdate()
  }

  /**
     * Checks whether a concept with conditionPath/conditionValue should be rendered.
     * If no condition is defined the field always shows; otherwise the referenced
     * field's current tracked value must equal `conditionValue`.
     */
    private matchesCondition(field: Concept): boolean {
      if (!field.conditionPath || !field.conditionValue) return true
      const refId = field.conditionPath
      // Normalize condition value for case-insensitive comparison.
      const expected = field.conditionValue.toLowerCase().trim()
      // Direct id match first (exact control that was rendered).
      let stored = this._fieldValues.get(refId)
      if (stored !== undefined && String(stored).toLowerCase() === expected) return true
      // Strip any instance suffix from the reference to get the base prefix.
      const basePrefix = refId.replace(/#\d+$/, '')
      // Check ALL stored values whose key starts with the base prefix,
      // so repeatable-fields on instances beyond #1 also satisfy conditions.
      for (const [key, val] of this._fieldValues.entries()) {
        if (key.startsWith(basePrefix) && String(val).toLowerCase() === expected) {
          return true
        }
      }
      return false
    }
}

declare global {
  interface HTMLElementTagNameMap {
    'codelijst-operationeel-fields': CodelijstOperationeelFields
  }
}

customElements.define('codelijst-operationeel-fields', CodelijstOperationeelFields)
