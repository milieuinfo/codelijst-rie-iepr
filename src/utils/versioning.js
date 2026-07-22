import { rdf_to_jsonld } from '@milieuinfo/maven-metadata-generator-npm/src/utils/functions.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import AdmZip from 'adm-zip';

/**
 * Default vocabulary IRIs used for versioning metadata.
 * @typedef {Object} VersioningDefaults
 * @property {string} dctCreated - Dublin Core Terms: created property IRI.
 * @property {string} dctModified - Dublin Core Terms: modified property IRI.
 * @property {string} dctIsVersionOf - Dublin Core Terms: isVersionOf property IRI.
 * @property {string} admsStatus - ADMS status property IRI.
 * @property {string} xsdDateTime - XSD dateTime type IRI.
 * @property {string} statusBaseIri - Base URL for converting status labels to IRIs.
 */

/**
 * Default configuration values for vocabulary IRIs and status base URL.
 * @type {VersioningDefaults}
 */
export const DEFAULTS = Object.freeze({
    dctCreated: 'http://purl.org/dc/terms/created',
    dctModified: 'http://purl.org/dc/terms/modified',
    dctIsVersionOf: 'http://purl.org/dc/terms/isVersionOf',
    admsStatus: 'http://www.w3.org/ns/adms#status',
    xsdDateTime: 'http://www.w3.org/2001/XMLSchema#dateTime',
    statusBaseIri: 'https://purl.archive.org/adms/status/',
});

/**
 * Options for the `process` method.
 * @typedef {Object} VersioningOptions
 * @property {string} [newStatus] - Status to assign to newly created concepts (default: 'active').
 * @property {boolean} [allowMultipleIsVersionOf] - Whether to accumulate isVersionOf links (default: true).
 * @property {string} [timestamp] - Fixed ISO 8601 timestamp to use instead of the current time.
 */

/**
 * release_url is an Artifactory directory-browsing endpoint (a Maven
 * artifact directory), not a content-negotiated RDF service or a direct
 * file link. It 406s on a restrictive Accept header, so request the
 * wildcard media type instead.
 * @type {string}
 */
const PREVIOUS_GRAPH_ACCEPT_HEADER = '*/*';

/**
 * Manages versioning metadata (created/modified timestamps, status, isVersionOf links)
 * for SKOS concepts represented as JSON-LD graphs.
 * @class
 */
export class ConceptVersioning {
    /**
     * Create a ConceptVersioning instance with optional configuration overrides.
     * @param {Partial<VersioningDefaults>} [config] - Optional configuration to override default IRIs.
     */
    constructor(config = {}) {
        this._defaults = Object.freeze({ ...DEFAULTS, ...config });
    }

