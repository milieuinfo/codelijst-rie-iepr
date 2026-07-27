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
import { getMockInstances } from '../services/mock-data.service.js'
import { vlMarginStyles } from '@domg-wc/styles/layout/margin/vl-margin.css.js'
import type { CodelistResult } from '../services/codelist-service.js'
import type { Concept, Scheme } from '../models/skos-models.js'

export class CodelijstOperationeelFields extends LitElement {
  static override styles = [
    css`
      :host {
        display: block;
      }
    `,
    vlMarginStyles,
  ]

  private codelistService = new CodelistService()
  /** Number of repeated copies rendered per isMeervoudig root field, keyed by field id. */
  private repeatCounts = new Map<string, number>()
  /** Current value of every vl-* form control, keyed by its DOM id (for conditionPath/conditionValue evaluation). */
  private _fieldValues = new Map<string, unknown>()

  result?: CodelistResult
  schemeId?: string

  static override properties = {
    result: { attribute: false },
    schemeId: { attribute: false },
  }

  override render() {
    if (!this.result || !this.schemeId) return nothing

    const scheme = this.result.schemes.get(this.schemeId)
    if (!scheme) return nothing

    const rootFields = this.codelistService
      .getTopConceptsForScheme(this.result, this.schemeId)
      // hasTopConcept lists every concept in the scheme, composite children included;
      // a field with `broader` set is a composite child, not a root question.
      .filter(field => !field.broader)

    return html`
      ${this.renderStructuralPicker(scheme)}
      ${rootFields.map(field => html`<div class="vl-margin--medium">${this.renderRootField(field)}</div>`)}
    `
  }

  /**
   * Renders a structural element picker dropdown when the scheme's relevantRiepr points at type concepts.
   * @param scheme - The operationeel scheme whose relevantRiepr refs determine available structural types.
   * @returns HTML template with vl-select pickers, or nothing if no structural types are defined.
   */
  private renderStructuralPicker(scheme: Scheme) {
    if (!this.result) return nothing

    const structuralConcepts = this.codelistService
      .getRelevantRieprRefs(this.result, scheme)
      .filter((ref): ref is Concept => Array.isArray((ref as Concept).type) && (ref as Concept).type!.includes('skos:Concept'))

    if (structuralConcepts.length === 0) return nothing

    return html`
      ${structuralConcepts.map(concept => {
        const label = concept.prefLabel ?? concept.id
        const fieldValue = String(this._fieldValues.get(concept.id) ?? '')
        const options = getMockInstances(concept.id, label).map(instance => ({ value: instance.id, label: instance.label, selected: instance.id === fieldValue }))
        const formLabel = html`<vl-form-label for="${concept.id}" label="Kies ${label}" block .annotation="${concept.definition ?? ''}"></vl-form-label>`
        const control = html`<vl-select id="${concept.id}" name="${concept.id}" label="Kies ${label}" placeholder="Selecteer ${label.toLowerCase()}..." .value="${fieldValue}" .options="${options}" @vl-input="${this._onControlInput}"></vl-select>`
        return html`${formLabel}${control}`
      })}
    `
  }

  private renderRootField(field: Concept) {
    if (!this.result) return nothing

    const children = this.codelistService.getChildren(this.result, field)
    const isComposite = children.length > 0
    const isRepeatable = field.isMeervoudig === true
    const count = isRepeatable ? this.repeatCounts.get(field.id) ?? 1 : 1

    const instances = Array.from({ length: count }, (_, index) => {
      const suffix = isRepeatable ? `#${index + 1}` : ''
      const body = isComposite
        ? html`
            <vl-fieldset>
              <span slot="legend">${field.prefLabel ?? field.id}${isRepeatable ? ` ${index + 1}` : ''}</span>
              ${children.map(child => this.renderFieldControl(child, suffix))}
            </vl-fieldset>
          `
        : this.renderFieldControl(field, suffix)

      const removeButton =
        isRepeatable && count > 1
          ? html`<vl-button secondary @click="${() => this.removeInstance(field.id)}">Verwijder</vl-button>`
          : nothing

      return html`<div class="vl-margin--small">${body}${removeButton}</div>`
    })

    const addButton = isRepeatable
      ? html`<vl-button secondary @click="${() => this.addInstance(field.id)}">+ Nog ${(field.prefLabel ?? 'item').toLowerCase()} toevoegen</vl-button>`
      : nothing

    return html`${instances}${addButton}`
  }

