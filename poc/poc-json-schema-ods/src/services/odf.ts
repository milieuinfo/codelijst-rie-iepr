import JSZip from 'jszip';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { CellValue, TabularColumn } from '../models/tabular-plan.js';
import { isObject } from './record-codec.js';

export function escapeXml(value: string): string {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\uD800-\uDFFF\uFFFE\uFFFF]/u.test(value)) throw new Error('Value contains characters that cannot be represented in XML 1.0.');
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;').replace(/\r/g, '&#13;');
}

export function columnLetter(index: number): string {
  let result = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result;
  return result;
}

export function odfCell(value?: CellValue, column?: TabularColumn, validation?: string, cellStyle?: string): string {
  const type = column?.schema.type;
  const style = cellStyle ?? (column?.schema.format === 'date-time' ? 'dateTimeCell'
    : column?.schema.format === 'date' || column?.temporalRangePart ? 'dateCell'
    : column?.schema.format === 'duration' ? 'durationCell'
    : type === 'integer' ? 'integerCell' : type === 'number' ? 'decimalCell'
    : type === 'string' ? 'textCell' : 'cell');
  let attributes = ` table:style-name="${style}"`;
  if (validation) attributes += ` table:content-validation-name="${escapeXml(validation)}"`;
  if (value === undefined) return `<table:table-cell${attributes}/>`;
  let text = String(value);
  if (typeof value === 'number') attributes += ` office:value-type="float" office:value="${value}"`;
  else if (typeof value === 'boolean') {
    attributes += ` office:value-type="boolean" office:boolean-value="${value}"`;
    text = value ? 'Ja' : 'Nee';
  } else if (column?.schema.format === 'date' || column?.schema.format === 'date-time' || column?.temporalRangePart) {
    attributes += ` office:value-type="date" office:date-value="${escapeXml(value)}"`;
  } else if (column?.schema.format === 'duration') {
    attributes += ` office:value-type="time" office:time-value="${escapeXml(value)}"`;
  } else attributes += ' office:value-type="string"';
  // text:s preserves repeated/leading spaces; text:p preserves line breaks.
  const paragraphs = text.split('\n').map(line => `<text:p>${line.split(/( +|\t)/).map(part =>
    /^ +$/.test(part) ? `<text:s text:c="${part.length}"/>` : part === '\t' ? '<text:tab/>' : escapeXml(part),
  ).join('')}</text:p>`).join('');
  return `<table:table-cell${attributes}>${paragraphs}</table:table-cell>`;
}

export function odfRow(cells: string[], hidden = false, header = false, repeat = 1): string {
  return `<table:table-row table:style-name="${header ? 'headerRow' : 'dataRow'}"${hidden ? ' table:visibility="collapse"' : ''}${repeat > 1 ? ` table:number-rows-repeated="${repeat}"` : ''}>${cells.join('')}</table:table-row>`;
}

export interface OdfCell {
  type?: string;
  value?: string;
  text: string;
  formula?: string;
}

export interface OdfTable {
  name: string;
  rows: { number: number; cells: OdfCell[] }[];
}

function nodes(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every(isObject)) throw new Error('Malformed ordered ODF XML.');
  return value;
}

function children(node: Record<string, unknown>, tag: string): Record<string, unknown>[] {
  return Object.hasOwn(node, tag) ? nodes(node[tag]) : [];
}

function attributes(node: Record<string, unknown>): Record<string, unknown> {
  const value = node[':@'];
  return isObject(value) ? value : {};
}

function attribute(node: Record<string, unknown>, name: string): string | undefined {
  const value = attributes(node)[`@_${name}`];
  if (value !== undefined && typeof value !== 'string') throw new Error(`Invalid ODF attribute ${name}.`);
  return value;
}

function count(node: Record<string, unknown>, name: string): number {
  const value = attribute(node, name) ?? '1';
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`Invalid ODF repeat count: ${value}.`);
  return Number(value);
}