    /**
     * Process a current N-Quads document against the previously published graph,
     * detect added/edited/deleted nodes, and attach versioning metadata.
     * @param {Object} params - The processing parameters.
     * @param {string} params.currentNt - N-Quads string representing the current graph.
     * @param {Object} [params.frame={}] - JSON-LD framing options.
     * @param {VersioningOptions} [params.options] - Versioning behavior options.
     * @param {string} [params.previousReleaseUrl] - URL of the previously published graph
     *   (e.g. `versioning.release_url` from config.yml) to diff the current graph against.
     *   A 404 is treated as "no previous release yet" (first run). Omit to diff against an
     *   empty graph, which treats every concept as newly created.
     * @returns {Promise<{updated_nt: string, result: {added: string[], edited: string[], deleted: string[]}}>} Updated N-Quads and change summary.
     * @throws {Error} If currentNt is null, undefined, or empty, or if fetching previousReleaseUrl fails for a reason other than "not found".
     */
    async process({ currentNt, frame = {}, options = {}, previousReleaseUrl } = {}) {
        if (currentNt == null) throw new Error('process() requires a non-null currentNt argument');
        if (typeof currentNt !== 'string' || currentNt.trim().length === 0) throw new Error('process() requires a non-empty currentNt string');
        if (frame == null || Array.isArray(frame)) throw new Error('process() requires frame to be a non-null object');

        const now = options.timestamp ?? new Date().toISOString();
        const allowMultiple = options.allowMultipleIsVersionOf ?? true;

        // Convert N-Quads to JSON-LD and extract the graph
        const currentJson = await rdf_to_jsonld(currentNt, frame);
        const currentGraph = Array.isArray(currentJson.graph) ? currentJson.graph : [];
        const prevGraph = await this._loadPreviousGraph(previousReleaseUrl ?? options.previousReleaseUrl, frame);

        // Compare the current graph to the previous graph to detect added/edited/deleted nodes
        const { added, edited, deleted, mapCurr, mapPrev } = this._detectChanges(currentGraph, prevGraph, {
            createdProp: this._defaults.dctCreated,
            modifiedProp: this._defaults.dctModified,
            statusProp: this._defaults.admsStatus,
            isVersionOfProp: this._defaults.dctIsVersionOf,
        });

        // Apply metadata updates in-place for the current graph
        this._handleCreations(mapCurr, added, options, now);
        this._handleEdits(mapCurr, mapPrev, edited, options, now, allowMultiple);
        this._handleDeletions(currentGraph, mapCurr, deleted, now);

        currentJson.graph = currentGraph;

        // convert updated JSON-LD back to N-Quads
        const jsonldLib = await import('jsonld');
        const toRDF = jsonldLib.toRDF || (jsonldLib.default && jsonldLib.default.toRDF);
        if (!toRDF) throw new Error('jsonld.toRDF is not available from the jsonld package');
        const updated_nt = await toRDF(currentJson, { format: 'application/n-quads' });

        return { updated_nt, result: { added, edited, deleted } };
    }

    /**
     * Initialize versioning metadata on a JSON-LD file by treating all nodes as new.
     * Reads the file, applies creation metadata, and writes it back.
     * @param {string} filePath - Path to the JSON-LD file to initialize.
     * @returns {{updated: number}} Number of concepts that received versioning metadata.
     * @throws {Error} If filePath is null, undefined, or empty; or if the file does not exist.
     */
    init(filePath) {
        if (filePath == null) throw new Error('init() requires a non-null filePath argument');
        if (typeof filePath !== 'string' || filePath.trim().length === 0) throw new Error('init() requires a non-empty filePath string');
        if (!existsSync(filePath)) throw new Error(`init(): file not found: ${filePath}`);

        const data = JSON.parse(readFileSync(filePath, 'utf-8'));
        const graph = Array.isArray(data.graph) ? data.graph : [];

        const now = new Date().toISOString();
        let updatedCount = 0;
        for (const node of graph) {
            const id = node['@id'] || node['id'] || node.uri || node._id;
            if (!id) continue;
            let nodeUpdated = false;
            if (!node[this._defaults.dctCreated]) {
                node[this._defaults.dctCreated] = { '@value': now, '@type': this._defaults.xsdDateTime };
                nodeUpdated = true;
            }
            if (!node[this._defaults.admsStatus]) {
                const statusIri = this._statusToIri('active');
                if (statusIri) {
                    node[this._defaults.admsStatus] = { '@id': statusIri };
                    nodeUpdated = true;
                }
            }
            if (nodeUpdated) updatedCount++;
        }

        writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

        return { updated: updatedCount };
    }

