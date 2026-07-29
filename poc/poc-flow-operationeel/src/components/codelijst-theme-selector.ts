/**
 * @file Theme selector component: step 1 of the user flow. Lets the
 * user pick a thema from the `thema-type` conceptscheme and, when the
 * selected thema has narrower concepts, a sub-thema from among those.
 */

import { LitElement, html, css } from 'lit'
import { CodelistService } from '../services/codelist-service.js'
import type { CodelistResult } from '../services/codelist-service.js'
import { vlMarginStyles } from '@domg-wc/styles/layout/margin/vl-margin.css.js'

const THEMA_SCHEME_ID = 'conceptscheme:thema_type'

/**
 * Theme selector element.
 * @fires theme-select - Fired whenever the thema or sub-thema changes. `detail: { themeId, subThemeId }`.
 */
export class CodelijstThemeSelector extends LitElement {
  // Rendered inline in the vl- form grid; layout/spacing come from vl-* styles, not custom CSS.
  static override styles = [vlMarginStyles, css`
    :host {
      display: block;
    }
  `]

  result?: CodelistResult
  selectedThemeId?: string
  selectedSubThemeId?: string
  codelistService?: CodelistService

  static override properties = {
    result: { attribute: false },
    selectedThemeId: { attribute: false },
    selectedSubThemeId: { attribute: false },
    codelistService: { attribute: false },
  }

  get _service(): CodelistService {
    return this.codelistService ??= new CodelistService()
  }

  override render() {
    if (!this.result) {
      return html`<vl-select id="thema" name="thema" label="Thema" disabled></vl-select>`
    }

    const themaScheme = this.result.schemes.get(THEMA_SCHEME_ID)
    // The thema_type scheme has no prefLabel in the source data (see ISSUES.md); fall back to a fixed Dutch label.
    const themaLabel = themaScheme?.prefLabel ?? 'Thema'

    const themaOptions = this._service
      .getTopLevelConcepts(this.result, THEMA_SCHEME_ID)
      .map(concept => ({ value: concept.id, label: concept.prefLabel ?? concept.id, selected: concept.id === this.selectedThemeId }))

    const selectedThema = this.selectedThemeId ? this.result.concepts.get(this.selectedThemeId) : undefined
    const subThemes = selectedThema ? this._service.getChildren(this.result, selectedThema) : []

    return html`
      <vl-form-label for="thema" label="${themaLabel}" block .annotation="${themaScheme?.definition ?? ''}"></vl-form-label>
      <vl-select
        id="thema"
        name="thema"
        placeholder="Selecteer een thema..."
        .options="${themaOptions}"
        .value="${this.selectedThemeId ?? ''}"
        @vl-input="${this._onThemaInput}"
      ></vl-select>

      ${subThemes.length > 0
        ? html`
            <div class="vl-margin--medium">
              <vl-form-label for="sub-thema" label="Sub-thema" block .annotation="${selectedThema?.definition ?? ''}"></vl-form-label>
              <vl-select
                id="sub-thema"
                name="sub-thema"
                placeholder="Selecteer een sub-thema..."
                .options="${subThemes.map(c => ({ value: c.id, label: c.prefLabel ?? c.id, selected: c.id === this.selectedSubThemeId }))}"
                .value="${this.selectedSubThemeId ?? ''}"
                @vl-input="${this._onSubThemaInput}"
              ></vl-select>
            </div>
          `
        : ''}
    `
  }

  private _onThemaInput(event: CustomEvent<{ value: string }>) {
    this.selectedThemeId = event.detail.value || undefined
    this.selectedSubThemeId = undefined
    this._emitSelection()
  }

  private _onSubThemaInput(event: CustomEvent<{ value: string }>) {
    this.selectedSubThemeId = event.detail.value || undefined
    this._emitSelection()
  }

  private _emitSelection() {
    this.dispatchEvent(
      new CustomEvent('theme-select', {
        bubbles: true,
        composed: true,
        detail: { themeId: this.selectedThemeId, subThemeId: this.selectedSubThemeId },
      })
    )
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'codelijst-theme-selector': CodelijstThemeSelector
  }
}

customElements.define('codelijst-theme-selector', CodelijstThemeSelector)
