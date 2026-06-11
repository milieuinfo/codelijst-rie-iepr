'use strict';

import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');

const dirIndex = args.indexOf('--dir');
const targetDir = dirIndex >= 0 && args[dirIndex + 1]
    ? path.resolve(args[dirIndex + 1])
    : path.resolve('source');

function countCsvColumns(line) {
    let columns = 1;
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            columns += 1;
        }
    }

    return columns;
}

async function collectCsvFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectCsvFiles(fullPath));
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) {
            files.push(fullPath);
        }
    }

    return files;
}

function getLineEnding(content) {
    if (content.includes('\r\n')) {
        return '\r\n';
    }
    return '\n';
}

async function processFile(filePath) {
    const original = await fs.readFile(filePath, 'utf8');
    const lineEnding = getLineEnding(original);
    const hadFinalNewline = original.endsWith('\n') || original.endsWith('\r\n');

    const lines = original.split(/\r?\n/);
    if (lines.length === 0 || lines[0].trim() === '') {
        return { filePath, expectedColumns: 0, issues: [], changed: false };
    }

    const expectedColumns = countCsvColumns(lines[0]);
    const issues = [];
    let changed = false;

    for (let index = 1; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.trim() === '') {
            continue;
        }

        const actualColumns = countCsvColumns(line);
        if (actualColumns === expectedColumns) {
            continue;
        }

        const lineNumber = index + 1;

        if (actualColumns < expectedColumns) {
            const missing = expectedColumns - actualColumns;
            issues.push({ lineNumber, actualColumns, expectedColumns, type: 'missing', missing });

            if (shouldFix) {
                lines[index] = `${line}${','.repeat(missing)}`;
                changed = true;
            }
            continue;
        }

        issues.push({ lineNumber, actualColumns, expectedColumns, type: 'extra', extra: actualColumns - expectedColumns });
    }

    if (shouldFix && changed) {
        let updated = lines.join(lineEnding);
        if (hadFinalNewline && !updated.endsWith(lineEnding)) {
            updated += lineEnding;
        }
        await fs.writeFile(filePath, updated, 'utf8');
    }

    return { filePath, expectedColumns, issues, changed };
}

async function main() {
    const csvFiles = await collectCsvFiles(targetDir);
    if (csvFiles.length === 0) {
        console.log(`No CSV files found in ${targetDir}.`);
        return;
    }

    const results = await Promise.all(csvFiles.map(processFile));

    let totalIssues = 0;
    let unresolvedIssues = 0;
    let changedFiles = 0;

    for (const result of results) {
        if (result.changed) {
            changedFiles += 1;
        }

        if (result.issues.length === 0) {
            continue;
        }

        totalIssues += result.issues.length;

        for (const issue of result.issues) {
            const isResolved = shouldFix && issue.type === 'missing';
            if (!isResolved) {
                unresolvedIssues += 1;
            }

            const action = isResolved ? 'fixed' : 'needs manual fix';
            console.log(
                `${result.filePath}: line ${issue.lineNumber} has ${issue.actualColumns} columns, expected ${issue.expectedColumns} (${action})`
            );
        }
    }

    console.log(`Scanned ${csvFiles.length} CSV file(s).`);
    console.log(`Detected ${totalIssues} issue(s).`);

    if (shouldFix) {
        console.log(`Updated ${changedFiles} file(s).`);
    }

    if (unresolvedIssues > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});