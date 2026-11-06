import JSZip from 'jszip';
import { isDeepStrictEqual } from 'node:util';
import { materializeDerivedValues, transformMemberData } from 'codelijst-rie-iepr-poc-json-schema';
import type { ReferenceRecord, ReferenceContext } from 'codelijst-rie-iepr-poc-json-schema';
import type { CellValue, TabularPlan, WorkbookRow } from '../models/tabular-plan.js';
import { cellValue, workbookRows } from './record-codec.js';
import { columnLetter, escapeXml, odfCell, odfRow } from './odf.js';
import { automaticStyles, columnStyle } from './workbook-styles.js';
import { businessLayout, identifierColumn, inputColumns, keyComponentsForParent, layoutColumns, parentColumn, parentKeyComponents, parentTitle, quantityValueColumn, technicalColumns } from './workbook-layout.js';
import { machineColumns } from './json-mapping.js';
import { ODSImporter } from './ods-importer.js';
import { encodedKeyValues } from './table-key.js';
export { technicalColumns } from './workbook-layout.js';

const templateRows = 1000;

export interface ODSOptions {
  plan: TabularPlan;
  data?: unknown;
  references?: ReferenceRecord[];
  referenceContext?: ReferenceContext;
  label?: (value: string) => string;
  validationData?: { data: unknown; references?: ReferenceRecord[]; referenceContext?: ReferenceContext };
}

