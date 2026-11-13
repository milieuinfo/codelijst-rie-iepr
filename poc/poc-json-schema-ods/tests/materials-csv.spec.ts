import { describe, expect, it } from 'vitest';
import { sourceSnapshot } from '../../poc-json-schema/scripts/source-snapshot.mjs';
import { compileTheme } from '../../poc-json-schema/tests/groundwater-csv-fixture.js';
import { compileTabularPlan, hash } from '../src/services/tabular-plan.js';
import { ODSGenerator } from '../src/services/ods-generator.js';
import { ODSImporter } from '../src/services/ods-importer.js';
import { generationFixture } from '../src/services/generation-fixture.js';
import { readOdf, odfCell } from '../src/services/odf.js';
import { cells, modifyTable, row } from './fixtures.js';

const source = sourceSnapshot();
const compiled = compileTheme(JSON.parse(source), 'Grondstoffen');
const planFor = (name: string) => compileTabularPlan(
  compiled.subSchemas.find(section => section.name === name)!.schema, { sourceSha256: hash(source) });

describe('Raw-material CSV -> reversible ODS', () => {
  it.each(['grondstof', 'inkomend'])('round-trips populated and blank %s workbooks, preserving zero and optional absence', async name => {
    const plan = planFor(name);
    const fixture = (await generationFixture(plan))!;
    const bytes = await new ODSGenerator().generate({ plan, ...fixture });
    expect(await new ODSImporter().import(bytes, plan)).toEqual(fixture.data);
    const blank = await new ODSGenerator().generate({ plan, ...fixture, data: undefined });
    expect(await new ODSImporter().import(blank, plan)).toEqual({});
    const sheets = await readOdf(bytes);
    expect(sheets.find(sheet => sheet.name === 'Voorblad')!.rows.some(row =>
      row.cells.some(cell => cell.text.includes('Heeft u grondstoffen geproduceerd?')))).toBe(name === 'grondstof');
    expect(sheets.map(sheet => sheet.name)).toEqual(name === 'grondstof'
      ? ['Voorblad', 'Geproduceerde grondstoffen', 'Bestemmingen', 'Keuzelijsten', '_riepr']
      : ['Voorblad', 'Inkomende grondstoffen', 'Keuzelijsten', '_riepr']);
    const headers = sheets.find(sheet => sheet.name === (name === 'grondstof' ? 'Bestemmingen' : 'Inkomende grondstoffen'))!
      .rows[2].cells.map(cell => cell.text.replace(/ \*$/, ''));
    expect(headers).toContain(name === 'grondstof' ? 'Type bestemming' : 'Activiteit');
    expect(headers).toContain(name === 'grondstof' ? 'Materiaalcode' : 'IEPR installatie');
    expect(headers.some(header => /Rij-ID|Bovenliggende|Entiteits-ID|propertyID/.test(header))).toBe(false);
  });

  it('links multiple destinations by material URI, independently of parent order, and rejects duplicate/unknown keys', async () => {
    const plan = planFor('grondstof');
    const fixture = (await generationFixture(plan))!;
    const bytes = await new ODSGenerator().generate({ plan, ...fixture });
    const reordered = await modifyTable(bytes, 'Geproduceerde grondstoffen', rows =>
      [...rows.slice(0, 3), rows[4], rows[3], ...rows.slice(5)]);
    const expected = structuredClone(fixture.data) as { grondstof: unknown[] };
    expected.grondstof.reverse();
    expect(await new ODSImporter().import(reordered, plan)).toEqual(expected);

    const duplicate = structuredClone(fixture.data) as { grondstof: { hasResult: { material: string } }[] };
    duplicate.grondstof[1].hasResult.material = duplicate.grondstof[0].hasResult.material;
    await expect(new ODSGenerator().generate({ plan, ...fixture, data: duplicate })).rejects.toThrow(/key|unique|duplicate/i);
    const unknown = await modifyTable(bytes, 'Bestemmingen', rows => {
      const values = cells(rows[3]);
      values[0] = odfCell('urn:unknown:material');
      return [...rows.slice(0, 3), row(values), ...rows.slice(4)];
    });
    await expect(new ODSImporter().import(unknown, plan)).rejects.toThrow();
  });
});
