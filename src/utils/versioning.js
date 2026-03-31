// Single in-memory NT-only versioning implementation

// Common RDF property IRIs used for versioning metadata
const DCT_CREATED = 'http://purl.org/dc/terms/created';
const DCT_MODIFIED = 'http://purl.org/dc/terms/modified';
const DCT_IS_VERSION_OF = 'http://purl.org/dc/terms/isVersionOf';
const ADMS_STATUS = 'http://www.w3.org/ns/adms#status';

export class ConceptVersioning {
    
    async process({ currentNt, frame = {}, options = {} } = {}) {
        const { rdf_to_jsonld } = await import('@milieuinfo/maven-metadata-generator-npm/src/utils/functions.js');
        const now = new Date().toISOString();
        const allowMultiple = options.allowMultipleIsVersionOf ?? true;

        // convert current RDF N-Quads to framed JSON-LD
        let currentJson;
        try {
            currentJson = await rdf_to_jsonld(currentNt, frame);
        } catch (e) {
            currentJson = { '@context': frame['@context'] || {}, graph: [] };
        }

        const currentGraph = Array.isArray(currentJson.graph) ? currentJson.graph : [];
        const prevGraph = [];

        const { added, edited, deleted, mapCurr, mapPrev } = this._detectChanges(currentGraph, prevGraph, {
            createdProp: DCT_CREATED,
            modifiedProp: DCT_MODIFIED,
            statusProp: ADMS_STATUS,
            isVersionOfProp: DCT_IS_VERSION_OF,
        });

        // Apply metadata updates in-place
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

    // Compute added/edited/deleted ids and return maps for quick lookup.
    _detectChanges(currentGraph, prevGraph, props = {}) {
        const { createdProp, modifiedProp, statusProp, isVersionOfProp } = props;
        const getId = n => n && (n['@id'] || n['id'] || n.uri || n._id || null);

        const mapCurr = new Map(currentGraph.filter(n => getId(n)).map(n => [getId(n), n]));
        const mapPrev = new Map(prevGraph.filter(n => getId(n)).map(n => [getId(n), n]));

        const currIds = new Set(mapCurr.keys());
        const prevIds = new Set(mapPrev.keys());

        const added = [...currIds].filter(id => id && !prevIds.has(id));
        const deleted = [...prevIds].filter(id => id && !currIds.has(id));
        const common = [...currIds].filter(id => prevIds.has(id));

        const edited = [];
        for (const id of common) {
            const a = mapPrev.get(id);
            const b = mapCurr.get(id);
            // Strip transient metadata before comparing
            const strip = o => {
                if (!o) return null;
                const copy = JSON.parse(JSON.stringify(o));
                delete copy[createdProp];
                delete copy[modifiedProp];
                delete copy[isVersionOfProp];
                delete copy[statusProp];
                return copy;
            };
            if (JSON.stringify(strip(a)) !== JSON.stringify(strip(b))) edited.push(id);
        }

        return { added, edited, deleted, mapCurr, mapPrev };
    }

    // Add created/status metadata for newly added nodes.
    _handleCreations(mapCurr, added, options, now) {
        const newStatus = options.newStatus || 'active';
        const statusIri = this._statusToIri(newStatus);
        for (const id of added) {
            const node = mapCurr.get(id);
            if (node) {
                node[DCT_CREATED] = { '@value': now, '@type': 'http://www.w3.org/2001/XMLSchema#dateTime' };
                if (statusIri) node[ADMS_STATUS] = { '@id': statusIri };
            }
        }
    }

    // Mark edited nodes with a modified timestamp and link to previous version
    // via `dct:isVersionOf`. If `allowMultiple` is true, append rather than
    // replace existing values.
    _handleEdits(mapCurr, mapPrev, edited, options, now, allowMultiple) {
        for (const id of edited) {
            const node = mapCurr.get(id);
            if (node) {
                node[DCT_MODIFIED] = { '@value': now, '@type': 'http://www.w3.org/2001/XMLSchema#dateTime' };
                const prevNode = mapPrev.get(id);
                const prevId = prevNode && prevNode['@id'] ? prevNode['@id'] : null;
                if (prevId) {
                    const existing = node[DCT_IS_VERSION_OF];
                    if (!existing) {
                        node[DCT_IS_VERSION_OF] = { '@id': prevId };
                    } else if (allowMultiple) {
                        if (!Array.isArray(existing)) {
                            node[DCT_IS_VERSION_OF] = [existing];
                        }
                        const ids = node[DCT_IS_VERSION_OF].map(v => (v['@id'] || v));
                        if (!ids.includes(prevId)) node[DCT_IS_VERSION_OF].push({ '@id': prevId });
                    }
                }
            }
        }
    }

    // For deleted items, add a minimal marker to the current graph indicating
    // withdrawal, unless the ID already exists in the current graph.
    _handleDeletions(currentGraph, mapCurr, deleted, now) {
        for (const id of deleted) {
            const marker = { '@id': id };
            marker[ADMS_STATUS] = { '@id': this._statusToIri('withdrawn') };
            marker[DCT_MODIFIED] = { '@value': now, '@type': 'http://www.w3.org/2001/XMLSchema#dateTime' };
            if (!mapCurr.has(id)) currentGraph.push(marker);
        }
    }

    // Map a status short name or full URI to an ADMS status IRI.
    _statusToIri(status) {
        if (!status) return null;
        if (typeof status === 'string' && (status.startsWith('http://') || status.startsWith('https://'))) return status;
        const base = 'https://purl.archive.org/adms/status/';
        const parts = String(status).split(/[^A-Za-z0-9]+/).filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1));
        return base + parts.join('');
    }
}