export class ODSGenerator {
  async generate(options: ODSOptions): Promise<Uint8Array> {
    const { tables, metadata } = workbookRows(options.plan, options);
    const business = businessLayout(options.plan);
    const validations: string[] = [];
    const lookupRows = [
      odfRow([odfCell('@lookups:v1')], true),
      odfRow(['Sleutel', 'Keuzelijst', 'Keuze', 'Waarde', 'Datatype'].map(value => odfCell(value, undefined, undefined, 'headerCell')), false, true),
    ];
    let lookupRow = 3;
    for (const record of options.plan.records) for (const column of record.columns) {
      if (business && !inputColumns(record).includes(column)) continue;
      const choices = metadata.lookups[column.id];
      if (!choices?.length) continue;
      const first = lookupRow;
      for (const choice of choices) {
        lookupRows.push(odfRow([
          odfCell(column.id), odfCell(`${record.title}: ${column.title}`), odfCell(choice.display),
          odfCell(String(choice.value)), odfCell(typeof choice.value),
        ]));
        lookupRow++;
      }
      validations.push(listValidation(column.id, 'Keuzelijsten', 'C', first, lookupRow - 1, !!column.schema['x-inline-array']));
    }
    if (business) for (const record of options.plan.records.filter(record => parentColumn(options.plan, record))) {
      const parent = options.plan.records.find(parent => parent.id === record.parentId)!;
      const identifier = identifierColumn(parent);
      if (!identifier) throw new Error(`${parent.sheetName}: a business identifier is required for the parent dropdown.`);
      const index = layoutColumns(options.plan, parent).indexOf(identifier.id);
      if (index < 0) throw new Error(`${parent.sheetName}: the parent dropdown requires a visible business identifier.`);
      validations.push(listValidation(`parent_${record.id}`, parent.sheetName, columnLetter(index), 4,
        3 + tables.get(parent.id)!.length + templateRows));
    }
    for (const record of options.plan.records.filter(record => parentKeyComponents(options.plan, record).length)) {
      const parent = options.plan.records.find(candidate => candidate.id === record.parentId)!;
      for (const component of parentKeyComponents(options.plan, record)) {
        const index = layoutColumns(options.plan, parent).indexOf(component.column.id);
        if (index < 0) throw new Error(`${parent.sheetName}: x-table-key requires a visible parent input column.`);
        validations.push(listValidation(component.id, parent.sheetName, columnLetter(index), 4,
          3 + tables.get(parent.id)!.length + templateRows, !!component.column.schema['x-inline-array']));
      }
    }
    const rowsById = new Map([...tables.values()].flat().map(row => [row.id, row]));
    const sheets = options.plan.records.map(record => {
      const fields = business ? inputColumns(record) : record.columns;
      const keyComponents = parentKeyComponents(options.plan, record);
      const columns = layoutColumns(options.plan, record);
      const headings = fields.map(column => column.title + (column.required ? ' *' : ''));
      const rows = [
        odfRow([odfCell(metadata.jsonMapping[record.id].pathTemplate)], true),
        odfRow(machineColumns(options.plan, record.id).map(value => odfCell(value)), true),
        odfRow((business ? [...keyComponents.map(component => component.column.title), ...(parentColumn(options.plan, record) ? [parentTitle(options.plan, record)] : []), ...headings]
          : ['Rij-ID', 'Bovenliggende rij-ID', 'Containers', 'Referentie', 'Bovenliggende referentie',
            ...keyComponents.map(component => component.column.title), ...headings])
          .map(value => odfCell(value, undefined, undefined, 'headerCell')), false, true),
      ];
      const dataRows: (WorkbookRow | undefined)[] = [...tables.get(record.id)!];
      if (record.id !== 'root') dataRows.push(...Array.from({ length: 10 }, () => undefined));
      let blankCells: string[] = [];
      for (const row of dataRows) {
        const keyCells = keyComponents.map(component => {
          const parentRow = row?.parentId ? rowsById.get(row.parentId) : undefined;
          let value: CellValue | undefined;
          if (parentRow) {
            const raw = encodedKeyValues(parentRow.values, [component])[0];
            value = component.column.schema['x-inline-array'] ? JSON.stringify(raw) : raw as CellValue;
            const choices = metadata.lookups[component.column.id];
            if (choices && typeof value === 'string') {
              const label = (item: unknown) => {
                const choice = choices.find(choice => choice.value === item);
                if (!choice) throw new Error(`Unknown selection in ${record.title}: ${component.column.title}.`);
                return choice.display;
              };
              if (component.column.schema['x-inline-array']) {
                const selected = (JSON.parse(value) as unknown[]).map(label);
                value = selected.length === 1 ? selected[0] : JSON.stringify(selected);
              } else value = label(value);
            }
          }
          return odfCell(value, component.column, component.id);
        });
        const cells = business ? [...keyCells, ...(parentColumn(options.plan, record)
          ? [odfCell(row?.parentReference, undefined, `parent_${record.id}`, 'textCell')] : [])] : [
          odfCell(row?.id), odfCell(row?.parentId), odfCell(row ? JSON.stringify(row.containers) : undefined),
          odfCell(row?.reference), odfCell(row?.parentReference),
          ...keyCells,
        ];
        for (const column of fields) {
          let value: CellValue | undefined = row?.values[column.id];
          const quantity = quantityValueColumn(record, column);
          if (!row && cellValue(column.schema.const) && (!quantity || quantity.required)) value = column.schema.const;
          if (value !== undefined && metadata.lookups[column.id] && typeof value === 'string') {
            const display = (value: unknown) => {
              const choice = metadata.lookups[column.id].find(choice => choice.value === value);
              if (!choice) throw new Error(`Unknown selection in ${record.title}: ${column.title}.`);
              return choice.display;
            };
            if (column.schema['x-inline-array']) {
              const items = (JSON.parse(value) as unknown[]).map(display);
              value = items.length === 1 ? items[0] : JSON.stringify(items);
            } else value = display(value);
          }
          cells.push(odfCell(value, column, metadata.lookups[column.id] ? column.id : undefined));
        }
        rows.push(odfRow(cells));
        if (!row) blankCells = cells;
      }
      if (business && record.id !== 'root') {
        rows.push(odfRow(blankCells, false, false, templateRows - 10));
      }
      const styles = columns.map(id => columnStyle(fields.find(column => column.id === id) ??
        keyComponents.find(component => component.id === id)?.column));
      const hidden = business ? [] : [
        ...(keyComponents.length ? [columns.indexOf('_parent_ref')] : []),
        ...record.columns.flatMap((column, index) => column.schema['x-ui-hidden']
          ? [technicalColumns.length + keyComponents.length + index] : []),
      ].filter(index => index >= 0);
      return tableXml(record.sheetName, rows, columns.length, business ? 0 : 3, false,
        hidden, styles);
    });
    sheets.push(tableXml('Keuzelijsten', lookupRows, 5, 1, false, [], ['column1_1', 'column3', 'column2_4', 'column3', 'column1_1']));
    const serialized = JSON.stringify(metadata);
    const chunks: string[] = [];
    let chunk = '';
    for (const character of serialized) {
      if (chunk.length + character.length > 12000) {
        chunks.push(chunk);
        chunk = '';
      }
      chunk += character;
    }
    if (chunk) chunks.push(chunk);
    sheets.push(tableXml('_riepr', [
      odfRow([odfCell('@metadata:v2')]),
      ...chunks.map(part => odfRow([odfCell(part)])),
    ], 1, 0, true));

    const content = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
      'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
      'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" ' +
      'xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2" office:version="1.3">' +
      '<office:font-face-decls><style:font-face style:name="Arial" svg:font-family="Arial" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"/></office:font-face-decls>' +
      '<office:automatic-styles>' + automaticStyles +
      '</office:automatic-styles><office:body><office:spreadsheet>' +
      `<table:content-validations>${validations.join('')}</table:content-validations>${sheets.join('')}` +
      '</office:spreadsheet></office:body></office:document-content>';
    const zip = new JSZip();
    zip.file('mimetype', 'application/vnd.oasis.opendocument.spreadsheet', { compression: 'STORE' });
    zip.file('content.xml', content);
    zip.file('styles.xml', '<?xml version="1.0"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.3"/>');
    zip.file('meta.xml', `<?xml version="1.0"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3"><office:meta><dc:title>${escapeXml(options.plan.schema.title ?? 'Rapportage')}</dc:title></office:meta></office:document-meta>`);
    zip.file('META-INF/manifest.xml', '<?xml version="1.0"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">' +
      '<manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.spreadsheet" manifest:full-path="/"/>' +
      ['content.xml', 'styles.xml', 'meta.xml'].map(path => `<manifest:file-entry manifest:media-type="text/xml" manifest:full-path="${path}"/>`).join('') + '</manifest:manifest>');
    const workbook = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    if (options.data !== undefined) {
      const imported = await new ODSImporter().import(workbook, options.plan);
      const derived = materializeDerivedValues(options.plan.schema, options.data, options.plan.dependencies);
      // Predicate arrays regroup by source kind; repeated rows within each kind retain their order.
      const expected = transformMemberData(options.plan.schema,
        transformMemberData(options.plan.schema, derived, 'presentation'), 'canonical');
      if (!isDeepStrictEqual(imported, expected)) throw new Error('Generated ODS failed JSON round-trip validation.');
    } else if (options.validationData) {
      await this.generate({
        ...options, data: options.validationData.data,
        references: options.validationData.references ?? options.references,
        referenceContext: options.validationData.referenceContext ?? options.referenceContext,
        validationData: undefined,
      });
    }
    return workbook;
  }
}

