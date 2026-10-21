/**
 * Type declarations for the Node build helpers in `scripts/lib`, so the
 * vitest data-consistency tests can read the source CSV's with the same parser
 * as the build scripts.
 */

export function splitCsvRecord(record: string): string[]

export function readCsv(file: string): {
  header: string[]
  rows: Record<string, string>[]
}
