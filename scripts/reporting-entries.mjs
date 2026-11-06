import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const reportingEntriesPath = 'poc/reporting-entries.json'

export function loadReportingEntries(root, { required = true } = {}) {
  let content
  try {
    content = readFileSync(join(root, reportingEntriesPath), 'utf8')
  } catch (error) {
    if (!required && error.code === 'ENOENT') return []
    throw error
  }
  const entries = JSON.parse(content)
  if (!Array.isArray(entries) || !entries.length) {
    throw new Error(`${reportingEntriesPath}: expected a nonempty array of reporting entries.`)
  }
  const seen = new Map(['file', 'schemeId', 'slug', 'label'].map(key => [key, new Set()]))
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        Object.keys(entry).some(key => !seen.has(key)) ||
        [...seen.keys()].some(key => typeof entry[key] !== 'string' || !entry[key].trim() || entry[key] !== entry[key].trim()) ||
        !/^operationeel_[a-z0-9_-]+\.csv$/.test(entry.file) ||
        !/^conceptscheme:operationeel_[a-z0-9_-]+$/.test(entry.schemeId) ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug)) {
      throw new Error(`${reportingEntriesPath}: invalid reporting entry ${JSON.stringify(entry)}.`)
    }
    for (const [key, values] of seen) {
      const value = key === 'label' ? entry[key].toLowerCase() : entry[key]
      if (values.has(value)) throw new Error(`${reportingEntriesPath}: duplicate ${key} ${entry[key]}.`)
      values.add(value)
    }
  }
  return entries
}
