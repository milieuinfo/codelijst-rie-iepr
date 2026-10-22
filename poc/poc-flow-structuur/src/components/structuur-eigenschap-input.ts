/**
 * @file Renders one eigenschap value (plan 06, taak 2).
 *
 * The control follows `relevantDataType` (via `field-control-factory`), the
 * selection list follows `relevantCodeList` (plan 03) and the unit follows
 * `relevantUnit`: a fixed suffix for one unit, a `vl-select-rich` for a
 * collection of units (first unit preselected, not deletable — zoals MJV).
 *
 * Every change is reported to the app with a `structuur-waarde` event, so the
 * debug panel can show the current input as JSON without any persistence.
 */

import { LitElement, css, html, nothing } from 'lit'
import type { CodelistResult, Eigenschap, SelectieOptie } from '../models/index.js'
import { createControl } from '../services/field-control-factory.js'
import { getalType } from '../services/getal.js'
import { CsorService } from '../services/csor.js'
import { getEenheden, getSelectieOpties } from '../services/structuur-service.js'

export class StructuurEigenschapInput extends LitElement {
  static override styles = [
    css`
      :host {
        display: block;
      }

      .structuur-input {
        display: flex;
        align-items: flex-start;
        gap: var(--vl-spacing--xsmall, 0.5rem);
      }

      .structuur-input > div:first-child {
        flex: 1 1 auto;
        min-width: 0;
      }

      /* A numeric field with a unit stays compact, so the unit sits next to the value. */
      .structuur-input--met-eenheid > div:first-child {
        flex: 0 1 16rem;
      }

      .structuur-eenheid {
        display: inline-flex;
        align-items: center;
        align-self: stretch;
        min-width: 3.5rem;
        padding: 0 var(--vl-spacing--xsmall, 0.5rem);
        color: var(--vl-color--text-alt, #687483);
        white-space: nowrap;
      }

      .structuur-eenheid-selector {
        flex: 0 0 9rem;
      }

      .structuur-extern {
        display: block;
        margin-top: var(--vl-spacing--xsmall, 0.5rem);
      }
    `,
  ]

  eigenschap?: Eigenschap
  result?: CodelistResult
  /** Row id for a repeated value; only used to make the DOM id unique. */
  rijId?: string
  /** Value path of this field; defaults to `[eigenschap.id]`. */
  pad?: string[]
  /** `false` inside a multi-row composite, where the column header shows the label. */
  toonLabel = true
  csor: CsorService = new CsorService()

  static override properties = {
    eigenschap: { attribute: false },
    result: { attribute: false },
    rijId: { attribute: false },
    pad: { attribute: false },
    toonLabel: { type: Boolean },
    csor: { attribute: false },
  }

