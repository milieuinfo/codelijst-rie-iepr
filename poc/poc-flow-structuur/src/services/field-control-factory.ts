/**
 * @file Factory for the vl-* form controls, driven by `relevantDataType`
 * (plan 06, taak 2). Returns only the control element; the caller adds the
 * label, the unit and the validation messages.
 */

import { html } from 'lit'
import { DECIMAAL_REGEX, INTEGER_REGEX, getalType } from './getal.js'

export const DataType = {
  BOOLEAN: 'xsd:boolean',
  DATE: 'xsd:date',
  DATETIME: 'xsd:dateTime',
  TEXT: 'default',
} as const

/** Options for one control. */
export interface ControlOptions {
  id: string
  name: string
  label: string
  required: boolean
  /** `relevantDataType`, e.g. `xsd:decimal`. */
  dataType?: string
  /** Render a `vl-textarea` instead of a `vl-input-field`. */
  multiline?: boolean
}

/**
 * Creates a vl-* form control based on an XSD data type.
 * @param options - The control configuration.
 * @returns The Lit template of the control.
 */
export function createControl(options: ControlOptions) {
  const { id, name, label, required, dataType, multiline } = options

  if (multiline) {
    return html`<vl-textarea
      id="${id}"
      name="${name}"
      label="${label}"
      ?required="${required}"
      rows="3"
    ></vl-textarea>`
  }

  if (dataType === DataType.BOOLEAN) {
    return html`<vl-checkbox id="${id}" name="${name}" label="${label}" ?required="${required}"></vl-checkbox>`
  }

  if (dataType === DataType.DATE) {
    return html`<vl-datepicker
      id="${id}"
      name="${name}"
      label="${label}"
      ?required="${required}"
    ></vl-datepicker>`
  }

  if (dataType === DataType.DATETIME) {
    return html`<vl-datepicker
      id="${id}"
      name="${name}"
      label="${label}"
      type="date-time"
      ?required="${required}"
    ></vl-datepicker>`
  }

  const getal = getalType(dataType)
  if (getal) {
    return html`<vl-input-field
      id="${id}"
      name="${name}"
      label="${label}"
      type="text"
      .regex="${getal === 'integer' ? INTEGER_REGEX : DECIMAAL_REGEX}"
      ?required="${required}"
    ></vl-input-field>`
  }

  return html`<vl-input-field
    id="${id}"
    name="${name}"
    label="${label}"
    type="text"
    ?required="${required}"
  ></vl-input-field>`
}
