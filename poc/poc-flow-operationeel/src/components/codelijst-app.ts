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

      /* ---- Breadcrumb / flow navigation bar ---- */
      .flow-nav {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: var(--vl-spacing--small);
        padding: 0.5rem 0;
      }
      .flow-nav button {
        font-size: 0.875rem;
        color: var(--vl-color--text-alt, #687483);
        background: none;
        border: none;
        cursor: pointer;
        text-decoration: underline;
        padding: 0;
      }
      .flow-nav button:hover {
        color: var(--vl-color--primary, #12528a);
      }
      .flow-nav .separator {
        color: var(--vl-color--text-alt, #687483);
        user-select: none;
      }
    `,
    vlMarginStyles,
    layoutStyle,
  ]

  public readonly codelistService = new CodelistService()

  private result?: CodelistResult
  private loadError?: string
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

  private onThemeSelect(event: CustomEvent<{ themeId?: string; subThemeId?: string }>) {
    this.selectedThemeId = event.detail.themeId
    this.selectedSubThemeId = event.detail.subThemeId
    // Reset flow stack when theme changes
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
                      <p class="vl-margin--small">Selecteer een thema om de bijbehorende operationele velden te bekijken.</p>

                      <codelijst-theme-selector
                        .result="${this.result}"
                        .selectedThemeId="${this.selectedThemeId}"
                        .selectedSubThemeId="${this.selectedSubThemeId}"
                        .codelistService="${this.codelistService}"
                        @theme-select="${this.onThemeSelect}"
                      ></codelijst-theme-selector>

                       ${this.currentSchemeId
                         ? html`
                             ${this.renderFlowNav()}
                             <div class="vl-fieldset-wrapper">
                               <vl-fieldset>
                                 <span slot="legend">${this.renderLegend()}</span>
                                 <codelijst-operationeel-fields
                                   style="margin-top: var(--vl-spacing--xsmall, 0.5rem)"
                                   .result="${this.result}"
                                   .schemeId="${this.currentSchemeId}"
                                   .codelistService="${this.codelistService}"
                                   @flow-navigate="${this.onFlowNavigate}"
                                 ></codelijst-operationeel-fields>
                               </vl-fieldset>
                             </div>
                           `
                         : (this.selectedThemeId ? html`<p>Voor dit thema zijn geen operationele gegevens gedefinieerd.</p>` : nothing)}
                  `}
            </div>
          </div>
        </main>
      </div>
    `
  }

  /** Render breadcrumb navigation when in a sub-flow step. */
  private renderFlowNav() {
    if (this.flowStack.length <= 1) return nothing

    const baseStep = this.flowStack[0]
    const baseScheme = this.result?.schemes.get(baseStep.schemeId)
    const baseLabel = baseScheme?.prefLabel ?? 'Overzicht'

    return html`
      <nav class="flow-nav" aria-label="Navigatie">
        <button @click="${this.goToBase}">← ${baseLabel}</button>
        <span class="separator">/</span>
        <span>Huidige stap</span>
      </nav>
    `
  }

  /** Render the fieldset legend with scheme label and flow context. */
  private renderLegend(): string {
    const current = this.currentSchemeId
    if (!current || !this.result) return 'Operationele gegevens'
    const scheme = this.result.schemes.get(current)
    return scheme?.prefLabel ? `${scheme.prefLabel}` : 'Operationele gegevens'
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'codelijst-app': CodelijstApp
  }
}

customElements.define('codelijst-app', CodelijstApp)
