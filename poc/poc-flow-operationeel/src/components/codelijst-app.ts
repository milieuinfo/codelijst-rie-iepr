/**
 * @file Root application component. Loads the RIE-IEPR codelist once
 * and drives the user flow: pick a thema/sub-thema, then render the
 * operationeel-* scheme it resolves to via `seeAlso`. Supports multi-step
 * flows where structural selection chains to sub-schemes (e.g., lucht →
 * feature selection → rapportering).
 */

import { LitElement, html, css, nothing } from 'lit'
import { vlMarginStyles } from '@domg-wc/styles/layout/margin/vl-margin.css.js'
import layoutStyle from '@domg/govflanders-style/common/layout.css.js'
import { CodelistService } from '../services/codelist-service.js'
import type { CodelistResult } from '../services/codelist-service.js'
import './codelijst-theme-selector.js'
import './codelijst-operationeel-fields.js'

/** Entry in the navigation stack for multi-step seeAlso flows. */
interface FlowStep {
  /** The conceptscheme being rendered at this step. */
  schemeId: string
  /** The concept that triggered navigation to this step (for back-navigation context), or undefined for the base step. */
  triggerConceptId?: string
}

export class CodelijstApp extends LitElement {
  static override styles = [
    css`
      :host {
        display: block;
      }

      /* ---- Fieldset wrapper for operationele gegevens section ---- */
      .vl-fieldset-wrapper {
        margin-top: var(--vl-spacing--medium);
        margin-bottom: var(--vl-spacing--large);
      }
    `,
    vlMarginStyles,
    layoutStyle,
  ]

  public readonly codelistService = new CodelistService()

  private result?: CodelistResult
  private loadError?: string
  private selectedYear?: number
  private selectedThemeId?: string
  private selectedSubThemeId?: string

  /** Stack of schemes rendered in the current flow path. Base step has no triggerConceptId. */
  private flowStack: FlowStep[] = []

  override firstUpdated(): void {
    this.loadCodelist()
  }

  private async loadCodelist(): Promise<void> {
    try {
      this.result = await this.codelistService.loadCodelist()
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : String(error)
      console.error('Kon codelijst niet laden:', error)
    }
    this.requestUpdate()
  }

  private onYearSelect(event: CustomEvent<{ value: string }>) {
    const val = Number(event.detail.value)
    if (!Number.isNaN(val) && val > 0) {
      this.selectedYear = val
    } else {
      this.selectedYear = undefined
    }
    this.requestUpdate()
  }

  private onThemeSelect(event: CustomEvent<{ themeId?: string; subThemeId?: string }>) {
    this.selectedThemeId = event.detail.themeId
    this.selectedSubThemeId = event.detail.subThemeId
    this.flowStack = []
    this.resolveBaseScheme()
    this.requestUpdate()
  }

  /** Resolve the base operationeel scheme from the selected theme and push it onto the flow stack. */
  private resolveBaseScheme(): void {
    if (!this.result) return
    const themeConcept = this.result.concepts.get(this.selectedSubThemeId ?? this.selectedThemeId ?? '')
    if (!themeConcept) return

    const schemeId = this.codelistService.resolveOperationeelSchemeId(this.result, themeConcept)
    if (schemeId) {
      this.flowStack = [{ schemeId }]
    } else {
      this.flowStack = []
    }
  }

  /** Handle navigation to a sub-scheme triggered by seeAlso on a structural concept. */
  private onFlowNavigate(event: CustomEvent<{ schemeId: string; triggerConceptId: string }>) {
    this.flowStack.push({
      schemeId: event.detail.schemeId,
      triggerConceptId: event.detail.triggerConceptId,
    })
    this.requestUpdate()
  }

  /** Navigate back one step in the flow stack. */
  private goBack(): void {
    if (this.flowStack.length > 1) {
      this.flowStack.pop()
      this.requestUpdate()
    }
  }

