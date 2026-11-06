import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { ODSGenerator } from '../src/services/ods-generator.js';
import { ODSImporter } from '../src/services/ods-importer.js';
import { readOdf, odfCell, columnLetter } from '../src/services/odf.js';
import { WorkbookError } from '../src/models/tabular-plan.js';
import { workbookMetadata } from '../src/services/workbook-metadata.js';
import { layoutColumns, parentKeyComponents } from '../src/services/workbook-layout.js';
import { array, cells, identifier, instance, modifyTable, object, plan, reportingSchema, row, text } from './fixtures.js';

const generator = new ODSGenerator();
const importer = new ODSImporter();
const codeConcept = 'urn:source:code';
const tagsConcept = 'urn:source:tags';

function keyedPlan(business = true, withSourceDependency = false) {
  const parent = object({
    code: { ...text, title: 'Code', enum: ['urn:code:a', 'urn:code:b'], 'x-source-concept': codeConcept },
    ...(withSourceDependency ? {
      source: {
        ...text, title: 'Source', 'x-source-concept': 'urn:source:selector',
        'x-reference-types': ['urn:type:source'],
        'x-reference-dependency': { sourceConcept: codeConcept, relation: 'urn:relation:point' },
      },
    } : {}),
    tags: {
      ...array({ ...text, enum: ['urn:tag:x', 'urn:tag:y'] }),
      title: 'Tags', 'x-source-concept': tagsConcept,
    },
    children: array(object({
      enabled: { type: 'boolean', title: 'Enabled' },
      value: { type: 'number', title: 'Value' },
    }, { required: ['enabled', 'value'] }), 'Children'),
  }, { 'x-table-key': [codeConcept, tagsConcept] });
  return plan(object({
    parents: array(parent, 'Parents'),
  }, { ...(business ? { 'x-table-workbook': 'synthetic' } : {}), required: ['parents'] }));
}

