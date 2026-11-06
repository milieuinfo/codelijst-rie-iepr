import assert from 'node:assert/strict';
import { test } from 'vitest';
import { uiOrder } from '../src/flows.js';
import type { CsvRecord } from '../src/csv.js';

const ids = (fields: CsvRecord[]) => uiOrder(fields).map(field => field._id);

test('preserves the ordering chain through conditional fields', () => {
    assert.deepEqual(ids([
        { _id: 'type', _ui_first: 'true' },
        { _id: 'state', _ui_after: 'cause' },
        { _id: 'temperature', _ui_after: 'state' },
        { _id: 'cause', _ui_after: 'type', conditionPath: 'type', conditionValue: 'abnormal' },
    ]), ['type', 'cause', 'state', 'temperature']);
});

test('places triggers before dependents without moving all conditional fields to the end', () => {
    assert.deepEqual(ids([
        { _id: 'detail', conditionPath: 'trigger', conditionValue: 'false' },
        { _id: 'trigger' },
        { _id: 'unrelated' },
        { _id: 'nested', conditionPath: 'detail', conditionValue: 'zero' },
    ]), ['trigger', 'detail', 'unrelated', 'nested']);
});

test('resolves free UI predecessors and ignores conditions outside the sibling context', () => {
    assert.deepEqual(ids([
        { _id: 'child', _ui_after: 'parent' },
        { _id: 'parent' },
        { _id: 'other', conditionPath: 'ancestor', conditionValue: 'true' },
    ]), ['parent', 'child', 'other']);
});

test('rejects contradictions between condition and UI ordering', () => {
    assert.throws(() => ids([
        { _id: 'trigger', _ui_after: 'detail' },
        { _id: 'detail', conditionPath: 'trigger', conditionValue: 'true' },
    ]), /Cyclic UI\/condition ordering/);
});
