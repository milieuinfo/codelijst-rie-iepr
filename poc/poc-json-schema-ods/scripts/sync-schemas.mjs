import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncSchemaSnapshot } from '../../poc-json-schema/scripts/sync-schema-snapshot.mjs';

const pocRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPoc = resolve(pocRoot, '../poc-json-schema');
const resource = 'resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld';

export function syncSchemas({
  schemaSource = join(schemaPoc, 'output/schema'),
  codelistSource = join(schemaPoc, 'public', resource),
  canonicalSource = resolve(pocRoot, '../../src/main', resource),
  inputDir = join(pocRoot, 'input'),
} = {}) {
  return syncSchemaSnapshot({ schemaSource, codelistSource, canonicalSource, inputDir });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { syncSchemas(); }
  catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
