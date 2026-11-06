import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('a fresh launcher exposes composite metadata and safe movement over MCP', async () => {
    const transport = new StdioClientTransport({
        command: process.execPath, args: [path.join(root, 'mcp/bin/codelijst-mcp.js')],
        cwd: root, env: { CODELIJST_ROOT: root }, stderr: 'pipe',
    });
    const client = new Client({ name: 'contract-test', version: '1.0.0' });
    try {
        await client.connect(transport);
        const { tools } = await client.listTools();
        const update = tools.find(tool => tool.name === 'update_flow_item')!;
        const add = tools.find(tool => tool.name === 'add_field')!;
        const move = tools.find(tool => tool.name === 'move_field')!;
        assert.ok(move, 'move_field must be discoverable');
        assert.ok(tools.some(tool => tool.name === 'get_reporting_preview'));
        const batch = tools.find(tool => tool.name === 'apply_operational_batch')!;
        assert.ok(batch, 'atomic operational batches must be discoverable');
        const set = update.inputSchema.properties!.set as { properties: Record<string, unknown> };
        for (const key of ['tableKey', 'referenceParent', 'referenceRelation']) {
            assert.ok(set.properties[key], `update_flow_item must expose ${key}`);
            assert.ok(add.inputSchema.properties![key], `add_field must expose ${key}`);
        }
        for (const args of [
            { id: 'lucht:emissie', set: { tableKey: ['lucht:emissietype'] } },
            { id: 'grondwater:kwaliteitsmeting-feature', set: {
                referenceParent: 'grondwater:kwaliteitsmeting-referentiepunt',
                referenceRelation: 'prov:wasDerivedFrom',
            } },
        ]) {
            const result = await client.callTool({ name: 'update_flow_item', arguments: { ...args, dryRun: true } });
            assert.notEqual(result.isError, true);
            const content = result.content as { type: string; text: string }[];
            const preview = JSON.parse(content[0].text);
            assert.match(preview.status, /dry-run/);
            assert.ok(preview.changes.length);
        }
        const result = await client.callTool({ name: 'move_field', arguments: {
            field: 'lucht:brandstof', step: 'operationeel_lucht_rapportering', dryRun: true,
        } });
        assert.notEqual(result.isError, true);
        const text = result.content as { type: string; text: string }[];
        const preview = JSON.parse(text[0].text);
        assert.match(preview.status, /dry-run/);
        assert.ok(preview.changes.some((change: { after?: string }) => change.after?.startsWith('lucht:brandstof_s,')));
        const bad = await client.callTool({ name: 'update_flow_item', arguments: {
            id: 'lucht:emissie', set: { unsupportedMetadata: 'must not be silently ignored' }, dryRun: true,
        } });
        assert.equal(bad.isError, true);
        const batchResult = await client.callTool({ name: 'apply_operational_batch', arguments: {
            operations: [
                { tool: 'update_flow_item', args: { id: 'lucht:brandstof_naam', set: { prefLabel: 'Testnaam' } } },
                { tool: 'update_flow_item', args: { id: 'lucht:brandstof_naam', set: { prefLabel: 'Definitieve testnaam' } } },
            ],
            dryRun: true,
        } });
        assert.notEqual(batchResult.isError, true);
        const batchPreview = JSON.parse((batchResult.content as { text: string }[])[0].text);
        assert.match(batchPreview.status, /dry-run/);
        assert.ok(batchPreview.files[0].resultingLines.some((line: { text: string }) => line.text.includes('Definitieve testnaam')));
        assert.ok(!batchPreview.files[0].resultingLines.some((line: { text: string }) => line.text.includes(',Testnaam,')));
        const badBatch = await client.callTool({ name: 'apply_operational_batch', arguments: {
            operations: [{ tool: 'update_flow_item', args: {
                id: 'lucht:brandstof_naam', set: { unsupportedMetadata: true },
            } }], dryRun: true,
        } });
        assert.equal(badBatch.isError, true);
        const readiness = await client.callTool({ name: 'get_reporting_preview', arguments: {
            flow: 'Lucht', section: 'lucht:afvalproduct',
        } });
        assert.notEqual(readiness.isError, true);
        const report = JSON.parse((readiness.content as { text: string }[])[0].text);
        assert.equal(report.complete, true);
        assert.equal(report.sections.length, 1);
        assert.equal(report.sections[0].sheets[0].columns[0].label, 'Installatie');
    } finally {
        await client.close();
        await transport.close();
    }
}, 30_000);
