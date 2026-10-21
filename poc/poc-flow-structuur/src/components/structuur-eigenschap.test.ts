/**
 * @file Component tests for the eigenschap dispatcher and the repeated
 * eigenschap (plan 06, "Unit: dispatcher kiest de juiste variant").
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { Eigenschap } from '../models/index.js'
import './structuur-eigenschap.js'
import type { StructuurEigenschap } from './structuur-eigenschap.js'
import type { StructuurMeervoudigeEigenschap } from './structuur-meervoudige-eigenschap.js'

/**
 * Builds an eigenschap with sensible defaults.
 * @param overschrijf - Fields to override.
 * @returns The eigenschap.
 */
function maakEigenschap(overschrijf: Partial<Eigenschap> = {}): Eigenschap {
  return {
    id: 'test:eigenschap',
    label: 'Testeigenschap',
    verplicht: false,
    meervoudig: false,
    multiselect: false,
    kinderen: [],
    ...overschrijf,
  }
}

/**
 * Creates and mounts a component.
 * @param tag - The custom element tag.
 * @param eigenschap - The eigenschap to render.
 * @returns The mounted element.
 */
async function mount<T extends HTMLElement>(tag: string, eigenschap: Eigenschap): Promise<T> {
  const element = document.createElement(tag) as T & {
    eigenschap: Eigenschap
    updateComplete: Promise<unknown>
  }
  element.eigenschap = eigenschap
  document.body.appendChild(element)
  await element.updateComplete
  return element
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('structuur-eigenschap (dispatcher)', () => {
  it('rendert een enkelvoudige eigenschap als één invoer', async () => {
    const element = await mount<StructuurEigenschap>('structuur-eigenschap', maakEigenschap())

    expect(element.shadowRoot?.querySelector('structuur-eigenschap-input')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('structuur-meervoudige-eigenschap')).toBeNull()
  })

  it('rendert een meervoudige eigenschap als rijbeheer', async () => {
    const element = await mount<StructuurEigenschap>(
      'structuur-eigenschap',
      maakEigenschap({ meervoudig: true }),
    )

    expect(element.shadowRoot?.querySelector('structuur-meervoudige-eigenschap')).not.toBeNull()
  })

  it('rendert een composite als rijbeheer, ook zonder meervoudig', async () => {
    const element = await mount<StructuurEigenschap>(
      'structuur-eigenschap',
      maakEigenschap({
        kinderen: [maakEigenschap({ id: 'test:kind', label: 'Kind' })],
      }),
    )

    expect(element.shadowRoot?.querySelector('structuur-meervoudige-eigenschap')).not.toBeNull()
  })
})

describe('structuur-meervoudige-eigenschap', () => {
  it('start met één rij als de eigenschap verplicht is', async () => {
    const element = await mount<StructuurMeervoudigeEigenschap>(
      'structuur-meervoudige-eigenschap',
      maakEigenschap({ meervoudig: true, verplicht: true }),
    )

    expect(element.shadowRoot?.querySelectorAll('.structuur-rij')).toHaveLength(1)
    const verwijder = element.shadowRoot?.querySelector('vl-button[icon="subtract-naked"]')
    expect(verwijder?.hasAttribute('disabled')).toBe(true)
  })

  it('start zonder rij als de eigenschap optioneel en meervoudig is', async () => {
    const element = await mount<StructuurMeervoudigeEigenschap>(
      'structuur-meervoudige-eigenschap',
      maakEigenschap({ meervoudig: true, verplicht: false }),
    )

    expect(element.shadowRoot?.querySelectorAll('.structuur-rij')).toHaveLength(0)
    expect(element.shadowRoot?.querySelector('vl-button[icon="add"]')).not.toBeNull()
  })

  it('voegt een rij toe en verwijdert ze opnieuw', async () => {
    const element = await mount<StructuurMeervoudigeEigenschap>(
      'structuur-meervoudige-eigenschap',
      maakEigenschap({ meervoudig: true, verplicht: true }),
    )

    const toevoegen = element.shadowRoot?.querySelector<HTMLElement>('vl-button[icon="add"]')
    toevoegen?.click()
    await element.updateComplete
    expect(element.shadowRoot?.querySelectorAll('.structuur-rij')).toHaveLength(2)

    const verwijderen = element.shadowRoot?.querySelectorAll<HTMLElement>(
      'vl-button[icon="subtract-naked"]',
    )
    expect(verwijderen?.[0]?.hasAttribute('disabled')).toBe(false)
    verwijderen?.[0]?.click()
    await element.updateComplete
    expect(element.shadowRoot?.querySelectorAll('.structuur-rij')).toHaveLength(1)
    expect(element.shadowRoot?.querySelectorAll('vl-button[icon="subtract-naked"]')[0]?.hasAttribute('disabled')).toBe(true)
  })

  it('toont kolomhoofdingen voor een composite', async () => {
    const element = await mount<StructuurMeervoudigeEigenschap>(
      'structuur-meervoudige-eigenschap',
      maakEigenschap({
        id: 'test:composite',
        label: 'Samengesteld',
        meervoudig: true,
        verplicht: true,
        kinderen: [
          maakEigenschap({ id: 'test:stof', label: 'Stof', verplicht: true }),
          maakEigenschap({ id: 'test:percentage', label: 'Rendement' }),
        ],
      }),
    )

    const koppen = [...(element.shadowRoot?.querySelectorAll('.structuur-kolomhoofd vl-form-label') ?? [])].map(
      (kop) => kop.getAttribute('label'),
    )
    expect(koppen).toEqual(['Stof (*)', 'Rendement'])
    expect(element.shadowRoot?.querySelectorAll('.structuur-rij')).toHaveLength(1)
  })
})
