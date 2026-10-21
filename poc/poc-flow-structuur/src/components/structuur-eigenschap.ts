/**
 * @file Dispatcher for one systeemeigenschap (plan 06, taak 1).
 *
 * | Geval | Weergave |
 * |---|---|
 * | enkelvoudig, niet composite | `<structuur-eigenschap-input>` |
 * | meervoudig | `<structuur-meervoudige-eigenschap>` |
 * | composite (enkelvoudig of meervoudig) | `<structuur-meervoudige-eigenschap>` met kolommen |
 */

import { LitElement, css, html, nothing } from 'lit'
import type { CodelistResult, Eigenschap } from '../models/index.js'
import { CsorService } from '../services/csor.js'
import './structuur-eigenschap-input.js'
import './structuur-meervoudige-eigenschap.js'

export class StructuurEigenschap extends LitElement {
  static override styles = [
    css`
      :host {
        display: block;
        margin-bottom: var(--vl-spacing--medium, 1.5rem);
      }
    `,
  ]

  eigenschap?: Eigenschap
  result?: CodelistResult
  csor: CsorService = new CsorService()

  static override properties = {
    eigenschap: { attribute: false },
    result: { attribute: false },
    csor: { attribute: false },
  }

  override render() {
    const eigenschap = this.eigenschap
    if (!eigenschap) return nothing

    const samengesteld = eigenschap.kinderen.length > 0

    if (!eigenschap.meervoudig && !samengesteld) {
      return html`<structuur-eigenschap-input
        .eigenschap="${eigenschap}"
        .result="${this.result}"
        .csor="${this.csor}"
        data-eigenschap-wrapper="${eigenschap.id}"
      ></structuur-eigenschap-input>`
    }

    return html`<structuur-meervoudige-eigenschap
      .eigenschap="${eigenschap}"
      .result="${this.result}"
      .csor="${this.csor}"
    ></structuur-meervoudige-eigenschap>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'structuur-eigenschap': StructuurEigenschap
  }
}

customElements.define('structuur-eigenschap', StructuurEigenschap)
