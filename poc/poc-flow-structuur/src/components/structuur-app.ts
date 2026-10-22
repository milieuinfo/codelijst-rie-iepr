/**
 * @file Root component (plannen 04, 05 en 06): loads the RIE-IEPR codelist once,
 * lets the user pick a systeemtype and renders the fixed datamodel fields plus
 * all systeemeigenschappen of that type.
 *
 * State is deliberately minimal and in memory only (the POC has no backend and
 * persists nothing):
 * - `selectedTypeId` / `selectedSysteem` drive the form;
 * - `waarden` keeps the last value per value path, only to feed the debug panel
 *   ("Toon waarden");
 * - `rijen` keeps the row ids per repeated eigenschap, so the debug panel can
 *   show repeated and composite values in their nested shape.
 */

import { LitElement, css, html, nothing } from 'lit'
import layoutStyle from '@domg/govflanders-style/common/layout.css.js'
import { vlMarginStyles } from '@domg-wc/styles/layout/margin/vl-margin.css.js'
import { CodelistService } from '../services/codelist-service.js'
import { CsorService } from '../services/csor.js'
import { getEigenschappen, getSysteem } from '../services/structuur-service.js'
import type { CodelistResult, Eigenschap, SysteemSleutel } from '../models/index.js'
import { SYSTEEMVELDEN, naarEigenschap } from './structuur-systeemvelden.js'
import './structuur-type-selector.js'
import './structuur-eigenschap.js'

export class StructuurApp extends LitElement {
  static override styles = [
    css`
      :host {
        display: block;
      }

      .structuur-sectie {
        margin-top: var(--vl-spacing--medium, 1.5rem);
        margin-bottom: var(--vl-spacing--large, 2rem);
      }

      .structuur-waarden {
        max-height: 24rem;
        overflow: auto;
        padding: var(--vl-spacing--small, 0.75rem);
        background: var(--vl-color--grey-100, #f7f9fc);
        font-size: 1.3rem;
        white-space: pre-wrap;
      }

      /*
       * @domg-wc/components 2.16: vl-fieldset adopts the form-label styles, whose
       * :host rule "font-size: 62.5%" shrinks the font of everything inside the
       * fieldset (nested fieldsets compound it). Text that inherits — such as the
       * options of a vl-select-rich — becomes unreadably small. Restore the
       * inherited body size on the fieldset host.
       */
      vl-fieldset {
        font-size: inherit;
      }
    `,
    vlMarginStyles,
    layoutStyle,
  ]

  readonly codelistService = new CodelistService()
  readonly csor = new CsorService()

  private result?: CodelistResult
  private loadError?: string
  private selectedTypeId?: string
  private selectedSysteem?: SysteemSleutel
  private toonWaarden = false

  /** Last value per value path (JSON-encoded path). */
  private waarden = new Map<string, unknown>()
  /** Row ids per repeated eigenschap. */
  private rijen = new Map<string, string[]>()

  static override properties = {
    result: { attribute: false, state: true },
    loadError: { attribute: false, state: true },
    selectedTypeId: { attribute: false, state: true },
    selectedSysteem: { attribute: false, state: true },
    toonWaarden: { type: Boolean, state: true },
  }

  override firstUpdated(): void {
    this.loadCodelist()
  }

  private async loadCodelist(): Promise<void> {
    try {
      this.result = await this.codelistService.loadCodelist()
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : String(error)
      console.error('Kon de codelijst niet laden:', error)
    }
    this.requestUpdate()
  }

  /**
   * Switches type: the form is rebuilt from scratch, so collected values are dropped.
   * @param event - The `type-select` event of the selector.
   */
  private onTypeSelect(event: CustomEvent<{ systeem?: SysteemSleutel; typeId?: string }>): void {
    this.selectedTypeId = event.detail.typeId
    this.selectedSysteem = event.detail.systeem
    this.waarden.clear()
    this.rijen.clear()
    this.toonWaarden = false
    this.requestUpdate()
  }

  private onWaarde(event: CustomEvent<{ pad: string[]; waarde: unknown }>): void {
    const sleutel = JSON.stringify(event.detail.pad)
    const waarde = event.detail.waarde
    const leeg =
      waarde === '' ||
      waarde === undefined ||
      waarde === null ||
      (Array.isArray(waarde) && waarde.length === 0)

    if (leeg) {
      this.waarden.delete(sleutel)
    } else {
      this.waarden.set(sleutel, waarde)
    }
    if (this.toonWaarden) this.requestUpdate()
  }

  private onRijen(event: CustomEvent<{ eigenschapId: string; rijIds: string[] }>): void {
    this.rijen.set(event.detail.eigenschapId, event.detail.rijIds)
    if (this.toonWaarden) this.requestUpdate()
  }

  private get eigenschappen(): Eigenschap[] {
    if (!this.result || !this.selectedSysteem || !this.selectedTypeId) return []
    return getEigenschappen(this.result, this.selectedSysteem, this.selectedTypeId)
  }

