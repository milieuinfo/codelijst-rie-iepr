import type { JsonSchemaObject } from '../models/index.js'
import { config } from '../config.js'

export class BaseSchemaGenerator {
  generate(): JsonSchemaObject {
    const sosaRef = 'https://opengeospatial.github.io/ogcapi-sosa/build/annotated/sosa/properties/observation-owa/schema.json'
    const extraTermsRef = `${sosaRef}/#/x-jsonld-extra-terms`

    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://data.riepr.omgeving.vlaanderen.be/schema/2026/observatie/observatie.json',
      description: 'RIE-IEPR observatie',
      type: 'object',
      properties: {
        resultTime: {
          'x-ui-first': true,
          allOf: [
            { $ref: `${sosaRef}/#/properties/resultTime` },
            {
              title: 'Tijdstip',
              description: 'Datum en tijdstip waarop de observatie is uitgevoerd.',
              format: 'date-time',
            },
          ],
        },
        observedProperty: {
          allOf: [
            { $ref: `${sosaRef}/#/properties/observedProperty` },
            {
              title: 'Geobserveerde eigenschap',
              description: 'De gemeten grootheid of parameter, zoals een specifieke stof, temperatuur of druk.',
            },
          ],
        },
        hasFeatureOfInterest: {
          allOf: [
            { $ref: `${sosaRef}/#/properties/hasFeatureOfInterest` },
            {
              title: 'Meetpunt',
              description: 'Het meetpunt waarop de observatie betrekking heeft.',
              'x-ui-after': 'observedProperty',
            },
          ],
        },
        wasOriginatedBy: {
          allOf: [
            { $ref: `${extraTermsRef}/wasOriginatedBy` },
            {
              title: 'Oorzaak emissie',
              description: 'De activiteit of oorzaak die aan de basis ligt van de gemeten emissie.',
              type: 'string',
            },
          ],
        },
        hasResult: {
          allOf: [
            { $ref: `${extraTermsRef}/hasResult` },
            {
              title: 'Resultaat',
              description: 'Resultaat van de observatie',
              type: 'object',
              required: ['numericValue', 'hasUnit'],
              properties: {
                numericValue: {
                  title: 'Numerieke waarde',
                  description: 'De gemeten waarde, uitgedrukt als decimaal getal.',
                  type: 'number',
                  'x-jsonld-id': 'https://qudt.org/schema/qudt/numericValue',
                  'x-jsonld-type': 'http://www.w3.org/2001/XMLSchema#double',
                },
                hasUnit: {
                  title: 'Eenheid',
                  description: 'De meeteenheid waarmee de numerieke waarde is uitgedrukt.',
                  type: 'string',
                  format: 'uri-template',
                  'x-jsonld-id': 'https://qudt.org/schema/qudt/hasUnit',
                  'x-jsonld-type': '@id',
                  'x-ui-after': 'numericValue',
                },
              },
            },
          ],
        },
      },
    }
  }

  /**
   * Generate the generic observation-collection envelope base schema.
   * A collection wraps one or more member observations (sosa:hasMember) and
   * carries a shared feature of interest plus optionally hoisted member
   * properties (created, observedProperty, resultTime, ...).
   */
  generateCollection(): JsonSchemaObject {
    const sosaRef = 'https://opengeospatial.github.io/ogcapi-sosa/build/annotated/sosa/properties/observation-owa/schema.json'
    const baseObservatieRef = `${config.baseSchemaUrl}/observatie.json`

    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: `${config.baseSchemaUrl.replace(/observatie$/, 'observatie-verzameling')}/observatie-verzameling.json`,
      description: 'RIE-IEPR observatieverzameling: envelope rond een of meer observaties.',
      type: 'object',
      'x-jsonld-type': 'http://www.w3.org/ns/sosa/ObservationCollection',
      required: ['hasFeatureOfInterest', 'hasMember'],
      properties: {
        hasFeatureOfInterest: {
          allOf: [
            { $ref: `${sosaRef}/#/properties/hasFeatureOfInterest` },
            {
              title: 'Meetpunt',
              description: 'Het meetpunt waarvoor het blok geldt.',
            },
          ],
        },
        created: {
          title: 'Gemaakt op',
          description: 'Creatietijdstip van de verzameling.',
          type: 'string',
          format: 'date-time',
          'x-jsonld-id': 'http://purl.org/dc/terms/created',
          'x-jsonld-type': 'http://www.w3.org/2001/XMLSchema#dateTime',
        },
        hasMember: {
          title: 'Observaties',
          description: 'De individuele observaties die deel uitmaken van deze verzameling.',
          type: 'array',
          minItems: 1,
          'x-jsonld-id': 'http://www.w3.org/ns/sosa/hasMember',
          items: { $ref: baseObservatieRef },
        },
        observedProperty: {
          allOf: [
            { $ref: `${sosaRef}/#/properties/observedProperty` },
            {
              title: 'Geobserveerde eigenschap',
            },
          ],
        },
        resultTime: {
          allOf: [
            { $ref: `${sosaRef}/#/properties/resultTime` },
            {
              title: 'Tijdstip',
            },
          ],
        },
        wasOriginatedBy: {
          allOf: [
            { $ref: `${sosaRef}/#/x-jsonld-extra-terms/wasOriginatedBy` },
            {
              title: 'Oorzaak emissie',
              type: 'string',
            },
          ],
        },
        phenomenonTime: {
          title: 'Fenomeentijd',
          type: 'string',
          format: 'date-time',
          'x-jsonld-id': 'http://www.w3.org/ns/sosa/phenomenonTime',
          'x-jsonld-type': 'http://www.w3.org/2001/XMLSchema#dateTime',
        },
        madeBySensor: {
          title: 'Sensor',
          type: 'string',
          format: 'uri',
          'x-jsonld-id': 'http://www.w3.org/ns/prov/madeBySensor',
        },
        usedProcedure: {
          title: 'Procedure',
          type: 'string',
          format: 'uri',
          'x-jsonld-id': 'http://www.w3.org/ns/prov/usedProcedure',
        },
        hasUltimateFeatureOfInterest: {
          title: 'Uitgaand meetpunt',
          type: 'string',
          format: 'uri',
          'x-jsonld-id': 'http://www.w3.org/ns/sosa/hasUltimateFeatureOfInterest',
        },
      },
    }
  }
}
