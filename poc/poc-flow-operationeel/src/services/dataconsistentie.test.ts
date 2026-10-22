/**
 * @file Dataconsistentie op de echte bronbestanden: elke CSOR-verwijzing en
 * elke keuzelijst in de operationele CSV's moet resolveerbaar zijn.
 *
 * Een fout hier is een fout in de bron, niet in de POC; de bevindingen staan in
 * `docs/ISSUES.md`.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { readCsv } from '../../scripts/lib/csv.mjs'
import { parseCodelist } from './codelist-parse.js'
import { CSOR } from './csor.js'
import type { CodelistResult } from '../models/index.js'

const SOURCE = resolve(__dirname, '../../../../src/source')
const TURTLE = resolve(
  __dirname,
  '../../public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.ttl',
)

/** De systeemtypes en -eigenschappen horen bij de structuur-POC, niet bij deze. */
const STRUCTUUR_BRONNEN = new Set([
  'emissiepunt_type.csv',
  'emissiepunt_eigenschappen.csv',
  'filter_type.csv',
  'filter_eigenschappen.csv',
  'installatie_type.csv',
  'installatie_eigenschappen.csv',
  'meetpunt_type.csv',
  'meetpunt_eigenschappen.csv',
  'uitwisselpunt_type.csv',
  'uitwisselpunt_eigenschappen.csv',
  'onttrekkingspunt_type.csv',
  'onttrekkingspunt_eigenschappen.csv',
])

let result: CodelistResult
const rows: Record<string, string>[] = []
const collections = new Map<string, string[]>()
const csorIds = new Set<string>()

beforeAll(() => {
  result = parseCodelist(readFileSync(TURTLE, 'utf8'), true)

  for (const file of readdirSync(SOURCE).filter(
    (name) => name.endsWith('.csv') && !STRUCTUUR_BRONNEN.has(name),
  )) {
    const parsed = readCsv(resolve(SOURCE, file)) as { rows: Record<string, string>[] }
    for (const row of parsed.rows) {
      if (row.collections && row._id) {
        if (!collections.has(row.collections)) collections.set(row.collections, [])
        collections.get(row.collections)!.push(row._id)
      }
      for (const value of Object.values(row)) {
        for (const match of String(value ?? '').match(/csor_[a-z]+:[A-Za-z0-9_]+/g) ?? []) csorIds.add(match)
      }
      // Alleen conceptrijen zijn velden; schemerijen vullen dezelfde kolommen met metadata.
      if (row._type === 'skos:Concept') rows.push(row)
    }
  }
})

describe('CSOR-verwijzingen', () => {
  it('elke CSOR-CURIE uit de bron resolveert in csor.json', () => {
    const onbekend = [...csorIds].filter((id) => !CSOR[id])

    expect(onbekend).toEqual([])
  })

  it('bevat alle eenheden, stoffen en CSOR-semantiek die de operationele velden gebruiken', () => {
    expect(csorIds.size).toBeGreaterThan(20)
    // Een greep uit de verwijzingen die de UI effectief toont.
    for (const id of [
      'csor_eenheid:E_1',
      'csor_eenheid:E_43',
      'csor_eenheid:E_32',
      'csor_variabele:V_46',
      'csor_kwantificeerbaaraspect:KWA_1',
      'csor_drager:DR_1',
      'csor_soortwaardebepaling:SWB_40',
    ]) {
      expect(CSOR[id], id).toBeDefined()
    }
  })
})

describe('relevantCodeList', () => {
  it('elke inline keuzelijst bestaat als conceptscheme met concepten', () => {
    const fouten: string[] = []
    for (const row of rows) {
      const refs = (row.relevantCodeList ?? '').split(',').map((ref) => ref.trim()).filter(Boolean)
      for (const ref of refs) {
        if (ref === 'http://TODO') continue
        if (!ref.startsWith('conceptscheme:')) continue
        const concepten = [...result.concepts.values()].filter((concept) => concept.inScheme === ref)
        if (!result.schemes.has(ref) || concepten.length === 0) fouten.push(`${row._id} → ${ref}`)
      }
    }
    expect(fouten).toEqual([])
  })

  it('elke CSOR-collectie heeft leden die resolveerbaar zijn', () => {
    const fouten: string[] = []
    for (const row of rows) {
      const refs = [row.relevantCodeList, row.relevantUnit].filter(Boolean).join(',')
      for (const ref of refs.split(',').map((value) => value.trim()).filter(Boolean)) {
        if (!ref.startsWith('collectie:')) continue
        const leden = collections.get(ref) ?? result.collections.get(ref) ?? []
        if (leden.length === 0) {
          fouten.push(`${row._id} → ${ref} (geen leden)`)
          continue
        }
        for (const lid of leden) {
          if (lid.startsWith('csor_') && !CSOR[lid]) fouten.push(`${ref} → ${lid}`)
        }
      }
    }
    expect(fouten).toEqual([])
  })

  it('externe en TODO-keuzelijsten zijn de enige niet-resolveerbare refs', () => {
    const extern = new Set<string>()
    for (const row of rows) {
      for (const ref of (row.relevantCodeList ?? '').split(',').map((value) => value.trim()).filter(Boolean)) {
        if (ref.startsWith('conceptscheme:') || ref.startsWith('collectie:')) continue
        extern.add(ref)
      }
    }
    expect([...extern].sort()).toEqual(['http://TODO'])
  })
})

describe('relevantUnit', () => {
  it('elke eenheid is een CSOR-eenheid of de TODO-plaatshouder', () => {
    const onbekend: string[] = []
    for (const row of rows) {
      for (const ref of (row.relevantUnit ?? '').split(',').map((value) => value.trim()).filter(Boolean)) {
        if (ref === 'http://TODO') continue
        if (ref.startsWith('csor_eenheid:')) {
          if (!CSOR[ref]) onbekend.push(`${row._id} → ${ref}`)
          continue
        }
        onbekend.push(`${row._id} → ${ref}`)
      }
    }
    expect(onbekend).toEqual([])
  })
})
