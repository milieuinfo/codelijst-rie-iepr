/**
 * @file Playwright smoke- en interactietests (plannen 04, 06 en 07).
 *
 * De app draait zonder backend; deze tests doorlopen de echte UI: een type
 * kiezen in de doorzoekbare dropdown, velden invullen, rijen toevoegen en
 * verwijderen, en het debugpaneel controleren.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Opens the POC and waits until the codelist is loaded. */
async function openApp(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('structuur-type-selector vl-select-rich').waitFor({ timeout: 20_000 })
}

/**
 * Picks a type in the searchable dropdown by (part of) its label.
 * @param page - The page.
 * @param label - Text to search for, e.g. "Luchtzuiveringsinstallatie".
 */
async function kiesType(page: Page, label: string): Promise<void> {
  await page.locator('structuur-type-selector [part="vl-select-rich__combobox"]').click()
  await page.waitForTimeout(300)
  await page.keyboard.type(label)
  const optie = page.locator('structuur-type-selector .vl-select__item--choice', { hasText: label }).first()
  await optie.waitFor({ timeout: 5_000 })
  await optie.click()
  await page.waitForTimeout(300)
}

const SYSTEMEN: { type: string; label: string; eigenschap: string }[] = [
  {
    type: 'installatie:stookinstallatie',
    label: 'Stookinstallatie',
    eigenschap: 'vl-input-field[name="installatie-eigenschappen:nominaal_thermisch_vermogen__waarde"]',
  },
  {
    type: 'emissiepunt:lozingspunt',
    label: 'Lozingspunt',
    eigenschap: 'vl-select-rich[data-eigenschap="emissiepunt-eigenschappen:lozingspunt-lozingsplaats"]',
  },
  {
    type: 'filter:peil',
    label: 'Peilfilter',
    eigenschap: 'vl-input-field[name="filter-eigenschappen:diepte__waarde"]',
  },
  {
    type: 'meetpunt:debietmeter',
    label: 'Debietmeter grondwater',
    eigenschap: 'vl-input-field[name="meetpunt-eigenschappen:serienummer__waarde"]',
  },
  {
    type: 'uitwisselpunt:pompput',
    label: 'Pompput',
    eigenschap: 'vl-input-field[name="uitwisselpunt-eigenschappen:diepte__waarde"]',
  },
  {
    type: 'onttrekkingspunt:opnamepunt',
    label: 'Opnamepunt oppervlaktewater',
    eigenschap: 'vl-input-field[name="onttrekkingspunt-eigenschappen:omschrijving__waarde"]',
  },
]

test.describe('structuurformulier', () => {
  for (const systeem of SYSTEMEN) {
    test(`toont de vaste velden en eigenschappen van ${systeem.label}`, async ({ page }) => {
      await openApp(page)
      await kiesType(page, systeem.label)

      await expect(page.locator('vl-input-field[name="systeemveld:rdfs:label__waarde"]')).toBeVisible()
      await expect(page.locator('vl-datepicker[name="systeemveld:inGebruikVanaf__waarde"]')).toBeVisible()
      await expect(page.locator(systeem.eigenschap).first()).toBeVisible()
    })
  }

  test('toont de beschrijving van een installatie', async ({ page }) => {
    await openApp(page)
    await kiesType(page, 'Luchtzuiveringsinstallatie')

    await expect(page.locator('vl-textarea[name="systeemveld:rdfs:comment__waarde"]')).toBeVisible()
  })

  test('wisselt van type en verwijdert de eigenschappen van het vorige type', async ({ page }) => {
    await openApp(page)
    await kiesType(page, 'Luchtzuiveringsinstallatie')
    await expect(page.locator('vl-fieldset [slot="legend"]', { hasText: 'Verwijderingsrendement' })).toBeVisible()

    await kiesType(page, 'Peilput')
    await expect(page.locator('vl-fieldset [slot="legend"]', { hasText: 'Referentiepunt' })).toBeVisible()
    await expect(page.locator('vl-fieldset [slot="legend"]', { hasText: 'Verwijderingsrendement' })).toHaveCount(0)
  })
})

