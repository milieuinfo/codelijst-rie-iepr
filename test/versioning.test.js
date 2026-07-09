import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Mock rdf_to_jsonld used by the module to avoid transforming external package files
vi.mock('@milieuinfo/maven-metadata-generator-npm/src/utils/functions.js', () => ({
  rdf_to_jsonld: async () => ({ graph: [] }),
}));

import { ConceptVersioning, DEFAULTS } from '../src/utils/versioning.js';

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

describe('Deterministic ordering of _detectChanges results', () => {
  let v;
  beforeEach(() => { v = new ConceptVersioning(); });

  it('added array is sorted alphabetically regardless of insertion order', () => {
    const prev = [];
    const curr = [
      { '@id': 'urn:z-last' },
      { '@id': 'urn:a-first' },
      { '@id': 'urn:m-middle' },
    ];
    const res = v._detectChanges(curr, prev, {
      createdProp: DCT_CREATED, modifiedProp: DCT_MODIFIED,
      statusProp: ADMS_STATUS, isVersionOfProp: DCT_IS_VERSION_OF,
    });
    expect(res.added).toEqual(['urn:a-first', 'urn:m-middle', 'urn:z-last']);
  });

  it('deleted array is sorted alphabetically regardless of insertion order', () => {
    const prev = [
      { '@id': 'urn:z-last' },
      { '@id': 'urn:a-first' },
      { '@id': 'urn:m-middle' },
    ];
    const curr = [];
    const res = v._detectChanges(curr, prev, {});
    expect(res.deleted).toEqual(['urn:a-first', 'urn:m-middle', 'urn:z-last']);
  });

  it('edited array is sorted alphabetically regardless of insertion order', () => {
    const prev = [
      { '@id': 'urn:z-last', name: 'old-z' },
      { '@id': 'urn:a-first', name: 'old-a' },
    ];
    const curr = [
      { '@id': 'urn:z-last', name: 'new-z' },
      { '@id': 'urn:a-first', name: 'new-a' },
    ];
    const res = v._detectChanges(curr, prev, {});
    expect(res.edited).toEqual(['urn:a-first', 'urn:z-last']);
  });
});

describe('Transient metadata stripping — no false-positive edits', () => {
  let v;
  beforeEach(() => { v = new ConceptVersioning(); });

  it('nodes differing only in dct:created are NOT flagged as edited', () => {
    const prev = [{ '@id': 'urn:x', name: 'same' }];
    const curr = [
      { '@id': 'urn:x', name: 'same', [DCT_CREATED]: { '@value': '2025-01-01T00:00:00.000Z', '@type': XSD_DATE_TIME } },
    ];
    const res = v._detectChanges(curr, prev, {
      createdProp: DCT_CREATED, modifiedProp: DCT_MODIFIED,
      statusProp: ADMS_STATUS, isVersionOfProp: DCT_IS_VERSION_OF,
    });
    expect(res.edited).toEqual([]);
  });

  it('nodes differing only in dct:modified are NOT flagged as edited', () => {
    const prev = [{ '@id': 'urn:x', name: 'same' }];
    const curr = [
      { '@id': 'urn:x', name: 'same', [DCT_MODIFIED]: { '@value': '2025-06-01T00:00:00.000Z', '@type': XSD_DATE_TIME } },
    ];
    const res = v._detectChanges(curr, prev, {
      createdProp: DCT_CREATED, modifiedProp: DCT_MODIFIED,
      statusProp: ADMS_STATUS, isVersionOfProp: DCT_IS_VERSION_OF,
    });
    expect(res.edited).toEqual([]);
  });

  it('nodes differing only in dct:isVersionOf are NOT flagged as edited', () => {
    const prev = [{ '@id': 'urn:x', name: 'same' }];
    const curr = [
      { '@id': 'urn:x', name: 'same', [DCT_IS_VERSION_OF]: { '@id': 'http://example.org/prev' } },
    ];
    const res = v._detectChanges(curr, prev, {
      createdProp: DCT_CREATED, modifiedProp: DCT_MODIFIED,
      statusProp: ADMS_STATUS, isVersionOfProp: DCT_IS_VERSION_OF,
    });
    expect(res.edited).toEqual([]);
  });

  it('nodes differing only in adms:status are NOT flagged as edited', () => {
    const prev = [{ '@id': 'urn:x', name: 'same' }];
    const curr = [
      { '@id': 'urn:x', name: 'same', [ADMS_STATUS]: { '@id': 'https://purl.archive.org/adms/status/Active' } },
    ];
    const res = v._detectChanges(curr, prev, {
      createdProp: DCT_CREATED, modifiedProp: DCT_MODIFIED,
      statusProp: ADMS_STATUS, isVersionOfProp: DCT_IS_VERSION_OF,
    });
    expect(res.edited).toEqual([]);
  });
});

