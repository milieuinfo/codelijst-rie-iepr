/**
 * Provides dummy "structural element" instances for fields whose
 * `relevantRiepr` points at a structural type concept (e.g.
 * `riepr-meetpunt-type:debietmeter`) rather than at another operationeel
 * conceptscheme. Per the POC's non-functional requirements there is no
 * backend, so these stand in for what would otherwise be a lookup against a
 * previously reported installation/emission point/measuring point.
 *
 * Labels for the concept ids below are style-matched to the real (dummy)
 * AGC Glass Europe MJV example from milieuinfo/RIE-IEPR
 * (documentatie/datamodel/datavoorbeelden/agc-glass_MJV_01-07-2026.ttl), so
 * the POC shows plausible Flemish-industry names instead of "Item 1/2/3".
 * Any structural type concept not listed here still gets a generic
 * numbered fallback, so new conceptscheme entries need no code change here.
 */

export interface MockInstance {
  id: string
  label: string
}

const SEEDED_INSTANCES: Record<string, string[]> = {
  'riepr-meetpunt-type:debietmeter': [
    'Debietmeter DM-01 (Pompput 1 - FL koeltoren)',
    'Debietmeter DM-02 (Pompput 2 - onderhoud)',
    'Debietmeter DM-03 (Pompput 3 - VT verzending)',
  ],
  'riepr-meetpunt-type:controleinrichting': [
    'Controleinrichting LP01 Industrieel glasfabriek',
    'Controleinrichting LP02 Industrieel Kempenglas',
    'Controleinrichting LP07 Industrieel Coater',
  ],
  'riepr-meetpunt-type:peilput': ['Peilput PP-01', 'Peilput PP-02'],
  'riepr-installatie-type:installatie': ['GLASOVEN', 'Centrifuge', 'Demi-installatie glasfabriek', 'ETSLIJN 1 etsafdeling'],
  'riepr-installatie-type:waterzuivering': ['Waterzuiveringsinstallatie'],
  'riepr-installatie-type:luchtzuivering': ['Electrofilter', 'SCR', 'Wastoren etslijn 1', 'Naverbrander'],
  'riepr-emissiepunt-type:lozingspunt': [
    'LP01 Industrieel glasfabriek',
    'LP02 Industrieel Kempenglas',
    'LP07 Industrieel Coater',
  ],
  'riepr-emissiepunt-type:schoorsteen': ['Schouw glasoven', 'Schouw naverbrander'],
  'riepr-onttrekkingspunt-type:pompput': [
    'Pompput 1 (FL koeltoren)',
    'Pompput 2 (onderhoud)',
    'Pompput 3 (VT verzending)',
  ],
  'riepr-onttrekkingspunt-type:opnamepunt': ['Opgenomen oppervlaktewater'],
  // Generic installation type aliases (used by operationeel-lucht feature_bron)
  // Codelist references this as 'riepr:Installatie' but the actual concept ID uses a different prefix.
  // Seed both formats so either lookup path resolves to mock data.
  'riepr:Installatie': [
    'GLASOVEN',
    'Centrifuge',
    'Demi-installatie glasfabriek',
    'ETSLIJN 1 etsafdeling',
  ],
  'https://data.vlaanderen.be/ns/rie-pr#Installatie': [
    'GLASOVEN',
    'Centrifuge',
    'Demi-installatie glasfabriek',
    'ETSLIJN 1 etsafdeling',
  ],
  // Filter types used in groundwater schemes
  'riepr-filter-type:peil': ['Peilfilter PF-01', 'Peilfilter PF-02'],
  'riepr-filter-type:pomp': ['Pompput PP-01', 'Pompput PP-02', 'Pompput PP-03'],
  // Meetpunt eigenschappen
  'riepr-meetpunt-eigenschappen:referentiepunt': ['Referentiepunt RPT-01 (terrasniveau)'],
}

/**
 * Returns dummy instances for a structural type concept. `fallbackLabel`
 * (typically the concept's own prefLabel) seeds a generic "<label> 1/2/3"
 * list for any type not explicitly seeded above.
 * @param conceptId - The structural type concept id (e.g. `riepr-meetpunt-type:debietmeter`).
 * @param fallbackLabel - Label to use when generating numbered fallback instances.
 * @returns Array of mock instance objects with id and label properties.
 */
export function getMockInstances(conceptId: string, fallbackLabel: string): MockInstance[] {
  const seeded = SEEDED_INSTANCES[conceptId]
  const labels = seeded ?? [1, 2, 3].map(n => `${fallbackLabel} ${n}`)
  return labels.map((label, index) => ({ id: `${conceptId}#mock-${index + 1}`, label }))
}
