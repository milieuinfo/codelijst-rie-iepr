/**
 * @file Landing page for the RIE-IEPR proofs of concept.
 *
 * Deployed at the root of the GitHub Pages site; the two POCs live in the
 * `operationeel/` and `structuur/` subfolders (see `Jenkinsfile.groovy`).
 * The asset URLs are relative (`base: './'`), so the same build works on
 * GitHub Pages and behind any other subpath.
 *
 * In development the POCs run on their own Vite servers (ports 3000 and 3001).
 */

import { LitElement, css, html } from 'lit'
import layoutStyle from '@domg/govflanders-style/common/layout.css.js'
import { vlMarginStyles } from '@domg-wc/styles/layout/margin/vl-margin.css.js'
import { vlGridStyles } from '@domg-wc/styles/layout/grid/vl-grid.css.js'

/** One proof of concept shown as a card. */
interface PocKaart {
  titel: string
  beschrijving: string
  /** Path in production, relative to the landing page. */
  pad: string
  /** Dev server of the POC. */
  devUrl: string
}

const POCS: PocKaart[] = [
  {
    titel: 'Operationele gegevens',
    beschrijving:
      'Kies een thema en vul de operationele velden in: conditionele velden, meervoudige en samengestelde groepen, eenheden en keuzelijsten.',
    pad: './operationeel/',
    devUrl: 'http://localhost:3000/',
  },
  {
    titel: 'Structurele gegevens',
    beschrijving:
      'Kies een systeemtype en vul de vaste velden uit het datamodel en alle systeemeigenschappen van dat type in.',
    pad: './structuur/',
    devUrl: 'http://localhost:3001/',
  },
]

export class PocLanding extends LitElement {
  static override styles = [
    css`
      :host {
        display: block;
      }

      .poc-intro {
        max-width: 42rem;
      }

      .poc-kaarten {
        margin-top: var(--vl-spacing--large, 2rem);
      }

      .poc-kaart {
        display: flex;
        flex-direction: column;
        gap: var(--vl-spacing--small, 0.75rem);
        height: 100%;
        box-sizing: border-box;
        padding: 1.5rem;
        border: 1px solid #e0e0e0;
        border-radius: 0.3rem;
        background: var(--vl-color--white, #fff);
      }

      .poc-kaart__titel {
        margin: 0;
        font-size: 1.25rem;
      }

      .poc-kaart__tekst {
        margin: 0;
        flex: 1 1 auto;
      }

      .poc-kaart__actie {
        align-self: flex-start;
      }

      .poc-voettekst {
        display: block;
        margin-top: var(--vl-spacing--large, 2rem);
      }
    `,
    vlMarginStyles,
    vlGridStyles,
    layoutStyle,
  ]

  override render() {
    return html`
      <div class="vl-page">
        <main class="vl-main-content">
          <div class="vl-region">
            <div class="vl-layout">
              <h1>RIE-IEPR POC's</h1>
              <p class="poc-intro">
                Proofs of concept voor het invullen van de RIE-IEPR-gegevens. Kies hieronder welke
                gegevens je wil bekijken.
              </p>

              <div class="vl-grid poc-kaarten">
                ${POCS.map(
                  (poc) => html`<div class="vl-column vl-column--s-12 vl-column--6">
                    <article class="poc-kaart">
                      <h2 class="poc-kaart__titel">${poc.titel}</h2>
                      <p class="poc-kaart__tekst">${poc.beschrijving}</p>
                      <vl-button
                        class="poc-kaart__actie"
                        cta-link="${this.link(poc)}"
                        secondary
                        >Open de POC</vl-button
                      >
                    </article>
                  </div>`,
                )}
              </div>

              <vl-text class="poc-voettekst" small annotation>
                Deze proofs of concept gebruiken dummy-invoer; er wordt niets bewaard. Vlaamse
                overheid — Departement Omgeving.
              </vl-text>
            </div>
          </div>
        </main>
      </div>
    `
  }

  /**
   * The production link is relative to the landing page; in development the
   * POCs run on their own Vite servers.
   * @param poc - The POC to link to.
   * @returns The href.
   */
  private link(poc: PocKaart): string {
    return import.meta.env.DEV ? poc.devUrl : poc.pad
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'poc-landing': PocLanding
  }
}

customElements.define('poc-landing', PocLanding)
