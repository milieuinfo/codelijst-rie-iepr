#!/usr/bin/env node
// Entry point that agents start. Installs dependencies and builds the server
// when needed (fresh clone, or TypeScript sources newer than the build), then
// starts it. Plain JavaScript without dependencies so it runs before `npm install`.
// stdout is reserved for the MCP protocol: all npm output goes to stderr.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const mcpDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(mcpDir, 'dist', 'index.js');

function npm(...args) {
    const result = spawnSync('npm', args, {
        cwd: mcpDir,
        stdio: ['ignore', process.stderr, process.stderr],
        shell: process.platform === 'win32',
    });
    if (result.status !== 0) {
        console.error(`codelijst-rie-iepr MCP: 'npm ${args.join(' ')}' failed in ${mcpDir}.`);
        process.exit(1);
    }
}

function newestSource() {
    const dir = path.join(mcpDir, 'src');
    return Math.max(...fs.readdirSync(dir).map(name => fs.statSync(path.join(dir, name)).mtimeMs));
}

if (!fs.existsSync(path.join(mcpDir, 'node_modules'))) {
    console.error('codelijst-rie-iepr MCP: installing dependencies (first start)...');
    npm('ci', '--no-audit', '--no-fund');
} else if (!fs.existsSync(entry) || fs.statSync(entry).mtimeMs < newestSource()) {
    console.error('codelijst-rie-iepr MCP: building...');
    npm('run', 'build');
}

await import(pathToFileURL(entry).href);
