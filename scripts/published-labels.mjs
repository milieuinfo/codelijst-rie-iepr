import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const publishedLabelsPath = 'poc/poc-flow-operationeel/src/generated/csor.json'

export function loadPublishedLabels(root) {
  let text
  try {
    text = readFileSync(join(root, publishedLabelsPath), 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return { available: false, concepts: {}, source: publishedLabelsPath }
    throw error
  }
  const concepts = JSON.parse(text)
  if (!concepts || typeof concepts !== 'object' || Array.isArray(concepts) ||
      Object.entries(concepts).some(([id, concept]) =>
        !/^csor_[a-z]+:[A-Za-z0-9_]+$/.test(id) || !concept || typeof concept !== 'object' ||
        typeof concept.label !== 'string' || !concept.label ||
        (concept.symbol !== undefined && typeof concept.symbol !== 'string'))) {
    throw new Error(`Invalid published label snapshot: ${publishedLabelsPath}. Run the existing sync:csor command.`)
  }
  return { available: true, concepts, source: publishedLabelsPath }
}
