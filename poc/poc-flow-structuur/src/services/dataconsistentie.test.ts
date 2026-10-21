/**
 * @file Dataconsistentietests op de echte bronbestanden (plan 07, taak 1).
 *
 * Deze tests horen bij het datateam: een fout hier is een fout in de CSV's of in
 * de CSOR-verwijzingen, niet in de POC. Ze worden bewust niet in de POC
 * omzeild; de bevindingen staan in `docs/ISSUES.md`.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { readCsv } from '../../scripts/lib/csv.mjs'
import { CSOR } from './csor.js'
import { CodelistService } from './codelist-service.js'
import { getAncestors, getSystemen } from './structuur-service.js'
import type { CodelistResult } from '../models/index.js'

const JSONLD = resolve(
  __dirname,
  '../../public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld',
)
const SOURCE = resolve(__dirname, '../../../../src/source')

/** Extern gepubliceerde keuzelijsten die deze POC niet kan resolven. */
const EXTERNE_CODELISTS = new Set([
  'https://data.bodemenondergrond.vlaanderen.be/id/conceptscheme/aquiferhcovv2',
  'https://vito.be/codelijst/luchtzuiveringstechniek',
  'https://vito.be/codelijst/waterzuiveringstechniek',
])

let result: CodelistResult

beforeAll(() => {
  const data = JSON.parse(readFileSync(JSONLD, 'utf8')) as Record<string, unknown>
  result = new CodelistService().parseData(data)
})

/**
 * All eigenschap-concepten (roots and composite children) of a systeem.
 * @param sleutel - The system key.
 * @returns The concepten.
 */
function eigenschappenVan(sleutel: string) {
  const schemeId = `conceptscheme:${sleutel}_eigenschappen`
  return [...result.concepts.values()].filter((concept) => concept.inScheme === schemeId)
}

describe('typeverwijzingen', () => {
  it('elke relevantRiepr verwijst naar een bestaand concept', () => {
    const onbekend: string[] = []

    for (const systeem of getSystemen(result)) {
      for (const eigenschap of eigenschappenVan(systeem.sleutel)) {
        for (const ref of eigenschap.relevantRiepr ?? []) {
          if (ref.startsWith('riepr:')) continue
          if (!result.concepts.has(ref) && !result.schemes.has(ref)) onbekend.push(`${eigenschap.id} → ${ref}`)
        }
      }
    }

    expect(onbekend).toEqual([])
  })

  it('elke broaderPartitive verwijst naar een bestaande composite', () => {
    const fouten: string[] = []

    for (const systeem of getSystemen(result)) {
      const ids = new Set(eigenschappenVan(systeem.sleutel).map((concept) => concept.id))
      for (const eigenschap of eigenschappenVan(systeem.sleutel)) {
        for (const ouder of eigenschap.broaderPartitive ?? []) {
          if (!ids.has(ouder)) fouten.push(`${eigenschap.id} → ${ouder}`)
        }
      }
    }

    expect(fouten).toEqual([])
  })
})

describe('scoperegel', () => {
  it('elke composite heeft een niet-lege scope (eigen of geërfde relevantRiepr)', () => {
    const fouten: string[] = []

    for (const systeem of getSystemen(result)) {
      const alle = eigenschappenVan(systeem.sleutel)
      for (const ouder of alle.filter((concept) => concept.broaderPartitive?.length === 0 || !concept.broaderPartitive)) {
        const kinderen = alle.filter((concept) => concept.broaderPartitive?.includes(ouder.id))
        if (kinderen.length === 0) continue

        const scope = new Set<string>(ouder.relevantRiepr ?? [])
        for (const kind of kinderen) {
          for (const ref of kind.relevantRiepr ?? []) scope.add(ref)
        }
        if (scope.size === 0) fouten.push(ouder.id)
      }
    }

    expect(fouten).toEqual([])
  })

  it('geen enkele zelfstandige eigenschap heeft een lege relevantRiepr', () => {
    const fouten: string[] = []

    for (const systeem of getSystemen(result)) {
      const alle = eigenschappenVan(systeem.sleutel)
      const compositeIds = new Set(
        alle.flatMap((concept) => concept.broaderPartitive ?? []),
      )

      for (const eigenschap of alle) {
        const isKind = (eigenschap.broaderPartitive ?? []).length > 0
        const isComposite = compositeIds.has(eigenschap.id)
        if (!isKind && !isComposite && (eigenschap.relevantRiepr ?? []).length === 0) {
          fouten.push(eigenschap.id)
        }
      }
    }

    expect(fouten).toEqual([])
  })

  it('elke eigenschap hoort bij minstens één zichtbaar type van zijn systeem', () => {
    const zonderType: string[] = []

    for (const systeem of getSystemen(result)) {
      const alle = eigenschappenVan(systeem.sleutel)
      const zichtbaar = [...result.concepts.values()].filter(
        (concept) =>
          concept.inScheme === systeem.typeSchemaId && concept.isOnzichtbaar !== true,
      )

      for (const eigenschap of alle) {
        const isKind = (eigenschap.broaderPartitive ?? []).length > 0
        if (isKind) continue
        const scope = eigenschap.relevantRiepr ?? []
        if (scope.length === 0) continue // gemeld door de vorige test
        const gedekt = zichtbaar.some((type) =>
          scope.some((ref) => ref === type.id || getAncestors(result, type.id).includes(ref)),
        )
        if (!gedekt) zonderType.push(eigenschap.id)
      }
    }

    expect(zonderType).toEqual([])
  })
})

