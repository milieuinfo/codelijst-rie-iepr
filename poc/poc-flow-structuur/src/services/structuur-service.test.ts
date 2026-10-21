/**
 * @file Tests for the structural model (`structuur-service.ts`) against the
 * real, generated RIE-IEPR codelist. Plan 02, "Tests (vitest)".
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { CodelistService } from './codelist-service.js'
import { parseCodelist } from './codelist-parse.js'
import { CsorService } from './csor.js'
import {
  getAncestors,
  getEenheden,
  getEigenschappen,
  getSelectieOpties,
  getSystemen,
  getTypes,
} from './structuur-service.js'
import type { CodelistResult, SysteemSleutel } from '../models/index.js'

const JSONLD = resolve(
  __dirname,
  '../../public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld',
)

let result: CodelistResult
const csor = new CsorService()

beforeAll(() => {
  const data = JSON.parse(readFileSync(JSONLD, 'utf8')) as Record<string, unknown>
  result = new CodelistService().parseData(data)
})

describe('getSystemen', () => {
  it('geeft de zes systemen met hun typeschema en eigenschappenschema', () => {
    const systemen = getSystemen(result)

    expect(systemen.map((systeem) => systeem.sleutel)).toEqual([
      'emissiepunt',
      'filter',
      'installatie',
      'meetpunt',
      'uitwisselpunt',
      'onttrekkingspunt',
    ])
    for (const systeem of systemen) {
      expect(result.schemes.has(systeem.typeSchemaId)).toBe(true)
      expect(result.schemes.has(systeem.eigenschappenSchemaId)).toBe(true)
    }
  })
})

describe('getTypes', () => {
  it('laat onzichtbare types weg', () => {
    const emissiepunten = getTypes(result, 'emissiepunt').map((type) => type.id)
    const installaties = getTypes(result, 'installatie').map((type) => type.id)
    const filters = getTypes(result, 'filter').map((type) => type.id)

    expect(emissiepunten).not.toContain('emissiepunt:emissiepunt_lucht')
    expect(installaties).not.toContain('installatie:gpbv')
    expect(filters).not.toContain('filter:filter')
  })

  it('houdt zichtbare kinderen van een onzichtbare ouder, als wortel', () => {
    const emissiepunten = getTypes(result, 'emissiepunt')
    // Emissiepunt lucht én schoorsteen zijn onzichtbaar; hun zichtbare subtypes blijven.
    const schoorsteen = emissiepunten.find((type) => type.id === 'emissiepunt:schoorsteen')
    const verticaal = emissiepunten.find(
      (type) => type.id === 'emissiepunt:schoorsteen_verticale_uitstroom',
    )

    expect(schoorsteen).toBeUndefined()
    expect(verticaal).toBeDefined()
    expect(verticaal?.diepte).toBe(0)
    // De verborgen ouders blijven wel als `broader` bekend.
    expect(verticaal?.broader).toBe('emissiepunt:schoorsteen')
  })

  it('zet een subtype direct onder zijn zichtbare ouder', () => {
    const installaties = getTypes(result, 'installatie').map((type) => type.id)
    const stook = installaties.indexOf('installatie:stookinstallatie')
    expect(installaties[stook + 1]).toBe('installatie:directe_stookinstallatie')
    expect(installaties[stook + 2]).toBe('installatie:indirecte_stookinstallatie')
  })

  it('bevat geen scheme- of collectieconcepten', () => {
    for (const systeem of getSystemen(result)) {
      for (const type of getTypes(result, systeem.sleutel)) {
        expect(type.id.startsWith('conceptscheme:')).toBe(false)
        expect(result.schemes.has(type.id)).toBe(false)
      }
    }
  })
})

describe('getAncestors', () => {
  it('geeft de typeketen via broader', () => {
    expect(getAncestors(result, 'emissiepunt:schoorsteen')).toEqual(['emissiepunt:emissiepunt_lucht'])
    expect(getAncestors(result, 'emissiepunt:schoorsteen_verticale_uitstroom')).toEqual([
      'emissiepunt:schoorsteen',
      'emissiepunt:emissiepunt_lucht',
    ])
    expect(getAncestors(result, 'emissiepunt:lozingspunt')).toEqual([])
  })
})

describe('getEigenschappen — scoperegel', () => {
  it('toont hoogte bij een schoorsteensubtype maar niet bij lozingspunt', () => {
    const schoorsteen = getEigenschappen(
      result,
      'emissiepunt',
      'emissiepunt:schoorsteen_verticale_uitstroom',
    )
    const lozingspunt = getEigenschappen(result, 'emissiepunt', 'emissiepunt:lozingspunt')

    expect(schoorsteen.map((eigenschap) => eigenschap.id)).toContain('emissiepunt-eigenschappen:hoogte')
    expect(lozingspunt.map((eigenschap) => eigenschap.id)).not.toContain(
      'emissiepunt-eigenschappen:hoogte',
    )
  })

  it('geeft verwijderingsrendement met twee kinderen, enkel bij luchtzuivering', () => {
    const luchtzuivering = getEigenschappen(result, 'installatie', 'installatie:luchtzuivering')
    const stookinstallatie = getEigenschappen(result, 'installatie', 'installatie:stookinstallatie')

    const rendement = luchtzuivering.find(
      (eigenschap) => eigenschap.id === 'installatie-eigenschappen:verwijderingsrendement',
    )
    expect(rendement).toBeDefined()
    expect(rendement?.kinderen.map((kind) => kind.id)).toEqual([
      'installatie-eigenschappen:verwijderingsrendement_stof',
      'installatie-eigenschappen:verwijderingsrendement_percentage',
    ])
    expect(rendement?.meervoudig).toBe(true)
    expect(rendement?.kinderen[0]?.codeList).toBe('collectie:verwijderingsrendement_stoffen')
    expect(rendement?.kinderen[1]?.unit).toBe('csor_eenheid:E_43')

    expect(stookinstallatie.map((eigenschap) => eigenschap.id)).not.toContain(
      'installatie-eigenschappen:verwijderingsrendement',
    )
  })

  it('toont referentiepunt enkel bij peilput', () => {
    const peilput = getEigenschappen(result, 'meetpunt', 'meetpunt:peilput')
    const debietmeter = getEigenschappen(result, 'meetpunt', 'meetpunt:debietmeter')

    const referentiepunt = peilput.find(
      (eigenschap) => eigenschap.id === 'meetpunt-eigenschappen:referentiepunt',
    )
    expect(referentiepunt?.kinderen.map((kind) => kind.id)).toEqual([
      'meetpunt-eigenschappen:referentiepunt_naam',
      'meetpunt-eigenschappen:referentiepunt_diepte',
    ])
    expect(referentiepunt?.verplicht).toBe(true)
    expect(referentiepunt?.meervoudig).toBe(true)
    expect(debietmeter.map((eigenschap) => eigenschap.id)).not.toContain(
      'meetpunt-eigenschappen:referentiepunt',
    )
  })

  it('erft de scope van de ouder voor kinderen zonder relevantRiepr', () => {
    const waterzuivering = getEigenschappen(result, 'installatie', 'installatie:waterzuivering')
    const techniek = waterzuivering.find(
      (eigenschap) => eigenschap.id === 'installatie-eigenschappen:waterzuiveringstechniek',
    )

    expect(techniek).toBeDefined()
    expect(techniek?.kinderen.map((kind) => kind.id)).toEqual([
      'installatie-eigenschappen:waterzuiveringstechniek_ingebruikvan',
      'installatie-eigenschappen:waterzuiveringstechniek_techniek',
    ])
  })

  it('behandelt meerdere relevantRiepr-waarden als lijst', () => {
    const synthetisch = parseCodelist({
      graph: [
        { id: 'conceptscheme:x_type', _type: ['skos:ConceptScheme'] },
        { id: 'x:a', _type: ['skos:Concept'], inScheme: 'conceptscheme:x_type', prefLabel: 'A' },
        { id: 'x:b', _type: ['skos:Concept'], inScheme: 'conceptscheme:x_type', prefLabel: 'B' },
        { id: 'conceptscheme:x_eigenschappen', _type: ['skos:ConceptScheme'] },
        {
          id: 'x-eigenschappen:meervoudig',
          _type: ['skos:Concept'],
          inScheme: 'conceptscheme:x_eigenschappen',
          prefLabel: 'Meervoudige scope',
          relevantRiepr: ['x:a', 'x:b'],
        },
        { id: 'conceptscheme:y_type', _type: ['skos:ConceptScheme'] },
        { id: 'y:c', _type: ['skos:Concept'], inScheme: 'conceptscheme:y_type', prefLabel: 'C' },
      ],
    })
    const xSysteem = {
      sleutel: 'x' as SysteemSleutel,
      label: 'X',
      typeSchemaId: 'conceptscheme:x_type',
      eigenschappenSchemaId: 'conceptscheme:x_eigenschappen',
    }
    const ySysteem = {
      sleutel: 'y' as SysteemSleutel,
      label: 'Y',
      typeSchemaId: 'conceptscheme:y_type',
      eigenschappenSchemaId: 'conceptscheme:y_eigenschappen',
    }

    expect(getEigenschappen(synthetisch, xSysteem, 'x:a')).toHaveLength(1)
    expect(getEigenschappen(synthetisch, xSysteem, 'x:b')).toHaveLength(1)
    expect(getEigenschappen(synthetisch, ySysteem, 'y:c')).toHaveLength(0)
  })
})

describe('getSelectieOpties', () => {
  it('geeft de opties van een inline keuzelijst in CSV-volgorde', () => {
    const opties = getSelectieOpties(result, 'conceptscheme:lozingspunt_lozingsplaats')

    expect(opties.map((optie) => optie.label)).toEqual([
      'Oppervlaktewater',
      'Riool',
      'Grondwater',
      'Collector',
      'Externe waterzuivering',
      'Regenwaterriolering',
    ])
    expect(opties[1]?.definitie).toBe('Lozing op riolering.')
  })

  it('geeft de leden van een CSOR-collectie met label en definitie', () => {
    const opties = getSelectieOpties(result, 'collectie:verwijderingsrendement_stoffen', csor)

    expect(opties.map((optie) => optie.id).sort()).toEqual(['csor_variabele:V_1096', 'csor_variabele:V_2217'])
    expect(opties.map((optie) => optie.label)).toEqual(['Dichlooretheen', 'Zoutzuur'])
  })

  it('geeft geen opties voor een extern gepubliceerde lijst', () => {
    expect(getSelectieOpties(result, 'https://vito.be/codelijst/luchtzuiveringstechniek')).toEqual([])
  })
})

describe('getEenheden', () => {
  it('geeft één eenheid met symbool', () => {
    expect(getEenheden('csor_eenheid:E_59', result, csor)).toEqual([
      { id: 'csor_eenheid:E_59', label: 'meter', definitie: undefined, symbool: 'm' },
    ])
  })

  it('geeft de leden van een eenhedencollectie', () => {
    const eenheden = getEenheden('collectie:opslagcapaciteit_eenheden', result, csor)

    // Alfabetisch op label: aantal (#), kubieke meter (m³), liter (L), ton.
    expect(eenheden.map((eenheid) => eenheid.symbool)).toEqual(['#', 'm³', 'L', 'ton'])
  })

  it('geeft geen eenheden zonder relevantUnit', () => {
    expect(getEenheden(undefined)).toEqual([])
  })
})