    /**
     * Fetch the previously published graph and convert it to a JSON-LD node array
     * so it can be diffed against the current graph.
     *
     * `release_url` is a Maven artifact directory (Artifactory), not a direct
     * link to an RDF file: `${release_url}/maven-metadata.xml` gives the
     * `<release>` version, and `${release_url}/<version>/<artifactId>-<version>-sources.jar`
     * is a jar containing (among other formats) the published `.nt` file for
     * that release.
     * @private
     * @param {string|undefined|null} url - Base URL of the previously published Maven artifact directory.
     * @param {Object} frame - JSON-LD framing options, applied the same way as for the current graph.
     * @returns {Promise<Object[]>} The previous graph's nodes, or an empty array if no URL was given
     *   or no previous release exists yet (HTTP 404 on maven-metadata.xml).
     * @throws {Error} If a fetch fails for a reason other than "not found", the release version can't
     *   be determined, or the sources jar doesn't contain exactly one identifiable `.nt` file.
     */
    async _loadPreviousGraph(url, frame) {
        if (!url) return [];
        const baseUrl = url.replace(/\/+$/, '');

        const metadataResponse = await this._fetchOrNullOn404(`${baseUrl}/maven-metadata.xml`, 'previous release metadata');
        if (metadataResponse === null) {
            console.warn(`ConceptVersioning: no previous release found at ${baseUrl} (404) — treating all concepts as new.`);
            return [];
        }
        const metadataXml = await metadataResponse.text();
        const version = this._extractMavenReleaseVersion(metadataXml);
        if (!version) {
            throw new Error(`ConceptVersioning: could not find a <release> or <latest> version in ${baseUrl}/maven-metadata.xml`);
        }

        const artifactId = baseUrl.split('/').filter(Boolean).pop();
        const jarUrl = `${baseUrl}/${version}/${artifactId}-${version}-sources.jar`;
        const jarResponse = await this._fetchOrNullOn404(jarUrl, 'previous release sources jar');
        if (jarResponse === null) {
            throw new Error(`ConceptVersioning: maven-metadata.xml at ${baseUrl} points at version ${version}, but ${jarUrl} was not found (404).`);
        }

        const jarBuffer = Buffer.from(await jarResponse.arrayBuffer());
        const ntEntries = new AdmZip(jarBuffer).getEntries().filter(e => e.entryName.endsWith('.nt'));
        const ntEntry = ntEntries.length === 1 ? ntEntries[0] : ntEntries.find(e => e.entryName.includes('/conceptscheme/'));
        if (!ntEntry) {
            throw new Error(
                ntEntries.length === 0
                    ? `ConceptVersioning: no .nt file found in ${jarUrl}`
                    : `ConceptVersioning: multiple .nt files found in ${jarUrl} and none is under a conceptscheme/ directory: ${ntEntries.map(e => e.entryName).join(', ')}`
            );
        }

        const previousNt = ntEntry.getData().toString('utf8');
        if (!previousNt || previousNt.trim().length === 0) return [];

        const previousJson = await rdf_to_jsonld(previousNt, frame);
        return Array.isArray(previousJson.graph) ? previousJson.graph : [];
    }

    /**
     * Fetch a URL, returning the Response on success or null on a 404.
     * @private
     * @param {string} url - URL to fetch.
     * @param {string} label - Human-readable description of what's being fetched, used in error messages.
     * @returns {Promise<Response|null>} The response, or null on 404.
     * @throws {Error} If the fetch fails (network error) or the response is a non-404 error status.
     */
    async _fetchOrNullOn404(url, label) {
        let response;
        try {
            response = await fetch(url, { headers: { Accept: PREVIOUS_GRAPH_ACCEPT_HEADER } });
        } catch (err) {
            throw new Error(`ConceptVersioning: failed to fetch ${label} from ${url}: ${err.message}`);
        }
        if (response.status === 404) return null;
        if (!response.ok) {
            throw new Error(`ConceptVersioning: failed to fetch ${label} from ${url}: ${response.status} ${response.statusText}`);
        }
        return response;
    }

    /**
     * Extract the `<release>` (preferred) or `<latest>` version from a Maven
     * maven-metadata.xml document.
     * @private
     * @param {string} xml - Contents of maven-metadata.xml.
     * @returns {string|null} The version string, or null if neither element was found.
     */
    _extractMavenReleaseVersion(xml) {
        const release = xml.match(/<release>\s*([^<\s]+)\s*<\/release>/);
        if (release) return release[1];
        const latest = xml.match(/<latest>\s*([^<\s]+)\s*<\/latest>/);
        return latest ? latest[1] : null;
    }

