import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Runs the built server; `npm test` builds it first.
const serverPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.js');

test('server exposes the tools over stdio', async () => {
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [serverPath] }));
    try {
        const { tools } = await client.listTools();
        assert.deepEqual(tools.map(t => t.name).sort(), [
            'add_field', 'add_flow', 'add_flow_collection', 'add_property', 'add_selection_list', 'add_step', 'add_type',
            'delete_field', 'delete_property', 'delete_selection_list', 'delete_step', 'delete_type',
            'find_code_lists', 'generate_skos', 'get_flow', 'get_flow_item', 'get_property', 'get_step', 'get_type_properties',
            'list_flows', 'list_properties', 'list_types', 'remove_list_entries', 'reorder_fields', 'search_codelists',
            'update_flow_item', 'update_property', 'update_selection_list', 'update_type', 'validate_codelists', 'validate_flows',
        ]);
        const result = await client.callTool({ name: 'list_types', arguments: { system: 'filter' } }) as CallToolResult;
        const text = (result.content[0] as { text: string }).text;
        assert.ok(JSON.parse(text).types.some((t: { id: string }) => t.id === 'filter:peil'));
        const invalid = await client.callTool({ name: 'add_type', arguments: { system: 'filter', code: 'peil', prefLabel: 'Peil', definition: 'Peil.' } });
        assert.equal(invalid.isError, true);
    } finally {
        await client.close();
    }
});