  override render() {
    const eigenschap = this.eigenschap
    if (!eigenschap) return nothing

    const id = this.veldId
    const opties = this.opties
    const eenheden = this.eenheden
    const heeftOpties = opties.length > 0
    const heeftEenheid = eenheden.length > 0
    const compact = heeftEenheid && getalType(eigenschap.dataType) !== undefined
    // A checkbox renders its own visible label; the other controls use `label` as aria-label only.
    const toonEigenLabel = this.toonLabel && eigenschap.dataType !== 'xsd:boolean'
    const extern =
      eigenschap.codeList &&
      !heeftOpties &&
      !eigenschap.codeList.startsWith('conceptscheme:') &&
      !eigenschap.codeList.startsWith('collectie:')

    return html`
      <div class="structuur-veld">
        ${toonEigenLabel
          ? html`<vl-form-label
              for="${id}"
              label="${this.labelTekst}"
              block
              .annotation="${eigenschap.definitie ?? ''}"
            ></vl-form-label>`
          : nothing}

        <div class="structuur-input ${compact ? 'structuur-input--met-eenheid' : ''}" title="${this.tooltip}">
          <div @vl-input="${this.onWaarde}" @vl-change="${this.onWaarde}">
            ${heeftOpties
              ? html`<vl-select-rich
                  id="${id}"
                  name="${eigenschap.id}__waarde"
                  data-eigenschap="${eigenschap.id}"
                  ?multiple="${eigenschap.multiselect}"
                  placeholder="Selecteer..."
                  search
                  search-placeholder="Zoek..."
                  .options="${opties.map((optie) => ({
                    value: optie.id,
                    label: optie.label,
                  }))}"
                ></vl-select-rich>`
              : createControl({
                  id,
                  name: `${eigenschap.id}__waarde`,
                  label: this.labelTekst,
                  required: eigenschap.verplicht,
                  dataType: eigenschap.dataType,
                  multiline: eigenschap.multiline,
                })}
          </div>

          ${this.renderEenheid(eenheden)}
        </div>

        ${extern
          ? html`<vl-text class="structuur-extern" small annotation>
              Deze keuzelijst wordt extern gepubliceerd (${eigenschap.codeList}); vrije tekst.
            </vl-text>`
          : nothing}
        ${this.renderMeldingen(eigenschap, id)}
      </div>
    `
  }

  /**
   * One unit is shown as a fixed suffix; several units get a required selector
   * with the first unit preselected.
   * @param eenheden - The resolved units.
   * @returns The unit template, or nothing.
   */
  private renderEenheid(eenheden: SelectieOptie[]) {
    if (eenheden.length === 0) return nothing

    if (eenheden.length === 1) {
      const eenheid = eenheden[0]
      return html`<vl-text class="structuur-eenheid" small title="${eenheid.definitie ?? eenheid.label}"
        >${eenheid.symbool ?? eenheid.label}</vl-text
      >`
    }

    const eenheidId = `${this.veldId}__eenheid`
    return html`<div class="structuur-eenheid-selector">
      <vl-select-rich
        id="${eenheidId}"
        name="${this.eigenschap?.id}__eenheid"
        data-eigenschap="${this.eigenschap?.id}__eenheid"
        aria-label="Eenheid"
        placeholder="Eenheid"
        required
        not-deletable
        .value="${eenheden[0].id}"
        .options="${eenheden.map((eenheid, index) => ({
          value: eenheid.id,
          label: eenheid.symbool ?? eenheid.label,
          selected: index === 0,
        }))}"
        @vl-change="${this.onEenheid}"
        @vl-input="${this.onEenheid}"
      ></vl-select-rich>
    </div>`
  }

  /**
   * Dutch validation messages for required and numeric fields.
   * @param eigenschap - The eigenschap being rendered.
   * @param id - The DOM id of the control.
   * @returns The messages.
   */
  private renderMeldingen(eigenschap: Eigenschap, id: string) {
    const getal = getalType(eigenschap.dataType)
    return html`
      ${eigenschap.verplicht
        ? html`<vl-form-message for="${id}" state="valueMissing">
            Gelieve '${eigenschap.label}' in te vullen.
          </vl-form-message>`
        : nothing}
      ${getal
        ? html`<vl-form-message for="${id}" state="patternMismatch">
            ${getal === 'integer'
              ? 'Gelieve een geheel getal in te geven (bv. 123).'
              : 'Gelieve een geldig getal in te geven met een komma als decimaalteken (bv. 123,45).'}
          </vl-form-message>`
        : nothing}
    `
  }

  get labelTekst(): string {
    const eigenschap = this.eigenschap
    if (!eigenschap) return ''
    return eigenschap.verplicht ? `${eigenschap.label} (*)` : eigenschap.label
  }

  get veldId(): string {
    const basis = `veld__${this.eigenschap?.id ?? 'onbekend'}`
    return this.rijId ? `${basis}__${this.rijId}` : basis
  }

  /**
   * The value path of this field, without the unit suffix.
   * @returns The path segments.
   */
  get padBasis(): string[] {
    return this.pad ?? [this.eigenschap?.id ?? 'onbekend']
  }

  /**
   * Informational tooltip: the RDF predicate (`relevantProperty`) or relation
   * (`riepr:parameter`, ...). These never change the control.
   * @returns The tooltip text, or an empty string.
   */
  get tooltip(): string {
    const eigenschap = this.eigenschap
    if (!eigenschap) return ''
    if (eigenschap.predicaat) return `RDF-predicaat: ${eigenschap.predicaat}`
    if (eigenschap.relatie) return `RDF-relatie: ${eigenschap.relatie}`
    return ''
  }

  get opties(): SelectieOptie[] {
    if (!this.result || !this.eigenschap?.codeList) return []
    return getSelectieOpties(this.result, this.eigenschap.codeList, this.csor)
  }

  get eenheden(): SelectieOptie[] {
    return getEenheden(this.eigenschap?.unit, this.result, this.csor)
  }

  /**
   * Reads the value of the changed control and reports it to the app.
   * @param event - The `vl-input` / `vl-change` event.
   */
  private onWaarde(event: Event): void {
    const doel = event.target as HTMLElement & { checked?: boolean; value?: string | string[] }
    const detail = (event as CustomEvent<{ value?: string | string[]; checked?: boolean }>).detail
    const waarde =
      doel.checked !== undefined
        ? Boolean(detail?.checked ?? doel.checked)
        : (detail?.value ?? doel.value ?? '')

    this.emitWaarde(this.padBasis, waarde)
  }

  /**
   * Reports the chosen unit under the same path, marked as `eenheid`.
   * @param event - The `vl-input` / `vl-change` event.
   */
  private onEenheid(event: Event): void {
    const detail = (event as CustomEvent<{ value?: string | string[] }>).detail
    const doel = event.target as HTMLElement & { value?: string | string[] }
    this.emitWaarde([...this.padBasis, 'eenheid'], detail?.value ?? doel.value ?? '')
  }

  /**
   * Emits one value with its path inside the form.
   * @param pad - The path.
   * @param waarde - The current value.
   */
  private emitWaarde(pad: string[], waarde: unknown): void {
    this.dispatchEvent(
      new CustomEvent('structuur-waarde', {
        bubbles: true,
        composed: true,
        detail: { pad, waarde },
      }),
    )
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'structuur-eigenschap-input': StructuurEigenschapInput
  }
}

customElements.define('structuur-eigenschap-input', StructuurEigenschapInput)
