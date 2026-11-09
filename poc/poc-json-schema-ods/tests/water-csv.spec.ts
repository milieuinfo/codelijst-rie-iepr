import { describe, expect, it } from 'vitest';
import { sourceSnapshot } from '../../poc-json-schema/scripts/source-snapshot.mjs';
import { compileTheme } from '../../poc-json-schema/tests/groundwater-csv-fixture.js';
import { compileTabularPlan, hash } from '../src/services/tabular-plan.js';
import { ODSGenerator } from '../src/services/ods-generator.js';
import { ODSImporter } from '../src/services/ods-importer.js';
import { generationFixture } from '../src/services/generation-fixture.js';
import { readOdf, odfCell } from '../src/services/odf.js';
import { layoutColumns } from '../src/services/workbook-layout.js';
import { cells, modifyTable, row } from './fixtures.js';

const compile = (name = 'lozing') => {
  const source = sourceSnapshot();
  const schema = compileTheme(JSON.parse(source), 'Water').subSchemas.find(section => section.name === name)!.schema;
  return compileTabularPlan(schema, { sourceSha256: hash(source) });
};

describe('Actual water CSV -> schema -> reversible ODS', () => {
  it.each(['lozing', 'abnormale-lozing'])('round-trips populated and blank %s workbooks without losing zero or optional absence', async name => {
    const plan = compile(name);
    const fixture = (await generationFixture(plan))!;
    const bytes = await new ODSGenerator().generate({ plan, ...fixture });
    expect(await new ODSImporter().import(bytes, plan)).toEqual(fixture.data);
    const blank = await new ODSGenerator().generate({ plan, ...fixture, data: undefined, validationData: fixture });
    if (name === 'lozing') await expect(new ODSImporter().import(blank, plan)).rejects.toThrow('/lozing');
    else expect(await new ODSImporter().import(blank, plan)).toEqual({});
    const sheets = await readOdf(bytes);
    expect(sheets.map(sheet => sheet.name)).toEqual([
      'Voorblad', ...(name === 'lozing' ? ['Waterstromen', 'Stoffen in waterstromen'] : ['Abnormale lozingen']),
      'Keuzelijsten', '_riepr',
    ]);
    for (const sheet of sheets.filter(sheet => !['Voorblad', 'Keuzelijsten', '_riepr'].includes(sheet.name))) {
      expect(sheet.rows[2].cells.some(cell => /Rij-ID|Bovenliggende|Entiteits-ID|@type|observedProperty|propertyID/.test(cell.text))).toBe(false);
    }
  });

  it('keeps annual totals on the parent and links ordered pollutant results by the control-point URI', async () => {
    const plan = compile();
    const fixture = (await generationFixture(plan))!;
    const bytes = await new ODSGenerator().generate({ plan, ...fixture });
    const tables = await readOdf(bytes);
    expect(tables.find(table => table.name === 'Waterstromen')!.rows[2].cells.map(cell => cell.text))
      .toEqual(['Controleinrichting *', 'Debiet per jaar *', 'Eenheid *', 'Aantal dagen per jaar *', 'Eenheid *']);
    expect(tables.find(table => table.name === 'Stoffen in waterstromen')!.rows[2].cells.map(cell => cell.text))
      .toEqual(['Controleinrichting', 'Verontreinigende stof *', 'Meetfrequentie',
        'Gemiddelde concentratie', 'Eenheid', 'Totale jaarvracht', 'Eenheid',
        'Bepalingsmethode', 'Bepalingsmethodeclassificatie']);
    const reordered = await modifyTable(bytes, 'Waterstromen', rows =>
      [...rows.slice(0, 3), rows[4], rows[3], ...rows.slice(5)]);
    const imported = await new ODSImporter().import(reordered, plan);
    const expected = structuredClone(fixture.data) as { lozing: unknown[] };
    expected.lozing.reverse();
    expect(imported).toEqual(expected);
    const unknown = await modifyTable(bytes, 'Stoffen in waterstromen', rows => {
      const values = cells(rows[3]);
      values[0] = odfCell('urn:unknown:controleinrichting');
      return [...rows.slice(0, 3), row(values), ...rows.slice(4)];
    });
    await expect(new ODSImporter().import(unknown, plan)).rejects.toThrow();
    const duplicate = structuredClone(fixture.data) as { lozing: { hasFeatureOfInterest: string }[] };
    duplicate.lozing[1].hasFeatureOfInterest = duplicate.lozing[0].hasFeatureOfInterest;
    await expect(new ODSGenerator().generate({ plan, ...fixture, data: duplicate })).rejects.toThrow(/key|unique|duplicate/i);
  });

  it('imports a new duration-only abnormal discharge without inventing an annual load or its unit', async () => {
    const plan = compile('abnormale-lozing');
    const fixture = (await generationFixture(plan))!;
    const blank = await new ODSGenerator().generate({ plan, ...fixture, data: undefined });
    const record = plan.records.find(record => record.sheetName === 'Abnormale lozingen')!;
    const columns = layoutColumns(plan, record);
    const edited = await modifyTable(blank, record.sheetName, rows => {
      const values = cells(rows[3]);
      const feature = record.columns.find(column => column.path.at(-1) === 'hasFeatureOfInterest')!;
      const pollutant = record.columns.find(column => column.path.at(-1) === 'observedProperty')!;
      const duration = record.columns.find(column => column.title === 'Lozingsduur')!;
      values[columns.indexOf(feature.id)] = odfCell('Controleinrichting 1');
      values[columns.indexOf(pollutant.id)] = odfCell('https://data.omgeving.vlaanderen.be/id/concept/csor/variabele/V_333');
      values[columns.indexOf(duration.id)] = odfCell(0);
      return [...rows.slice(0, 3), row(values), ...rows.slice(4)];
    });
    const imported = await new ODSImporter().import(edited, plan);
    expect(imported).toEqual({
      abnormaleLozing: [{
        hasFeatureOfInterest: 'urn:test:controleinrichting:1',
        observedProperty: 'https://data.omgeving.vlaanderen.be/id/concept/csor/variabele/V_333',
        hasResult: { additionalProperty: [{
          propertyID: 'https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-water/abnormale-lozing-lozingsduur',
          value: 0, unitCode: 'https://data.omgeving.vlaanderen.be/id/concept/csor/eenheid/E_94',
        }] },
      }],
    });
  });
});