describe('Non-transient property change detection across types', () => {
  let v;
  beforeEach(() => { v = new ConceptVersioning(); });

  it('string value changes are detected', () => {
    const prev = [{ '@id': 'urn:s1', label: 'old' }];
    const curr = [{ '@id': 'urn:s1', label: 'new' }];
    expect(v._detectChanges(curr, prev, {}).edited).toEqual(['urn:s1']);
  });

  it('number value changes are detected', () => {
    const prev = [{ '@id': 'urn:n1', value: 42 }];
    const curr = [{ '@id': 'urn:n1', value: 99 }];
    expect(v._detectChanges(curr, prev, {}).edited).toEqual(['urn:n1']);
  });

  it('array value changes are detected', () => {
    const prev = [{ '@id': 'urn:a1', tags: ['x'] }];
    const curr = [{ '@id': 'urn:a1', tags: ['y'] }];
    expect(v._detectChanges(curr, prev, {}).edited).toEqual(['urn:a1']);
  });

  it('nested object value changes are detected', () => {
    const prev = [{ '@id': 'urn:o1', meta: { key: 'old' } }];
    const curr = [{ '@id': 'urn:o1', meta: { key: 'new' } }];
    expect(v._detectChanges(curr, prev, {}).edited).toEqual(['urn:o1']);
  });

  it('boolean value changes are detected', () => {
    const prev = [{ '@id': 'urn:b1', active: true }];
    const curr = [{ '@id': 'urn:b1', active: false }];
    expect(v._detectChanges(curr, prev, {}).edited).toEqual(['urn:b1']);
  });
});

describe('Modification timestamp format and placement', () => {
  let v;
  beforeEach(() => { v = new ConceptVersioning(); });

  it('_handleEdits sets dct:modified with correct ISO 8601 value and @type', () => {
    const fixedTimestamp = '2026-07-09T10:00:00.000Z';
    const node = { '@id': 'urn:e1' };
    const mapCurr = new Map([['urn:e1', node]]);
    const mapPrev = new Map([['urn:e1', { '@id': 'urn:e1-prev' }]]);

    v._handleEdits(mapCurr, mapPrev, ['urn:e1'], {}, fixedTimestamp, false);

    expect(node[DCT_MODIFIED]['@value']).toBe(fixedTimestamp);
    expect(node[DCT_MODIFIED]['@type']).toBe(XSD_DATE_TIME);
  });
});

describe('Unchanged nodes are never touched', () => {
  let v;
  beforeEach(() => { v = new ConceptVersioning(); });

  it('concepts not in the edited list retain their original properties', () => {
    const nodeA = { '@id': 'urn:A', name: 'Alpha' };
    const nodeB = { '@id': 'urn:B', name: 'Beta' };
    const nodeC = { '@id': 'urn:C', name: 'Gamma' };

    const mapPrev = new Map([
      ['urn:A', { '@id': 'urn:A', name: 'Alpha-old' }],
      ['urn:B', nodeB],
      ['urn:C', nodeC],
    ]);
    const mapCurr = new Map([['urn:A', nodeA]]);

    v._handleEdits(mapCurr, mapPrev, ['urn:A'], {}, '2026-01-01T00:00:00.000Z', false);

    // B and C should not have dct:modified
    expect(nodeB[DCT_MODIFIED]).toBeUndefined();
    expect(nodeC[DCT_MODIFIED]).toBeUndefined();
    // B and C data intact
    expect(nodeB.name).toBe('Beta');
    expect(nodeC.name).toBe('Gamma');
  });
});

