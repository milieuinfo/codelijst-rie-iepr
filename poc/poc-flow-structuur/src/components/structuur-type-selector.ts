/**
 * @file The systeemtype selector (plan 04).
 *
 * One searchable dropdown with every visible type of the six systemen, grouped
 * per systeem and indented by type depth. Types with `isOnzichtbaar = true`
 * never appear (`getTypes` already filtered them); their visible subtypes do.
 */

import { LitElement, css, html, nothing } from 'lit'
import type { CodelistResult, StructuurType, SysteemSleutel } from '../models/index.js'
import { getSysteem, getSystemen, getTypes } from '../services/structuur-service.js'
import { expandUri } from '../services/uri.js'
import { uriTooltip } from './uri-tooltip.js'

/** Two non-breaking spaces per nesting level, so the indentation survives in a dropdown. */
const INSCHUIVING = '\u00A0\u00A0'

export class StructuurTypeSelector extends LitElement {
  static override styles = [
    css`
      :host {
        display: block;
      }

      .structuur-samenvatting {
        display: block;
        margin-top: var(--vl-spacing--small, 0.75rem);
      }

      .structuur-meetbaar {
        display: block;
        margin-top: var(--vl-spacing--xsmall, 0.5rem);
      }
    `,
  ]

  result?: CodelistResult
  selectedTypeId?: string
  selectedSysteem?: SysteemSleutel

  static override properties = {
    result: { attribute: false },
    selectedTypeId: { attribute: false },
    selectedSysteem: { attribute: false },
  }

  override render() {
    if (!this.result) {
      return html`<vl-select-rich id="systeemtype" label="Systeemtype" disabled></vl-select-rich>`
    }

    const geselecteerd = this.geselecteerdeType

    return html`
      <vl-form-label for="systeemtype" label="Systeemtype" block></vl-form-label>
      <vl-select-rich
        id="systeemtype"
        name="systeemtype"
        placeholder="Selecteer een systeemtype..."
        search
        search-placeholder="Zoek een systeemtype..."
        .options="${this.opties}"
        .value="${this.selectedTypeId ?? ''}"
        @vl-change="${this.onSelectie}"
        @vl-input="${this.onSelectie}"
      ></vl-select-rich>

      ${geselecteerd ? this.renderSamenvatting(geselecteerd) : nothing}
    `
  }

  /**
   * All options, grouped per systeem. Labels are indented by type depth.
   * @returns The grouped options.
   */
  get opties() {
    if (!this.result) return []

    return getSystemen(this.result)
      .map((systeem) => {
        const types = getTypes(this.result!, systeem.sleutel)
        return {
          label: systeem.label,
          value: `systeem:${systeem.sleutel}`,
          choices: types.map((type) => ({
            value: type.id,
            label: `${INSCHUIVING.repeat(type.diepte)}${type.label}`,
            selected: type.id === this.selectedTypeId,
          })),
        }
      })
      .filter((groep) => groep.choices.length > 0)
  }

  /**
   * The currently selected type, with its systeem.
   * @returns The type, or undefined when nothing (valid) is selected.
   */
  get geselecteerdeType(): (StructuurType & { systeemLabel: string }) | undefined {
    if (!this.result || !this.selectedTypeId || !this.selectedSysteem) return undefined
    const type = getTypes(this.result, this.selectedSysteem).find(
      (kandidaat) => kandidaat.id === this.selectedTypeId,
    )
    if (!type) return undefined
    const systeem = getSysteem(this.selectedSysteem, this.result)
    return { ...type, systeemLabel: systeem?.label ?? this.selectedSysteem }
  }

  /**
   * Shows the systeem, the definition and the `isMeetbaar` flag of the selection.
   * @param type - The selected type.
   * @returns The summary template.
   */
  private renderSamenvatting(type: StructuurType & { systeemLabel: string }) {
    // The summary + its URI tooltip live in one wrapper div (the tooltip's
    // reference), so the tooltip can never outlive the element it is attached
    // to when the selection is cleared.
    const uri = this.result ? expandUri(this.result, type.id) : undefined
    return html`
      <div id="geselecteerde-type">
        <vl-text class="structuur-samenvatting" small>
          <strong>${type.systeemLabel}</strong> — ${type.label}${type.definitie ? `: ${type.definitie}` : ''}
        </vl-text>
        ${uriTooltip('geselecteerde-type', uri)}
      </div>
      ${type.isMeetbaar
        ? html`<vl-text class="structuur-meetbaar" small annotation>Dit systeemtype is meetbaar.</vl-text>`
        : nothing}
    `
  }

  /**
   * Emits the selected type (or an empty selection when the user clears it).
   * @param event - The `vl-input` / `vl-change` event.
   */
  private onSelectie(event: Event): void {
    const detail = (event as CustomEvent<{ value?: string | string[] }>).detail
    const waarde = Array.isArray(detail?.value) ? detail.value[0] : detail?.value
    const typeId = waarde ? String(waarde) : undefined

    if (!typeId || !this.result) {
      this.dispatchEvent(
        new CustomEvent('type-select', {
          bubbles: true,
          composed: true,
          detail: { systeem: undefined, typeId: undefined },
        }),
      )
      return
    }

    const systeem = getSystemen(this.result).find((kandidaat) =>
      getTypes(this.result!, kandidaat.sleutel).some((type) => type.id === typeId),
    )

    this.dispatchEvent(
      new CustomEvent('type-select', {
        bubbles: true,
        composed: true,
        detail: { systeem: systeem?.sleutel, typeId },
      }),
    )
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'structuur-type-selector': StructuurTypeSelector
  }
}

customElements.define('structuur-type-selector', StructuurTypeSelector)