  private renderFieldControl(field: Concept, idSuffix: string) {
    if (!this.result) return nothing

    // Conditional visibility check — hide field when conditionPath is set but unmet.
    if (!this.matchesCondition(field)) return nothing

    const id = `${field.id}${idSuffix}`
    const required = field.isVerplicht === true
    const plainLabel = field.prefLabel ?? field.id
    const codeListSchemes = this.codelistService.getCodeListSchemes(this.result, field)

    // relevantCodeList takes priority — renders as a vl-select.
    if (field.relevantCodeList) {
      const fieldValue = String(this._fieldValues.get(id) ?? '')
      const options = codeListSchemes.flatMap(codeListScheme =>
        this.codelistService
          .getTopConceptsForScheme(this.result!, codeListScheme.id)
          .map(concept => ({ value: concept.id, label: concept.prefLabel ?? concept.id, selected: concept.id === fieldValue }))
      )
      const formLabel = html`<vl-form-label for="${id}" label="${plainLabel}" block .annotation="${field.definition ?? ''}"></vl-form-label>`
      const control = html`<vl-select id="${id}" name="${id}" label="${plainLabel}" placeholder="Selecteer..." ?required="${required}" .value="${fieldValue}" .options="${options}" @vl-input="${this._onControlInput}"></vl-select>`
      return html`${formLabel}${control}`
    }

    // Check whether relevantUnit resolves to a conceptscheme (multiple units → dropdown).
    const unitIds = field.relevantUnit ?? []
    let unitScheme: Scheme | undefined
    let singleUnitConcept: Concept | undefined
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
        }
      }
    }

    // Unit scheme → render vl-select populated from that scheme's top concepts.
    if (isUnitScheme && unitScheme) {
      const fieldValue = String(this._fieldValues.get(id) ?? '')
      const options = this.codelistService
        .getTopConceptsForScheme(this.result, unitScheme.id)
        .map(concept => ({ value: concept.id, label: concept.prefLabel ?? concept.id, selected: concept.id === fieldValue }))
      const formLabel = html`<vl-form-label for="${id}" label="${plainLabel}" block .annotation="${field.definition ?? ''}"></vl-form-label>`
      const control = html`<vl-select id="${id}" name="${id}" label="${plainLabel}" placeholder="Selecteer eenheid..." ?required="${required}" .value="${fieldValue}" .options="${options}" @vl-input="${this._onControlInput}"></vl-select>`
      return html`${formLabel}${control}`
    }

    switch (field.relevantDataType) {
      case 'xsd:boolean':
        return html`<vl-checkbox id="${id}" name="${id}" label="${plainLabel}" ?required="${required}" @vl-change="${this._onCheckboxChange}"></vl-checkbox>`
      case 'dcterms:temporal': {
        const formLabel = html`<vl-form-label for="${id}" label="${plainLabel}" block .annotation="${field.definition ?? ''}"></vl-form-label>`
        const control = html`<vl-datepicker id="${id}" name="${id}" label="${plainLabel}" type="range" ?required="${required}" @vl-input="${this._onControlInput}"></vl-datepicker>`
        return this.renderWithUnit(formLabel, control, singleUnitConcept)
      }
      case 'xsd:date':
      case 'xsd:dateTime': {
        const formLabel = html`<vl-form-label for="${id}" label="${plainLabel}" block .annotation="${field.definition ?? ''}"></vl-form-label>`
        const control = html`<vl-datepicker id="${id}" name="${id}" label="${plainLabel}" ?required="${required}" @vl-input="${this._onControlInput}"></vl-datepicker>`
        return this.renderWithUnit(formLabel, control, singleUnitConcept)
      }
      case 'xsd:decimal':
      case 'xsd:integer':
      case 'xsd:double':
      case 'xsd:float': {
        const formLabel = html`<vl-form-label for="${id}" label="${plainLabel}" block .annotation="${field.definition ?? ''}"></vl-form-label>`
        const control = html`<vl-input-field id="${id}" name="${id}" label="${plainLabel}" type="number" ?required="${required}" @vl-input="${this._onControlInput}"></vl-input-field>`
        return this.renderWithUnit(formLabel, control, singleUnitConcept)
      }
      case 'xsd:duration': {
        const formLabel = html`<vl-form-label for="${id}" label="${plainLabel}" block .annotation="${field.definition ?? ''}"></vl-form-label>`
        const control = html`<vl-input-field id="${id}" name="${id}" label="${plainLabel}" type="text" pattern="[0-9]+:[0-2][0-9]:[0-5][0-9]:[0-5][0-9]" placeholder="dd:hh:mm:ss" ?required="${required}" @vl-input="${this._onControlInput}"></vl-input-field>`
        return this.renderWithUnit(formLabel, control, singleUnitConcept)
      }
      default: {
        const formLabel = html`<vl-form-label for="${id}" label="${plainLabel}" block .annotation="${field.definition ?? ''}"></vl-form-label>`
        const control = html`<vl-input-field id="${id}" name="${id}" label="${plainLabel}" type="text" ?required="${required}" @vl-input="${this._onControlInput}"></vl-input-field>`
        return this.renderWithUnit(formLabel, control, singleUnitConcept)
      }
    }
  }

  /** Wraps a control + unit addon in an input-group container; label stays outside. */
  private renderWithUnit(
    formLabel: ReturnType<typeof html>,
    control: ReturnType<typeof html>,
    unitConcept: Concept | undefined,
  ) {
    if (!unitConcept) return html`${formLabel}${control}`

    const unitText = unitConcept.code ?? unitConcept.prefLabel ?? unitConcept.id
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
  private _onControlInput(event: CustomEvent<{ value?: unknown }>) {
    const component = event.currentTarget as Element
    const id = component.id
    let value: unknown = event.detail?.value
    // Fallback — read directly from the component instance when detail.value is missing.
    if (value === undefined) {
      value = (component as { value?: unknown }).value
    }
    this._fieldValues.set(id, value)
    this.requestUpdate()
  }

  /**
   * Handles vl-change events from vl-checkbox controls.
   * Checkbox state is tracked via .checked since its form "value" attribute
   * does not reflect whether it is actually checked/unchecked.
   */
  private _onCheckboxChange(event: CustomEvent<{ checked?: boolean; value?: unknown }>) {
    const component = event.currentTarget as Element
    const id = component.id
    // Prefer explicit checked flag from event detail; fallback to component property.
    const checked = event.detail?.checked ?? (component as { checked?: boolean }).checked
    this._fieldValues.set(id, checked)
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
    // Direct id match first (the exact control that was rendered).
    let stored = this._fieldValues.get(refId)
    if (stored !== undefined && String(stored) === field.conditionValue) return true
    // For repeatable fields the rendered id has a #N suffix — check baseId#1.
    const baseId = refId.replace(/#\d+$/, '')
    const firstInstance = `${baseId}#1`
    stored = this._fieldValues.get(firstInstance)
    if (stored !== undefined && String(stored) === field.conditionValue) return true
    // No stored value yet → treat as unmet (field stays hidden until user fills in the trigger).
    return false
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'codelijst-operationeel-fields': CodelijstOperationeelFields
  }
}

customElements.define('codelijst-operationeel-fields', CodelijstOperationeelFields)