    /**
     * Detect added, edited, and deleted nodes by comparing two graphs.
     * @private
     * @param {Object[]} currentGraph - The current JSON-LD graph (array of nodes).
     * @param {Object[]} prevGraph - The previous JSON-LD graph (array of nodes).
     * @param {Object} props - Property IRI keys for transient metadata stripping.
     * @param {string} props.createdProp - IRI of the created property.
     * @param {string} props.modifiedProp - IRI of the modified property.
     * @param {string} props.statusProp - IRI of the status property.
     * @param {string} props.isVersionOfProp - IRI of the isVersionOf property.
     * @returns {{added: string[], edited: string[], deleted: string[], mapCurr: Map<string, Object>, mapPrev: Map<string, Object>}} Detected changes and node maps.
     */
    _detectChanges(currentGraph, prevGraph, props = {}) {
        const { createdProp, modifiedProp, statusProp, isVersionOfProp } = props;
        const getId = n => n && (n['@id'] || n['id'] || n.uri || n._id || null);

        const mapCurr = new Map(currentGraph.filter(n => getId(n)).map(n => [getId(n), n]));
        const mapPrev = new Map(prevGraph.filter(n => getId(n)).map(n => [getId(n), n]));

        const currIds = new Set(mapCurr.keys());
        const prevIds = new Set(mapPrev.keys());

        // Added nodes are new IDs that were not in the previous graph
        const added = [...currIds].filter(id => id && !prevIds.has(id)).sort();
        // Deleted nodes are old IDs that are not in the current graph
        const deleted = [...prevIds].filter(id => id && !currIds.has(id)).sort();

        // Edited nodes: common IDs with different content (ignoring transient metadata)
        const edited = this._findEdited(mapPrev, mapCurr, createdProp, modifiedProp, isVersionOfProp, statusProp).sort();

        return { added, edited, deleted, mapCurr, mapPrev };
    }

    /**
     * Find IDs of nodes that exist in both graphs but differ in non-transient properties.
     * @private
     * @param {Map<string, Object>} mapPrev - Map of previous graph nodes by ID.
     * @param {Map<string, Object>} mapCurr - Map of current graph nodes by ID.
     * @param {string} createdProp - IRI of the created property to exclude.
     * @param {string} modifiedProp - IRI of the modified property to exclude.
     * @param {string} isVersionOfProp - IRI of the isVersionOf property to exclude.
     * @param {string} statusProp - IRI of the status property to exclude.
     * @returns {string[]} IDs of edited nodes, sorted alphabetically.
     */
    _findEdited(mapPrev, mapCurr, createdProp, modifiedProp, isVersionOfProp, statusProp) {
        const transientProps = new Set([createdProp, modifiedProp, isVersionOfProp, statusProp]);

        /**
         * Strip transient metadata from a node, cloning only when necessary.
         * @param {Object} node - The node to process.
         * @returns {Object|null} A copy without transient properties, or null if input is falsy.
         */
        const stripTransient = (node) => {
            if (!node) return null;
            const keys = Object.keys(node);
            // Fast path: no transient props present means identity is safe
            const hasTransient = keys.some(k => transientProps.has(k));
            if (!hasTransient) return node;

            const copy = {};
            for (const k of keys) {
                if (!transientProps.has(k)) copy[k] = node[k];
            }
            return copy;
        };

        const edited = [];
        for (const id of mapPrev.keys()) {
            if (!mapCurr.has(id)) continue;
            const a = mapPrev.get(id);
            const b = mapCurr.get(id);

            // Same object reference — no edit regardless of transient props
            if (a === b) continue;

            const strippedA = stripTransient(a);
            const strippedB = stripTransient(b);

            if (JSON.stringify(strippedA) !== JSON.stringify(strippedB)) {
                edited.push(id);
            }
        }
        return edited;
    }

