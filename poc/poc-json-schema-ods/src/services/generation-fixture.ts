import { readFile } from 'node:fs/promises';
import type { TabularPlan } from '../models/tabular-plan.js';
import { referenceContext, referenceData } from './workbook-metadata.js';

export async function generationFixture(plan: TabularPlan) {
  const section = plan.schema['x-section-concept'];
  const prefix = 'https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-grondwater/';
  if (typeof section !== 'string' || !section.startsWith(prefix)) return undefined;
  const name = section.slice(prefix.length);
  if (!['onttrekking', 'peilmeting', 'kwaliteitsmeting'].includes(name)) {
    throw new Error(`No generation validation fixture for groundwater section ${section}.`);
  }
  const directory = new URL('../../../poc-json-schema/examples/', import.meta.url);
  return {
    data: JSON.parse(await readFile(new URL(`grondwater/${name}.json`, directory), 'utf8')) as unknown,
    references: referenceData(JSON.parse(await readFile(new URL('refs.json', directory), 'utf8'))),
    referenceContext: referenceContext(JSON.parse(await readFile(new URL('reference-context.json', directory), 'utf8'))),
  };
}
