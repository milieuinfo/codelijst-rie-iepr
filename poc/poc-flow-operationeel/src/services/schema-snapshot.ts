import { parseSchemaIndex, schemaObject, SchemaValidator, type JsonSchemaObject, type SchemaIndex } from 'codelijst-rie-iepr-poc-json-schema/browser'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

export interface SchemaSnapshot {
  index: SchemaIndex
  schemas: Map<string, JsonSchemaObject>
}

/**
 * Hashes the exact fetched UTF-8 content for comparison with the index.
 * @param content - The fetched document.
 * @returns Its lowercase SHA-256 digest.
 */
export async function fingerprint(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content)
  const subtle = globalThis.crypto?.subtle
  if (subtle) return bytesToHex(new Uint8Array(await subtle.digest('SHA-256', bytes)))
  return bytesToHex(sha256(bytes))
}

/**
 * Loads only indexed resources and rejects stale or modified schema snapshots.
 * @param base - Application URL, including its deployment subdirectory.
 * @returns The verified index and offline schema documents.
 */
export async function loadSchemaSnapshot(base: URL): Promise<SchemaSnapshot> {
  const read = async (path: string) => {
    const response = await fetch(new URL(path, base), { cache: 'no-cache' })
    if (!response.ok) throw new Error(`Kon schemasnapshot niet laden: ${path} (${response.status}). Voer npm run sync:schemas uit.`)
    return response.text()
  }
  const index = parseSchemaIndex(JSON.parse(await read('schema/index.json')))
  if (await fingerprint(await read('codelist.jsonld')) !== index.sourceSha256) {
    throw new Error('Codelijst en schema-index komen niet overeen. Synchroniseer de schemasnapshot opnieuw.')
  }
  const documents = await Promise.all(index.files.map(async entry => {
    const content = await read('schema/' + entry.path.split('/').map(encodeURIComponent).join('/'))
    const schema = schemaObject(JSON.parse(content))
    if (await fingerprint(content) !== entry.sha256 || schema.$id !== entry.id) {
      throw new Error(`Schema wijkt af van de index: ${entry.path}. Synchroniseer de schemasnapshot opnieuw.`)
    }
    return [entry.id, schema] as const
  }))
  const schemas = new Map(documents)
  for (const entry of index.files.filter(file => file.kind === 'section')) {
    new SchemaValidator().validateInstance(schemas.get(entry.id)!, {}, [...schemas.values()])
  }
  return { index, schemas }
}
