import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pocRoot = join(__dirname, '..');
const pocDir = join(pocRoot, '..'); // parent "poc/" directory containing all POCs

// Source paths
const schemaSource = join(pocDir, 'poc-json-schema', 'output', 'schema');
const codelistSource = join(
  pocDir,
  'poc-json-schema',
  'public',
  'resources',
  'be',
  'vlaanderen',
  'omgeving',
  'data',
  'id',
  'conceptscheme',
  'rie-iepr',
);

// Destination
const inputDir = join(pocRoot, 'input');

function copyJson(file, destDir) {
  const src = join(schemaSource, file);
  const dest = join(destDir, file);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, readFileSync(src));
  console.log(`Copied schema: ${file}`);
}

function copyCodelist() {
  const src = join(codelistSource, 'rie-iepr.jsonld');
  const dest = join(inputDir, 'codelist.jsonld');
  writeFileSync(dest, readFileSync(src));
  console.log('Copied codelist: rie-iepr.jsonld');
}

async function main() {
  if (!existsSync(schemaSource)) {
    console.error(`Schema source not found: ${schemaSource}`);
    console.error('Run "npm run predev && npm run generate" in poc-json-schema first');
    process.exit(1);
  }

  mkdirSync(inputDir, { recursive: true });

  // Copy base schema
  copyJson('observatie.json', join(inputDir, 'schema'));

  // Copy all theme schemas
  const themes = ['grondstoffen', 'grondwater', 'lucht', 'water', 'zelfcontrole-lucht', 'zelfcontrole-water'];
  for (const theme of themes) {
    const srcFile = join(schemaSource, theme, 'schema.json');
    if (existsSync(srcFile)) {
      const destDir = join(inputDir, 'schema', theme);
      mkdirSync(destDir, { recursive: true });
      const src = readFileSync(srcFile);
      writeFileSync(join(destDir, 'schema.json'), src);
      console.log(`Copied schema: ${theme}/schema.json`);
    } else {
      console.warn(`Schema not found for theme: ${theme}`);
    }

    // Copy sub-schemas (composites) under each theme
    const themeSrcDir = join(schemaSource, theme);
    if (existsSync(themeSrcDir)) {
      for (const entry of readdirSync(themeSrcDir).sort()) {
        const compPath = join(themeSrcDir, entry);
        if (entry !== 'schema.json' && existsSync(compPath)) {
          try {
            const entries = readdirSync(compPath);
            if (entries.includes('schema.json')) {
              const srcFile = join(themeSrcDir, entry, 'schema.json');
              const destDir = join(inputDir, 'schema', theme, entry);
              mkdirSync(destDir, { recursive: true });
              writeFileSync(join(destDir, 'schema.json'), readFileSync(srcFile));
              console.log(`Copied schema: ${theme}/${entry}/schema.json`);
            }
          } catch {
            // skip non-directory entries
          }
        }
      }
    }
  }

  // Copy codelist
  if (existsSync(join(codelistSource, 'rie-iepr.jsonld'))) {
    copyCodelist();
  } else {
    console.warn('Codelist not found, run "npm run predev" in poc-json-schema first');
  }

  console.log('Sync complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
