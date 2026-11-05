import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { ODSGenerator } from '../src/services/ods-generator.js';
import { ODSImporter } from '../src/services/ods-importer.js';
import { readOdf, odfCell, columnLetter } from '../src/services/odf.js';
import { WorkbookError } from '../src/models/tabular-plan.js';
import { array, cells, identifier, instance, modifyTable, object, plan, reportingSchema, row, text } from './fixtures.js';

const generator = new ODSGenerator();
const importer = new ODSImporter();

describe('Versioned, reversible ODS workbooks', () => {
  it('round-trips all values, types, empty containers and independent nested arrays without rounding', async () => {
    const compiled = plan(reportingSchema);
    const original = instance();
    const workbook = await generator.generate({ plan: compiled, data: original, label: value => value.startsWith('urn:choice:') ? 'Same label' : value });
    expect(await importer.import(workbook, compiled)).toEqual(original);
    const xml = await (await JSZip.loadAsync(workbook)).file('content.xml')!.async('string');
    expect(xml).toContain('office:value="0.123456789012345"');
    expect(xml).toContain('office:boolean-value="false"');
    expect(xml).toContain('office:date-value="2024-01-02T10:00:00+02:00"');
    expect(xml).toContain('office:time-value="PT1H30M"');
    expect(xml.indexOf('<table:content-validations>')).toBeGreaterThan(xml.indexOf('<office:spreadsheet>'));
    expect(xml).toContain('of:cell-content-is-in-list([$&apos;Keuzelijsten&apos;.$C$');
    expect(xml).toContain('table:base-cell-address="$&apos;Keuzelijsten&apos;.$A$1"');
    expect(xml).toContain('table:style-name="hiddenTable"');
    expect(xml).toContain('table:visibility="collapse"');
    const zip = await JSZip.loadAsync(workbook);
    expect(await zip.file('mimetype')!.async('string')).toBe('application/vnd.oasis.opendocument.spreadsheet');
    expect(zip.file('META-INF/manifest.xml')).not.toBeNull();
  });

  it('imports untouched templates without inventing records or null values', async () => {
    const compiled = plan(reportingSchema);
    expect(await importer.import(await generator.generate({ plan: compiled }), compiled)).toEqual({});
  });

  it('lets users select Dutch boolean labels while preserving JSON boolean values', async () => {
    const compiled = plan(object({ values: array({ type: 'boolean' }, 'Booleans') }));
    let workbook = await generator.generate({ plan: compiled });
    const tables = await readOdf(workbook);
    expect(tables.find(table => table.name === 'Keuzelijsten')!.rows.slice(2)
      .map(row => row.cells[2].text)).toEqual(['Ja', 'Nee']);
    workbook = await modifyTable(workbook, 'Booleans', rows => {
      const columns = cells(rows[3]);
      columns[5] = odfCell('Nee');
      return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
    });
    expect(await importer.import(workbook, compiled)).toEqual({ values: [false] });
  });

  it('preserves empty parent records, scalar empty strings and arrays of arrays', async () => {
    const compiled = plan(object({ parents: array(object({ children: array(text) })), nested: array(array(text)) }));
    const data = { parents: [{}, { children: [] }, { children: ['', 'x'] }], nested: [[], ['a', '']] };
    expect(await importer.import(await generator.generate({ plan: compiled, data }), compiled)).toEqual(data);
  });

  it('survives column reorder, renamed headers and row sorting while keeping links and sheet ordering', async () => {
    const compiled = plan(reportingSchema);
    let workbook = await generator.generate({ plan: compiled, data: instance() });
    for (const record of compiled.records.filter(record => record.id !== 'root')) {
      workbook = await modifyTable(workbook, record.sheetName, rows => {
        const reordered = rows.map((original, index) => {
          if (index === 0) return original;
          let columns = cells(original);
          if (index === 2) columns = columns.map(() => odfCell('Renamed readable header'));
          return row(columns.reverse());
        });
        return [...reordered.slice(0, 3), ...reordered.slice(3).reverse()];
      });
    }
    const imported = await importer.import(workbook, compiled);
    const expected = instance();
    expected.records.reverse();
    for (const record of expected.records) {
      record.children.reverse();
      record.selections.reverse();
      record.siblings.reverse();
      for (const child of record.children) child.grandchildren?.reverse();
    }
    expect(imported).toEqual(expected);
  });

  it('accepts new parents and children using visible references, without any hidden IDs', async () => {
    const compiled = plan(object({ parents: array(object({
      identifier, children: array(object({ value: { type: 'number' } }), 'Children'),
    }, { required: ['identifier'] }), 'Parents') }));
    let workbook = await generator.generate({ plan: compiled });
    const parents = compiled.records[1];
    const children = compiled.records[2];
    workbook = await modifyTable(workbook, parents.sheetName, rows => {
      const columns = cells(rows[3]);
      columns[5] = odfCell('0007', parents.columns[0]);
      return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
    });
    workbook = await modifyTable(workbook, children.sheetName, rows => {
      const columns = cells(rows[3]);
      columns[4] = odfCell('0007');
      columns[5] = odfCell(0, children.columns[0]);
      return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
    });
    expect(await importer.import(workbook, compiled)).toEqual({ parents: [{ identifier: '0007', children: [{ value: 0 }] }] });
  });

  it('accepts decimal-comma text without treating thousands separators as decimal precision', async () => {
    const compiled = plan(object({ values: array({ type: 'number' }, 'Values') }));
    const workbook = await modifyTable(await generator.generate({ plan: compiled }), 'Values', rows => {
      const columns = cells(rows[3]);
      columns[5] = odfCell('1,234567890123');
      return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
    });
    expect(await importer.import(workbook, compiled)).toEqual({ values: [1.234567890123] });
  });

  it('supports intentional reparenting through the visible reference without editing hidden links', async () => {
    const compiled = plan(object({ parents: array(object({ identifier, children: array(text, 'Children') }), 'Parents') }));
    const data = { parents: [{ identifier: 'A', children: ['x'] }, { identifier: 'B', children: [] }] };
    const workbook = await modifyTable(await generator.generate({ plan: compiled, data }), 'Children', rows => {
      const columns = cells(rows[3]);
      columns[4] = odfCell('B');
      return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
    });
    expect(await importer.import(workbook, compiled)).toEqual({ parents: [{ identifier: 'A', children: [] }, { identifier: 'B', children: ['x'] }] });
  });

  it('disambiguates duplicate business identifiers without imposing new business uniqueness rules', async () => {
    const compiled = plan(object({ parents: array(object({ identifier, children: array(text, 'Children') }), 'Parents') }));
    const data = { parents: [{ identifier: 'same', children: ['a'] }, { identifier: 'same', children: ['b'] }] };
    const workbook = await generator.generate({ plan: compiled, data });
    const tables = await readOdf(workbook);
    const parents = tables.find(table => table.name === 'Parents')!.rows.filter(row => row.number >= 4 && row.cells[0].text);
    expect(parents[0].cells[3].text).toMatch(/^same \[/);
    expect(parents[1].cells[3].text).not.toBe(parents[0].cells[3].text);
    expect(await importer.import(workbook, compiled)).toEqual(data);
  });
});

describe('Authoritative ODS import diagnostics', () => {
  async function editedColumn(key: string, value: string) {
    const compiled = plan(reportingSchema);
    const index = compiled.records[1].columns.findIndex(column => column.path.join('/') === key);
    const workbook = await modifyTable(await generator.generate({ plan: compiled, data: instance() }), 'Records', rows => {
      const columns = cells(rows[3]);
      columns[5 + index] = odfCell(value);
      return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
    });
    return { compiled, workbook, index };
  }

  it.each([
    ['conditional', 'must not be discarded', /must NOT be valid/],
    ['count', '1.5', /integer/],
    ['date', '2023-02-29', /format/],
    ['instant', '2024-01-01', /format/],
    ['duration', '90 minutes', /format/],
    ['quantity/hasUnit', 'wrong unit', /selection/],
  ])('reports %s failures at the exact sheet, row and column', async (key, value, message) => {
    const { compiled, workbook, index } = await editedColumn(key, value);
    let caught: unknown;
    try { await importer.import(workbook, compiled); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(WorkbookError);
    const error = caught as WorkbookError;
    expect(error.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ sheet: 'Records', row: 4, column: columnLetter(5 + index), message: expect.stringMatching(message) }),
    ]));
  });

  it('rejects duplicate IDs, orphan children, missing metadata and incompatible schema versions', async () => {
    const compiled = plan(reportingSchema);
    const original = await generator.generate({ plan: compiled, data: instance() });
    const duplicate = await modifyTable(original, 'Records', rows => {
      const first = cells(rows[3]);
      const second = cells(rows[4]);
      second[0] = first[0];
      return [...rows.slice(0, 4), row(second), ...rows.slice(5)];
    });
    await expect(importer.import(duplicate, compiled)).rejects.toThrow(/Duplicate technical row ID/);
    const orphan = await modifyTable(original, 'Kinderen', rows => {
      const columns = cells(rows[3]);
      columns[4] = odfCell('missing parent');
      return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
    });
    await expect(importer.import(orphan, compiled)).rejects.toThrow(/orphan parent/);
    const missing = await modifyTable(original, 'Records', rows => [rows[0], row(cells(rows[1]).slice(1)), ...rows.slice(2)]);
    await expect(importer.import(missing, compiled)).rejects.toThrow(/Required column metadata/);
    await expect(importer.import(original, { ...compiled, sourceSha256: 'a'.repeat(64) })).rejects.toThrow(/version differs/);
  });

  it('rejects unknown columns even when the original template row is otherwise untouched', async () => {
    const compiled = plan(reportingSchema);
    const workbook = await modifyTable(await generator.generate({ plan: compiled }), 'Records', rows => [
      ...rows.slice(0, 3), row([...cells(rows[3]), odfCell('unmapped data')]), ...rows.slice(4),
    ]);
    await expect(importer.import(workbook, compiled)).rejects.toThrow(/Unexpected populated data column/);
  });

  it('does not trust edited hidden parent IDs or ambiguous new parent labels', async () => {
    const compiled = plan(object({ parents: array(object({ identifier, children: array(text, 'Children') }), 'Parents') }));
    const original = await generator.generate({ plan: compiled, data: { parents: [{ identifier: 'A', children: ['x'] }, { identifier: 'B' }] } });
    const hidden = await modifyTable(original, 'Children', rows => {
      const columns = cells(rows[3]);
      columns[1] = odfCell('wrong-parent-id');
      return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
    });
    await expect(importer.import(hidden, compiled)).rejects.toThrow(/parent links are inconsistent/);
    const ambiguous = await modifyTable(original, 'Parents', rows => {
      const columns = cells(rows[4]);
      columns[3] = odfCell('A');
      return [...rows.slice(0, 4), row(columns), ...rows.slice(5)];
    });
    await expect(importer.import(ambiguous, compiled)).rejects.toThrow(/Ambiguous parent reference/);
  });

  it('refuses formulas and missing reference data instead of silently substituting values', async () => {
    const compiled = plan(object({ values: array({ ...text, 'x-reference-types': ['urn:filter:type'] }, 'Filters') }));
    await expect(generator.generate({ plan: compiled })).rejects.toThrow(/Reference data is required/);
    const basic = plan(object({ values: array(text, 'Values') }));
    const formula = await modifyTable(await generator.generate({ plan: basic }), 'Values', rows => {
      const columns = cells(rows[3]);
      columns[5] = '<table:table-cell table:formula="of:=1+1" office:value-type="float" office:value="2"><text:p>2</text:p></table:table-cell>';
      return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
    });
    await expect(importer.import(formula, basic)).rejects.toThrow(/Formula cells/);
  });
});
