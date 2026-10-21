/**
 * @file Tests for the generated `systeemvelden.json` (plan 05).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SYSTEMEN, UITGESLOTEN } from '../../scripts/systeemvelden-config.mjs'
import systeemvelden from '../generated/systeemvelden.json'
import type { Systeemveld } from '../models/index.js'

const VELDEN = systeemvelden as Record<string, Systeemveld[]>
const POC = resolve(__dirname, '../..')
const JSON_PATH = resolve(POC, 'src/generated/systeemvelden.json')

/**
 * Finds one field of a systeem.
 * @param systeem - The system key.
 * @param property - The property CURIE.
 * @returns The field, or undefined.
 */
function veld(systeem: string, property: string): Systeemveld | undefined {
  return VELDEN[systeem]?.find((kandidaat) => kandidaat.property === property)
}

describe('systeemvelden.json', () => {
  it('bevat voor installatie naam, beschrijving en in gebruik vanaf', () => {
    expect(veld('installatie', 'rdfs:label')).toMatchObject({
      label: 'Naam',
      verplicht: true,
      meervoudig: false,
    })
    expect(veld('installatie', 'rdfs:comment')).toMatchObject({
      label: 'Beschrijving',
      verplicht: false,
    })
    expect(veld('installatie', ':inGebruikVanaf')).toMatchObject({
      label: 'In gebruik vanaf',
      verplicht: true,
      datatype: 'xsd:date',
    })
  })

  it('bevat de zes systemen', () => {
    expect(Object.keys(VELDEN).sort()).toEqual(SYSTEMEN.map((systeem) => systeem.sleutel).sort())
  })

  it('bevat geen uitgesloten properties', () => {
    const uitgesloten = Object.keys(UITGESLOTEN)
    for (const [systeem, velden] of Object.entries(VELDEN)) {
      for (const gevonden of velden) {
        expect(uitgesloten, `${systeem}: ${gevonden.property}`).not.toContain(gevonden.property)
      }
    }
  })

  it('geeft elk veld een Nederlands label en een datatype', () => {
    for (const [systeem, velden] of Object.entries(VELDEN)) {
      for (const gevonden of velden) {
        expect(gevonden.label, `${systeem}: ${gevonden.property}`).toBeTruthy()
        expect(gevonden.label).not.toBe(gevonden.property)
        expect(gevonden.datatype).toMatch(/^xsd:|^adms:/)
      }
    }
  })

  it('houdt naam en beschrijving enkelvoudig, externe identificatie meervoudig', () => {
    expect(veld('installatie', 'rdfs:label')?.meervoudig).toBe(false)
    expect(veld('installatie', 'rdfs:comment')?.meervoudig).toBe(false)
    expect(veld('installatie', 'adms:identifier')?.meervoudig).toBe(true)
  })

  it('is deterministisch: twee runs geven een identiek bestand', () => {
    const eerste = readFileSync(JSON_PATH, 'utf8')
    execFileSync(process.execPath, ['scripts/build-systeemvelden.mjs'], { cwd: POC })
    const tweede = readFileSync(JSON_PATH, 'utf8')

    expect(tweede).toBe(eerste)
  })
})
