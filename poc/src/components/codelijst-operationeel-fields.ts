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
import { vlMarginStyles } from '@domg-wc/styles/layout/margin/vl-margin.css.js'
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

  /** Number of repeated copies rendered per isMeervoudig root field, keyed by field id. */
  private repeatCounts = new Map<string, number>()
  /** Current value of every vl-* form control, keyed by its DOM id (for conditionPath/conditionValue evaluation). */
  private _fieldValues = new Map<string, unknown>()

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

  override render() {
    if (!this.result || !this.schemeId) return nothing

    const scheme = this.result.schemes.get(this.schemeId)
    if (!scheme) return nothing

    const rootFields = this._service.getTopLevelConcepts(this.result, this.schemeId!)

    return html`
      ${this.renderStructuralPicker(scheme)}
      ${rootFields.map(field => html`<div class="vl-margin--medium">${this.renderRootField(field)}</div>`)}
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

    let children = this._service.getChildren(this.result, field)
    let groupPicker: ReturnType<typeof html> | typeof nothing = nothing

    if (children.length === 0 && field.relevantRiepr?.length) {
      const referencedConcept = field.relevantRiepr
        .map(id => this.result!.concepts.get(id))
        .find((c): c is Concept => c !== undefined)

      if (referencedConcept) {
        const grandchildren = this._service.getChildren(this.result, referencedConcept)
        if (grandchildren.length > 0) {
          children = grandchildren
          const structuralRefIds = new Set(grandchildren.flatMap(c => c.relevantRiepr ?? []))
          const structuralRefs = Array.from(structuralRefIds)
            .map(id => this.result!.concepts.get(id))
            .filter((c): c is Concept => c !== undefined)
          groupPicker = this.renderPickersForRefs(structuralRefs)
        }
      }
    }

    const isComposite = children.length > 0
    const isRepeatable = field.isMeervoudig === true
    const count = isRepeatable ? this.repeatCounts.get(field.id) ?? 1 : 1

    const instances = Array.from({ length: count }, (_, index) => {
      const suffix = isRepeatable ? `#${index + 1}` : ''
      const body = isComposite
        ? html`
            <vl-fieldset>
              <span slot="legend">${field.prefLabel ?? field.id}${isRepeatable ? ` ${index + 1}` : ''}</span>
              ${groupPicker}
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
    const codeListSchemes = this._service.getCodeListSchemes(this.result, field)

    // relevantCodeList takes priority — renders as a vl-select.
    if (field.relevantCodeList) {
      const fieldValue = String(this._fieldValues.get(id) ?? '')
      const options = codeListSchemes.flatMap(codeListScheme =>
        this._service
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
      const options = this._service
        .getTopConceptsForScheme(this.result, unitScheme.id)
        .map(concept => ({ value: concept.id, label: concept.prefLabel ?? concept.id, selected: concept.id === fieldValue }))
      const formLabel = html`<vl-form-label for="${id}" label="${plainLabel}" block .annotation="${field.definition ?? ''}"></vl-form-label>`
      const control = html`<vl-select id="${id}" name="${id}" label="${plainLabel}" placeholder="Selecteer eenheid..." ?required="${required}" .value="${fieldValue}" .options="${options}" @vl-input="${this._onControlInput}"></vl-select>`
      return html`${formLabel}${control}`
    }

    // Boolean checkbox — no label wrapper, no unit support.
    if (field.relevantDataType === DataType.BOOLEAN) {
      return html`<vl-checkbox id="${id}" name="${id}" label="${plainLabel}" ?required="${required}" @vl-change="${this._onCheckboxChange}"></vl-checkbox>`
    }

    const control = createControl(id, id, plainLabel, required, field.relevantDataType, this._onControlInput)
    const formLabel = html`<vl-form-label for="${id}" label="${plainLabel}" block .annotation="${field.definition ?? ''}"></vl-form-label>`
    return this.renderWithUnit(formLabel, control, singleUnitConcept)
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
   private _onControlInput(event: CustomEvent<VlInputElementEventDetail>) {
      const component = event.currentTarget! as VlSelectElement | VlInputFieldElement | VlDatepickerElement
      const id = component.id
      let value: unknown = event.detail?.value
      // Fallback — read directly from the component instance when detail.value is missing.
      if (value === undefined) {
        value = 'value' in component ? component.value : undefined
      }
      this._fieldValues.set(id, value)
      this.requestUpdate()
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
      // Direct id match first (exact control that was rendered).
      let stored = this._fieldValues.get(refId)
      if (stored !== undefined && String(stored) === field.conditionValue) return true
      // Strip any instance suffix from the reference to get the base prefix.
      const basePrefix = refId.replace(/#\d+$/, '')
      // Check ALL stored values whose key starts with the base prefix,
      // so repeatable-fields on instances beyond #1 also satisfy conditions.
      for (const [key, val] of this._fieldValues.entries()) {
        if (key.startsWith(basePrefix) && String(val) === field.conditionValue) {
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
