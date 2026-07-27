/**
 * @file Root application component. Loads the RIE-IEPR codelist once
 * and drives the user flow: pick a thema/sub-thema, then render the
 * operationeel-* scheme it resolves to via `relevantRiepr`.
 */

import { LitElement, html, css, nothing } from 'lit'
import { vlMarginStyles } from '@domg-wc/styles/layout/margin/vl-margin.css.js'
import { CodelistService } from '../services/codelist-service.js'
import type { CodelistResult } from '../services/codelist-service.js'
import './codelijst-theme-selector.js'
import './codelijst-operationeel-fields.js'

export class CodelijstApp extends LitElement {
  static override styles = [
    css`
      :host {
        display: block;
      }
    `,
    vlMarginStyles,
  ]

  private codelistService = new CodelistService()

  private result?: CodelistResult
  private loadError?: string
  private selectedThemeId?: string
  private selectedSubThemeId?: string

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
    this.requestUpdate()
  }

  /**
   * Resolves the operationeel-* scheme id from the currently selected theme/sub-theme via `relevantRiepr`.
   * @returns The scheme id if found, otherwise undefined.
   */
  private get operationeelSchemeId(): string | undefined {
    if (!this.result) return undefined
    const themeConcept = this.result.concepts.get(this.selectedSubThemeId ?? this.selectedThemeId ?? '')
    if (!themeConcept) return undefined
    const refs = this.codelistService.getRelevantRieprRefs(this.result, themeConcept)
    const scheme = refs.find(ref => ref.type?.includes('skos:ConceptScheme'))
    return scheme?.id
  }

  override render() {
    return html`
      <div class="vl-margin--medium">
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
                  @theme-select="${this.onThemeSelect}"
                ></codelijst-theme-selector>

                ${this.operationeelSchemeId
                  ? html`
                      <vl-fieldset class="vl-margin--small">
                        <span slot="legend">Operationele gegevens</span>
                        <codelijst-operationeel-fields
                          .result="${this.result}"
                          .schemeId="${this.operationeelSchemeId}"
                        ></codelijst-operationeel-fields>
                      </vl-fieldset>
                    `
                  : (this.selectedThemeId ? html`<p>Voor dit thema zijn geen operationele gegevens gedefinieerd.</p>` : nothing)}
              `}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'codelijst-app': CodelijstApp
  }
}

customElements.define('codelijst-app', CodelijstApp)