describe('keuzelijsten en eenheden', () => {
  it('elke relevantCodeList is een inline lijst, een collectie of een bekende externe lijst', () => {
    const onbekend: string[] = []

    for (const systeem of getSystemen(result)) {
      for (const eigenschap of eigenschappenVan(systeem.sleutel)) {
        for (const ref of eigenschap.relevantCodeList ?? []) {
          if (ref.startsWith('conceptscheme:')) {
            if (!result.schemes.has(ref)) onbekend.push(`${eigenschap.id} → ${ref}`)
          } else if (ref.startsWith('collectie:')) {
            if (!result.collections.has(ref) && !(ref in COLLECTIE_LEDEN)) onbekend.push(`${eigenschap.id} → ${ref}`)
          } else if (!EXTERNE_CODELISTS.has(ref)) {
            onbekend.push(`${eigenschap.id} → ${ref}`)
          }
        }
      }
    }

    expect(onbekend).toEqual([])
  })

  it('elke relevantUnit resolveert naar een CSOR-eenheid', () => {
    const onbekend: string[] = []

    for (const systeem of getSystemen(result)) {
      for (const eigenschap of eigenschappenVan(systeem.sleutel)) {
        for (const ref of eigenschap.relevantUnit ?? []) {
          const ids = ref.startsWith('collectie:') ? COLLECTIE_LEDEN[ref] ?? [] : [ref]
          for (const id of ids) {
            if (!CSOR[id]) onbekend.push(`${eigenschap.id} → ${id}`)
          }
        }
      }
    }

    expect(onbekend).toEqual([])
  })

  it('elke CSOR-collectie uit de bron heeft leden', () => {
    for (const [id, leden] of Object.entries(COLLECTIE_LEDEN)) {
      expect(leden.length, id).toBeGreaterThan(0)
    }
  })
})

describe('bronbestanden', () => {
  it('de CSV-volgorde dekt alle schema\'s en collecties uit de eigenschappen-CSV\'s', () => {
    const volgorde = JSON.parse(
      readFileSync(resolve(__dirname, '../generated/csv-volgorde.json'), 'utf8'),
    ) as { schemes: Record<string, string[]>; collections: Record<string, string[]> }

    for (const systeem of getSystemen(result)) {
      expect(volgorde.schemes[systeem.typeSchemaId]?.length).toBeGreaterThan(0)
      expect(volgorde.schemes[systeem.eigenschappenSchemaId]?.length).toBeGreaterThan(0)
    }
    for (const collectie of Object.keys(COLLECTIE_LEDEN)) {
      expect(volgorde.collections[collectie], collectie).toBeDefined()
    }
  })

  it('de types-CSV\'s bevatten dezelfde concepten als het gegenereerde JSON-LD', () => {
    for (const systeem of getSystemen(result)) {
      const { rows } = readCsv(resolve(SOURCE, `${systeem.sleutel}_type.csv`)) as {
        rows: Record<string, string>[]
      }
      const uitCsv = rows.map((row) => row._id).filter((id) => id && !id.startsWith('conceptscheme:'))
      const uitJsonld = [...result.concepts.values()]
        .filter((concept) => concept.inScheme === systeem.typeSchemaId)
        .map((concept) => concept.id)

      expect(uitJsonld.sort(), systeem.sleutel).toEqual(uitCsv.sort())
    }
  })
})

/** Members of the CSOR collections, from the CSV `collections` column. */
const COLLECTIE_LEDEN: Record<string, string[]> = (() => {
  const leden: Record<string, string[]> = {}
  for (const systeem of ['emissiepunt', 'filter', 'installatie', 'meetpunt', 'uitwisselpunt', 'onttrekkingspunt']) {
    const { rows } = readCsv(resolve(SOURCE, `${systeem}_eigenschappen.csv`)) as {
      rows: Record<string, string>[]
    }
    for (const row of rows) {
      const collectie = row.collections
      if (!collectie || !row._id) continue
      leden[collectie] ??= []
      leden[collectie].push(row._id)
    }
  }
  return leden
})()
