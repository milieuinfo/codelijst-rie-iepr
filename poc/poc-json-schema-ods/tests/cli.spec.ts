import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { hash } from '../src/services/tabular-plan.js';
import { instance, reportingSchema } from './fixtures.js';
import { personalizeReferenceSchema } from 'codelijst-rie-iepr-poc-json-schema';
import { sourceSnapshot } from '../../poc-json-schema/scripts/source-snapshot.mjs';
import { compileGroundwater } from '../../poc-json-schema/tests/groundwater-csv-fixture.js';

const cli = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/cli.js');

describe('Indexed CLI export/import', () => {
  it('selects personal variants for verified blank templates and populated round trips without separate references', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'riepr-personal-ods-cli-'));
    try {
      const input = join(directory, 'input');
      const schemaDirectory = join(input, 'schema/grondwater/peilmeting');
      await mkdir(schemaDirectory, { recursive: true });
      const generic = compileGroundwater(JSON.parse(sourceSnapshot())).subSchemas.find(section => section.name === 'peilmeting')!.schema;
      const references = JSON.parse(await readFile(new URL('../../poc-json-schema/examples/refs.json', import.meta.url), 'utf8'));
      const personal = personalizeReferenceSchema(generic, { references, referenceContext: { year: 2024 } });
      const source = JSON.stringify({ '@context': {}, graph: [] });
      await writeFile(join(input, 'codelist.jsonld'), source);
      const files = [];
      for (const [filename, schema] of [['schema.json', generic], ['schema.personalized.json', personal]] as const) {
        const content = JSON.stringify(schema);
        await writeFile(join(schemaDirectory, filename), content);
        files.push({
          path: `grondwater/peilmeting/${filename}`, id: schema.$id, sha256: hash(content), theme: 'grondwater',
          kind: schema === generic ? 'section' : 'personalized',
          ...(schema === personal ? { genericSchemaId: generic.$id } : {}),
        });
      }
      await writeFile(join(input, 'schema/index.json'), JSON.stringify({ version: 1, sourceSha256: hash(source), files }));
      const data = await readFile(new URL('../../poc-json-schema/examples/grondwater/peilmeting.json', import.meta.url), 'utf8');
      const sample = join(directory, 'data.json');
      await writeFile(sample, data);
      const common = ['--input-dir', input, '--theme', 'grondwater', '--section', 'peilmeting', '--personalized'];
      const run = (command: string, ...args: string[]) =>
        spawnSync(process.execPath, [cli, command, ...common, ...args], { encoding: 'utf8' });
      const template = run('template', '--data', sample, '--out', join(directory, 'templates'));
      expect(template.status, template.stderr).toBe(0);
      await expect(access(join(directory, 'templates/grondwater/grondwater-peilmetingen.personalized.ods'))).resolves.toBeUndefined();
      const exported = run('export', '--data', sample, '--out', join(directory, 'exports'));
      expect(exported.status, exported.stderr).toBe(0);
      const output = join(directory, 'imported.json');
      const imported = run('import', '--ods', join(directory, 'exports/grondwater/grondwater-peilmetingen.personalized.ods'), '--out', output);
      expect(imported.status, imported.stderr).toBe(0);
      expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(JSON.parse(data));
      const context = join(directory, 'context.json');
      await writeFile(context, '{"year":2025}');
      const mismatched = run('plan', '--reference-context', context);
      expect(mismatched.status).toBe(1);
      expect(mismatched.stderr).toContain('Reference context differs');
      await writeFile(join(input, 'schema/index.json'), JSON.stringify({ version: 1, sourceSha256: hash(source), files: [files[0]] }));
      const missing = run('plan');
      expect(missing.status).toBe(1);
      expect(missing.stderr).toContain('No personalized schema');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('round-trips an explicit section and never writes success JSON after an import failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'riepr-ods-cli-'));
    try {
      const input = join(directory, 'input');
      const schemaDirectory = join(input, 'schema/synthetic/report');
      await mkdir(schemaDirectory, { recursive: true });
      const source = JSON.stringify({ '@context': {}, graph: [] });
      const schema = JSON.stringify({ $id: 'https://example.test/section', ...reportingSchema });
      await writeFile(join(input, 'codelist.jsonld'), source);
      await writeFile(join(schemaDirectory, 'schema.json'), schema);
      await writeFile(join(input, 'schema/index.json'), JSON.stringify({
        version: 1, sourceSha256: hash(source),
        files: [{ path: 'synthetic/report/schema.json', id: 'https://example.test/section', sha256: hash(schema), kind: 'section', theme: 'synthetic' }],
        generation: {
          mode: 'allow-incomplete', complete: false,
          blockedSections: [{
            theme: 'Synthetic', themeConceptId: 'urn:theme', sectionConceptId: 'urn:blocked', sectionLabel: 'Blocked',
            issues: [{ code: 'missing-datatype', conceptId: 'urn:field', message: 'Missing type.' }],
          }],
        },
      }));
      const original = join(directory, 'data.json');
      await writeFile(original, JSON.stringify(instance()));
      const common = ['--input-dir', input, '--theme', 'synthetic', '--section', 'report'];
      const refused = spawnSync(process.execPath, [cli, 'export', ...common, '--data', original, '--out', join(directory, 'refused')], { encoding: 'utf8' });
      expect(refused.status).not.toBe(0);
      expect(refused.stderr).toContain('--allow-incomplete');
      const exported = spawnSync(process.execPath, [cli, 'export', ...common, '--allow-incomplete', '--data', original, '--out', join(directory, 'export')], { encoding: 'utf8' });
      expect(exported.status, exported.stderr).toBe(0);
      expect(exported.stderr).toContain('INCOMPLETE schema snapshot: 1 blocked section(s)');
      const workbook = join(directory, 'export/synthetic/report.ods');
      const output = join(directory, 'imported.json');
      const imported = spawnSync(process.execPath, [cli, 'import', ...common, '--allow-incomplete', '--ods', workbook, '--out', output], { encoding: 'utf8' });
      expect(imported.status, imported.stderr).toBe(0);
      expect(imported.stderr).toContain('INCOMPLETE schema snapshot: 1 blocked section(s)');
      expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(instance());
      await writeFile(workbook, 'not a workbook');
      const failedOutput = join(directory, 'must-not-exist.json');
      const failed = spawnSync(process.execPath, [cli, 'import', ...common, '--allow-incomplete', '--ods', workbook, '--out', failedOutput], { encoding: 'utf8' });
      expect(failed.status).not.toBe(0);
      expect(failed.stderr.length).toBeGreaterThan(0);
      await expect(access(failedOutput)).rejects.toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
