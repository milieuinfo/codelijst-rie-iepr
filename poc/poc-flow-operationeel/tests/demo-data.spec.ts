import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { DataFactory, Parser, Store } from 'n3'
import { parseReferenceData, schemaObject } from 'codelijst-rie-iepr-poc-json-schema/browser'

const references = parseReferenceData(JSON.parse(readFileSync(new URL('../../poc-json-schema/examples/refs.json', import.meta.url), 'utf8')))

const sections = (JSON.parse(readFileSync(new URL('../public/schema/index.json', import.meta.url), 'utf8')) as {
  files: Array<{ kind: string; id: string; themeConceptId?: string }>
}).files.filter((entry): entry is typeof entry & { themeConceptId: string } =>
  entry.kind === 'section' && typeof entry.themeConceptId === 'string')

const mappings = [
  ['/grondwater/kwaliteitsmeting/', 'operationeel-grondwater/kwaliteitsmeting-resultaten-meetwaarde', 'operationeel-grondwater/kwaliteitsmeting-resultaten-parameter'],
  ['/lucht/emissie/', 'operationeel-lucht/emissie_parameter_massastroom', 'operationeel-lucht/emissie_parameter_parameter'],
  ['/lucht/emissie/', 'operationeel-lucht/emissie_parameter_concentratie', 'operationeel-lucht/emissie_parameter_parameter'],
  ['/lucht/emissie/', 'operationeel-lucht/emissie_parameter_jaaremissie', 'operationeel-lucht/emissie_parameter_parameter'],
  ['/water/abnormale-lozing/', 'operationeel-water/abnormale-lozing-jaarvracht', 'operationeel-water/abnormale-lozing-stof'],
  ['/zelfcontrole-lucht/meting/', 'operationeel-zelfcontrole-lucht/parameter-concentratie', 'operationeel-zelfcontrole-lucht/parameter-parameter'],
  ['/zelfcontrole-water/meting/', 'operationeel-zelfcontrole-water/parameter-concentratie', 'operationeel-zelfcontrole-water/parameter-parameter'],
]

test('fills every reporting form with its fictional example data', async ({ page }) => {
  await page.goto('/')
  await page.locator('select#productie-jaar').selectOption(String(new Date().getFullYear()))

  for (const section of sections) {
    await page.locator('select#thema').selectOption(section.themeConceptId)
    await page.locator('select#doorsnede').selectOption(section.id)
    await page.getByRole('button', { name: 'Fictieve voorbeeldgegevens invullen', exact: true }).click()
    await page.getByRole('button', { name: 'Valideren en JSON tonen', exact: true }).click()

    const output = page.locator('#validated-json')
    await expect(output).toBeVisible()
    const data = JSON.parse(await output.innerText()) as Record<string, unknown>
    expect(Object.values(data).some(value => Array.isArray(value) && value.length > 0), section.id).toBe(true)
    const selections = Object.values(data).flatMap(rows => Array.isArray(rows) ? rows.flatMap(row => {
      const record = schemaObject(row)
      return [record.hasFeatureOfInterest, record.featureEp, record.featureBron].flat()
        .filter((id): id is string => typeof id === 'string')
    }) : [])
    if (!selections.length) continue
    await page.getByRole('tab', { name: 'Turtle', exact: true }).click()
    const graph = new Store(new Parser().parse(await page.locator('#validated-turtle').innerText()))
    const { namedNode } = DataFactory
    const sosa = 'http://www.w3.org/ns/sosa/'
    const schema = 'https://schema.org/'
    const rdfType = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
    const processClass = namedNode('https://data.riepr.omgeving.vlaanderen.be/ns/riepr#Proces')
    for (const id of selections) {
      expect(graph.has(namedNode(id), rdfType, processClass, null), section.id).toBe(true)
      const [system] = graph.getObjects(namedNode(id), namedNode('http://www.w3.org/ns/ssn/implementedBy'), null)
      expect(system).toBeDefined()
      expect(graph.getObjects(namedNode(id), namedNode('http://www.w3.org/2000/01/rdf-schema#label'), null)
        .map(term => term.value)).toEqual([references.find(reference => reference.id === system.value)!.label])
    }
    for (const quad of graph.getQuads(null, namedNode(sosa + 'observedProperty'), null, null)) {
      expect(quad.object.value).not.toContain('/csor/variabele/')
    }
    for (const [sectionPath, measurement, selector] of mappings.filter(([path]) => section.id.includes(path))) {
      const concept = 'https://data.omgeving.vlaanderen.be/id/concept/riepr/'
      const observations = graph.getSubjects(namedNode(sosa + 'observedProperty'), namedNode(concept + measurement), null)
      expect(observations.length, sectionPath).toBeGreaterThan(0)
      for (const observation of observations) {
        const [result] = graph.getObjects(observation, namedNode(sosa + 'hasResult'), null)
        const variables = graph.getObjects(result, namedNode(schema + 'additionalProperty'), null)
          .filter(property => graph.countQuads(property, namedNode(schema + 'propertyID'), namedNode(concept + selector), null))
        expect(variables, `${section.id}: ${measurement}`).toHaveLength(1)
        expect(graph.getObjects(variables[0], namedNode(schema + 'value'), null)[0].value).toContain('/csor/variabele/')
      }
    }
    if (section.id.includes('/grondwater/kwaliteitsmeting/')) {
      const sampling = graph.getSubjects(rdfType, namedNode('http://www.w3.org/ns/sosa/Sampling'), null)
      const emissions = graph.getSubjects(rdfType, namedNode('https://data.riepr.omgeving.vlaanderen.be/ns/riepr#Emissie'), null)
      expect(sampling).toHaveLength(1)
      expect(emissions).toHaveLength(1)
      expect(graph.getObjects(sampling[0], namedNode('http://www.w3.org/ns/sosa/ultimateFeatureOfInterest'), null))
        .toEqual(emissions)
    }
  }
})
