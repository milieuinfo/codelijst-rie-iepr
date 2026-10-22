/**
 * @file Tests for the CSOR resolution of the operationele POC.
 *
 * The data comes from `src/generated/csor.json`, generated from the GitHub
 * sources by `scripts/sync-csor.mjs`. Definitions are only present for some
 * lists (the eenheden publish none); the UI falls back to the label.
 */
import { describe, expect, it } from 'vitest'
import { CSOR, CsorService, localName } from './csor.js'

const csor = new CsorService()

describe('CsorService', () => {
  it('resolveert een eenheid naar label en symbool', () => {
    expect(csor.resolveConcept('csor_eenheid:E_43')).toMatchObject({
      label: 'procent',
      symbol: '%',
      notation: 'E_43',
    })
    expect(csor.resolveUnitLabel('csor_eenheid:E_43')).toBe('%')
    expect(csor.resolveUnitLabel('csor_eenheid:E_1')).toBe('mg/L')
    expect(csor.resolveUnitLabel('csor_eenheid:E_12')).toBe('kg/jr')
  })

  it('toont van een variabele het label, niet de chemische formule', () => {
    expect(csor.resolveLabel('csor_variabele:V_46')).toBe('Fosfor')
    // csor:symbool van een variabele is een brutoformule ("P") en mag niet als eenheid dienen.
    expect(csor.resolveUnitLabel('csor_variabele:V_46')).toBe('Fosfor')
  })

  it('resolveert de CSOR-semantiek van een waardeveld', () => {
    expect(csor.resolveLabel('csor_kwantificeerbaaraspect:KWA_1')).toBe('massaconcentratie')
    expect(csor.resolveLabel('csor_kwantificeerbaaraspect:KWA_2')).toBe('vracht per tijd')
    expect(csor.resolveLabel('csor_drager:DR_1')).toBe('water')
    expect(csor.resolveLabel('csor_drager:DR_8')).toBe('lucht')
    expect(csor.resolveLabel('csor_soortwaardebepaling:SWB_40')).toBe('standaard deviatie')
  })

  it('valt terug op de lokale naam en waarschuwt één keer voor een onbekend id', () => {
    const waarschuwingen: string[] = []
    const origineel = console.warn
    console.warn = (bericht: string) => waarschuwingen.push(bericht)

    try {
      expect(csor.resolveLabel('csor_eenheid:E_9999')).toBe('E_9999')
      expect(csor.resolveLabel('csor_eenheid:E_9999')).toBe('E_9999')
      expect(csor.resolveUnitLabel('csor_drager:DR_99')).toBe('DR_99')
    } finally {
      console.warn = origineel
    }

    expect(waarschuwingen).toHaveLength(2)
  })
})

describe('csor.json', () => {
  it('bevat een label voor elk concept', () => {
    for (const [id, concept] of Object.entries(CSOR)) {
      expect(concept.label, id).toBeTruthy()
      expect(concept.label, id).not.toBe(id)
      expect(concept.label, id).not.toBe(localName(id))
    }
  })

  it('bevat een symbool voor elke eenheid', () => {
    for (const [id, concept] of Object.entries(CSOR).filter(([id]) => id.startsWith('csor_eenheid:'))) {
      expect(concept.symbol, id).toBeTruthy()
    }
  })
})