test.describe('meervoudige en composite eigenschappen', () => {
  test('voegt rijen toe, verwijdert een rij en behoudt de waarden van de andere rij', async ({ page }) => {
    await openApp(page)
    await kiesType(page, 'Luchtzuiveringsinstallatie')

    const stof = page.locator('vl-select-rich[data-eigenschap="installatie-eigenschappen:verwijderingsrendement_stof"]')
    const percentage = page.locator(
      'vl-input-field[name="installatie-eigenschappen:verwijderingsrendement_percentage__waarde"] input',
    )
    const verwijderen = page.getByRole('button', { name: 'Verwijderingsrendement rij verwijderen' })

    // Eerste rij.
    await page.getByRole('button', { name: 'Verwijderingsrendement toevoegen' }).click()
    await stof.first().locator('[part="vl-select-rich__combobox"]').click()
    await page.waitForTimeout(300)
    await page.keyboard.type('Zoutzuur')
    await page.waitForTimeout(300)
    await page.keyboard.press('Enter')
    await percentage.first().fill('87,5')

    // Tweede rij.
    await page.getByRole('button', { name: 'Verwijderingsrendement toevoegen' }).click()
    await stof.nth(1).locator('[part="vl-select-rich__combobox"]').click()
    await page.waitForTimeout(300)
    await page.keyboard.type('Dichlooretheen')
    await page.waitForTimeout(300)
    await page.keyboard.press('Enter')
    await percentage.nth(1).fill('12,25')
    await page.waitForTimeout(300)

    await expect(verwijderen).toHaveCount(2)
    await verwijderen.first().click()
    await page.waitForTimeout(300)
    await expect(verwijderen).toHaveCount(1)

    await page.getByRole('button', { name: 'Toon waarden' }).click()
    const waarden = page.locator('[data-testid="waarden"]')
    await expect(waarden).toContainText('V_1096')
    await expect(waarden).toContainText('12,25')
    await expect(waarden).not.toContainText('V_2217')
    await expect(waarden).not.toContainText('87,5')
  })

  test('een verplichte meervoudige eigenschap start met één rij die niet verwijderd kan worden', async ({
    page,
  }) => {
    await openApp(page)
    await kiesType(page, 'Peilput')

    const verwijderen = page.getByRole('button', { name: 'Referentiepunt rij verwijderen' })
    await expect(verwijderen).toHaveCount(1)
    await expect(verwijderen).toBeDisabled()
  })

  test('toont een selector bij meerdere eenheden uit een collectie', async ({ page }) => {
    await openApp(page)
    await kiesType(page, 'Opslag/Overslag')

    const eenheid = page.locator(
      'vl-select-rich[name="installatie-eigenschappen:geinstalleerde_opslag_overslagcapaciteit__eenheid"]',
    )
    await expect(eenheid).toBeVisible()

    const opties = await eenheid.evaluate((element) => {
      const select = element as unknown as { options: { label: string }[] }
      return select.options.map((optie) => optie.label)
    })
    expect(opties).toEqual(['#', 'm³', 'L', 'ton'])
  })

  test('houdt de eenheid naast het numerieke veld en de keuzelijstopties leesbaar', async ({ page }) => {
    await openApp(page)
    await kiesType(page, 'Schoorsteen met verticale uitstroom')

    const invoer = await page.locator('vl-input-field[name="emissiepunt-eigenschappen:hoogte__waarde"]').boundingBox()
    const eenheid = await page.locator('vl-text.structuur-eenheid', { hasText: 'm' }).first().boundingBox()

    expect(invoer).not.toBeNull()
    expect(eenheid).not.toBeNull()
    // De eenheid staat direct naast het invoerveld, niet aan de rand van de pagina.
    expect(eenheid!.x - (invoer!.x + invoer!.width)).toBeLessThan(40)
    expect(invoer!.width).toBeLessThan(300)

    await kiesType(page, 'Lozingspunt')
    const optieFont = await page
      .locator('vl-select-rich[data-eigenschap="emissiepunt-eigenschappen:lozingspunt-lozingsplaats"]')
      .evaluate((element) => {
        const optie = element.shadowRoot?.querySelector('.vl-select__item--choice')
        return optie ? parseFloat(getComputedStyle(optie).fontSize) : 0
      })
    // vl-fieldset verkleint geërfde tekst in @domg-wc/components 2.16; dit bewaakt de workaround.
    expect(optieFont).toBeGreaterThanOrEqual(16)
  })

  test('toont eenheden en keuzelijsten met labels uit de codelijsten', async ({ page }) => {
    await openApp(page)
    await kiesType(page, 'Schoorsteen met verticale uitstroom')

    await expect(page.locator('vl-input-field[name="emissiepunt-eigenschappen:hoogte__waarde"]')).toBeVisible()
    await expect(page.locator('vl-text', { hasText: 'm' }).first()).toBeVisible()

    await kiesType(page, 'Lozingspunt')
    const lozingsplaats = page.locator('vl-select-rich[data-eigenschap="emissiepunt-eigenschappen:lozingspunt-lozingsplaats"]')
    await expect(lozingsplaats).toBeVisible()
    await expect(lozingsplaats.locator('.vl-select__item--choice', { hasText: 'Riool' })).toHaveCount(1)
  })
})
