/**
 * @file Minimal CSV reader for the RIE-IEPR source files in `src/source`.
 *
 * The files use the usual quoting rules (a `"` starts a quoted field, `""` is a
 * literal quote, quoted fields may contain comma's and line breaks). Newlines
 * inside quoted fields are supported because a record is assembled until the
 * quote count is balanced.
 */
import { readFileSync } from 'node:fs'

/**
 * Splits one CSV record into fields.
 * @param {string} record - One complete record (no unquoted line break).
 * @returns {string[]} The fields, without surrounding quotes.
 */
export function splitCsvRecord(record) {
  const fields = []
  let value = ''
  let inQuotes = false

  for (let i = 0; i < record.length; i++) {
    const char = record[i]

    if (inQuotes) {
      if (char === '"') {
        if (record[i + 1] === '"') {
          value += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        value += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      fields.push(value)
      value = ''
    } else {
      value += char
    }
  }

  fields.push(value)
  return fields
}

/**
 * Reads a CSV file into a header and row objects.
 * @param {string} file - Absolute path of the CSV file.
 * @returns {{ header: string[], rows: Record<string, string>[] }} Parsed content; blank records are skipped.
 */
export function readCsv(file) {
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  const records = []
  let current = ''
  let inQuotes = false

  for (const char of text) {
    if (char === '"') inQuotes = !inQuotes
    if (char === '\n' && !inQuotes) {
      records.push(current.replace(/\r$/, ''))
      current = ''
      continue
    }
    current += char
  }
  if (current.trim() !== '') records.push(current.replace(/\r$/, ''))

  const nonEmpty = records.filter((record) => record.trim() !== '')
  const [headerRecord, ...dataRecords] = nonEmpty
  if (!headerRecord) return { header: [], rows: [] }

  const header = splitCsvRecord(headerRecord).map((column) => column.trim())
  const rows = dataRecords.map((record) => {
    const fields = splitCsvRecord(record)
    const row = {}
    header.forEach((column, index) => {
      row[column] = (fields[index] ?? '').trim()
    })
    return row
  })

  return { header, rows }
}
