import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock rdf_to_jsonld used by the module to avoid transforming external package files
vi.mock('@milieuinfo/maven-metadata-generator-npm/src/utils/functions.js', () => ({
  rdf_to_jsonld: async () => ({ graph: [] }),
}));

import { ConceptVersioning } from '../src/utils/versioning.js';

const DCT_CREATED = 'http://purl.org/dc/terms/created';
const DCT_MODIFIED = 'http://purl.org/dc/terms/modified';
const DCT_IS_VERSION_OF = 'http://purl.org/dc/terms/isVersionOf';
const ADMS_STATUS = 'http://www.w3.org/ns/adms#status';
const XSD_DATE_TIME = 'http://www.w3.org/2001/XMLSchema#dateTime';

describe('ConceptVersioning (unit)', () => {
  let v;

  beforeEach(() => {
    v = new ConceptVersioning();
  });

  it('maps status short name to ADMS IRI', () => {
    expect(v._statusToIri('active')).toBe('https://purl.archive.org/adms/status/Active');
    const full = 'http://example.org/status/foo';
    expect(v._statusToIri(full)).toBe(full);
    expect(v._statusToIri(null)).toBeNull();
  });

  it('detects added, edited and deleted nodes (data scenarios)', () => {
    // scenario: new data added
    const prevA = [];
    const currA = [{ '@id': 'http://example.org/c/1', prefLabel: 'One' }];
    const resA = v._detectChanges(currA, prevA, {
      createdProp: DCT_CREATED,
      modifiedProp: DCT_MODIFIED,
      statusProp: ADMS_STATUS,
      isVersionOfProp: DCT_IS_VERSION_OF,
    });
    expect(resA.added).toEqual(['http://example.org/c/1']);

    // scenario: edited data (non-transient property changed)
    const prevB = [{ '@id': 'urn:2', name: 'old' }];
    const currB = [{ '@id': 'urn:2', name: 'new' }];
    const resB = v._detectChanges(currB, prevB, {});
    expect(resB.edited).toEqual(['urn:2']);

    // scenario: deleted data
    const prevC = [{ '@id': 'urn:3', name: 'gone' }];
    const currC = [];
    const resC = v._detectChanges(currC, prevC, {});
    expect(resC.deleted).toEqual(['urn:3']);
  });

  it('_handleCreations adds created timestamp and status IRI', () => {
    const now = '2026-04-02T12:00:00.000Z';
    const node = { '@id': 'urn:new' };
    const mapCurr = new Map([['urn:new', node]]);
    v._handleCreations(mapCurr, ['urn:new'], { newStatus: 'active' }, now);

    expect(node[DCT_CREATED]['@value']).toBe(now);
    expect(node[DCT_CREATED]['@type']).toBe(XSD_DATE_TIME);
    expect(node[ADMS_STATUS]['@id']).toBe('https://purl.archive.org/adms/status/Active');
  });

  it('_handleEdits sets modified and links to previous version (single & multiple)', () => {
    const now = '2026-04-02T12:00:00.000Z';
    const prevNode = { '@id': 'prev-1' };
    const currNode = { '@id': 'e1' };
    const mapPrev = new Map([['e1', prevNode]]);
    const mapCurr = new Map([['e1', currNode]]);

    v._handleEdits(mapCurr, mapPrev, ['e1'], {}, now, false);
    expect(currNode[DCT_MODIFIED]['@value']).toBe(now);
    expect(currNode[DCT_IS_VERSION_OF]['@id']).toBe('prev-1');

    // allowMultiple true appends when existing link present
    const currNode2 = { '@id': 'e2', [DCT_IS_VERSION_OF]: { '@id': 'older' } };
    const mapCurr2 = new Map([['e2', currNode2]]);
    const mapPrev2 = new Map([['e2', { '@id': 'prev-2' }]]);
    v._handleEdits(mapCurr2, mapPrev2, ['e2'], {}, now, true);
    expect(Array.isArray(currNode2[DCT_IS_VERSION_OF])).toBe(true);
    const ids = currNode2[DCT_IS_VERSION_OF].map(x => x['@id']);
    expect(ids).toContain('older');
    expect(ids).toContain('prev-2');
  });

  it('_handleDeletions adds withdrawal marker for deleted ids', () => {
    const now = '2026-04-02T12:00:00.000Z';
    const currentGraph = [];
    const mapCurr = new Map();
    v._handleDeletions(currentGraph, mapCurr, ['urn:del'], now);

    const marker = currentGraph.find(n => n['@id'] === 'urn:del');
    expect(marker).toBeDefined();
    expect(marker[ADMS_STATUS]['@id']).toBe('https://purl.archive.org/adms/status/Withdrawn');
    expect(marker[DCT_MODIFIED]['@value']).toBe(now);
  });

  it('real-data scenario: detect and apply changes using example URIs', () => {
    // Use a few URIs that exist in the sample .nt file as realistic IDs
    const A = 'http://qudt.org/vocab/unit/DEG_C';
    const B = 'http://qudt.org/vocab/unit/K';
    const C = 'http://qudt.org/vocab/unit/NEW_UNIT';

    // previous graph: A (old label), B
    const prevGraph = [
      { '@id': A, 'http://www.w3.org/2004/02/skos/core#prefLabel': 'Graden celcius' },
      { '@id': B, 'http://www.w3.org/2004/02/skos/core#prefLabel': 'Kelvin' },
    ];

    // current graph: A modified label, C added
    const currGraph = [
      { '@id': A, 'http://www.w3.org/2004/02/skos/core#prefLabel': 'Graden Celsius' }, // edited (typo fixed)
      { '@id': C, 'http://www.w3.org/2004/02/skos/core#prefLabel': 'Nieuwe eenheid' }, // added
    ];

    const res = v._detectChanges(currGraph, prevGraph, {
      createdProp: DCT_CREATED,
      modifiedProp: DCT_MODIFIED,
      statusProp: ADMS_STATUS,
      isVersionOfProp: DCT_IS_VERSION_OF,
    });

    // expectations
    expect(res.added).toEqual([C]);
    expect(res.deleted).toEqual([B]);
    expect(res.edited).toEqual([A]);

    // Now simulate applying metadata: create maps
    const mapCurr = res.mapCurr;
    // Simulate that the previous version had a different internal id (prev-A)
    const mapPrev = new Map();
    mapPrev.set(A, { '@id': 'http://example.org/prev/DEG_C' });

    const now = '2026-04-02T13:00:00.000Z';

    // Apply creation metadata for C
    v._handleCreations(mapCurr, res.added, { newStatus: 'active' }, now);
    const nodeC = mapCurr.get(C);
    expect(nodeC[DCT_CREATED]['@value']).toBe(now);
    expect(nodeC[ADMS_STATUS]['@id']).toBe('https://purl.archive.org/adms/status/Active');

    // Apply edit handling for A (link to previous version)
    v._handleEdits(mapCurr, mapPrev, res.edited, {}, now, true);
    const nodeA = mapCurr.get(A);
    expect(nodeA[DCT_MODIFIED]['@value']).toBe(now);
    // should have an isVersionOf linking to the simulated previous id
    const isv = nodeA[DCT_IS_VERSION_OF];
    expect(isv).toBeDefined();
    // allow array or single
    const ids = Array.isArray(isv) ? isv.map(x => x['@id']) : [isv['@id']];
    expect(ids).toContain('http://example.org/prev/DEG_C');

    // Apply deletion handling for B
    v._handleDeletions(currGraph, mapCurr, res.deleted, now);
    const marker = currGraph.find(n => n['@id'] === B);
    expect(marker).toBeDefined();
    expect(marker[ADMS_STATUS]['@id']).toBe('https://purl.archive.org/adms/status/Withdrawn');
  });
});
