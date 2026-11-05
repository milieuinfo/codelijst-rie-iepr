import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncSchemas } from '../scripts/sync-schemas.mjs';
import { loadSchemaIndex } from '../src/services/schema-index.js';

const directories: string[] = [];
const digest = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ods-schema-index-'));
  directories.push(root);
  const schemaSource = join(root, 'generated');
  const inputDir = join(root, 'input');
  const codelistSource = join(root, 'source.jsonld');
  const canonicalSource = join(root, 'canonical.jsonld');
  writeFileSync(codelistSource, '{"synthetic":true}');
  writeFileSync(canonicalSource, '{"synthetic":true}');
  mkdirSync(schemaSource);
  const options = { schemaSource, inputDir, codelistSource, canonicalSource };
  const publish = (names: string[]) => {
    const files = names.map(name => {
      const path = `${name}/schema.json`;
      const id = `https://example.test/${name}`;
      const content = JSON.stringify({ $id: id, type: 'object' });
      mkdirSync(join(schemaSource, name), { recursive: true });
      writeFileSync(join(schemaSource, path), content);
      return { path, id, sha256: digest(content), kind: 'theme', theme: name };
    });
    const index = { version: 1, sourceSha256: digest(readFileSync(codelistSource)), files };
    writeFileSync(join(schemaSource, 'index.json'), JSON.stringify(index));
    return index;
  };
  return { ...options, publish, options };
}
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('Index-driven schema synchronization', () => {
  it('preserves explicit partial coverage through synchronization and loading and warns on sync', () => {
    const f = fixture();
    const index = f.publish(['supported']);
    const generation = {
      mode: 'allow-incomplete', complete: false,
      blockedSections: [{
        theme: 'Synthetic', themeConceptId: 'urn:theme', sectionConceptId: 'urn:blocked', sectionLabel: 'Blocked',
        issues: [{ code: 'unresolved-unit', conceptId: 'urn:quantity', message: 'Unit is TODO.' }],
      }],
    };
    const expected = { ...index, generation };
    writeFileSync(join(f.schemaSource, 'index.json'), JSON.stringify(expected));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(syncSchemas(f.options)).toEqual(expected);
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('INCOMPLETE schema snapshot: 1 blocked section(s)'));
      expect(loadSchemaIndex(f.inputDir)).toEqual(expected);
    } finally { warning.mockRestore(); }
  });

  it.each([
    { mode: 'allow-incomplete', complete: false, blockedSections: [] },
    { mode: 'allow-incomplete', complete: true, blockedSections: [{}] },
    { mode: 'strict', complete: false, blockedSections: [] },
    { mode: 'unknown', complete: true, blockedSections: [] },
  ])('rejects malformed generation reports without changing synced input: %j', generation => {
    const f = fixture();
    const index = f.publish(['supported']);
    syncSchemas(f.options);
    const before = readFileSync(join(f.inputDir, 'schema/index.json'), 'utf8');
    writeFileSync(join(f.schemaSource, 'index.json'), JSON.stringify({ ...index, generation }));
    expect(() => syncSchemas(f.options)).toThrow('Invalid schema generation report');
    expect(readFileSync(join(f.inputDir, 'schema/index.json'), 'utf8')).toBe(before);
    writeFileSync(join(f.inputDir, 'schema/index.json'), JSON.stringify({ ...index, generation }));
    expect(() => loadSchemaIndex(f.inputDir)).toThrow('Invalid schema generation report');
  });

  it('discovers previously unknown themes and excludes unindexed source and destination schemas', () => {
    const f = fixture();
    const expected = f.publish(['new-theme', 'another-theme']);
    mkdirSync(join(f.inputDir, 'schema/legacy'), { recursive: true });
    writeFileSync(join(f.inputDir, 'schema/legacy/schema.json'), 'unindexed legacy');
    writeFileSync(join(f.schemaSource, 'not-indexed.json'), 'not generated');
    syncSchemas(f.options);
    expect(loadSchemaIndex(f.inputDir)).toEqual(expected);
    expect(existsSync(join(f.inputDir, 'schema/not-indexed.json'))).toBe(false);
    expect(readFileSync(join(f.inputDir, 'schema/legacy/schema.json'), 'utf8')).toBe('unindexed legacy');
  });

  it('removes only obsolete previously synced files and preserves unrelated files', () => {
    const f = fixture();
    f.publish(['old', 'keep']);
    syncSchemas(f.options);
    writeFileSync(join(f.inputDir, 'schema/notes.txt'), 'notes');
    f.publish(['keep', 'new']);
    syncSchemas(f.options);
    expect(existsSync(join(f.inputDir, 'schema/old/schema.json'))).toBe(false);
    expect(readFileSync(join(f.inputDir, 'schema/notes.txt'), 'utf8')).toBe('notes');
    expect(loadSchemaIndex(f.inputDir).files.map(entry => entry.theme)).toEqual(['keep', 'new']);
  });

  it('rejects stale schemas and codelists before modifying any destination files', () => {
    const f = fixture();
    f.publish(['one']);
    syncSchemas(f.options);
    const before = readFileSync(join(f.inputDir, 'schema/index.json'), 'utf8');
    f.publish(['two']);
    writeFileSync(f.canonicalSource, '{"newer":true}');
    expect(() => syncSchemas(f.options)).toThrow('Stale schema/codelist');
    expect(readFileSync(join(f.inputDir, 'schema/index.json'), 'utf8')).toBe(before);
    expect(existsSync(join(f.inputDir, 'schema/two/schema.json'))).toBe(false);
    writeFileSync(f.canonicalSource, readFileSync(f.codelistSource));
    writeFileSync(join(f.schemaSource, 'two/schema.json'), '{}');
    expect(() => syncSchemas(f.options)).toThrow('differs from generated index');
    expect(readFileSync(join(f.inputDir, 'schema/index.json'), 'utf8')).toBe(before);
  });

  it('refuses to delete an obsolete file edited since synchronization', () => {
    const f = fixture();
    f.publish(['old']);
    syncSchemas(f.options);
    writeFileSync(join(f.inputDir, 'schema/old/schema.json'), 'manual changes');
    f.publish(['new']);
    expect(() => syncSchemas(f.options)).toThrow('modified synced schema');
    expect(readFileSync(join(f.inputDir, 'schema/old/schema.json'), 'utf8')).toBe('manual changes');
    expect(existsSync(join(f.inputDir, 'schema/new/schema.json'))).toBe(false);
  });

  it('rejects unsafe and duplicate manifest entries', () => {
    const f = fixture();
    const index = f.publish(['safe']);
    index.files[0].path = '../outside.json';
    writeFileSync(join(f.schemaSource, 'index.json'), JSON.stringify(index));
    expect(() => syncSchemas(f.options)).toThrow('Unsafe');
    index.files[0].path = 'safe/schema.json';
    index.files.push(index.files[0]);
    writeFileSync(join(f.schemaSource, 'index.json'), JSON.stringify(index));
    expect(() => syncSchemas(f.options)).toThrow('duplicate');
  });

  it('fails when input is missing rather than reusing stale copies', () => {
    const f = fixture();
    expect(() => syncSchemas(f.options)).toThrow();
    expect(() => loadSchemaIndex(f.inputDir)).toThrow();
  });

  it('detects changed synced schemas or codelists before ODS generation', () => {
    const f = fixture();
    f.publish(['one']);
    syncSchemas(f.options);
    writeFileSync(join(f.inputDir, 'schema/one/schema.json'), '{}');
    expect(() => loadSchemaIndex(f.inputDir)).toThrow('differs from generated index');
    syncSchemas(f.options);
    writeFileSync(join(f.inputDir, 'codelist.jsonld'), '{}');
    expect(() => loadSchemaIndex(f.inputDir)).toThrow('Codelist does not match');
  });
});
