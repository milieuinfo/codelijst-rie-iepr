/**
 * @file Hover tooltip showing the full codelist URI of one concept.
 *
 * A `vl-tooltip` (from `@domg-wc/components`) is attached to the field label
 * (or legend / thema label) via its DOM id; on hover it shows the full
 * published URI of the concept or scheme the field refers to, e.g.
 * `https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-lucht/brandstof`.
 *
 * The tooltip must be rendered in the **same shadow root** as the reference
 * element: the component resolves the reference through its own root node,
 * so call this helper from the component that also renders the label.
 *
 * Registered in `src/main.ts` (VlTooltipComponent).
 */

import { html, nothing } from 'lit'
import type { TemplateResult } from 'lit'

/**
 * Makes a codelist id safe to use as a DOM id. `vl-tooltip` resolves its
 * reference element with `querySelector('#<for>')`, and a CSS `#id` selector
 * throws on characters such as `:` — which every codelist CURIE contains.
 * Use this for both the element's `id` and the tooltip's `for`.
 * @param id - The codelist id (or derived DOM id) to sanitize.
 * @returns A CSS-safe id.
 */
export function veiligeDomId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * Renders the URI tooltip for one reference element.
 * @param referenceId - The DOM id of the element to attach the tooltip to.
 * @param uri - The full published URI, or undefined to render nothing.
 * @returns The tooltip template, or nothing when there is no URI to show.
 */
export function uriTooltip(referenceId: string, uri: string | undefined): TemplateResult | typeof nothing {
  if (!uri) return nothing
  return html`<vl-tooltip for="${referenceId}">${uri}</vl-tooltip>`
}