describe('isVersionOf chaining across three sequential edits', () => {
  let v;
  beforeEach(() => { v = new ConceptVersioning(); });

  it('isVersionOf correctly chains across multiple edits without duplicates', () => {
    const fixedTimestamp = '2026-01-01T00:00:00.000Z';

    // Round 1: prev-A exists -> A gets isVersionOf=prev-A
    const round1Node = { '@id': 'A' };
    const round1MapPrev = new Map([['A', { '@id': 'prev-A' }]]);
    const round1MapCurr = new Map([['A', round1Node]]);
    v._handleEdits(round1MapCurr, round1MapPrev, ['A'], {}, fixedTimestamp, true);
    expect(round1Node[DCT_IS_VERSION_OF]).toEqual({ '@id': 'prev-A' });

    // Round 2: prev-B -> isVersionOf becomes [prev-A, prev-B]
    const round2Node = { '@id': 'A', [DCT_IS_VERSION_OF]: { '@id': 'prev-A' } };
    const round2MapPrev = new Map([['A', { '@id': 'prev-B' }]]);
    const round2MapCurr = new Map([['A', round2Node]]);
    v._handleEdits(round2MapCurr, round2MapPrev, ['A'], {}, fixedTimestamp, true);
    expect(Array.isArray(round2Node[DCT_IS_VERSION_OF])).toBe(true);
    const ids2 = round2Node[DCT_IS_VERSION_OF].map(x => x['@id']);
    expect(ids2).toEqual(['prev-A', 'prev-B']);

    // Round 3: prev-C -> isVersionOf becomes [prev-A, prev-B, prev-C]
    const round3Node = { '@id': 'A', [DCT_IS_VERSION_OF]: [...round2Node[DCT_IS_VERSION_OF]] };
    const round3MapPrev = new Map([['A', { '@id': 'prev-C' }]]);
    const round3MapCurr = new Map([['A', round3Node]]);
    v._handleEdits(round3MapCurr, round3MapPrev, ['A'], {}, fixedTimestamp, true);
    expect(Array.isArray(round3Node[DCT_IS_VERSION_OF])).toBe(true);
    const ids3 = round3Node[DCT_IS_VERSION_OF].map(x => x['@id']);
    expect(ids3).toEqual(['prev-A', 'prev-B', 'prev-C']);
  });
});

describe('Deletion handling — markers, timestamps, no duplicates', () => {
  let v;
  beforeEach(() => { v = new ConceptVersioning(); });

  it('deleted concepts receive withdrawal markers with correct status and timestamp', () => {
    const now = '2026-04-02T12:00:00.000Z';
    const currentGraph = [];
    const mapCurr = new Map();

    v._handleDeletions(currentGraph, mapCurr, ['urn:del1', 'urn:del2', 'urn:del3'], now);

    expect(currentGraph).toHaveLength(3);
    for (const id of ['urn:del1', 'urn:del2', 'urn:del3']) {
      const marker = currentGraph.find(n => n['@id'] === id);
      expect(marker).toBeDefined();
      expect(marker[ADMS_STATUS]['@id']).toBe('https://purl.archive.org/adms/status/Withdrawn');
      expect(marker[DCT_MODIFIED]['@value']).toBe(now);
    }
  });

  it('calling _handleDeletions again with same IDs adds no additional markers', () => {
    const now = '2026-04-02T12:00:00.000Z';
    const currentGraph = [];
    const mapCurr = new Map();

    v._handleDeletions(currentGraph, mapCurr, ['urn:del'], now);
    expect(currentGraph).toHaveLength(1);

    const countBefore = currentGraph.filter(n => n['@id'] === 'urn:del').length;
    v._handleDeletions(currentGraph, mapCurr, ['urn:del'], now);
    const countAfter = currentGraph.filter(n => n['@id'] === 'urn:del').length;

    expect(countBefore).toBe(countAfter);
  });
});

