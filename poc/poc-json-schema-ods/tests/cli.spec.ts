import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { hash } from '../src/services/tabular-plan.js';
import { instance, reportingSchema } from './fixtures.js';

const cli = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/cli.js');

describe('Indexed CLI export/import', () => {
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