function tableXml(name: string, rows: string[], columns: number, hiddenColumns: number, hidden = false, extraHidden: number[] = [], styles: string[] = []): string {
  return `<table:table table:name="${escapeXml(name)}"${hidden ? ' table:style-name="hiddenTable"' : ''}>` +
    Array.from({ length: columns }, (_, index) => `<table:table-column table:style-name="${styles[index] ?? 'column1_8'}"${index < hiddenColumns || extraHidden.includes(index) ? ' table:visibility="collapse"' : ''}/>`).join('') +
    rows.join('') + '</table:table>';
}

function listValidation(id: string, sheet: string, column: string, first: number, last: number, multiple = false): string {
  const name = "$'" + sheet.replace(/'/g, "''") + "'";
  const range = `[${name}.$${column}$${first}:.$${column}$${last}]`;
  return `<table:content-validation table:name="${escapeXml(id)}" table:condition="${escapeXml(`of:cell-content-is-in-list(${range})`)}" ` +
    `table:base-cell-address="${escapeXml(name + '.$A$1')}" table:allow-empty-cell="true" table:display-list="unsorted">` +
    (multiple ? '<table:help-message table:display="true" table:title="Meerdere keuzes"><text:p>Kies één waarde of voer meerdere keuzes in als JSON-lijst, bijvoorbeeld ["Filter 1","Filter 2"].</text:p></table:help-message>' : '') +
    `<table:error-message table:display="true" table:message-type="${multiple ? 'warning' : 'stop'}" table:title="Ongeldige keuze"><text:p>` +
    (multiple ? 'Kies een waarde uit de keuzelijst of bevestig een JSON-lijst met meerdere geldige keuzes.' : 'Kies een waarde uit de keuzelijst.') +
    '</text:p></table:error-message></table:content-validation>';
}