    /**
     * Add created timestamp and status metadata for newly added nodes.
     * @private
     * @param {Map<string, Object>} mapCurr - Map of current graph nodes by ID.
     * @param {string[]} added - Array of IDs that were added.
     * @param {Object} options - Versioning options containing newStatus.
     * @param {string} now - ISO 8601 timestamp string.
     */
    _handleCreations(mapCurr, added, options, now) {
        const newStatus = options.newStatus || 'active';
        const statusIri = this._statusToIri(newStatus);
        for (const id of added) {
            const node = mapCurr.get(id);
            if (node) {
                node[this._defaults.dctCreated] = { '@value': now, '@type': this._defaults.xsdDateTime };
                if (statusIri) node[this._defaults.admsStatus] = { '@id': statusIri };
            }
        }
    }

    /**
     * Apply edit metadata: modified timestamp and isVersionOf link to the previous version.
     * @private
     * @param {Map<string, Object>} mapCurr - Map of current graph nodes by ID.
     * @param {Map<string, Object>} mapPrev - Map of previous graph nodes by ID.
     * @param {string[]} edited - Array of IDs that were edited.
     * @param {Object} options - Versioning options.
     * @param {string} now - ISO 8601 timestamp string.
     * @param {boolean} allowMultiple - Whether to accumulate isVersionOf links or overwrite.
     */
    _handleEdits(mapCurr, mapPrev, edited, options, now, allowMultiple) {
        for (const id of edited) {
            const node = mapCurr.get(id);
            if (node) {
                node[this._defaults.dctModified] = { '@value': now, '@type': this._defaults.xsdDateTime };
                const prevNode = mapPrev.get(id);
                const prevId = prevNode ? (prevNode['@id'] || prevNode['id'] || prevNode.uri || prevNode._id || null) : null;
                if (prevId) {
                    const existing = node[this._defaults.dctIsVersionOf];
                    if (!existing) {
                        node[this._defaults.dctIsVersionOf] = { '@id': prevId };
                    } else if (allowMultiple) {
                        if (!Array.isArray(existing)) {
                            node[this._defaults.dctIsVersionOf] = [existing];
                        }
                        const ids = node[this._defaults.dctIsVersionOf].map(v => (v['@id'] || v));
                        if (!ids.includes(prevId)) node[this._defaults.dctIsVersionOf].push({ '@id': prevId });
                    } else {
                        // Overwrite: single object, not array
                        node[this._defaults.dctIsVersionOf] = { '@id': prevId };
                    }
                }
            }
        }
    }

    /**
     * Add withdrawal markers for deleted nodes.
     * @private
     * @param {Object[]} currentGraph - The current JSON-LD graph (array of nodes).
     * @param {Map<string, Object>} mapCurr - Map of current graph nodes by ID.
     * @param {string[]} deleted - Array of IDs that were deleted.
     * @param {string} now - ISO 8601 timestamp string.
     */
    _handleDeletions(currentGraph, mapCurr, deleted, now) {
        // Precompute existing IDs for O(1) lookup instead of O(n) find() per iteration
        const existingIds = new Set(currentGraph.map(n => n['@id']));
        for (const id of deleted) {
            if (mapCurr.has(id)) continue;
            if (existingIds.has(id)) continue;

            const marker = { '@id': id };
            marker[this._defaults.admsStatus] = { '@id': this._statusToIri('withdrawn') };
            marker[this._defaults.dctModified] = { '@value': now, '@type': this._defaults.xsdDateTime };
            currentGraph.push(marker);
            existingIds.add(id);
        }
    }

    /**
     * Convert a status label or full IRI to an ADMS status IRI.
     * @private
     * @param {string|null} status - Status label (e.g., 'active', 'withdrawn') or full IRI.
     * @returns {string|null} The resolved ADMS status IRI, or null if input is falsy.
     */
    _statusToIri(status) {
        if (!status) return null;
        if (typeof status === 'string' && (status.startsWith('http://') || status.startsWith('https://'))) return status;
        const base = (typeof this._defaults.statusBaseIri === 'string' && this._defaults.statusBaseIri.length > 0)
            ? this._defaults.statusBaseIri
            : DEFAULTS.statusBaseIri;
        const parts = String(status).split(/[^A-Za-z0-9]+/).filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1));
        return base + parts.join('');
    }
}