describe('Edge cases for _detectChanges', () => {
  let v;
  beforeEach(() => { v = new ConceptVersioning(); });

  it('both graphs empty returns all arrays empty', () => {
    const res = v._detectChanges([], [], {});
    expect(res.added).toEqual([]);
    expect(res.edited).toEqual([]);
    expect(res.deleted).toEqual([]);
  });

  it('single concept in each graph — added case', () => {
    const prev = [];
    const curr = [{ '@id': 'urn:only' }];
    const res = v._detectChanges(curr, prev, {});
    expect(res.added).toEqual(['urn:only']);
    expect(res.edited).toEqual([]);
    expect(res.deleted).toEqual([]);
  });

  it('single concept in each graph — deleted case', () => {
    const prev = [{ '@id': 'urn:gone' }];
    const curr = [];
    const res = v._detectChanges(curr, prev, {});
    expect(res.deleted).toEqual(['urn:gone']);
    expect(res.added).toEqual([]);
  });

  it('concepts without @id are excluded from all detection', () => {
    const prev = [{ name: 'no-id-prev' }];
    const curr = [{ name: 'no-id-curr' }];
    const res = v._detectChanges(curr, prev, {});
    expect(res.added).toEqual([]);
    expect(res.edited).toEqual([]);
    expect(res.deleted).toEqual([]);
  });

  it('duplicate IDs in the same graph — last wins via Map deduplication', () => {
    const curr = [
      { '@id': 'urn:dup', name: 'first' },
      { '@id': 'urn:dup', name: 'second' },
    ];
    const prev = [];
    const res = v._detectChanges(curr, prev, {});
    expect(res.added).toEqual(['urn:dup']);
    // The node in the map should be the last one
    expect(res.mapCurr.get('urn:dup').name).toBe('second');
  });

  it('nodes with only transient metadata are treated as equal to nodes without them', () => {
    const prev = [{ '@id': 'urn:tm' }];
    const curr = [
      { '@id': 'urn:tm', [DCT_CREATED]: { '@value': '2025-01-01T00:00:00.000Z', '@type': XSD_DATE_TIME } },
    ];
    const res = v._detectChanges(curr, prev, {
      createdProp: DCT_CREATED, modifiedProp: DCT_MODIFIED,
      statusProp: ADMS_STATUS, isVersionOfProp: DCT_IS_VERSION_OF,
    });
    expect(res.edited).toEqual([]);
  });
});

describe('Idempotency — running detect apply twice is stable', () => {
  let v;
  beforeEach(() => { v = new ConceptVersioning(); });

  it('second pass over already-versioned data produces empty added/edited/deleted', () => {
    // First pass: create a "previous graph" and "current graph" where current is the result of applying versioning
    const prevGraph = [{ '@id': 'urn:x', name: 'original' }];
    const currGraph = [
      { '@id': 'urn:x', name: 'updated' },
    ];

    // Simulate first detect+apply cycle
    const res1 = v._detectChanges(currGraph, prevGraph, {});
    expect(res1.edited).toContain('urn:x');

    // After applying versioning, the node has dct:modified and isVersionOf
    const mapPrev = new Map([['urn:x', { '@id': 'prev-x' }]]);
    v._handleEdits(res1.mapCurr, mapPrev, res1.edited, {}, '2026-01-01T00:00:00.000Z', true);

    // Now treat the versioned current graph as input again with itself as previous
    const versionedGraph = Array.from(res1.mapCurr.values());
    const res2 = v._detectChanges(versionedGraph, versionedGraph, {});
    expect(res2.added).toEqual([]);
    expect(res2.edited).toEqual([]);
    expect(res2.deleted).toEqual([]);
  });
});

describe('Status mapping edge cases and configurability', () => {
  let v;
  beforeEach(() => { v = new ConceptVersioning(); });

  it('handles various status inputs correctly', () => {
    expect(v._statusToIri('active')).toBe('https://purl.archive.org/adms/status/Active');
    expect(v._statusToIri('withdrawn')).toBe('https://purl.archive.org/adms/status/Withdrawn');
    expect(v._statusToIri('draft')).toBe('https://purl.archive.org/adms/status/Draft');
    expect(v._statusToIri('in review')).toBe('https://purl.archive.org/adms/status/InReview');
    expect(v._statusToIri('test-case')).toBe('https://purl.archive.org/adms/status/TestCase');
  });

  it('full IRIs are passed through unchanged', () => {
    const full1 = 'http://example.org/status/custom';
    const full2 = 'https://example.org/status/another';
    expect(v._statusToIri(full1)).toBe(full1);
    expect(v._statusToIri(full2)).toBe(full2);
  });

  it('null and undefined return null', () => {
    expect(v._statusToIri(null)).toBeNull();
    expect(v._statusToIri(undefined)).toBeNull();
  });

  it('empty string returns null', () => {
    expect(v._statusToIri('')).toBeNull();
  });

  it('custom status base IRI from config is respected', () => {
    const custom = 'https://custom.example.org/adms/status/';
    const v2 = new ConceptVersioning({ statusBaseIri: custom });
    expect(v2._statusToIri('active')).toBe(custom + 'Active');
  });

  it('DEFAULTS exports correct values', () => {
    expect(DEFAULTS.dctCreated).toBe('http://purl.org/dc/terms/created');
    expect(DEFAULTS.dctModified).toBe('http://purl.org/dc/terms/modified');
    expect(DEFAULTS.dctIsVersionOf).toBe('http://purl.org/dc/terms/isVersionOf');
    expect(DEFAULTS.admsStatus).toBe('http://www.w3.org/ns/adms#status');
    expect(DEFAULTS.xsdDateTime).toBe('http://www.w3.org/2001/XMLSchema#dateTime');
    expect(DEFAULTS.statusBaseIri).toBe('https://purl.archive.org/adms/status/');
  });
});

