/**
 * @file Renders a repeated eigenschap (plan 06, taak 3 en 4).
 *
 * This component covers three of the four cases from the plan:
 * - meervoudig, niet composite → one input per row;
 * - composite, enkelvoudig → one fixed row with the children side by side;
 * - composite + meervoudig → column headers and one row with all children.
 *
 * Rows are tracked with stable ids (`crypto.randomUUID()`) and rendered with
 * Lit's `repeat` directive, so removing a row never shifts the input of another
 * row. A required eigenschap starts with one row that cannot be removed; an
 * optional one starts without rows (README-regel; MJV start steeds met één rij).
 */

import { LitElement, css, html, nothing } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { vlGridStyles } from '@domg-wc/styles/layout/grid/vl-grid.css.js'
import type { CodelistResult, Eigenschap } from '../models/index.js'
import { CsorService } from '../services/csor.js'
import { expandUri } from '../services/uri.js'
import { uriTooltip, veiligeDomId } from './uri-tooltip.js'
import './structuur-eigenschap-input.js'

const ACTIE_KOLOM_BREEDTE = 1

/**
 * Creates a stable id for a new row.
 * @returns A UUID, or a random fallback when `crypto.randomUUID` is unavailable.
 */
function nieuweRijId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `rij-${Math.random().toString(36).slice(2)}`
}

export class StructuurMeervoudigeEigenschap extends LitElement {
  static override styles = [
    css`
      :host {
        display: block;
        margin-bottom: var(--vl-spacing--medium, 1.5rem);
      }

      .structuur-rij {
        align-items: flex-start;
      }

      .structuur-kolomhoofd {
        display: flex;
        align-items: flex-end;
        gap: var(--vl-spacing--xsmall, 0.5rem);
        padding-bottom: var(--vl-spacing--xsmall, 0.5rem);
      }

      .structuur-actie {
        display: flex;
        justify-content: flex-end;
      }

      .structuur-verplicht {
        display: block;
        margin-bottom: var(--vl-spacing--small, 0.75rem);
      }

      /*
       * Zelfde correctie als in structuur-app: het veld is genest in een
       * vl-fieldset die de form-label-styles adopteert (host-regel
       * font-size: 62.5%), waardoor de tekst en de keuzelijsten per niveau
       * kleiner worden.
       */
      vl-fieldset {
        font-size: inherit;
      }
    `,
    vlGridStyles,
  ]

  eigenschap?: Eigenschap
  result?: CodelistResult
  csor: CsorService = new CsorService()

  private rijIds: string[] = []
  private _huidigeEigenschapId?: string

  static override properties = {
    eigenschap: { attribute: false },
    result: { attribute: false },
    csor: { attribute: false },
  }

