import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CodelistEnricher } from './services/codelist-enricher.js';
import { SchemaFlattener } from './services/schema-flattener.js';
import { SheetSplitter } from './services/sheet-splitter.js';
import { ODSGenerator } from './services/ods-generator.js';
import type { SheetConfig } from './services/ods-generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pocRoot = join(__dirname, '..');

interface CliArgs {
  theme?: string;
  outDir: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { outDir: 'output', dryRun: false };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--theme':
        args.theme = argv[++i];
        break;
      case '--out':
        args.outDir = argv[++i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      default:
        console.warn(`Unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  const inputDir = join(pocRoot, 'input');
  const schemaDir = join(inputDir, 'schema');
  const codelistPath = join(inputDir, 'codelist.jsonld');
  const outputDir = join(pocRoot, args.outDir);

  if (!existsSync(codelistPath)) {
    console.error('Codelist not found. Run "npm run predev" to sync schemas and codelist.');
    process.exit(1);
  }
  if (!existsSync(join(schemaDir, 'observatie.json'))) {
    console.error('Base schema not found. Run "npm run predev" to sync schemas.');
    process.exit(1);
  }

  // Initialize services
  const enricher = new CodelistEnricher(codelistPath);
  const flattener = new SchemaFlattener();
  flattener.loadBaseSchema(join(schemaDir, 'observatie.json'));
  const splitter = new SheetSplitter();
  const generator = new ODSGenerator();

  // Find available themes
  const availableThemes = getAvailableThemes(schemaDir);
  if (availableThemes.length === 0) {
    console.error('No theme schemas found in:', schemaDir);
    process.exit(1);
  }

  // Process requested or all themes
  const themesToProcess = args.theme ? [args.theme] : availableThemes;

  for (const theme of themesToProcess) {
    if (!availableThemes.includes(theme)) {
      console.error(`Theme "${theme}" not found. Available: ${availableThemes.join(', ')}`);
      process.exit(1);
    }
    await processTheme(theme, schemaDir, outputDir, enricher, generator, args.dryRun);
  }

  // Report unresolved URIs
  const unresolved = enricher.getUnresolvedUris();
  if (unresolved.length > 0) {
    console.log(`\nFound ${unresolved.length} unresolved URI(s):`);
    for (const uri of unresolved) {
      console.log(`  - ${uri}`);
    }
  }

  console.log('\nDone.');
}

async function processTheme(
  theme: string,
  schemaDir: string,
  outputDir: string,
  enricher: CodelistEnricher,
  generator: ODSGenerator,
  dryRun: boolean,
): Promise<void> {
  const schemaPath = join(schemaDir, theme, 'schema.json');
  console.log(`\nProcessing theme: ${theme}`);

  const flattener = new SchemaFlattener();
  flattener.loadBaseSchema(join(schemaDir, 'observatie.json'));
  const splitter = new SheetSplitter();

  // Step 1: Flatten schema into columns
  const columns = flattener.flatten(schemaPath);
  console.log(`  Extracted ${columns.length} columns`);

  // Step 2: Enrich dropdown URIs with codelist labels
  for (const col of columns) {
    if (col.dropdownUris && col.dropdownUris.length > 0) {
      const enriched = enricher.resolveMany(col.dropdownUris);
      col.dropdownLabels = enriched.map((e) => e.displayLabel);

      const unresolvedCount = enriched.filter((e) => !e.resolved).length;
      if (unresolvedCount > 0) {
        console.log(`  [warn] ${col.title}: ${unresolvedCount}/${enriched.length} labels unresolved`);
      } else {
        console.log(`  [ok]   ${col.title}: enriched ${enriched.length} values`);
      }
    }
  }

  // Dry-run mode: print columns to console
  if (dryRun) {
    for (const col of columns) {
      let extra = '';
      if (col.uiType === 'dropdown') {
        extra = ` [${(col.dropdownLabels || []).join(', ')}]`;
      }
      console.log(`    ${col.jsonPath} -> "${col.title}" (${col.uiType})${extra}`);
    }
    return;
  }

  // Step 3: Look up theme display name from codelist
  const themeTitle = getThemeDisplayName(enricher, theme);

  // Step 4: Split into sheets (main + nested objects)
  const sheets = splitter.split(columns, themeTitle);
  console.log(`  Sheets: ${sheets.map((s) => s.sheetName).join(', ')}`);

  // Step 5: Generate ODS file using unified generator
  mkdirSync(outputDir, { recursive: true });
  const odsPath = join(outputDir, `${theme}.ods`);

  const sheetConfigs: SheetConfig[] = sheets.map((s) => ({
    sheetName: s.sheetName,
    columns: s.columns,
  }));

  const buffer = await generator.generate({
    documentTitle: themeTitle,
    sheets: sheetConfigs,
  });

  writeFileSync(odsPath, Buffer.from(buffer));
  console.log(`  Written: ${odsPath}`);
}

function getAvailableThemes(schemaDir: string): string[] {
  const themes: string[] = [];
  for (const entry of readdirSync(schemaDir)) {
    if (!entry.endsWith('.json') && existsSync(join(schemaDir, entry, 'schema.json'))) {
      themes.push(entry);
    }
  }
  return themes.sort();
}

function getThemeDisplayName(enricher: CodelistEnricher, theme: string): string {
  const concept = enricher.getAllConcepts().find((c) => c.id.includes(`thema-type:${theme}`));
  return concept?.prefLabel || theme;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
