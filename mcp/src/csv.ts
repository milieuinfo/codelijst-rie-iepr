// Line-preserving CSV editing for the codelijst source files.
//
// The source CSVs are hand-edited and reviewed in git, so we never re-serialise
// existing rows: we parse them to understand the structure and only insert,
// replace or remove individual lines (or append a column). That keeps diffs
// minimal and leaves the quoting of untouched rows as it is.

import fs from 'node:fs';

/** One CSV row keyed by column name; empty cells are ''. */
export type CsvRecord = Record<string, string>;

/** A record to write; missing or undefined fields become empty cells. */
export type CsvInput = Record<string, string | undefined>;

export interface CsvRow {
    /** Index in `CsvFile.lines` (0 is the header). */
    index: number;
    record: CsvRecord;
    /** A separator row with only empty cells (",,,,"). */
    blank: boolean;
    columnCount: number;
}

export function parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (inQuotes) {
            if (char === '"' && line[i + 1] === '"') {
                field += '"';
                i += 1;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                field += char;
            }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === ',') {
            fields.push(field);
            field = '';
        } else {
            field += char;
        }
    }
    if (inQuotes) {
        throw new Error(`Unbalanced quotes in CSV line: ${line}`);
    }
    fields.push(field);
    return fields;
}

export function escapeCsvField(value: string | undefined | null): string {
    const text = value ?? '';
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export class CsvFile {
    readonly filePath: string;
    readonly eol: string;
    readonly finalNewline: boolean;
    lines: string[];
    header: string[];

    constructor(filePath: string) {
        this.filePath = filePath;
        const text = fs.readFileSync(filePath, 'utf8');
        this.eol = text.includes('\r\n') ? '\r\n' : '\n';
        this.finalNewline = text.endsWith('\n');
        this.lines = text.split(/\r?\n/);
        if (this.finalNewline) this.lines.pop();
        this.header = parseCsvLine(this.lines[0]).map(h => h.trim());
    }

    /**
     * Rows with their line index. Blank separator rows (",,,,") are kept with
     * `blank: true` because they delimit blocks inside a file.
     */
    get rows(): CsvRow[] {
        const rows: CsvRow[] = [];
        for (let index = 1; index < this.lines.length; index += 1) {
            const line = this.lines[index];
            if (line.trim() === '') continue;
            const values = parseCsvLine(line);
            const record: CsvRecord = {};
            this.header.forEach((column, i) => {
                record[column] = (values[i] ?? '').trim();
            });
            const blank = values.every(v => v.trim() === '');
            rows.push({ index, record, blank, columnCount: values.length });
        }
        return rows;
    }

    get records(): CsvRecord[] {
        return this.rows.filter(r => !r.blank).map(r => r.record);
    }

    hasColumn(column: string): boolean {
        return this.header.includes(column);
    }

    /** Appends a column at the end of the header and pads every non-empty line. */
    addColumn(column: string): boolean {
        if (this.hasColumn(column)) return false;
        this.lines = this.lines.map((line, index) => {
            if (index === 0) return `${line},${column}`;
            return line.trim() === '' ? line : `${line},`;
        });
        this.header.push(column);
        return true;
    }

    serialize(record: CsvInput): string {
        const unknown = Object.keys(record).filter(k => record[k] !== undefined && record[k] !== '' && !this.hasColumn(k));
        if (unknown.length > 0) {
            throw new Error(`${this.filePath} has no column(s) ${unknown.join(', ')}`);
        }
        return this.header.map(column => escapeCsvField(record[column])).join(',');
    }

    blankLine(): string {
        return ','.repeat(this.header.length - 1);
    }

    /** Inserts serialized records after the given line index. */
    insertAfter(lineIndex: number, records: Array<CsvInput | string>): string[] {
        const newLines = records.map(r => (typeof r === 'string' ? r : this.serialize(r)));
        this.lines.splice(lineIndex + 1, 0, ...newLines);
        return newLines;
    }

    /** Re-serialises one row; the other lines are left untouched. */
    replaceLine(lineIndex: number, record: CsvInput): string {
        const line = this.serialize(record);
        this.lines[lineIndex] = line;
        return line;
    }

    isBlankLine(lineIndex: number): boolean {
        const line = this.lines[lineIndex];
        return line !== undefined && line.trim() !== '' && parseCsvLine(line).every(v => v.trim() === '');
    }

    /**
     * Removes lines and the blank separator row left dangling by them (a blank
     * row followed by another blank row or by the end of the file).
     */
    removeLines(lineIndexes: number[]): string[] {
        const removed: string[] = [];
        for (const index of [...new Set(lineIndexes)].sort((a, b) => b - a)) {
            removed.unshift(this.lines[index]);
            this.lines.splice(index, 1);
            const previous = index - 1;
            let next = index;
            while (next < this.lines.length && this.lines[next].trim() === '') next += 1;
            if (previous > 0 && this.isBlankLine(previous) && (next >= this.lines.length || this.isBlankLine(next))) {
                removed.push(...this.lines.splice(previous, 1));
            }
        }
        return removed;
    }

    lastContentIndex(): number {
        for (let index = this.lines.length - 1; index > 0; index -= 1) {
            if (this.lines[index].trim() !== '') return index;
        }
        return 0;
    }

    /**
     * Appends a new block (e.g. an inline concept scheme or collection) at the end
     * of the file, separated from the previous content by a blank row.
     */
    appendBlock(records: CsvInput[]): string[] {
        const index = this.lastContentIndex();
        const lastRow = this.rows.find(r => r.index === index);
        const toInsert: string[] = [];
        if (!lastRow?.blank) toInsert.push(this.blankLine());
        toInsert.push(...records.map(r => this.serialize(r)));
        this.lines.splice(index + 1, 0, ...toInsert);
        return toInsert;
    }

    toString(): string {
        return this.lines.join(this.eol) + (this.finalNewline ? this.eol : '');
    }

    save(): void {
        fs.writeFileSync(this.filePath, this.toString(), 'utf8');
    }
}
