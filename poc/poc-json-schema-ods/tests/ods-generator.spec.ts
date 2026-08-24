import JSZip from 'jszip';
import { describe, it, expect } from 'vitest';
import { ODSGenerator } from '../src/services/ods-generator.js';
import type { ColumnDefinition } from '../src/models/index.js';

function makeCol(jsonPath: string, uiType: ColumnDefinition['uiType'], extra: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return { jsonPath, title: jsonPath.slice(1), uiType, required: false, ...extra };
}

async function contentXml(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(Buffer.from(buffer));
  return (await zip.file('content.xml')!.async('string'));
}

function rowsOf(xml: string, sheetName: string): string[] {
  const escaped = sheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tbl = xml.match(new RegExp(`<table:table table:name="${escaped}".*?</table:table>`, 's'));
  expect(tbl, `table ${sheetName}`).toBeTruthy();
  return [...tbl![0].matchAll(/<table:table-row.*?<\/table:table-row>/gs)].map((m) => m[0]);
}

function cellsOf(row: string): string[] {
  return [...row.matchAll(/<table:table-cell[^>]*>/g)].map((m) => m[0]);
}

describe('ODSGenerator empty data rows and dropdown validations', () => {
  it('anchors the dropdown validation to the column that carries it, not a fixed column', async () => {
    const generator = new ODSGenerator();
    const buffer = await generator.generate({
      documentTitle: 'Meting',
      sheets: [
        {
          sheetName: 'Meting',
          columns: [
            makeCol('/created', 'datetime'),
            makeCol('/wasOriginatedBy', 'text'),
            makeCol('/observedProperty', 'dropdown', {
              dropdownUris: ['https://x/a', 'https://x/b', 'https://x/c'],
              dropdownLabels: ['AS-gehalte', 'S-gehalte', 'Naam'],
              description: 'Selecteer de parameter.',
            }),
            makeCol('/hasResult/numericValue', 'number'),
          ],
        },
      ],
    });
    const xml = await contentXml(buffer);
    const rows = rowsOf(xml, 'Meting');

    // Row 1 (path, hidden) + row 2 (header) + 10 empty data rows
    expect(rows).toHaveLength(12);

    // Validation anchored at the first data row (row 3) of its own column (C = index 2)
    const validation = xml.match(/<table:content-validation [^>]*table:name="val_Meting_2"[^>]*>/);
    expect(validation).toBeTruthy();
    expect(validation![0]).toContain('table:base-cell-address="Meting.C3"');
    expect(validation![0]).toContain('table:allow-empty-cell="true"');
    expect(validation![0]).toContain('table:display-list="sort-ascending"');
    expect(validation![0]).toContain('of:cell-content-is-in-list("AS-gehalte";"S-gehalte";"Naam")');

    // Header row marks the dropdown column
    expect(rows[1]).toContain('<text:p>observedProperty ▾</text:p>');

    // Every empty data row references the validation in the dropdown column only
    for (let r = 2; r < rows.length; r++) {
      const cells = cellsOf(rows[r]);
      expect(cells).toHaveLength(4);
      expect(cells[0]).not.toContain('content-validation-name');
      expect(cells[1]).not.toContain('content-validation-name');
      expect(cells[2]).toContain('table:content-validation-name="val_Meting_2"');
      expect(cells[3]).not.toContain('content-validation-name');
    }
  });

  it('anchors each dropdown of a multi-dropdown sheet to its own column', async () => {
    const generator = new ODSGenerator();
    const buffer = await generator.generate({
      documentTitle: 'T',
      sheets: [
        {
          sheetName: 'T',
          columns: [
            makeCol('/observedProperty', 'dropdown', { dropdownLabels: ['A', 'B'] }),
            makeCol('/wasOriginatedBy', 'text'),
            makeCol('/note', 'text'),
            makeCol('/hasResult/hasUnit', 'dropdown', { dropdownLabels: ['g', 'mg'] }),
          ],
        },
      ],
    });
    const xml = await contentXml(buffer);

    const v0 = xml.match(/<table:content-validation [^>]*table:name="val_T_0"[^>]*>/);
    const v3 = xml.match(/<table:content-validation [^>]*table:name="val_T_3"[^>]*>/);
    expect(v0![0]).toContain('table:base-cell-address="T.A3"');
    expect(v3![0]).toContain('table:base-cell-address="T.D3"');

    const rows = rowsOf(xml, 'T');
    const firstDataCells = cellsOf(rows[2]);
    expect(firstDataCells[0]).toContain('table:content-validation-name="val_T_0"');
    expect(firstDataCells[1]).not.toContain('content-validation-name');
    expect(firstDataCells[2]).not.toContain('content-validation-name');
    expect(firstDataCells[3]).toContain('table:content-validation-name="val_T_3"');
  });

  it('emits no validations for a sheet without dropdown columns', async () => {
    const generator = new ODSGenerator();
    const buffer = await generator.generate({
      documentTitle: 'Plain',
      sheets: [
        {
          sheetName: 'Plain',
          columns: [makeCol('/note', 'text'), makeCol('/value', 'number')],
        },
      ],
    });
    const xml = await contentXml(buffer);
    expect(xml).toContain('<table:content-validations/>');
    expect(xml).not.toContain('<table:content-validation ');
  });
});
