/**
 * @file Renders the fixed fields of a systeem (plan 05).
 *
 * These fields are **not hardcoded** in the UI: `scripts/build-systeemvelden.mjs`
 * reads the `owl:Restriction`s of each class in `riepr.ttl` and writes
 * `src/generated/systeemvelden.json`. Change the datamodel → rerun
 * `npm run sync:velden` (also part of `predev`/`prebuild`).
 *
 * The fields are converted to the same `Eigenschap` view the systeemeigenschappen
 * use, so repetition, units and validation behave identically.
 */

import { LitElement, css, html, nothing } from 'lit'
import { vlGridStyles } from '@domg-wc/styles/layout/grid/vl-grid.css.js'
import systeemvelden from '../generated/systeemvelden.json'
import type { Eigenschap, SysteemSleutel, Systeemveld } from '../models/index.js'
import './structuur-eigenschap.js'

/** The generated fields per systeem, typed once. */
export const SYSTEEMVELDEN = systeemvelden as Record<string, Systeemveld[]>

/**
 * Converts a generated datamodel field to the `Eigenschap` view.
 * @param veld - One generated field.
 * @returns The eigenschap to render.
 */
export function naarEigenschap(veld: Systeemveld): Eigenschap {
  return {
    id: `systeemveld:${veld.property.replace(/^:/, '')}`,
    label: veld.label,
    definitie: veld.opmerking ?? undefined,
    verplicht: veld.verplicht,
    meervoudig: veld.meervoudig,
    dataType: veld.datatype === 'adms:Identifier' ? 'xsd:string' : veld.datatype,
    multiline: veld.property === 'rdfs:comment',
    multiselect: false,
    kinderen: [],
  }
}

export class StructuurSysteemvelden extends LitElement {
  static override styles = [
    css`
      :host {
        display: block;
      }

      .structuur-datamodel {
        display: block;
        margin-bottom: var(--vl-spacing--small, 0.75rem);
      }
    `,
    vlGridStyles,
  ]

  systeem?: SysteemSleutel

  static override properties = {
    systeem: { type: String },
  }

  override render() {
    const velden = SYSTEEMVELDEN[this.systeem ?? ''] ?? []
    if (velden.length === 0) return nothing

    return html`
      <div class="vl-grid">
        <div class="vl-column vl-column--12">
          <vl-text class="structuur-datamodel" small annotation>
            Deze vaste velden komen uit het RIE-IEPR datamodel (riepr.ttl).
          </vl-text>
        </div>
        ${velden.map(
          (veld) => html`<div class="vl-column vl-column--12">
            <structuur-eigenschap .eigenschap="${naarEigenschap(veld)}"></structuur-eigenschap>
          </div>`,
        )}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'structuur-systeemvelden': StructuurSysteemvelden
  }
}

customElements.define('structuur-systeemvelden', StructuurSysteemvelden)
