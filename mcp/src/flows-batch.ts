import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addField, addFlowCollection, moveField, reorderFields, updateFlowItem } from './flows-edit.js';
import { repoRoot, sourceDir, withRepoRoot } from './repo.js';
import { ValidationError } from './rules.js';

type Args<T extends (...args: never[]) => unknown> = Omit<Parameters<T>[0], 'dryRun'>;
export type OperationalEdit =
    | { tool: 'add_field'; args: Args<typeof addField> }
    | { tool: 'update_flow_item'; args: Args<typeof updateFlowItem> }
    | { tool: 'move_field'; args: Args<typeof moveField> }
    | { tool: 'reorder_fields'; args: Args<typeof reorderFields> }
    | { tool: 'add_flow_collection'; args: Args<typeof addFlowCollection> };

function apply(edit: OperationalEdit) {
    switch (edit.tool) {
        case 'add_field': return addField({ ...edit.args, dryRun: false });
        case 'update_flow_item': return updateFlowItem({ ...edit.args, dryRun: false });
        case 'move_field': return moveField({ ...edit.args, dryRun: false });
        case 'reorder_fields': return reorderFields({ ...edit.args, dryRun: false });
        case 'add_flow_collection': return addFlowCollection({ ...edit.args, dryRun: false });
        default: throw new ValidationError('Unsupported operational batch operation.');
    }
}

function unmatchedLines(content: string, other: string) {
    const counts = new Map<string, number>();
    for (const line of other.split('\n')) counts.set(line, (counts.get(line) ?? 0) + 1);
    return content.split('\n').flatMap((text, index) => {
        const remaining = counts.get(text) ?? 0;
        if (remaining) {
            counts.set(text, remaining - 1);
            return [];
        }
        return [{ line: index + 1, text }];
    });
}

/** Stage sequential existing edits in an isolated source tree before copying any result. */
export function applyOperationalBatch({ operations, dryRun = true }: { operations: OperationalEdit[]; dryRun?: boolean }) {
    if (!operations.length) throw new ValidationError('A batch needs at least one operation.');
    const root = repoRoot();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codelijst-operational-batch-'));
    try {
        fs.cpSync(sourceDir(root), sourceDir(directory), { recursive: true });
        const results = withRepoRoot(directory, () => operations.map(edit => apply(edit)));
        const changed = fs.readdirSync(sourceDir(directory)).flatMap(name => {
            const staged = path.join(sourceDir(directory), name);
            if (!fs.statSync(staged).isFile()) return [];
            const original = path.join(sourceDir(root), name);
            const before = fs.readFileSync(original, 'utf8');
            const after = fs.readFileSync(staged, 'utf8');
            return before === after ? [] : [{ file: `src/source/${name}`, original, before, after }];
        });
        if (!changed.length) throw new ValidationError('The batch has no net changes.');
        const files = changed.map(({ file, before, after }) => ({
            file, removedLines: unmatchedLines(before, after), resultingLines: unmatchedLines(after, before),
        }));
        if (!dryRun) {
            try {
                for (const file of changed) fs.writeFileSync(file.original, file.after);
            } catch (error) {
                for (const file of changed) fs.writeFileSync(file.original, file.before);
                throw error;
            }
        }
        return {
            status: dryRun ? 'dry-run (nothing written)' : 'written without generator validation',
            operations: results.map(result => ({ action: result.action, warnings: result.warnings })),
            files,
            next: dryRun
                ? 'Show the final CSV lines and obtain confirmation before repeating the entire batch with dryRun=false.'
                : 'Run once through validatedWrite for CSV fixing, SKOS validation and full rollback on failure.',
        };
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
}
