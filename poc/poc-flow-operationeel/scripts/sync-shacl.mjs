import { readFile, writeFile } from 'node:fs/promises'

const source = new URL('../../../../RIE-IEPR/documentatie/datamodel/generated/shacl/schema.ttl', import.meta.url)
const target = new URL('../test/fixtures/riepr-shacl.ttl', import.meta.url)
const raw = await readFile(source, 'utf8')
// ODDToolkit emits xsd:int; SHACL requires xsd:integer for cardinalities.
const normalized = raw.replace(/(sh:(?:minCount|maxCount)\s+"[0-9]+")\^\^xsd:int\b/g, '$1^^xsd:integer')
await writeFile(target, normalized)
console.log(`Synced ontology shapes from ${source.pathname}`)