  override render() {
    return html`
      <div class="vl-page">
        <main class="vl-main-content">
          <div class="vl-region">
            <div class="vl-layout">
              <h1>RIE-IEPR Structuur POC</h1>
              <p>
                Kies een systeemtype. De vaste velden komen uit het RIE-IEPR datamodel en de
                systeemeigenschappen uit de codelijst van dat type.
              </p>

              ${this.loadError
                ? html`<vl-alert
                    type="error"
                    title="Kon de codelijst niet laden"
                    message="${this.loadError}"
                  ></vl-alert>`
                : !this.result
                  ? html`<p>Codelijsten laden...</p>`
                  : this.renderFormulier()}
            </div>
          </div>
        </main>
      </div>
    `
  }

  private renderFormulier() {
    return html`
      <structuur-type-selector
        .result="${this.result}"
        .selectedTypeId="${this.selectedTypeId}"
        .selectedSysteem="${this.selectedSysteem}"
        @type-select="${this.onTypeSelect}"
      ></structuur-type-selector>

      ${this.selectedTypeId && this.selectedSysteem
        ? this.renderType(this.selectedSysteem)
        : html`<p class="vl-margin--small">Selecteer een systeemtype om de gegevens te tonen.</p>`}
    `
  }

  /**
   * The form of one type: the fixed fields from the datamodel, then the
   * systeemeigenschappen, then the debug panel.
   * @param systeem - The system of the selected type.
   * @returns The form template.
   */
  private renderType(systeem: SysteemSleutel) {
    const systeemConfig = getSysteem(systeem, this.result)
    const eigenschappen = this.eigenschappen

    return html`<div
      class="structuur-sectie"
      @structuur-waarde="${this.onWaarde}"
      @structuur-rijen="${this.onRijen}"
    >
      <vl-fieldset class="structuur-sectie">
        <span slot="legend">Vaste gegevens</span>
        <structuur-systeemvelden .systeem="${systeem}"></structuur-systeemvelden>
      </vl-fieldset>

      <vl-fieldset class="structuur-sectie">
        <span slot="legend">Systeemeigenschappen</span>
        ${eigenschappen.length === 0
          ? html`<p>
              Voor ${systeemConfig?.label ?? systeem} zijn geen systeemeigenschappen gedefinieerd.
            </p>`
          : eigenschappen.map(
              (eigenschap) => html`<structuur-eigenschap
                .eigenschap="${eigenschap}"
                .result="${this.result}"
                .csor="${this.csor}"
              ></structuur-eigenschap>`,
            )}
      </vl-fieldset>

      <vl-button secondary type="button" @click="${() => (this.toonWaarden = !this.toonWaarden)}">
        ${this.toonWaarden ? 'Verberg waarden' : 'Toon waarden'}
      </vl-button>

      ${this.toonWaarden
        ? html`<pre class="structuur-waarden" data-testid="waarden">${this.waardenJson()}</pre>`
        : nothing}
    </div>`
  }

  /**
   * Builds the debug JSON: the selected type, then every field with a value.
   * A composite is nested as `deeleigenschappen` per row.
   * @returns Pretty-printed JSON.
   */
  private waardenJson(): string {
    const vasteVelden = (SYSTEEMVELDEN[this.selectedSysteem ?? ''] ?? [])
      .map((veld) => naarEigenschap(veld))
      .map((veld) => this.eigenschapWaarde(veld))
      .filter(Boolean)

    const velden = [
      ...vasteVelden,
      ...this.eigenschappen.map((eigenschap) => this.eigenschapWaarde(eigenschap)).filter(Boolean),
    ]

    return JSON.stringify(
      {
        systeem: this.selectedSysteem,
        type: this.selectedTypeId,
        velden,
      },
      null,
      2,
    )
  }

  /**
   * One rendered value, with its unit when the user picked one.
   * @param eigenschap - The field.
   * @param pad - The value path.
   * @returns The debug object, or undefined when the field is empty.
   */
  private veldObject(eigenschap: Eigenschap, pad: string[]) {
    const waarde = this.waarden.get(JSON.stringify(pad))
    if (waarde === undefined) return undefined

    const eenheid = this.waarden.get(JSON.stringify([...pad, 'eenheid']))
    return {
      type: eigenschap.id,
      ...(eenheid ? { eenheid } : {}),
      waarde,
    }
  }

  /**
   * The debug shape of one eigenschap: plain, repeated or composite.
   * @param eigenschap - The eigenschap.
   * @returns The debug object, or undefined when it has no values.
   */
  private eigenschapWaarde(eigenschap: Eigenschap): unknown {
    if (eigenschap.kinderen.length > 0) {
      const rijen = this.rijen.get(eigenschap.id) ?? []
      const waarden = rijen
        .map((rijId) => {
          const deeleigenschappen = eigenschap.kinderen
            .map((kind) => this.veldObject(kind, [eigenschap.id, rijId, kind.id]))
            .filter(Boolean)
          return deeleigenschappen.length > 0 ? { deeleigenschappen } : undefined
        })
        .filter(Boolean)
      return waarden.length > 0 ? { type: eigenschap.id, waarden } : undefined
    }

    if (eigenschap.meervoudig) {
      const rijen = this.rijen.get(eigenschap.id) ?? []
      const waarden = rijen
        .map((rijId) => this.veldObject(eigenschap, [eigenschap.id, rijId]))
        .filter(Boolean)
      return waarden.length > 0 ? { type: eigenschap.id, waarden } : undefined
    }

    return this.veldObject(eigenschap, [eigenschap.id])
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'structuur-app': StructuurApp
  }
}

customElements.define('structuur-app', StructuurApp)