  /** Reset to base scheme (pop everything except the first entry). */
  private goToBase(): void {
    if (this.flowStack.length > 1) {
      this.flowStack = [this.flowStack[0]]
      this.requestUpdate()
    }
  }

  /** The current scheme being rendered (top of the flow stack). */
  private get currentSchemeId(): string | undefined {
    return this.flowStack[this.flowStack.length - 1]?.schemeId
  }

  override render() {
    return html`
      <div class="vl-page">
        <main class="vl-main-content">
          <div class="vl-region">
            <div class="vl-layout">
              <h1>RIE-IEPR Codelijst POC</h1>

              ${this.loadError
                ? html`<vl-alert type="error" title="Kon codelijst niet laden" message="${this.loadError}"></vl-alert>`
                : !this.result
                  ? html`<p>Codelijsten laden...</p>`
            : html`
                       <vl-form-label for="productie-jaar" label="Productie jaar" block></vl-form-label>
                       <vl-select
                         id="productie-jaar"
                         name="productie-jaar"
                         placeholder="Selecteer een productie jaar..."
                         .options="${this.getProductieJaarOptions()}"
                         .value="${String(this.selectedYear ?? '')}"
                         @vl-input="${this.onYearSelect}"
                       ></vl-select>

                       ${this.selectedYear
                         ? html`
                             <p class="vl-margin--small">Selecteer een thema voor ${this.selectedYear} om de bijbehorende operationele velden te bekijken.</p>

                             <codelijst-theme-selector
                               .result="${this.result}"
                               .selectedThemeId="${this.selectedThemeId}"
                               .selectedSubThemeId="${this.selectedSubThemeId}"
                               .codelistService="${this.codelistService}"
                               @theme-select="${this.onThemeSelect}"
                             ></codelijst-theme-selector>

                  ${this.currentSchemeId
                    ? html`${this.renderAllFlowSteps()}`
                : (this.selectedThemeId ? html`<p>Voor dit thema zijn geen operationele gegevens gedefinieerd.</p>` : nothing)}
                             `
                         : nothing}
                  `}
            </div>
          </div>
        </main>
      </div>
    `
  }

  /** Build year options: current year ± range for historical and future reporting periods. */
  private getProductieJaarOptions(): { value: string; label: string }[] {
    const currentYear = new Date().getFullYear()
    const years: { value: string; label: string }[] = []
    for (let y = currentYear - 5; y <= currentYear + 2; y++) {
      years.push({ value: String(y), label: String(y) })
    }
    return years
  }

  /** Render ALL flow steps simultaneously so no previous selection disappears. Only the last step listens for flow-navigate. */
  private renderAllFlowSteps() {
    return html`
      ${this.flowStack.map((step, idx) => {
        const scheme = this.result?.schemes.get(step.schemeId)
        const isLast = idx === this.flowStack.length - 1
        return html`
          <div class="vl-fieldset-wrapper">
            <vl-fieldset>
              <span slot="legend">${scheme?.prefLabel ?? 'Operationele gegevens'}</span>
              <codelijst-operationeel-fields
                style="margin-top: var(--vl-spacing--xsmall, 0.5rem)"
                .result="${this.result}"
                .schemeId="${step.schemeId}"
                .codelistService="${this.codelistService}"
                ?data-is-last="${isLast}"
                @flow-navigate="${isLast ? this.onFlowNavigate : nothing}"
              ></codelijst-operationeel-fields>
            </vl-fieldset>
          </div>
          ${isLast && this.flowStack.length > 1
            ? html`
                <div style="margin-top: var(--vl-spacing--small); display: flex; gap: var(--vl-spacing--small);">
                  <vl-button secondary @click="${this.goBack}">← Terug naar vorige stap</vl-button>
                  <vl-button secondary @click="${this.goToBase}">← Terug naar overzicht</vl-button>
                </div>
              `
            : nothing}
        `
      })}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'codelijst-app': CodelijstApp
  }
}

customElements.define('codelijst-app', CodelijstApp)
