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
        const options = getMockInstances(concept.id, label).map(instance => ({ value: instance.id, label: instance.label }))
        const formLabel = html`<vl-form-label for="${concept.id}" label="Kies ${label}" block .annotation="${concept.definition ?? ''}"></vl-form-label>`
        const control = html`<vl-select id="${concept.id}" name="${concept.id}" label="Kies ${label}" placeholder="Selecteer ${label.toLowerCase()}..." .options="${options}"></vl-select>`
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

    const id = `${field.id}${idSuffix}`
    const required = field.isVerplicht === true
    const label = this.labelWithUnit(field)
    const codeListSchemes = this.codelistService.getCodeListSchemes(this.result, field)

    if (field.relevantCodeList) {
      // relevantCodeList is set but may not resolve (external/TODO ref): show an
      // (empty) selection anyway rather than erroring out, per the POC's data-quality rule.
      const options = codeListSchemes.flatMap(codeListScheme =>
        this.codelistService
          .getTopConceptsForScheme(this.result!, codeListScheme.id)
          .map(concept => ({ value: concept.id, label: concept.prefLabel ?? concept.id }))
      )
      const formLabel = html`<vl-form-label for="${id}" label="${label}" block .annotation="${field.definition ?? ''}"></vl-form-label>`
      const control = html`<vl-select id="${id}" name="${id}" label="${label}" placeholder="Selecteer..." ?required="${required}" .options="${options}"></vl-select>`
      return html`${formLabel}${control}`
    }

    switch (field.relevantDataType) {
      case 'xsd:boolean':
        return html`<vl-checkbox id="${id}" name="${id}" label="${label}" ?required="${required}"></vl-checkbox>`
      case 'xsd:date':
      case 'xsd:dateTime': {
        const formLabel = html`<vl-form-label for="${id}" label="${label}" block .annotation="${field.definition ?? ''}"></vl-form-label>`
        const control = html`<vl-datepicker id="${id}" name="${id}" label="${label}" ?required="${required}"></vl-datepicker>`
        return html`${formLabel}${control}`
      }
      case 'xsd:decimal':
      case 'xsd:integer':
      case 'xsd:double':
      case 'xsd:float': {
        const formLabel = html`<vl-form-label for="${id}" label="${label}" block .annotation="${field.definition ?? ''}"></vl-form-label>`
        const control = html`<vl-input-field id="${id}" name="${id}" label="${label}" type="number" ?required="${required}"></vl-input-field>`
        return html`${formLabel}${control}`
      }
      default: {
        const formLabel = html`<vl-form-label for="${id}" label="${label}" block .annotation="${field.definition ?? ''}"></vl-form-label>`
        const control = html`<vl-input-field id="${id}" name="${id}" label="${label}" type="text" ?required="${required}"></vl-input-field>`
        return html`${formLabel}${control}`
      }
    }
  }

  private labelWithUnit(field: Concept): string {
    const label = field.prefLabel ?? field.id
    const unitId = field.relevantUnit?.[0]
    const unitCode = unitId ? this.result?.concepts.get(unitId)?.code : undefined
    return unitCode ? `${label} (${unitCode})` : label
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
}

declare global {
  interface HTMLElementTagNameMap {
    'codelijst-operationeel-fields': CodelijstOperationeelFields
  }
}

customElements.define('codelijst-operationeel-fields', CodelijstOperationeelFields)
