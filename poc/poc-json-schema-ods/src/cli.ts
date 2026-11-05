import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodelistEnricher } from './services/codelist-enricher.js';
import { loadSchemaIndex } from './services/schema-index.js';
import { compileTabularPlan } from './services/tabular-plan.js';
import { ODSGenerator } from './services/ods-generator.js';
import { ODSImporter } from './services/ods-importer.js';
import { referenceData, referenceContext } from './services/workbook-metadata.js';
import { collectCsorValues, fetchCsorLabels } from './services/csor-labels.js';
import { schemaObject, generationWarning } from 'codelijst-rie-iepr-poc-json-schema';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0] && !argv[0].startsWith('--') ? argv.shift()! : 'template';
  if (!['template', 'export', 'import', 'plan'].includes(command)) throw new Error(`Unknown command: ${command}`);
  const args = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (args.has(key)) throw new Error(`Duplicate option: ${key}`);
    if (key === '--dry-run' || key === '--fetch-labels' || key === '--allow-incomplete') { args.set(key, 'true'); continue; }
    if (!['--theme', '--section', '--out', '--data', '--references', '--reference-context', '--ods', '--input-dir'].includes(key) ||
        !argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`Unknown option or missing value: ${key}`);
    args.set(key, argv[++index]);
  }
  const input = resolve(args.get('--input-dir') ?? join(root, 'input'));
  const index = loadSchemaIndex(input);
  const warning = generationWarning(index.generation);
  if (warning && !args.has('--allow-incomplete')) throw new Error(`${warning} Use --allow-incomplete to generate the indexed valid sections anyway.`);
  if (warning) console.warn(warning);
  let entries = index.files.filter(entry => entry.kind === 'section');
  if (args.has('--theme')) entries = entries.filter(entry => entry.theme === args.get('--theme'));
  if (args.has('--section')) entries = entries.filter(entry =>
    entry.path.split('/').at(-2) === args.get('--section') || entry.id === args.get('--section'));
  if (!entries.length) throw new Error('No matching reporting sections in the generated index. Generate and sync the selected section first.');
  if (['import', 'export'].includes(command) && entries.length !== 1) throw new Error('Import/export requires one explicit --theme and --section.');
  if (command === 'export' && !args.has('--data')) throw new Error('Export requires --data <json-file>.');
  if (command === 'import' && (!args.has('--ods') || !args.has('--out'))) throw new Error('Import requires --ods <workbook> and --out <json-file>.');
  const dependencies = await Promise.all(index.files.filter(entry => entry.kind === 'base').map(async entry =>
    schemaObject(JSON.parse(await readFile(join(input, 'schema', entry.path), 'utf8')))));
  const references = args.has('--references') ? referenceData(JSON.parse(await readFile(resolve(args.get('--references')!), 'utf8'))) : undefined;
  const context = args.has('--reference-context') ? referenceContext(JSON.parse(await readFile(resolve(args.get('--reference-context')!), 'utf8'))) : undefined;
  const enricher = command === 'import' || command === 'plan' || args.has('--dry-run') ? undefined : new CodelistEnricher(join(input, 'codelist.jsonld'));
  const failures: string[] = [];
  for (const entry of entries) {
    try {
      const schema = schemaObject(JSON.parse(await readFile(join(input, 'schema', entry.path), 'utf8')));
      const plan = compileTabularPlan(schema, { sourceSha256: index.sourceSha256, schemaSha256: entry.sha256, dependencies });
      if (args.has('--fetch-labels') && enricher) enricher.addExternalLabels(await fetchCsorLabels(collectCsorValues(schema)));
      if (command === 'plan' || args.has('--dry-run')) {
        console.log(JSON.stringify({
          schemaId: plan.schemaId, sourceSha256: plan.sourceSha256,
          records: plan.records.map(record => ({
            id: record.id, parentId: record.parentId, path: record.path, ancestry: record.ancestry,
            sheet: record.sheetName, kind: record.kind,
            columns: record.columns.map(column => ({ title: column.title, path: column.path, schemaPointer: column.schemaPointer, required: column.required })),
          })),
        }, null, 2));
      } else if (command === 'import') {
        const data = await new ODSImporter().import(await readFile(resolve(args.get('--ods')!)), plan, { references, referenceContext: context });
        const output = resolve(args.get('--out')!);
        if (output === resolve(args.get('--ods')!)) throw new Error('JSON output must not overwrite the source workbook.');
        await mkdir(dirname(output), { recursive: true });
        await writeFile(output, JSON.stringify(data, null, 2) + '\n');
        console.log(`Imported ${output}`);
      } else {
        const data: unknown = command === 'export' ? JSON.parse(await readFile(resolve(args.get('--data')!), 'utf8')) : undefined;
        const workbook = await new ODSGenerator().generate({ plan, data, references, referenceContext: context, label: value => enricher!.resolve(value).displayLabel });
        const workbookName = schema['x-table-workbook'] ?? `${entry.path.split('/').at(-2)}.ods`;
        if (typeof workbookName !== 'string' || !/^[^/\\]+\.ods$/.test(workbookName)) throw new Error(`Invalid workbook filename: ${String(workbookName)}`);
        const output = resolve(args.get('--out') ?? join(root, 'output'), entry.theme!, workbookName);
        await mkdir(dirname(output), { recursive: true });
        await writeFile(output, workbook);
        console.log(`Written ${output}`);
      }
    } catch (error) {
      if (entries.length === 1) throw error;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed ${entry.id}: ${message}`);
      failures.push(entry.id);
    }
  }
  if (failures.length) throw new Error(`${failures.length} of ${entries.length} section(s) failed; see messages above. Sections needing reference data can be generated with --references <json-file>.`);
  const unresolved = enricher?.getUnresolvedUris() ?? [];
  if (unresolved.length) console.warn(`Labels unavailable for ${unresolved.length} URI(s); choices retain their exact URI mappings. Use --fetch-labels for published CSOR labels, or supply labels through the export API.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
