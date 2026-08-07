import { readFileSync, existsSync } from 'fs';
import type { EnrichedValue } from '../models/index.js';

interface ConceptEntry {
  id: string;
  expandedUri: string;
  prefLabel: string;
  code?: string;
  definition?: string;
  alternative?: string;
}

/**
 * Loads a codelist JSON-LD file and provides URI → prefLabel/code enrichment.
 *
 * Expands CURIE prefixes from @context so that full URIs from generated schemas
 * can be looked up against the codelist to get human-readable labels.
 */
export class CodelistEnricher {
  private concepts = new Map<string, ConceptEntry>();
  private prefixMap = new Map<string, string>();
  private unresolvedUris = new Set<string>();

  constructor(codelistPath: string) {
    if (!existsSync(codelistPath)) {
      throw new Error(`Codelist not found at: ${codelistPath}`);
    }

    const raw = readFileSync(codelistPath, 'utf-8');
    const data = JSON.parse(raw);
    const context = data['@context'] as Record<string, unknown>;
    const graph = (data.graph || []) as Record<string, unknown>[];

    // Build CURIE prefix map from @context
    this.buildPrefixMap(context);

    // Index all concepts by their expanded URI
    for (const entry of graph) {
      const id = String(entry.id || '');
      if (!id) continue;

      const types = Array.isArray(entry['_type']) ? entry['_type'] : [];
      const isConcept = types.includes('skos:Concept') || types.includes('qudt:Unit');
      if (!isConcept) continue;

      const uri = this.expandCurie(id);
      this.concepts.set(uri, {
        id,
        expandedUri: uri,
        prefLabel: String(entry.prefLabel || ''),
        code: entry.code ? String(entry.code) : undefined,
        definition: entry.definition ? String(entry.definition) : undefined,
        alternative: entry.alternative ? String(entry.alternative) : undefined,
      });
    }

    console.log(
      `CodelistEnricher loaded: ${this.concepts.size} concepts, ${this.prefixMap.size} prefixes`,
    );
  }

  /** Resolve a single URI to an enriched display value. */
  resolve(uri: string): EnrichedValue {
    // Exact match on expanded URI
    const concept = this.concepts.get(uri);
    if (concept && concept.prefLabel) {
      const label = this.pickDisplayLabel(concept);
      return {
        rawUri: uri,
        displayLabel: label,
        definition: concept.definition || concept.alternative,
        resolved: true,
      };
    }

    // Track unresolved URIs for ISSUES.md reporting
    this.unresolvedUris.add(uri);
    return this.fallbackForUri(uri);
  }

  /** Resolve multiple URIs at once. */
  resolveMany(uris: string[]): EnrichedValue[] {
    return uris.map((uri) => this.resolve(uri));
  }

  /** Get all unresolved URIs discovered during resolution. */
  getUnresolvedUris(): string[] {
    return [...this.unresolvedUris];
  }

  /** Get all known concepts for debugging. */
  getAllConcepts(): ConceptEntry[] {
    return [...this.concepts.values()];
  }

  /** Get a count of how many lookup keys we have. */
  getCount(): number {
    return this.concepts.size;
  }

  // ----- Internal helpers -----

  private buildPrefixMap(context: Record<string, unknown>): void {
    if (!context || typeof context !== 'object') return;

    for (const [key, val] of Object.entries(context)) {
      let prefixUri = '';

      if (typeof val === 'string') {
        prefixUri = val;
      } else if (typeof val === 'object' && val !== null) {
        const obj = val as Record<string, unknown>;
        if (typeof obj['@id'] === 'string') {
          prefixUri = obj['@id'];
        }
      }

      if (prefixUri && !key.startsWith('@')) {
        this.prefixMap.set(key, prefixUri);
      }
    }
  }

  /** Expand a CURIE like "riepr-operationeel-lucht:temperatuur" to full URI. */
  expandCurie(curie: string): string {
    // Already a full URI
    if (curie.startsWith('http://') || curie.startsWith('https://')) {
      return curie;
    }

    const colonIndex = curie.indexOf(':');
    if (colonIndex === -1) return curie;

    const prefix = curie.substring(0, colonIndex);
    const local = curie.substring(colonIndex + 1);

    const baseUri = this.prefixMap.get(prefix);
    if (baseUri) {
      return `${baseUri}${local}`;
    }

    // Unknown prefix — return as-is
    return curie;
  }

  /** Pick the best display label: code (symbol) for units, prefLabel for concepts. */
  private pickDisplayLabel(concept: ConceptEntry): string {
    // Units: prefer code ("%","°C", "K") over prefLabel ("Percent", "Celsius")
    const types = this.concepts.get(concept.expandedUri);
    if (concept.code && concept.expandedUri.includes('qudt')) {
      return concept.code;
    }
    return concept.prefLabel || concept.code || concept.id;
  }

  /** Fallback for URIs not found in codelist: extract a readable label from the URI. */
  private fallbackForUri(uri: string): EnrichedValue {
    // http://TODO → marker
    if (uri === 'http://TODO' || uri.startsWith('http://TODO')) {
      return { rawUri: uri, displayLabel: '(onbekend)', resolved: false };
    }

    // Try to extract meaningful segment from URI
    try {
      const segments = uri.split('/');
      const last = segments[segments.length - 1];
      if (last && last !== uri) {
        // Decode and capitalize first letter
        const decoded = decodeURIComponent(last);
        return { rawUri: uri, displayLabel: decoded, resolved: false };
      }
    } catch {
      // ignore parse errors
    }

    return { rawUri: uri, displayLabel: uri, resolved: false };
  }
}
