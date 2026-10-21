/**
 * @file Tests for the CSOR resolution (plan 03).
 *
 * De definities in de CSOR-bronnen zijn (nog) leeg; dat is een eigenschap van de
 * gepubliceerde lijsten, geen fout van de POC. Zie `docs/ISSUES.md`.
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
  })

  it('resolveert een stof uit de collectie met het CSOR-label', () => {
    expect(csor.resolveLabel('csor_variabele:V_2217')).toBe('Zoutzuur')
    expect(csor.resolveLabel('csor_variabele:V_1096')).toBe('Dichlooretheen')
  })

  it('geeft de leden van een collectie alfabetisch op label', () => {
    const opties = csor.resolveCollection(['csor_variabele:V_2217', 'csor_variabele:V_1096'])

    expect(opties.map((optie) => optie.id)).toEqual(['csor_variabele:V_1096', 'csor_variabele:V_2217'])
    expect(opties.map((optie) => optie.label)).toEqual(['Dichlooretheen', 'Zoutzuur'])
  })

  it('valt terug op de lokale naam en waarschuwt één keer voor een onbekend id', () => {
    const waarschuwingen: string[] = []
    const origineel = console.warn
    console.warn = (bericht: string) => waarschuwingen.push(bericht)

    try {
      expect(csor.resolveLabel('csor_eenheid:E_9999')).toBe('E_9999')
      expect(csor.resolveLabel('csor_eenheid:E_9999')).toBe('E_9999')
      expect(csor.resolveUnitLabel('csor_variabele:V_9999')).toBe('V_9999')
    } finally {
      console.warn = origineel
    }

    expect(waarschuwingen).toHaveLength(2)
  })
})

describe('csor.json', () => {
  it('bevat alle eenheden en stoffen die de eigenschappen-CSV\'s gebruiken', () => {
    const verwacht = [
      'csor_eenheid:E_15',
      'csor_eenheid:E_32',
      'csor_eenheid:E_33',
      'csor_eenheid:E_41',
      'csor_eenheid:E_43',
      'csor_eenheid:E_59',
      'csor_eenheid:E_83',
      'csor_eenheid:E_92',
      'csor_variabele:V_1096',
      'csor_variabele:V_2217',
    ]

    expect(Object.keys(CSOR).sort()).toEqual(verwacht)
  })

  it('bevat geen ruwe CURIE als label', () => {
    for (const [id, concept] of Object.entries(CSOR)) {
      expect(concept.label, id).toBeTruthy()
      expect(concept.label, id).not.toBe(id)
      expect(concept.label, id).not.toBe(localName(id))
    }
  })

  it('de eenheden hebben een symbool', () => {
    for (const [id, concept] of Object.entries(CSOR).filter(([id]) => id.startsWith('csor_eenheid:'))) {
      expect(concept.symbol, id).toBeTruthy()
    }
  })
})
