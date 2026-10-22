# Componenten — poc-flow-structuur

Alle componenten zijn Lit-elementen die zichzelf registreren. Ze gebruiken `@domg-wc/components`
(`vl-select-rich`, `vl-input-field`, `vl-textarea`, `vl-datepicker`, `vl-checkbox`, `vl-fieldset`,
`vl-form-label`, `vl-form-message`, `vl-text`, `vl-button`, `vl-alert`, `vl-tooltip`).

## URI-tooltips (hover)

Bij hover van een veldlabel, een kolomhoofding, een composite-legend of de
samenvatting van het geselecteerde type toont een `vl-tooltip` de volledige
gepubliceerde URI van het onderliggende codelist-concept, bv.
`https://data.omgeving.vlaanderen.be/id/concept/riepr/installatie-eigenschappen/verwijderingsrendement`.

- `services/uri.ts` (`expandUri`) expandeert de CURIE-id met de prefixkaart uit het
  `@context` van de codelist (`CodelistResult.prefixes`, opgevangen in `codelist-parse.ts`).
- `components/uri-tooltip.ts` levert de `vl-tooltip`-template en `veiligeDomId`
  (DOM-id's zonder `:`, want `vl-tooltip` lost de referentie op via `querySelector`).
- Label en tooltip zitten altijd in dezelfde `<div>` (de referentie), zodat de tooltip
  de referentie nooit overleeft wanneer Lit een template verwijdert (dat crasht de
  controller van `vl-tooltip`).

## `<structuur-app>`

Hoofdcomponent. Laadt de codelijst, houdt het gekozen type bij en rendert de secties.

| Property | Type | Betekenis |
|---|---|---|
| — | — | geen publieke properties; de app laadt zelf |

- Interne state: `selectedTypeId`, `selectedSysteem`, `waarden` (per pad), `rijen` (per eigenschap),
  `toonWaarden`.
- Wisselen van type wist alle waarden en rijen.

## `<structuur-type-selector>`

Doorzoekbare dropdown met alle zichtbare types, gegroepeerd per systeem en ingesprongen per diepte.

| Property | Type |
|---|---|
| `result` | `CodelistResult` |
| `selectedTypeId` | `string?` |
| `selectedSysteem` | `SysteemSleutel?` |

| Event | Detail |
|---|---|
| `type-select` | `{ systeem, typeId }`; leegmaken geeft `{ systeem: undefined, typeId: undefined }` |

Toont onder de dropdown een samenvatting (systeem, definitie, "meetbaar").

## `<structuur-systeemvelden>`

Rendert de vaste velden van een systeem uit `src/generated/systeemvelden.json` (afgeleid van
`riepr.ttl`). Converteert elk veld naar een `Eigenschap` en hergebruikt `<structuur-eigenschap>`,
zodat verplicht/meervoudig/validatie identiek werken.

| Property | Type |
|---|---|
| `systeem` | `SysteemSleutel` |

## `<structuur-eigenschap>`

Dispatcher:

| Geval | Rendering |
|---|---|
| enkelvoudig, niet composite | `<structuur-eigenschap-input>` |
| meervoudig | `<structuur-meervoudige-eigenschap>` |
| composite (enkelvoudig of meervoudig) | `<structuur-meervoudige-eigenschap>` met kolommen |

| Property | Type |
|---|---|
| `eigenschap` | `Eigenschap` |
| `result` | `CodelistResult?` |
| `csor` | `CsorService` |

## `<structuur-eigenschap-input>`

Eén waarde: label, controle volgens `relevantDataType`, keuzelijst volgens `relevantCodeList`,
eenheid volgens `relevantUnit`.

- Keuzelijst met opties → `vl-select-rich` (doorzoekbaar; `multiple` bij `isMultiselect`).
- Externe lijst zonder opties → tekstveld met aanduiding.
- `xsd:decimal`/`xsd:integer` → tekstveld met regex en Nederlandse foutmelding (komma als
  decimaalteken).
- Eén eenheid → vaste suffix; meerdere eenheden → `vl-select-rich` met de eerste als standaard en
  `not-deletable`.

| Property | Type | Betekenis |
|---|---|---|
| `eigenschap` | `Eigenschap` | |
| `result` | `CodelistResult?` | nodig voor inline lijsten en eenhedencollecties |
| `rijId` | `string?` | maakt DOM-id's uniek per rij |
| `pad` | `string[]?` | waardepad; standaard `[eigenschap.id]` |
| `toonLabel` | `boolean` | `false` in een meerrijige composite (kolomhoofding toont het label) |

| Event | Detail |
|---|---|
| `structuur-waarde` | `{ pad: string[], waarde }`; eenheid: pad + `'eenheid'` |

## `<structuur-meervoudige-eigenschap>`

Rijbeheer voor meervoudige en composite eigenschappen.

- Verplicht + meervoudig → start met één rij; de verwijderknop is dan uitgeschakeld.
- Optioneel + meervoudig → start zonder rij (README-regel).
- Composite enkelvoudig → één vaste rij, kinderen naast elkaar, kolombreedte
  `max(1, floor((12 − 1) / aantalKinderen))`.
- Stabiele rij-id's + `repeat`, zodat verwijderen de invoer van andere rijen niet verschuift.
- Toegankelijkheid: `aria-label` via `label` op de knoppen ("&lt;label&gt; rij verwijderen",
  "&lt;label&gt; toevoegen").

| Property | Type |
|---|---|
| `eigenschap` | `Eigenschap` |
| `result` | `CodelistResult?` |
| `csor` | `CsorService` |

| Event | Detail |
|---|---|
| `structuur-rijen` | `{ eigenschapId, rijIds }` |

## Debugpaneel

De knop **Toon waarden** in `<structuur-app>` toont de huidige invoer als JSON:

```json
{
  "systeem": "installatie",
  "type": "installatie:luchtzuivering",
  "velden": [
    { "type": "systeemveld:label", "waarde": "Mijn installatie" },
    {
      "type": "installatie-eigenschappen:verwijderingsrendement",
      "waarden": [
        {
          "deeleigenschappen": [
            { "type": "installatie-eigenschappen:verwijderingsrendement_stof", "waarde": "csor_variabele:V_2217" },
            { "type": "installatie-eigenschappen:verwijderingsrendement_percentage", "waarde": "87,5" }
          ]
        }
      ]
    }
  ]
}
```
