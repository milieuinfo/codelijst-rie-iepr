import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const lock = JSON.parse(await readFile(new URL('../test/linked-data.lock.json', import.meta.url), 'utf8'))
const cache = new URL('../.cache/linked-data/', import.meta.url)
const digest = data => createHash('sha256').update(data).digest('hex')

for (const [path, { url, sha256 }] of Object.entries(lock)) {
  const target = new URL(path, cache)
  let data
  try {
    data = await readFile(target)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (data) {
    if (digest(data) !== sha256) throw new Error(`Checksum mismatch: ${target.pathname}`)
    continue
  }
  const response = await fetch(url, {
    headers: { Accept: path.endsWith('.ttl') ? 'text/turtle' : '*/*' },
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  data = Buffer.from(await response.arrayBuffer())
  if (digest(data) !== sha256) throw new Error(`Checksum mismatch: ${url}`)
  await mkdir(new URL('.', target), { recursive: true })
  await writeFile(target, data)
  console.log(`Downloaded ${path}`)
}
console.log('Pinned linked-data validator and context are ready; validation runs offline.')
