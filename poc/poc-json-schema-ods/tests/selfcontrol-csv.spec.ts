import { describe, expect, it } from 'vitest';
import { sourceSnapshot } from '../../poc-json-schema/scripts/source-snapshot.mjs';
import { compileTheme } from '../../poc-json-schema/tests/groundwater-csv-fixture.js';
import { compileTabularPlan, hash } from '../src/services/tabular-plan.js';
import { ODSGenerator } from '../src/services/ods-generator.js';
import { ODSImporter } from '../src/services/ods-importer.js';
import { generationFixture } from '../src/services/generation-fixture.js';
import { readOdf, odfCell } from '../src/services/odf.js';
import { cells, modifyTable, row } from './fixtures.js';

for (const theme of ['Zelfcontrole lucht', 'Zelfcontrole water']) {
  const source = sourceSnapshot();
  const schema = compileTheme(JSON.parse(source), theme).subSchemas[0].schema;
  const plan = compileTabularPlan(schema, { sourceSha256: hash(source) });

  describe(`${theme} CSV -> reversible two-sheet ODS`, () => {
    it('round-trips optional concentration, unit choices, laboratory metadata and uncertainty boundaries', async () => {
      const fixture = (await generationFixture(plan))!;
      const bytes = await new ODSGenerator().generate({ plan, ...fixture });
      expect(await new ODSImporter().import(bytes, plan)).toEqual(fixture.data);
      const blank = await new ODSGenerator().generate({ plan, ...fixture, data: undefined });
      expect(await new ODSImporter().import(blank, plan)).toEqual({});
      const sheets = await readOdf(bytes);
      expect(sheets.map(sheet => sheet.name)).toEqual(['Voorblad', 'Metingen', 'Meetresultaten', 'Keuzelijsten', '_riepr']);
      const headers = sheets.find(sheet => sheet.name === 'Meetresultaten')!.rows[2].cells.map(cell => cell.text);
      expect(headers.slice(0, 2)).toEqual([theme === 'Zelfcontrole lucht' ? 'Emissiepunt' : 'Controleinrichting', 'Meetmoment']);
      expect(headers).toContain(theme === 'Zelfcontrole lucht' ? 'Massastroom' : 'Grenswaarde');
      expect(headers).toContain('Gehanteerde meetfrequentie');
      expect(headers).toContain('Bron meetfrequentie');
      expect(headers.some(header => /Rij-ID|Bovenliggende|Entiteits-ID|propertyID|observedProperty/.test(header))).toBe(false);
    });

    it('links results by point and timestamp, independent of row order or laboratory metadata', async () => {
      const fixture = (await generationFixture(plan))!;
      const bytes = await new ODSGenerator().generate({ plan, ...fixture });
      const reordered = await modifyTable(bytes, 'Metingen', rows =>
        [...rows.slice(0, 3), rows[4], rows[3], ...rows.slice(5)]);
      const expected = structuredClone(fixture.data) as { meting: unknown[] };
      expected.meting.reverse();
      expect(await new ODSImporter().import(reordered, plan)).toEqual(expected);

      const duplicate = structuredClone(fixture.data) as {
        meting: { resultTime: string; wasAssociatedWith?: { label: string } }[];
      };
      duplicate.meting[1].resultTime = duplicate.meting[0].resultTime;
      duplicate.meting[1].wasAssociatedWith = { label: 'Ander labo' };
      await expect(new ODSGenerator().generate({ plan, ...fixture, data: duplicate })).rejects.toThrow(/key|unique|duplicate/i);

      const unknown = await modifyTable(bytes, 'Meetresultaten', rows => {
        const values = cells(rows[3]);
        values[1] = odfCell('2024-06-03T19:00:00Z');
        return [...rows.slice(0, 3), row(values), ...rows.slice(4)];
      });
      await expect(new ODSImporter().import(unknown, plan)).rejects.toThrow();
    });
  });
}