describe('allowMultiple = false overwrites instead of appending', () => {
  let v;
  beforeEach(() => { v = new ConceptVersioning(); });

  it('when allowMultiple is false, only the latest prev link exists as single object', () => {
    const node = { '@id': 'urn:multi', [DCT_IS_VERSION_OF]: { '@id': 'old-prev' } };
    const mapCurr = new Map([['urn:multi', node]]);
    const mapPrev = new Map([['urn:multi', { '@id': 'new-prev' }]]);

    v._handleEdits(mapCurr, mapPrev, ['urn:multi'], {}, '2026-01-01T00:00:00.000Z', false);

    // Should be a single object, not an array
    expect(Array.isArray(node[DCT_IS_VERSION_OF])).toBe(false);
    expect(node[DCT_IS_VERSION_OF]['@id']).toBe('new-prev');
  });
});

describe('Input validation in process() and init()', () => {
  let v;
  beforeEach(() => { v = new ConceptVersioning(); });

  it('process() throws when currentNt is null', async () => {
    await expect(v.process({ currentNt: null })).rejects.toThrow('requires a non-null currentNt');
  });

  it('process() throws when currentNt is undefined', async () => {
    await expect(v.process({})).rejects.toThrow('requires a non-null currentNt');
  });

  it('process() throws when currentNt is empty string', async () => {
    await expect(v.process({ currentNt: '' })).rejects.toThrow('requires a non-empty currentNt');
  });

  it('init() throws when filePath is undefined', () => {
    expect(() => v.init(undefined)).toThrow('requires a non-null filePath');
  });

  it('init() throws when filePath is empty string', () => {
    expect(() => v.init('')).toThrow('requires a non-empty filePath');
  });

  it('init() throws when filePath does not exist', () => {
    expect(() => v.init('/nonexistent/path/file.jsonld')).toThrow('file not found');
  });
});

describe('init() end-to-end', () => {
  let tmpFile;
  const testGraph = [
    { '@id': 'urn:init1', label: 'First' },
    { '@id': 'urn:init2', label: 'Second' },
    { '@id': 'urn:init3', label: 'Third' },
  ];

  beforeEach(() => {
    tmpFile = join(tmpdir(), `versioning-init-test-${Date.now()}.jsonld`);
    writeFileSync(tmpFile, JSON.stringify({ graph: testGraph }, null, 2), 'utf-8');
  });

  afterEach(() => {
    try { unlinkSync(tmpFile); } catch {}
  });

  it('reads a JSON-LD file, adds versioning metadata, and writes it back', async () => {
    const v = new ConceptVersioning();
    const res = await v.init(tmpFile);

    expect(res.updated).toBe(3);

    const data = JSON.parse(readFileSync(tmpFile, 'utf-8'));
    expect(data.graph).toHaveLength(3);

    for (const node of data.graph) {
      expect(node[DCT_CREATED]).toBeDefined();
      expect(node[DCT_CREATED]['@type']).toBe(XSD_DATE_TIME);
      expect(node[ADMS_STATUS]).toBeDefined();
      expect(node[ADMS_STATUS]['@id']).toBe('https://purl.archive.org/adms/status/Active');
    }
  });

  it('init() on an already-versioned file does not duplicate metadata', async () => {
    const v = new ConceptVersioning();

    // First init
    await v.init(tmpFile);

    // Second init (idempotent for creations)
    const res2 = await v.init(tmpFile);
    expect(res2.updated).toBe(0); // All nodes already have created/status, so none are "added"
  });
});
