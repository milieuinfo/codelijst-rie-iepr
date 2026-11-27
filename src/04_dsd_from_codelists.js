import rdf from '@zazuko/env-node';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDsdDocuments } from './utils/dsd.js';

const { Writer } = createRequire(import.meta.url)('n3');

export async function generateDsds(turtlePath, outputDirectory) {
    const prefixes = {
        qb: 'http://purl.org/linked-data/cube#',
        dsd: 'https://data.omgeving.vlaanderen.be/id/dsd/',
    };
    const input = rdf.fromFile(turtlePath);
    input.on('prefix', (prefix, namespace) => { prefixes[prefix] = namespace.value; });
    const source = await rdf.dataset().import(input);
    const documents = createDsdDocuments(source);
    // Compile and serialize everything before touching the previous publication.
    const files = await Promise.all(documents.map(async document => {
        const codeList = [...document.graph.match(null, rdf.namedNode(prefixes.qb + 'codeList'))][0]?.object.value;
        const namespaces = Object.entries(prefixes).sort((a, b) => b[1].length - a[1].length);
        const generatedPrefixes = {};
        for (const role of ['dimension', 'measure', 'attribute']) {
            for (const { object } of document.graph.match(null, rdf.namedNode(prefixes.qb + role))) {
                const match = namespaces.find(([, namespace]) => object.value.startsWith(namespace));
                if (!match) continue;
                const [prefix, namespace] = match;
                generatedPrefixes['comp-' + prefix] = document.id + '#component-' + encodeURIComponent(namespace);
                if (codeList && document.graph.match(object, rdf.namedNode(prefixes.qb + 'codeList')).size) {
                    generatedPrefixes['codes-' + prefix] = codeList.slice(0, codeList.lastIndexOf('/') + 1) + encodeURIComponent(namespace);
                }
            }
        }
        const candidates = Object.entries({
            ...prefixes,
            dsd: document.id.slice(0, document.id.lastIndexOf('/') + 1),
            ...generatedPrefixes,
        }).sort((a, b) => b[1].length - a[1].length);
        const used = new Set();
        for (const { subject, predicate, object } of document.graph) {
            for (const term of [subject, predicate, object, object.datatype].filter(Boolean)) {
                if (term.termType !== 'NamedNode') continue;
                const match = candidates.find(([, namespace]) => term.value.startsWith(namespace));
                if (match) used.add(match[0]);
            }
        }
        const writer = new Writer({
            format: 'Turtle',
            prefixes: Object.fromEntries(candidates.filter(([prefix]) => used.has(prefix))),
        });
        writer.addQuads([...document.graph]);
        const turtle = await new Promise((resolve, reject) => {
            writer.end((error, result) => error ? reject(error) : resolve(result));
        });
        // Keep literal/IRI tokens untouched when laying out the flat DSD graph.
        const formatted = turtle.replace(
            /@prefix [^\n]+\n|"(?:\\.|[^"\\])*"|<[^>]*>|\\.|,\s*|\.\n/g,
            token => token.startsWith(',') ? ',\n        ' : token === '.\n' ? '.\n\n' : token,
        ).trimEnd() + '\n';
        return { file: path.join(outputDirectory, document.relativePath), turtle: formatted };
    }));
    const previousFiles = async directory => {
        const entries = await readdir(directory, { withFileTypes: true });
        const files = await Promise.all(entries.map(entry => {
            const file = path.join(directory, entry.name);
            return entry.isDirectory() ? previousFiles(file) : entry.isFile() && entry.name.endsWith('.ttl') ? [file] : [];
        }));
        return files.flat();
    };
    await mkdir(outputDirectory, { recursive: true });
    const previous = await previousFiles(outputDirectory);
    for (const { file, turtle } of files) {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, turtle);
    }
    const current = new Set(files.map(({ file }) => file));
    for (const file of previous) if (!current.has(file)) await unlink(file);
    console.log(`DSD generation: ${documents.length} aparte Turtle-bestanden in ${outputDirectory}`);
    return documents;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { skosOptions } = await import('./utils/variables.js');
    await generateDsds(skosOptions.turtlePath, path.resolve(path.dirname(skosOptions.turtlePath), '../../dsd'));
}
