import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/** Base URI of the CSOR concepts (variabelen, eenheden, ...) the codelist refers to. */
export const CSOR_BASE = 'https://data.omgeving.vlaanderen.be/id/concept/csor/';

/** SPARQL endpoint with the CSOR concepts; override with CSOR_SPARQL_ENDPOINT. */
export const CSOR_SPARQL_ENDPOINT =
  process.env.CSOR_SPARQL_ENDPOINT ?? 'https://data-ontwikkel.omgeving.vlaanderen.be/sparql';

export interface CsorLabel {
  uri: string;
  prefLabel: string;
  /** csor:symbool, only for eenheden (e.g. "mg/L"). */
  symbol?: string;
}

/** Collect every CSOR URI used as a string value in the JSON schemas below `dir`. */
export function collectCsorUris(dir: string): string[] {
  const uris = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      if (value.startsWith(CSOR_BASE)) uris.add(value);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(visit);
    }
  };
  const walk = (path: string): void => {
    for (const entry of readdirSync(path)) {
      const full = join(path, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.json')) visit(JSON.parse(readFileSync(full, 'utf-8')));
    }
  };
  walk(dir);
  return [...uris].sort();
}

/**
 * Fetch prefLabel and symbol of CSOR concepts from the SPARQL endpoint. CSOR is
 * not part of the codelist JSON-LD, so this is the only source of their labels.
 */
export async function fetchCsorLabels(uris: string[], endpoint = CSOR_SPARQL_ENDPOINT): Promise<CsorLabel[]> {
  if (uris.length === 0) return [];
  const query = `PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?s ?label ?symbol WHERE {
  VALUES ?s { ${uris.map((u) => `<${u}>`).join(' ')} }
  ?s skos:prefLabel ?label .
  OPTIONAL { ?s <https://data.omgeving.vlaanderen.be/ns/csor#symbool> ?symbol }
}`;
  const response = await fetch(`${endpoint}?query=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/sparql-results+json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${endpoint}: ${response.status} ${response.statusText}`);
  const json = (await response.json()) as {
    results: { bindings: Array<Record<string, { value: string } | undefined>> };
  };
  return json.results.bindings.map((b) => ({
    uri: b.s!.value,
    prefLabel: b.label!.value,
    symbol: b.symbol?.value,
  }));
}