  override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('eigenschap') && this.eigenschap?.id !== this._huidigeEigenschapId) {
      this._huidigeEigenschapId = this.eigenschap?.id
      this.rijIds = this.startRijen()
      this._meldRijen()
    }
  }

  override firstUpdated(): void {
    this._meldRijen()
  }

  /**
   * Initial rows: a required eigenschap starts with one (and only) row, an
   * optional repeated eigenschap starts empty, a single composite always has
   * exactly one row.
   * @returns The initial row ids.
   */
  private startRijen(): string[] {
    if (!this.eigenschap) return []
    if (!this.eigenschap.meervoudig) return [nieuweRijId()]
    return this.eigenschap.verplicht ? [nieuweRijId()] : []
  }

  override render() {
    const eigenschap = this.eigenschap
    if (!eigenschap) return nothing

    const velden = this.velden
    const samengesteld = eigenschap.kinderen.length > 0
    const kolomBreedte = Math.max(1, Math.floor((12 - ACTIE_KOLOM_BREEDTE) / velden.length))
    const label = eigenschap.verplicht ? `${eigenschap.label} (*)` : eigenschap.label

    const uri = this.result ? expandUri(this.result, eigenschap.id) : undefined
    const legendId = veiligeDomId(`${eigenschap.id}__legend`)

    return html`
      <vl-fieldset border>
        <span slot="legend" id="${legendId}">${label}</span>
        ${uriTooltip(legendId, uri)}
        ${eigenschap.verplicht
          ? html`<vl-text class="structuur-verplicht" small annotation
              >Er is minstens 1 ${eigenschap.label} verplicht.</vl-text
            >`
          : nothing}
        <div class="vl-grid">
          ${samengesteld ? this.renderKolomhoofdingen(velden, kolomBreedte) : nothing}
          ${repeat(
            this.rijIds,
            (rijId) => rijId,
            (rijId) => this.renderRij(velden, kolomBreedte, rijId, samengesteld),
          )}
          ${eigenschap.meervoudig
            ? html`<div class="vl-column vl-column--12">
                <vl-button icon="add" ghost type="button" @click="${this.voegRijToe}">
                  ${eigenschap.label} toevoegen
                </vl-button>
              </div>`
            : nothing}
        </div>
      </vl-fieldset>
    `
  }

  private get velden(): Eigenschap[] {
    return this.eigenschap && this.eigenschap.kinderen.length > 0 ? this.eigenschap.kinderen : [this.eigenschap!]
  }

  /**
   * Column headers for a composite: one label per child plus an empty action column.
   * @param velden - The children.
   * @param kolomBreedte - The width of each child column.
   * @returns The header row.
   */
  private renderKolomhoofdingen(velden: Eigenschap[], kolomBreedte: number) {
    return html`<div class="vl-column vl-column--12">
      <div class="vl-grid">
        ${velden.map(
          (veld) => {
            const labelId = veiligeDomId(`kolomhoofd__${veld.id}`)
            const uri = this.result ? expandUri(this.result, veld.id) : undefined
            return html`<div class="vl-column vl-column--${kolomBreedte}">
              <div class="structuur-kolomhoofd">
                <vl-form-label id="${labelId}" label="${veld.verplicht ? `${veld.label} (*)` : veld.label}"></vl-form-label>
                ${uriTooltip(labelId, uri)}
              </div>
            </div>`
          },
        )}
        <div class="vl-column vl-column--${ACTIE_KOLOM_BREEDTE}"></div>
      </div>
    </div>`
  }

  /**
   * One row: all children (or the eigenschap itself) plus the delete button.
   * @param velden - The fields in the row.
   * @param kolomBreedte - The width of each field column.
   * @param rijId - The stable row id.
   * @param samengesteld - Whether the row belongs to a composite.
   * @returns The row template.
   */
  private renderRij(velden: Eigenschap[], kolomBreedte: number, rijId: string, samengesteld: boolean) {
    const verwijderbaar = this.eigenschap?.meervoudig === true && this.rijIds.length > 1

    return html`<div class="vl-column vl-column--12">
      <div class="vl-grid structuur-rij">
        ${velden.map(
          (veld) => html`<div class="vl-column vl-column--${kolomBreedte}">
            <structuur-eigenschap-input
              .eigenschap="${veld}"
              .result="${this.result}"
              .csor="${this.csor}"
              .rijId="${rijId}"
              .pad="${[this.eigenschap!.id, rijId, ...(samengesteld ? [veld.id] : [])]}"
              .toonLabel="${!samengesteld}"
            ></structuur-eigenschap-input>
          </div>`,
        )}
        <div class="vl-column vl-column--${ACTIE_KOLOM_BREEDTE}">
          <div class="structuur-actie">
            ${this.eigenschap?.meervoudig
              ? html`<vl-button
                  icon="subtract-naked"
                  type="button"
                  tertiary
                  ?disabled="${!verwijderbaar}"
                  label="${this.eigenschap.label} rij verwijderen"
                  @click="${() => this.verwijderRij(rijId)}"
                ></vl-button>`
              : nothing}
          </div>
        </div>
      </div>
    </div>`
  }

  private voegRijToe(): void {
    this.rijIds = [...this.rijIds, nieuweRijId()]
    this._meldRijen()
    this.requestUpdate()
  }

  /**
   * Removes one row; the last row of a required eigenschap stays.
   * @param rijId - The row to remove.
   */
  private verwijderRij(rijId: string): void {
    if (this.rijIds.length <= 1 && this.eigenschap?.verplicht) return
    this.rijIds = this.rijIds.filter((id) => id !== rijId)
    this._meldRijen()
    this.requestUpdate()
  }

  /** Tells the app which rows exist, so the debug panel can show them. */
  private _meldRijen(): void {
    this.dispatchEvent(
      new CustomEvent('structuur-rijen', {
        bubbles: true,
        composed: true,
        detail: { eigenschapId: this.eigenschap?.id, rijIds: [...this.rijIds] },
      }),
    )
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'structuur-meervoudige-eigenschap': StructuurMeervoudigeEigenschap
  }
}

customElements.define('structuur-meervoudige-eigenschap', StructuurMeervoudigeEigenschap)
