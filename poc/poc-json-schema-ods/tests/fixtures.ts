import JSZip from 'jszip';
import type { JsonSchemaObject } from 'codelijst-rie-iepr-poc-json-schema';
import type { TabularPlan } from '../src/models/tabular-plan.js';
import { compileTabularPlan, hash } from '../src/services/tabular-plan.js';

export const object = (properties: Record<string, JsonSchemaObject>, extra: JsonSchemaObject = {}): JsonSchemaObject =>
  ({ type: 'object', additionalProperties: false, properties, ...extra });
export const text: JsonSchemaObject = { type: 'string' };
export const numeric: JsonSchemaObject = { type: 'number' };
export const array = (items: JsonSchemaObject, title?: string): JsonSchemaObject => ({ type: 'array', items, title });
export const identifier: JsonSchemaObject = { type: 'string', title: 'Nummer', 'x-jsonld-id': 'http://purl.org/dc/terms/identifier' };

export function plan(schema: JsonSchemaObject): TabularPlan {
  return compileTabularPlan({ $id: 'https://example.test/section', ...schema }, { sourceSha256: hash('synthetic source') });
}

export const reportingSchema = object({
  active: { type: 'boolean', title: 'Actief' },
  records: array(object({
    identifier,
    enabled: { type: 'boolean', title: 'Ingeschakeld' },
    amount: { type: 'number', title: 'Hoeveelheid' },
    count: { type: 'integer', title: 'Aantal' },
    note: { type: 'string', title: 'Toelichting' },
    date: { type: 'string', format: 'date', title: 'Datum' },
    instant: { type: 'string', format: 'date-time', title: 'Tijdstip' },
    duration: { type: 'string', format: 'duration', title: 'Duur' },
    period: object({ start: { ...text, format: 'date' }, end: { ...text, format: 'date' } }, { required: ['start', 'end'], 'x-temporal-range': true }),
    quantity: object({ numericValue: numeric, hasUnit: { ...text, const: 'urn:unit:mass' } }, { title: 'Meetwaarde', required: ['numericValue', 'hasUnit'] }),
    details: object({ note: text }),
    conditional: { ...text, title: 'Voorwaardelijk' },
    selections: array({ ...text, enum: ['urn:choice:a', 'urn:choice:b'] }, 'Keuzen'),
    children: array(object({
      value: numeric,
      grandchildren: array(object({ value: numeric }), 'Kleinkinderen'),
    }), 'Kinderen'),
    siblings: array(object({ note: text }), 'Onafhankelijke notities'),
  }, { required: ['identifier'] }), 'Records'),
}, {
  title: 'Synthetische rapportage',
  allOf: [{
    if: { required: ['active'], properties: { active: { const: true } } },
    then: { properties: { records: { items: { required: ['conditional'] } } } },
    else: { properties: { records: { items: { properties: { conditional: { not: {} } } } } } },
  }],
});

export function instance() {
  return {
    active: false,
    records: [
      {
        identifier: '0001', enabled: false, amount: 0, count: 2,
        note: '  A < B & C "quoted" 😀\t\nline two\rwith carriage return  ',
        date: '2024-02-29', instant: '2024-01-02T10:00:00+02:00', duration: 'PT1H30M',
        period: { start: '2024-01-01', end: '2024-12-31' },
        quantity: { numericValue: 0.123456789012345, hasUnit: 'urn:unit:mass' },
        details: {}, selections: ['urn:choice:a', 'urn:choice:b'],
        children: [{ value: 1, grandchildren: [{ value: 11 }, { value: 12 }] }, { value: 2 }],
        siblings: [{ note: 'one' }, {}],
      },
      { identifier: '0002', selections: [], children: [{ value: 3 }], siblings: [] },
    ],
  };
}

function regex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function tableRows(input: Uint8Array, sheet: string): Promise<string[]> {
  const zip = await JSZip.loadAsync(input);
  const xml = await zip.file('content.xml')!.async('string');
  const body = xml.match(new RegExp(`<table:table table:name="${regex(sheet)}"[^>]*>([\\s\\S]*?)</table:table>`))?.[1];
  if (!body) throw new Error(`Missing test sheet ${sheet}.`);
  return [...body.matchAll(/<table:table-row\b[^>]*>[\s\S]*?<\/table:table-row>/g)].map(match => match[0]);
}

export async function modifyTable(
  input: Uint8Array, sheet: string, change: (rows: string[]) => string[],
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(input);
  const xml = await zip.file('content.xml')!.async('string');
  const pattern = new RegExp(`(<table:table table:name="${regex(sheet)}"[^>]*>)([\\s\\S]*?)(</table:table>)`);
  const updated = xml.replace(pattern, (_match, start: string, body: string, end: string) => {
    const first = body.indexOf('<table:table-row');
    const rows = [...body.slice(first).matchAll(/<table:table-row\b[^>]*>[\s\S]*?<\/table:table-row>/g)].map(match => match[0]);
    return start + body.slice(0, first) + change(rows).join('') + end;
  });
  if (updated === xml) throw new Error(`Test mutation did not change ${sheet}.`);
  zip.file('content.xml', updated);
  return zip.generateAsync({ type: 'uint8array' });
}

export function cells(row: string): string[] {
  return [...row.matchAll(/<table:table-cell\b[^>]*\/>|<table:table-cell\b[^>]*>[\s\S]*?<\/table:table-cell>/g)].map(match => match[0]);
}

export function row(cells: string[]): string {
  return `<table:table-row>${cells.join('')}</table:table-row>`;
}
