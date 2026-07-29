/**
 * @file Factory for rendering vl-* form controls based on XSD/SKOS data types.
 * Replaces the switch statement in `codelijst-operationeel-fields.ts` with a
 * strategy/map lookup pattern.
 */

import { html } from 'lit'

export const DataType = {
  BOOLEAN: 'xsd:boolean',
  DATE: 'xsd:date',
  DATETIME: 'xsd:dateTime',
  TEMPORAL_RANGE: 'dcterms:temporal',
  NUMERIC: ['xsd:decimal', 'xsd:integer', 'xsd:double', 'xsd:float'],
  DURATION: 'xsd:duration',
  TEXT: 'default',
} as const

type HtmlReturn = ReturnType<typeof html>
type ControlWithHandlerFn = (i: string, n: string, l: string, r: boolean, handler: unknown) => HtmlReturn
type ControlNoHandlerFn = (i: string, n: string, l: string, r: boolean) => HtmlReturn

const NO_HANDLER: Record<string, ControlNoHandlerFn> = {
  [DataType.BOOLEAN]: (i, n, l, r) =>
    html`<vl-checkbox id="${i}" name="${n}" label="${l}" ?required="${r}"></vl-checkbox>`,

  [DataType.DATE]: (i, n, l, r) =>
    html`<vl-datepicker id="${i}" name="${n}" label="${l}" ?required="${r}"></vl-datepicker>`,

  [DataType.DATETIME]: (i, n, l, r) =>
    html`<vl-datepicker id="${i}" name="${n}" label="${l}" ?required="${r}"></vl-datepicker>`,

  [DataType.TEMPORAL_RANGE]: (i, n, l, r) =>
    html`<vl-datepicker id="${i}" name="${n}" label="${l}" type="range" ?required="${r}"></vl-datepicker>`,
}

for (const numericType of DataType.NUMERIC) {
  NO_HANDLER[numericType] = (i, n, l, r) =>
    html`<vl-input-field id="${i}" name="${n}" label="${l}" type="number" ?required="${r}"></vl-input-field>`
}

NO_HANDLER[DataType.DURATION] = (i, n, l, r) =>
  html`<vl-input-field id="${i}" name="${n}" label="${l}" type="text" pattern="[0-9]+:[0-2][0-9]:[0-5][0-9]:[0-5][0-9]" placeholder="dd:hh:mm:ss" ?required="${r}"></vl-input-field>`

NO_HANDLER[DataType.TEXT] = (i, n, l, r) =>
  html`<vl-input-field id="${i}" name="${n}" label="${l}" type="text" ?required="${r}"></vl-input-field>`

const WITH_HANDLER: Record<string, ControlWithHandlerFn> = {
  [DataType.BOOLEAN]: (i, n, l, r, h) =>
    html`<vl-checkbox id="${i}" name="${n}" label="${l}" ?required="${r}" @vl-change="${h}"></vl-checkbox>`,

  [DataType.DATE]: (i, n, l, r, h) =>
    html`<vl-datepicker id="${i}" name="${n}" label="${l}" ?required="${r}" @vl-input="${h}"></vl-datepicker>`,

  [DataType.DATETIME]: (i, n, l, r, h) =>
    html`<vl-datepicker id="${i}" name="${n}" label="${l}" ?required="${r}" @vl-input="${h}"></vl-datepicker>`,

  [DataType.TEMPORAL_RANGE]: (i, n, l, r, h) =>
    html`<vl-datepicker id="${i}" name="${n}" label="${l}" type="range" ?required="${r}" @vl-input="${h}"></vl-datepicker>`,
}

for (const numericType of DataType.NUMERIC) {
  WITH_HANDLER[numericType] = (i, n, l, r, h) =>
    html`<vl-input-field id="${i}" name="${n}" label="${l}" type="number" ?required="${r}" @vl-input="${h}"></vl-input-field>`
}

WITH_HANDLER[DataType.DURATION] = (i, n, l, r, h) =>
  html`<vl-input-field id="${i}" name="${n}" label="${l}" type="text" pattern="[0-9]+:[0-2][0-9]:[0-5][0-9]:[0-5][0-9]" placeholder="dd:hh:mm:ss" ?required="${r}" @vl-input="${h}"></vl-input-field>`

WITH_HANDLER[DataType.TEXT] = (i, n, l, r, h) =>
  html`<vl-input-field id="${i}" name="${n}" label="${l}" type="text" ?required="${r}" @vl-input="${h}"></vl-input-field>`

/**
 * Creates a vl-* form control based on an XSD/SKOS data type string.
 * Returns only the control element — callers should wrap it in their own
 * `<vl-form-label>` where needed.
 */
export function createControl(
  id: string,
  name: string,
  label: string,
  required: boolean,
  dataType?: string,
  inputHandler?: unknown,
): HtmlReturn {
  const key = dataType ?? DataType.TEXT
  if (inputHandler !== undefined && WITH_HANDLER[key]) {
    return WITH_HANDLER[key](id, name, label, required, inputHandler)
  }
  return NO_HANDLER[key]?.(id, name, label, required) ?? NO_HANDLER[DataType.TEXT](id, name, label, required)
}