function textContent(parts: Record<string, unknown>[]): string {
  return parts.map(part => {
    if (typeof part['#text'] === 'string') return part['#text'];
    if (Object.hasOwn(part, 's')) {
      const spaces = count(part, 'c');
      if (spaces > 100_000) throw new Error('ODF text expansion exceeds the supported size.');
      return ' '.repeat(spaces);
    }
    if (Object.hasOwn(part, 'tab')) return '\t';
    if (Object.hasOwn(part, 'line-break')) return '\n';
    const tag = Object.keys(part).find(key => key !== ':@');
    return tag ? textContent(children(part, tag)) : '';
  }).join('');
}

export async function readOdf(input: Uint8Array): Promise<OdfTable[]> {
  if (input.length > 100_000_000) throw new Error('Workbook exceeds the supported input size.');
  const zip = await JSZip.loadAsync(input);
  if (await zip.file('mimetype')?.async('string') !== 'application/vnd.oasis.opendocument.spreadsheet') {
    throw new Error('Not an OpenDocument spreadsheet.');
  }
  const xml = await zip.file('content.xml')?.async('string');
  if (!xml || xml.length > 20_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Missing, oversized or unsupported ODF content.');
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error(`Malformed ODF XML: ${valid.err.msg}`);
  const parser = new XMLParser({
    ignoreAttributes: false, preserveOrder: true, removeNSPrefix: true,
    parseTagValue: false, parseAttributeValue: false, trimValues: false,
    htmlEntities: true,
  });
  const parsed: unknown = parser.parse(xml);
  const document = nodes(parsed).find(node => Object.hasOwn(node, 'document-content'));
  if (!document) throw new Error('Missing ODF document-content.');
  const body = children(document, 'document-content').find(node => Object.hasOwn(node, 'body'));
  const spreadsheet = body && children(body, 'body').find(node => Object.hasOwn(node, 'spreadsheet'));
  if (!spreadsheet) throw new Error('Missing ODF spreadsheet.');
  const tables: OdfTable[] = [];
  for (const table of children(spreadsheet, 'spreadsheet').filter(node => Object.hasOwn(node, 'table'))) {
    const name = attribute(table, 'name');
    if (!name || tables.some(existing => existing.name === name)) throw new Error('Missing or duplicate worksheet name.');
    const rows: OdfTable['rows'] = [];
    let number = 1;
    for (const row of children(table, 'table').filter(node => Object.hasOwn(node, 'table-row'))) {
      const cells: OdfCell[] = [];
      let column = 0;
      for (const cell of children(row, 'table-row')) {
        const tag = Object.hasOwn(cell, 'table-cell') ? 'table-cell' : Object.hasOwn(cell, 'covered-table-cell') ? 'covered-table-cell' : undefined;
        if (!tag) continue;
        const type = attribute(cell, 'value-type');
        const text = children(cell, tag).filter(node => Object.hasOwn(node, 'p')).map(node => textContent(children(node, 'p'))).join('\n');
        const value = attribute(cell, 'value') ?? attribute(cell, 'boolean-value') ??
          attribute(cell, 'date-value') ?? attribute(cell, 'time-value');
        const formula = attribute(cell, 'formula');
        const repeat = count(cell, 'number-columns-repeated');
        if (column + repeat > 1024 && (text.length || type || value !== undefined || formula)) throw new Error('Worksheet exceeds 1024 populated columns.');
        if (column < 1024) for (let i = 0; i < Math.min(repeat, 1024 - column); i++) {
          cells.push({ type, text, value, formula });
        }
        column += repeat;
      }
      const repeat = count(row, 'number-rows-repeated');
      if (cells.some(cell => cell.type !== undefined || cell.text.length || cell.value !== undefined || cell.formula)) {
        if (rows.length + repeat > 100_000) throw new Error('Worksheet exceeds 100000 populated rows.');
        for (let i = 0; i < repeat; i++) rows.push({ number: number + i, cells });
      }
      number += repeat;
    }
    tables.push({ name, rows });
  }
  return tables;
}
