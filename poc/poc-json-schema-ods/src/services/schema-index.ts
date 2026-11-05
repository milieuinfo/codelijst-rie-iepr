import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSchemaIndex, type SchemaIndex } from 'codelijst-rie-iepr-poc-json-schema';
export type { SchemaIndex, SchemaIndexEntry } from 'codelijst-rie-iepr-poc-json-schema';

const sha256 = (content: Buffer): string =>
  createHash('sha256').update(content).digest('hex');

export function loadSchemaIndex(inputDir: string): SchemaIndex {
  const index = parseSchemaIndex(JSON.parse(readFileSync(join(inputDir, 'schema/index.json'), 'utf8')));
  if (sha256(readFileSync(join(inputDir, 'codelist.jsonld'))) !== index.sourceSha256) {
    throw new Error('Codelist does not match the generated schema index. Sync schemas first.');
  }
  for (const entry of index.files) {
    const content = readFileSync(join(inputDir, 'schema', entry.path));
    if (sha256(content) !== entry.sha256 || JSON.parse(content.toString()).$id !== entry.id) {
      throw new Error(`Schema differs from generated index: ${entry.path}. Regenerate and sync schemas first.`);
    }
  }
  return index;
}
