import { readFile } from 'node:fs/promises';
import type { TabularPlan } from '../models/tabular-plan.js';
import { referenceContext, referenceData } from './workbook-metadata.js';

export async function generationFixture(plan: TabularPlan) {
  const section = plan.schema['x-section-concept'];
  const profiles = [
    { theme: 'grondwater', sections: ['onttrekking', 'peilmeting', 'kwaliteitsmeting'] },
    { theme: 'lucht', sections: ['emissie', 'brandstof', 'verbruikte_stof', 'geproduceerde_stof', 'afvalproduct'] },
    { theme: 'water', sections: ['lozing', 'abnormale-lozing'] },
  ];
  const profile = profiles.find(profile => typeof section === 'string' &&
    section.startsWith(`https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-${profile.theme}/`));
  if (!profile || typeof section !== 'string') return undefined;
  const name = section.slice(section.lastIndexOf('/') + 1);
  if (!profile.sections.includes(name)) {
    throw new Error(`No generation validation fixture for ${profile.theme} section ${section}.`);
  }
  const directory = new URL('../../../poc-json-schema/examples/', import.meta.url);
  return {
    data: JSON.parse(await readFile(new URL(`${profile.theme}/${name}.json`, directory), 'utf8')) as unknown,
    references: referenceData(JSON.parse(await readFile(new URL('refs.json', directory), 'utf8'))),
    referenceContext: referenceContext(JSON.parse(await readFile(new URL('reference-context.json', directory), 'utf8'))),
  };
}
