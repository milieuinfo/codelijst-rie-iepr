import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { CodelistEnricher } from '../src/services/codelist-enricher.js';
import { collectCsorUris } from '../src/services/csor-labels.js';

const CSOR = 'https://data.omgeving.vlaanderen.be/id/concept/csor';

function fixture(): { schemaDir: string; codelistPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'csor-labels-'));
  const schemaDir = join(dir, 'schema');
  mkdirSync(join(schemaDir, 'water', 'lozing'), { recursive: true });
  writeFileSync(
    join(schemaDir, 'water', 'lozing', 'schema.json'),
    JSON.stringify({
      properties: {
        parameter: { enum: [`${CSOR}/variabele/V_46`, `${CSOR}/variabele/V_231`] },
        hasResult: { properties: { hasUnit: { const: `${CSOR}/eenheid/E_1` } } },
        other: { enum: ['https://example.org/not-csor'] },
      },
    }),
  );
  const codelistPath = join(dir, 'codelist.jsonld');
  writeFileSync(codelistPath, JSON.stringify({ '@context': {}, graph: [] }));
  return { schemaDir, codelistPath };
}

describe('CSOR labels', () => {
  it('collects the CSOR URIs used in the schemas', () => {
    const { schemaDir } = fixture();
    expect(collectCsorUris(schemaDir)).toEqual([
      `${CSOR}/eenheid/E_1`,
      `${CSOR}/variabele/V_231`,
      `${CSOR}/variabele/V_46`,
    ]);
  });

  it('resolves variabelen to their prefLabel and eenheden to their symbol', () => {
    const { codelistPath } = fixture();
    const enricher = new CodelistEnricher(codelistPath);
    enricher.addExternalLabels([
      { uri: `${CSOR}/variabele/V_46`, prefLabel: 'Fosfor', symbol: 'P' },
      { uri: `${CSOR}/eenheid/E_1`, prefLabel: 'milligram per liter', symbol: 'mg/L' },
    ]);

    expect(enricher.resolve(`${CSOR}/variabele/V_46`)).toMatchObject({ displayLabel: 'Fosfor', resolved: true });
    expect(enricher.resolve(`${CSOR}/eenheid/E_1`)).toMatchObject({ displayLabel: 'mg/L', resolved: true });
    expect(enricher.resolve(`${CSOR}/variabele/V_231`)).toMatchObject({ displayLabel: 'V_231', resolved: false });
  });
});
