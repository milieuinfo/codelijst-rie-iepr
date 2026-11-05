import type { TabularColumn } from '../models/tabular-plan.js';

/** Match the supplied Teepak workbooks without depending on their business data. */
export const automaticStyles =
  '<number:text-style style:name="textFormat"><number:text-content/></number:text-style>' +
  '<number:number-style style:name="integerFormat"><number:number number:decimal-places="0" number:grouping="true"/></number:number-style>' +
  '<number:number-style style:name="decimalFormat"><number:number number:decimal-places="15" number:min-decimal-places="0" number:grouping="true"/></number:number-style>' +
  '<number:date-style style:name="dateFormat">' + dateParts() + '</number:date-style>' +
  '<number:date-style style:name="dateTimeFormat">' + dateParts() + '<number:text> </number:text>' + timeParts() + '</number:date-style>' +
  '<number:time-style style:name="durationFormat" number:truncate-on-overflow="false">' + timeParts() + '</number:time-style>' +
  '<style:style style:name="cell" style:family="table-cell">' +
  '<style:table-cell-properties fo:padding="0.04in" style:vertical-align="middle"/>' +
  '<style:text-properties style:font-name="Arial" fo:font-family="Arial" fo:font-size="11pt"/>' +
  '</style:style>' +
  '<style:style style:name="headerCell" style:family="table-cell" style:parent-style-name="cell">' +
  '<style:table-cell-properties fo:background-color="#447A6D" fo:border-bottom="0.75pt solid #365F55" fo:padding="0.08in" style:vertical-align="middle" fo:wrap-option="wrap"/>' +
  '<style:paragraph-properties fo:text-align="start"/><style:text-properties fo:font-weight="bold" fo:color="#FFFFFF"/>' +
  '</style:style>' +
  ['text', 'integer', 'decimal', 'date', 'dateTime', 'duration'].map(name =>
    `<style:style style:name="${name}Cell" style:family="table-cell" style:parent-style-name="cell" style:data-style-name="${name}Format"/>`).join('') +
  '<style:style style:name="headerRow" style:family="table-row"><style:table-row-properties style:row-height="50pt" style:use-optimal-row-height="false"/></style:style>' +
  '<style:style style:name="dataRow" style:family="table-row"><style:table-row-properties style:row-height="20pt" style:use-optimal-row-height="false"/></style:style>' +
  [0.9, 1.1, 1.4, 1.8, 2.4, 3].map(width =>
    `<style:style style:name="column${String(width).replace('.', '_')}" style:family="table-column"><style:table-column-properties style:column-width="${width}in"/></style:style>`).join('') +
  '<style:style style:name="hiddenTable" style:family="table"><style:table-properties table:display="false"/></style:style>';

function dateParts(): string {
  return '<number:day number:style="long"/><number:text>.</number:text><number:month number:style="long"/><number:text>.</number:text><number:year number:style="long"/>';
}

function timeParts(): string {
  return '<number:hours number:style="long"/><number:text>:</number:text><number:minutes number:style="long"/><number:text>:</number:text><number:seconds number:style="long"/>';
}

export function columnStyle(column?: TabularColumn): string {
  const schema = column?.schema;
  const width = ['hasUnit', 'unitCode'].includes(column?.path.at(-1) ?? '') ? 0.9
    : schema?.format === 'date-time' ? 1.8
    : schema?.format === 'date' || schema?.type === 'number' || schema?.type === 'integer' ? 1.4
    : column && (schema?.enum || schema?.['x-reference-types'] || schema?.['x-inline-array']) ? 1.8
    : column && column.title.length > 25 ? 2.4 : 1.8;
  return 'column' + String(width).replace('.', '_');
}
