import { CodelistParser } from '../src/services/codelist-parser.js'
import { ThemeResolver } from '../src/services/theme-resolver.js'
import { ConceptMapper } from '../src/services/concept-mapper.js'
import { ChainComposer } from '../src/services/chain-composer.js'
import { CompositeGroupBuilder } from '../src/services/composite-group-builder.js'
import { SchemaAssembler } from '../src/services/schema-assembler.js'

const scheme = 'conceptscheme:operationeel_grondwater'
const field = (id: string, label: string, parent?: string, extra: Record<string, unknown> = {}) => ({
  id: `grondwater:${id}`, _type: 'skos:Concept', inScheme: scheme, prefLabel: label,
  ...(parent ? { broaderPartitive: `grondwater:${parent}` } : { topConceptOf: scheme }),
  ...extra,
})
const table = (workbook: string, sheet: string) => ({ _table_workbook: workbook, _table_sheet: sheet })

/** Synthetic, internally consistent input; never repairs or writes the actual source. */
export function groundwaterFixture() {
  return {
    'x-source-profile': 'groundwater-csv-v1',
    '@context': {
      conceptscheme: 'https://example.test/schemes/', grondwater: 'https://example.test/grondwater/',
      collectie: 'https://example.test/collections/', parameter: 'https://example.test/parameters/',
      unit: 'https://example.test/units/', meetpunt: 'https://example.test/meetpunten/',
      riepr: 'https://data.riepr.omgeving.vlaanderen.be/ns/riepr#',
      prov: 'http://www.w3.org/ns/prov#', rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    },
    graph: [
      { id: scheme, _type: 'skos:ConceptScheme' },
      field('onttrekking', 'Onttrekking/infiltratie', undefined, { relevantClass: 'riepr:ObservatieVerzameling', isMeervoudig: true }),
      field('startdatum', 'Startdatum', 'onttrekking', {
        relevantObservation: 'grondwater:startmeterstand', relation: 'sosa:resultTime', relevantDataType: 'xsd:date',
        ...table('grondwater-debieten.ods', 'Debieten'), _table_order: 1,
      }),
      field('startmeterstand', 'Startmeterstand', 'onttrekking', {
        relevantObservation: 'grondwater:onttrekking', relation: 'sosa:hasMember', relevantClass: 'riepr:Observatie',
        relevantDataType: 'xsd:decimal', relevantUnit: 'unit:m3', ...table('grondwater-debieten.ods', 'Debieten'), _table_order: 2,
      }),
      field('einddatum', 'Einddatum', 'onttrekking', {
        relevantObservation: ['grondwater:eindmeterstand', 'grondwater:hoeveelheid'],
        relation: 'sosa:resultTime', relevantDataType: 'xsd:date',
        ...table('grondwater-debieten.ods', 'Debieten'), _table_order: 3,
      }),
      ...['eindmeterstand', 'hoeveelheid'].map((id, index) => field(id, index ? 'Hoeveelheid' : 'Eindmeterstand', 'onttrekking', {
        relevantObservation: 'grondwater:onttrekking', relation: 'sosa:hasMember', relevantClass: 'riepr:Observatie',
        relevantDataType: 'xsd:decimal', relevantUnit: 'unit:m3', isVerplicht: !!index,
        ...table('grondwater-debieten.ods', 'Debieten'), _table_order: 4 + index,
      })),
      field('peilmeting', 'Peilmeting', undefined, { relevantClass: 'riepr:Observatie', isMeervoudig: true }),
      field('diepte', 'Diepte', 'peilmeting', {
        relevantDataType: 'xsd:decimal', relevantUnit: 'unit:m', relation: 'qudt:numericValue', isVerplicht: true,
        ...table('grondwater-peilmetingen.ods', 'Peilmetingen'),
      }),
      field('peil-datum', 'Datum en tijdstip', 'peilmeting', {
        relevantDataType: 'xsd:dateTime', relation: 'sosa:resultTime', ...table('grondwater-peilmetingen.ods', 'Peilmetingen'),
      }),
      field('methode', 'Peilmethode', 'peilmeting', {
        relevantDataType: 'xsd:string', relation: 'schema:measurementMethod', ...table('grondwater-peilmetingen.ods', 'Peilmetingen'),
      }),
      field('kwaliteitsmeting', 'Kwaliteitsmeting', undefined, { relevantClass: 'riepr:ObservatieVerzameling', isMeervoudig: true }),
      field('monsternummer', 'Monsternummer', 'kwaliteitsmeting', {
        relevantDataType: 'xsd:string', relation: 'dcterms:identifier', ...table('grondwater-kwaliteitsanalyses.ods', 'Monsters'),
      }),
      field('filters', 'Filter(s)', 'kwaliteitsmeting', {
        relevantRiepr: ['meetpunt:filter'], relevantFeatureClass: ['riepr:Emissie'],
        relevantClass: 'sosa:FeatureOfInterest', relation: 'sosa:hasFeatureOfInterest',
        isMultiselect: true, ...table('grondwater-kwaliteitsanalyses.ods', 'Monsters'),
      }),
      field('labo', 'Labo', 'kwaliteitsmeting', {
        relevantClass: 'prov:Agent', isOnzichtbaar: true, ...table('grondwater-kwaliteitsanalyses.ods', 'Monsters'),
      }),
      field('labo-naam', 'Labo naam', 'labo', {
        relevantDataType: 'xsd:string', relation: 'rdfs:label', ...table('grondwater-kwaliteitsanalyses.ods', 'Monsters'),
      }),
      field('resultaten', 'Meetresultaten', 'kwaliteitsmeting', {
        relevantClass: 'riepr:Observatie', relation: 'sosa:hasMember', isMeervoudig: true,
        ...table('grondwater-kwaliteitsanalyses.ods', 'Meetresultaten'),
      }),
      field('parameter', 'Parameter', 'resultaten', {
        relevantCodeList: ['collectie:parameters'], relation: 'sosa:observedProperty', ...table('grondwater-kwaliteitsanalyses.ods', 'Meetresultaten'),
      }),
      field('meetwaarde', 'Meetwaarde', 'resultaten', {
        relevantDataType: 'xsd:decimal', relevantUnit: ['collectie:units'], isVerplicht: true,
        ...table('grondwater-kwaliteitsanalyses.ods', 'Meetresultaten'), _table_order: 1,
      }),
      field('limiet', 'Detectielimiet', 'resultaten', {
        relevantDataType: 'xsd:string', ...table('grondwater-kwaliteitsanalyses.ods', 'Meetresultaten'), _table_order: 2,
      }),
      { id: 'collectie:parameters', _type: 'skos:Collection', member: ['parameter:a', 'parameter:b'] },
      { id: 'collectie:units', _type: 'skos:Collection', member: ['unit:mgL', 'unit:gL'] },
    ],
  }
}

export function compileGroundwater(data: Record<string, unknown> = groundwaterFixture(), section?: string) {
  const result = new CodelistParser().parseData(data)
  const chain = new ThemeResolver().resolveAllThemes(result).get('Grondwater')!
  const mapper = new ConceptMapper(result)
  const fields = new ChainComposer().composeThemeFields(result, chain, mapper, section).fields
  return new SchemaAssembler({}).assemble('Grondwater',
    new CompositeGroupBuilder(result, mapper).buildNestedStructure(fields), null, chain, result)
}