describe('Versioned, reversible ODS workbooks', () => {
  it('validates source-to-point dependencies when importing composite-key records', async () => {
    const compiled = keyedPlan(true, true);
    const references = [
      { id: 'urn:code:a', label: 'Point A', types: ['urn:type:point'] },
      { id: 'urn:code:b', label: 'Point B', types: ['urn:type:point'] },
      { id: 'urn:selection:connected', label: 'Connected source', types: ['urn:type:source'],
        relations: { 'urn:relation:point': ['urn:code:a'] } },
      { id: 'urn:selection:disconnected', label: 'Disconnected source', types: ['urn:type:source'],
        relations: { 'urn:relation:point': ['urn:code:b'] } },
    ];
    const data = { parents: [{
      code: 'urn:code:a', source: 'urn:selection:connected', tags: ['urn:tag:x'],
      children: [{ enabled: false, value: 0 }],
    }] };
    const workbook = await generator.generate({ plan: compiled, data, references });
    expect(await importer.import(workbook, compiled)).toEqual(data);
    const parent = compiled.records.find(record => record.sheetName === 'Parents')!;
    const source = parent.columns.find(column => column.path[0] === 'source')!;
    const disconnected = await modifyTable(workbook, parent.sheetName, rows => {
      const values = cells(rows[3]);
      values[layoutColumns(compiled, parent).indexOf(source.id)] = odfCell('Disconnected source');
      return [...rows.slice(0, 3), row(values), ...rows.slice(4)];
    });
    await expect(importer.import(disconnected, compiled)).rejects.toThrow(
      /urn:selection:disconnected is not connected to the selected urn:source:code through urn:relation:point/,
    );
  });

  it('links children through typed source-declared composite keys without copying them into JSON', async () => {
    const compiled = keyedPlan();
    const data = { parents: [{ code: 'urn:code:a', tags: ['urn:tag:x', 'urn:tag:y'], children: [
      { enabled: false, value: 0 },
    ] }] };
    const workbook = await generator.generate({
      plan: compiled, data,
      label: value => value === 'urn:code:a' ? 'Code A' : value === 'urn:tag:x' ? 'Tag X' :
        value === 'urn:tag:y' ? 'Tag Y' : value,
    });
    const tables = await readOdf(workbook);
    const metadata = workbookMetadata(JSON.parse(tables.find(table => table.name === '_riepr')!.rows.slice(1)
      .map(row => row.cells[0].text).join('')));
    const child = compiled.records.find(record => record.sheetName === 'Children')!;
    const keys = parentKeyComponents(compiled, child);
    expect(tables.find(table => table.name === 'Children')!.rows[2].cells.slice(0, 2).map(cell => cell.text))
      .toEqual(['Code', 'Tags']);
    expect(tables.find(table => table.name === 'Children')!.rows[3].cells.slice(0, 2).map(cell => cell.text))
      .toEqual(['Code A', '["Tag X","Tag Y"]']);
    expect(metadata.jsonMapping[child.id].parentKeyPaths).toEqual({
      [codeConcept]: '/code', [tagsConcept]: '/tags',
    });
    expect(keys.map(key => key.column.title)).toEqual(['Code', 'Tags']);
    expect(await importer.import(workbook, compiled)).toEqual(data);
    expect(JSON.stringify(await importer.import(workbook, compiled))).not.toContain('x-table-key');
  });

  it('supports blank templates, new rows, zero/false, fixed choices and unordered array key identity', async () => {
    const compiled = keyedPlan();
    let workbook = await generator.generate({ plan: compiled });
    const parent = compiled.records.find(record => record.sheetName === 'Parents')!;
    const child = compiled.records.find(record => record.sheetName === 'Children')!;
    const childKeys = parentKeyComponents(compiled, child);
    expect(await importer.import(workbook, compiled)).toEqual({ parents: [] });
    workbook = await modifyTable(workbook, 'Parents', rows => {
      const values = cells(rows[3]);
      values[layoutColumns(compiled, parent).indexOf(parent.columns.find(column => column.schema['x-source-concept'] === codeConcept)!.id)] = odfCell('urn:code:a');
      values[layoutColumns(compiled, parent).indexOf(parent.columns.find(column => column.schema['x-source-concept'] === tagsConcept)!.id)] = odfCell('["urn:tag:x","urn:tag:y"]');
      return [...rows.slice(0, 3), row(values), ...rows.slice(4)];
    });
    workbook = await modifyTable(workbook, 'Children', rows => {
      const values = cells(rows[3]);
      values[layoutColumns(compiled, child).indexOf(childKeys[0].id)] = odfCell('urn:code:a');
      values[layoutColumns(compiled, child).indexOf(childKeys[1].id)] = odfCell('["urn:tag:y","urn:tag:x"]');
      values[layoutColumns(compiled, child).indexOf(child.columns.find(column => column.path[0] === 'enabled')!.id)] = odfCell(false);
      values[layoutColumns(compiled, child).indexOf(child.columns.find(column => column.path[0] === 'value')!.id)] = odfCell(0);
      return [...rows.slice(0, 3), row(values), ...rows.slice(4)];
    });
    expect(await importer.import(workbook, compiled)).toEqual({
      parents: [{ code: 'urn:code:a', tags: ['urn:tag:x', 'urn:tag:y'], children: [{ enabled: false, value: 0 }] }],
    });
    const xml = await (await JSZip.loadAsync(workbook)).file('content.xml')!.async('string');
    expect(xml).toContain('table:name="Parents"');
    expect(xml).toContain('table:content-validation-name="_key_');
  });

  it('uses the same key links in generic sheets after sorting and inserting rows', async () => {
    const compiled = keyedPlan(false);
    const data = { parents: [
      { code: 'urn:code:a', tags: ['urn:tag:x'], children: [{ enabled: false, value: 1 }] },
      { code: 'urn:code:b', tags: ['urn:tag:y'], children: [{ enabled: true, value: 2 }] },
    ] };
    let workbook = await generator.generate({ plan: compiled, data });
    const child = compiled.records.find(record => record.sheetName === 'Children')!;
    const components = parentKeyComponents(compiled, child);
    workbook = await modifyTable(workbook, 'Parents', rows => [
      ...rows.slice(0, 3), rows[4], rows[3], ...rows.slice(5),
    ]);
    workbook = await modifyTable(workbook, 'Children', rows => {
      const newRow = cells(rows[5]);
      for (const component of components) {
        const index = layoutColumns(compiled, child).indexOf(component.id);
        newRow[index] = cells(rows[3])[index];
      }
      newRow[layoutColumns(compiled, child).indexOf(child.columns.find(column => column.path[0] === 'enabled')!.id)] = odfCell(false);
      newRow[layoutColumns(compiled, child).indexOf(child.columns.find(column => column.path[0] === 'value')!.id)] = odfCell(3);
      return [...rows.slice(0, 3), rows[3], row(newRow), rows[4], ...rows.slice(6)];
    });
    const result = await importer.import(workbook, compiled) as typeof data;
    expect(result.parents.map(item => item.code)).toEqual(['urn:code:b', 'urn:code:a']);
    expect(result.parents[0].children).toEqual([{ enabled: true, value: 2 }]);
    expect(result.parents[1].children).toEqual([{ enabled: false, value: 1 }, { enabled: false, value: 3 }]);
  });

  it('rejects duplicate parent keys, missing components and orphan or ambiguous child keys', async () => {
    const compiled = keyedPlan();
    const duplicateData = { parents: [
      { code: 'urn:code:a', tags: ['urn:tag:x'], children: [] },
      { code: 'urn:code:a', tags: ['urn:tag:x'], children: [] },
    ] };
    await expect(generator.generate({ plan: compiled, data: duplicateData })).rejects.toThrow(/components must be unique/);
    await expect(generator.generate({ plan: compiled, data: { parents: [{ tags: ['urn:tag:x'] }] } }))
      .rejects.toThrow(/invalid x-table-key/);
    await expect(generator.generate({ plan: compiled, data: {
      parents: [{ code: 'urn:code:a', tags: ['urn:tag:x', 'urn:tag:x'] }],
    } })).rejects.toThrow(/duplicate elements/);
    await expect(generator.generate({ plan: compiled, data: { parents: [{ code: 'urn:code:a', tags: [] }] } }))
      .rejects.toThrow(/invalid x-table-key/);
    const original = await generator.generate({ plan: compiled, data: {
      parents: [{ code: 'urn:code:a', tags: ['urn:tag:x'], children: [{ enabled: true, value: 1 }] }],
    } });
    const child = compiled.records.find(record => record.sheetName === 'Children')!;
    const childKey = parentKeyComponents(compiled, child)[0];
    const orphan = await modifyTable(original, 'Children', rows => {
      const values = cells(rows[3]);
      values[layoutColumns(compiled, child).indexOf(childKey.id)] = odfCell('urn:code:b');
      return [...rows.slice(0, 3), row(values), ...rows.slice(4)];
    });
    await expect(importer.import(orphan, compiled)).rejects.toThrow(/orphan parent x-table-key/);
    const missingChildKey = await modifyTable(original, 'Children', rows => {
      const values = cells(rows[3]);
      values[layoutColumns(compiled, child).indexOf(parentKeyComponents(compiled, child)[1].id)] = odfCell('[]');
      return [...rows.slice(0, 3), row(values), ...rows.slice(4)];
    });
    await expect(importer.import(missingChildKey, compiled)).rejects.toThrow(/Missing or invalid child x-table-key/);
    const duplicate = await modifyTable(original, 'Parents', rows => {
      const parent = compiled.records.find(record => record.sheetName === 'Parents')!;
      const values = cells(rows[3]);
      const second = cells(rows[4]);
      for (const component of parentKeyComponents(compiled, child)) {
        const index = layoutColumns(compiled, parent).indexOf(component.column.id);
        second[index] = values[index];
      }
      return [...rows.slice(0, 4), row(second), ...rows.slice(4)];
    });
    await expect(importer.import(duplicate, compiled)).rejects.toThrow(/Duplicate parent x-table-key/);
  });

  it('rejects composite key declarations that resolve to quantities or non-visible objects', async () => {
    const quantity = 'urn:source:quantity';
    const quantityPlan = plan(object({
      parents: array(object({
        quantity: object({
          numericValue: { type: 'number', 'x-source-concept': quantity },
          hasUnit: text,
        }),
        children: array(object({ value: text }), 'Children'),
      }, { 'x-table-key': [quantity] }), 'Parents'),
    }, { 'x-table-workbook': 'synthetic' }));
    await expect(generator.generate({ plan: quantityPlan })).rejects.toThrow(/scalar or scalar inline array/);
    const complex = 'urn:source:complex';
    const complexPlan = plan(object({
      parents: array(object({
        detail: { ...object({ value: text }), 'x-source-concept': complex },
        children: array(object({ value: text }), 'Children'),
      }, { 'x-table-key': [complex] }), 'Parents'),
    }, { 'x-table-workbook': 'synthetic' }));
    await expect(generator.generate({ plan: complexPlan })).rejects.toThrow(/exactly one visible input column/);
  });

  it('preserves reference relations in transport metadata for dependency validation', async () => {
    const dependency = { sourceConcept: 'urn:source:owner', relation: 'urn:relation:owner' };
    const compiled = plan(object({
      owner: { ...text, 'x-source-concept': dependency.sourceConcept },
      selection: { ...text, 'x-reference-types': ['urn:type:selection'], 'x-reference-dependency': dependency },
    }, { required: ['owner', 'selection'] }));
    const references = [
      { id: 'urn:owner:1', label: 'Owner', types: ['urn:type:owner'] },
      { id: 'urn:selection:1', label: 'Selection', types: ['urn:type:selection'],
        relations: { [dependency.relation]: ['urn:owner:1'] } },
    ];
    const workbook = await generator.generate({
      plan: compiled, data: { owner: 'urn:owner:1', selection: 'urn:selection:1' }, references,
    });
    const tables = await readOdf(workbook);
    const metadata = workbookMetadata(JSON.parse(tables.find(table => table.name === '_riepr')!.rows.slice(1)
      .map(row => row.cells[0].text).join('')));
    expect(metadata.references[1].relations).toEqual({ [dependency.relation]: ['urn:owner:1'] });
    expect(await importer.import(workbook, compiled)).toEqual({ owner: 'urn:owner:1', selection: 'urn:selection:1' });
    const disconnected = structuredClone(metadata);
    disconnected.references[1].relations = { [dependency.relation]: ['urn:other'] };
    const changed = await modifyTable(workbook, '_riepr', rows =>
      [rows[0], row([odfCell(JSON.stringify(disconnected))])]);
    await expect(importer.import(changed, compiled)).rejects.toThrow(/not connected to the selected/);
  });

  it('uses escaped JSON pointers and detects altered column, row and parent mappings', async () => {
    const compiled = plan(object({ 'a/b': array(object({ identifier, 'x~y': text }), 'Escaped') }));
    const data = { 'a/b': [{ identifier: '0001', 'x~y': 'text' }] };
    const workbook = await generator.generate({ plan: compiled, data });
    const tables = await readOdf(workbook);
    const table = tables.find(table => table.name === 'Escaped')!;
    expect(table.rows.find(row => row.number === 1)!.cells[0].text).toBe('/a~1b/*');
    expect(table.rows.find(row => row.number === 2)!.cells.map(cell => cell.text)).toContain('/x~0y');
    const metadata = workbookMetadata(JSON.parse(tables.find(table => table.name === '_riepr')!.rows.slice(1)
      .map(row => row.cells[0].text).join('')));
    const baseline = Object.values(metadata.rows).find(row => row.instancePath === '/a~1b/0')!;
    expect(baseline.parentInstancePath).toBe('');
    for (const change of ['column', 'row', 'parent'] as const) {
      const edited = structuredClone(metadata);
      if (change === 'column') edited.jsonMapping[compiled.records[1].id].columns[compiled.records[1].columns[0].id] = '/wrong';
      else {
        const row = Object.values(edited.rows).find(row => row.instancePath === '/a~1b/0')!;
        if (change === 'row') row.instancePath = '/wrong/0';
        else row.parentInstancePath = '/wrong';
      }
      const invalid = await modifyTable(workbook, '_riepr', rows =>
        [rows[0], row([odfCell(JSON.stringify(edited))])]);
      await expect(importer.import(invalid, compiled)).rejects.toThrow(/JSON.*path/);
    }
    const invalidColumn = await modifyTable(workbook, 'Escaped', rows =>
      [rows[0], row(cells(rows[1]).map((cell, index) => index === 5 ? odfCell('/wrong') : cell)), ...rows.slice(2)]);
    await expect(importer.import(invalidColumn, compiled)).rejects.toThrow('column metadata');
  });

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
