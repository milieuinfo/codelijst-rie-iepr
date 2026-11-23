import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sourceSnapshot } from '../../poc-json-schema/scripts/source-snapshot.mjs';
import { compileTheme } from '../../poc-json-schema/tests/groundwater-csv-fixture.js';
import { compileTabularPlan, hash } from '../src/services/tabular-plan.js';
import { ODSGenerator } from '../src/services/ods-generator.js';
import { ODSImporter } from '../src/services/ods-importer.js';
import { readOdf, odfCell } from '../src/services/odf.js';
import { layoutColumns } from '../src/services/workbook-layout.js';
import { modifyTable, cells, row } from './fixtures.js';
import { reportingRecords, transformMemberData } from 'codelijst-rie-iepr-poc-json-schema/browser';
import { generationFixture } from '../src/services/generation-fixture.js';

describe('Actual air CSV -> schema -> reversible ODS', () => {
  it('round-trips an actual reported-material selection with its business key and readable choice', async () => {
    const source = sourceSnapshot();
    const schemas = compileTheme(JSON.parse(source), 'Lucht').subSchemas;
    const schema = schemas.find(section => section.name === 'emissie')!.schema;
    const fuel = schemas.find(section => section.name === 'brandstof')!.schema;
    const load = (name: string) => JSON.parse(readFileSync(new URL(`../../poc-json-schema/examples/${name}.json`, import.meta.url), 'utf8'));
    const reported = reportingRecords([{ schema: fuel, data: load('lucht/brandstof'), year: 2024 }], load('refs'));
    const data = load('lucht/emissie');
    data.emissie[0].used = [reported[0].reference.id];
    const plan = compileTabularPlan(schema, { sourceSha256: hash(source) });
    const bytes = await new ODSGenerator().generate({
      plan, data, references: [...load('refs'), ...reported.map(record => record.reference)], referenceContext: { year: 2024 },
    });
    const tables = await readOdf(bytes);
    expect(tables.find(table => table.name === 'Keuzelijsten')!.rows.some(row =>
      row.cells.some(cell => cell.text.includes('Aardgas')))).toBe(true);
    const expected = transformMemberData(schema, transformMemberData(schema, data, 'presentation'), 'canonical');
    expect(await new ODSImporter().import(bytes, plan)).toEqual(expected);
  });

  it.each([
    ['brandstof', 'Brandstoffen'],
    ['verbruikte-stof', 'Verbruikte stoffen'],
    ['geproduceerde-stof', 'Geproduceerde stoffen'],
    ['afvalproduct', 'Afvalproducten'],
  ])('round-trips %s with installation selections, optional composition and numeric units', async (name, sheet) => {
    const source = sourceSnapshot();
    const schema = compileTheme(JSON.parse(source), 'Lucht').subSchemas.find(section => section.name === name)!.schema;
    const plan = compileTabularPlan(schema, { sourceSha256: hash(source) });
    const fixture = (await generationFixture(plan))!;
    const bytes = await new ODSGenerator().generate({ plan, ...fixture });
    expect(await new ODSImporter().import(bytes, plan)).toEqual(fixture.data);
    const tables = await readOdf(bytes);
    expect(tables.map(table => table.name)).toEqual(['Voorblad', sheet, 'Keuzelijsten', '_riepr']);
    const headings = tables.find(table => table.name === sheet)!.rows[2].cells.map(cell => cell.text);
    expect(headings[0]).toBe('Installatie *');
    expect(headings.some(heading => heading.startsWith('Naam'))).toBe(true);
    expect(headings).toContain('Aard en/of samenstelling');
    expect(headings.some(heading => /Rij-ID|Bovenliggende|Entiteits-ID/.test(heading))).toBe(false);
    const blank = await new ODSGenerator().generate({ plan, ...fixture, data: undefined, validationData: fixture });
    expect(await new ODSImporter().import(blank, plan)).toEqual({});
    const record = plan.records.find(record => record.sheetName === sheet)!;
    const quantity = record.columns.find(column => column.path.at(-1) === 'numericValue' &&
      column.title === (name === 'brandstof' || name === 'verbruikte-stof' ? 'Verbruik' :
        name === 'geproduceerde-stof' ? 'Productie' : 'Hoeveelheid afvalproduct'))!;
    const edited = await modifyTable(bytes, sheet, rows => {
      const values = cells(rows[3]);
      values[layoutColumns(plan, record).indexOf(quantity.id)] = odfCell(1.5);
      return [...rows.slice(0, 3), row(values), ...rows.slice(4)];
    });
    const imported = await new ODSImporter().import(edited, plan);
    expect(imported).not.toEqual(fixture.data);
    expect(JSON.stringify(imported)).toContain('"numericValue":1.5');
  });

  it('links pollutant rows by point and source set without emission IDs', async () => {
    const source = sourceSnapshot();
    const schema = compileTheme(JSON.parse(source), 'Lucht').subSchemas.find(section => section.name === 'emissie')!.schema;
    const plan = compileTabularPlan(schema, { sourceSha256: hash(source) });
    const load = (name: string) => JSON.parse(readFileSync(new URL(`../../poc-json-schema/examples/${name}.json`, import.meta.url), 'utf8'));
    const data = load('lucht/emissie');
    const expected = transformMemberData(schema, transformMemberData(schema, data, 'presentation'), 'canonical');
    const options = { plan, data, references: load('refs'), referenceContext: load('reference-context') };
    const bytes = await new ODSGenerator().generate(options);
    const tables = await readOdf(bytes);
    const parent = plan.records.find(record => record.sheetName === 'Emissiegehelen')!;
    const child = plan.records.find(record => record.parentId === parent.id &&
      record.columns.some(column => column.title === 'Naam controle-instantie'))!;
    expect(tables.find(table => table.name === child.sheetName)!.rows[2].cells.slice(0, 2).map(cell => cell.text))
      .toEqual(['Emissiepunt', 'Bron(nen)']);
    const headings = tables.find(table => table.name === child.sheetName)!.rows[2].cells.map(cell => cell.text);
    expect(headings).toContain('Naam controle-instantie');
    expect(headings.indexOf('Concentratie')).toBeLessThan(headings.indexOf('Massastroom'));
    expect(headings.indexOf('Massastroom')).toBeLessThan(headings.indexOf('Jaaremissie'));
    expect(await new ODSImporter().import(bytes, plan)).toEqual(expected);
    const edited = await modifyTable(bytes, child.sheetName, rows => {
      const values = cells(rows[3]);
      const mass = child.columns.find(column => column.title === 'Massastroom')!;
      values[layoutColumns(plan, child).indexOf(mass.id)] = odfCell(0);
      return [...rows.slice(0, 3), row(values), ...rows.slice(4)];
    });
    const imported = await new ODSImporter().import(edited, plan) as typeof data;
    const pollutant = imported.emissie[0].hasMember.find((member: { '@type'?: string }) => member['@type']);
    expect(pollutant.hasMember.find((member: { observedProperty: string }) =>
      member.observedProperty.endsWith('/emissie_parameter_massastroom')).hasResult.numericValue).toBe(0);
    expect(pollutant.hasMember.find((member: { observedProperty: string }) =>
      member.observedProperty.endsWith('/emissie_parameter_jaaremissie')).hasResult.numericValue).toBe(12.5);
    expect(imported.emissie[0]).not.toHaveProperty('identifier');
    const blank = await new ODSGenerator().generate({ ...options, data: undefined });
    expect(await new ODSImporter().import(blank, plan)).toEqual({});
  });
});
