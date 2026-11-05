import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseSchemaIndex } from '../dist/services/schema-index.js';
import { generationWarning } from '../dist/services/generation-report.js';
import { sourceSnapshot } from './source-snapshot.mjs';

const sha256 = content => createHash('sha256').update(content).digest('hex');
const readIndex = file => parseSchemaIndex(JSON.parse(readFileSync(file, 'utf8')));

export function syncSchemaSnapshot({ schemaSource, codelistSource, canonicalSource, inputDir }) {
  const index = readIndex(join(schemaSource, 'index.json'));
  const codelist = readFileSync(codelistSource);
  const canonical = JSON.parse(codelist.toString())['x-source-profile'] === 'groundwater-csv-v1'
    ? sourceSnapshot(canonicalSource) : readFileSync(canonicalSource);
  if (sha256(codelist) !== index.sourceSha256 || sha256(canonical) !== index.sourceSha256) {
    throw new Error('Stale schema/codelist input. Sync and regenerate poc-json-schema before syncing input.');
  }
  const files = index.files.map(entry => {
    const content = readFileSync(join(schemaSource, entry.path));
    if (sha256(content) !== entry.sha256 || JSON.parse(content.toString()).$id !== entry.id) {
      throw new Error(`Schema differs from generated index: ${entry.path}`);
    }
    return { entry, content };
  });
  const destination = join(inputDir, 'schema');
  const previousPath = join(destination, 'index.json');
  const previous = existsSync(previousPath) ? readIndex(previousPath) : undefined;
  const currentPaths = new Set(index.files.map(entry => entry.path));
  const obsolete = (previous?.files ?? []).filter(entry => !currentPaths.has(entry.path));
  for (const entry of obsolete) {
    const file = join(destination, entry.path);
    if (existsSync(file) && sha256(readFileSync(file)) !== entry.sha256) {
      throw new Error(`Refusing to remove modified synced schema: ${file}`);
    }
  }
  for (const { entry, content } of files) {
    const dest = join(destination, entry.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  }
  for (const entry of obsolete) {
    const file = join(destination, entry.path);
    if (existsSync(file)) unlinkSync(file);
  }
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(inputDir, 'codelist.jsonld'), codelist);
  writeFileSync(previousPath, JSON.stringify(index, null, 2) + '\n');
  const warning = generationWarning(index.generation);
  if (warning) console.warn(warning);
  console.log(`Synced ${files.length} indexed schemas and matching codelist.`);
  return index;
}
