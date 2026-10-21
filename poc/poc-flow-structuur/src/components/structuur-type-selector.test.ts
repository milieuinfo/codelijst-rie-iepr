/**
 * @file Component tests for the type selector (plan 04).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { readCsv } from '../../scripts/lib/csv.mjs'
import type { CodelistResult, SysteemSleutel } from '../models/index.js'
import { CodelistService } from '../services/codelist-service.js'
import { getSystemen } from '../services/structuur-service.js'
import './structuur-type-selector.js'
import type { StructuurTypeSelector } from './structuur-type-selector.js'

const JSONLD = resolve(
  __dirname,
  '../../public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld',
)
const SOURCE = resolve(__dirname, '../../../../src/source')

let result: CodelistResult

beforeAll(() => {
  const data = JSON.parse(readFileSync(JSONLD, 'utf8')) as Record<string, unknown>
  result = new CodelistService().parseData(data)
})

/**
 * Counts the visible types of every systeem directly from the source CSV's.
 * @returns The expected number of options.
 */
function zichtbareTypesUitCsv(): number {
  let totaal = 0
  for (const systeem of getSystemen(result)) {
    const { rows } = readCsv(resolve(SOURCE, `${systeem.sleutel}_type.csv`)) as {
      rows: Record<string, string>[]
    }
    totaal += rows.filter(
      (row) => row._id && !row._id.startsWith('conceptscheme:') && row.isOnzichtbaar !== 'true',
    ).length
  }
  return totaal
}

/**
 * Mounts a selector with the real codelist.
 * @returns The element.
 */
async function mountSelector(): Promise<StructuurTypeSelector> {
  const element = document.createElement('structuur-type-selector') as StructuurTypeSelector
  element.result = result
  document.body.appendChild(element)
  await element.updateComplete
  return element
}

describe('structuur-type-selector', () => {
  it('bevat evenveel opties als de zichtbare types in de CSV\'s', async () => {
    const element = await mountSelector()
    const aantal = element.opties.reduce((som, groep) => som + groep.choices.length, 0)

    expect(aantal).toBe(zichtbareTypesUitCsv())
    expect(aantal).toBe(24)
  })

  it('groepeert per systeem, in de volgorde van de zes systemen', async () => {
    const element = await mountSelector()

    expect(element.opties.map((groep) => groep.label)).toEqual([
      'Emissiepunt',
      'Filter',
      'Installatie',
      'Meetpunt',
      'Uitwisselpunt',
      'Onttrekkingspunt',
    ])
  })

  it('bevat geen onzichtbare types', async () => {
    const element = await mountSelector()
    const waarden = element.opties.flatMap((groep) => groep.choices.map((keuze) => keuze.value))

    expect(waarden).not.toContain('emissiepunt:emissiepunt_lucht')
    expect(waarden).not.toContain('installatie:gpbv')
    expect(waarden).not.toContain('filter:filter')
    // Het zichtbare subtype van een onzichtbare ouder staat er wel.
    expect(waarden).toContain('emissiepunt:schoorsteen_verticale_uitstroom')
  })

  it('springt subtypes in onder hun ouder', async () => {
    const element = await mountSelector()
    const installaties = element.opties.find((groep) => groep.label === 'Installatie')
    const directe = installaties?.choices.find(
      (keuze) => keuze.value === 'installatie:directe_stookinstallatie',
    )

    expect(directe?.label.startsWith('\u00A0\u00A0')).toBe(true)
  })

  it('stuurt type-select met systeem en type-id', async () => {
    const element = await mountSelector()
    const select = element.shadowRoot?.querySelector('vl-select-rich') as HTMLElement

    const detail = await new Promise<{ systeem: SysteemSleutel; typeId: string }>((resolveer) => {
      element.addEventListener('type-select', (event) => {
        resolveer((event as CustomEvent<{ systeem: SysteemSleutel; typeId: string }>).detail)
      })
      select.dispatchEvent(
        new CustomEvent('vl-change', {
          bubbles: true,
          composed: true,
          detail: { value: 'meetpunt:peilput' },
        }),
      )
    })

    expect(detail).toEqual({ systeem: 'meetpunt', typeId: 'meetpunt:peilput' })
  })

  it('stuurt een lege selectie bij het leegmaken', async () => {
    const element = await mountSelector()
    const select = element.shadowRoot?.querySelector('vl-select-rich') as HTMLElement

    const detail = await new Promise<{ systeem?: string; typeId?: string }>((resolveer) => {
      element.addEventListener('type-select', (event) => {
        resolveer((event as CustomEvent<{ systeem?: string; typeId?: string }>).detail)
      })
      select.dispatchEvent(
        new CustomEvent('vl-change', { bubbles: true, composed: true, detail: { value: '' } }),
      )
    })

    expect(detail).toEqual({ systeem: undefined, typeId: undefined })
  })
})
