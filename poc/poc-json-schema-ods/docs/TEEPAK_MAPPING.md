# Teepak reference contract and source review

The complete header-by-header inventory is
[`teepak-mapping.json`](./teepak-mapping.json). It covers all 14 operational
reference workbooks, including empty sheets, without copying populated business
data. `concepts` identifies current source anchors, not necessarily the final
owner of a field. Missing facts and proposed corrections need review.

## Semantic representation

No new CSV columns are needed for workbook, worksheet or record labels.
`relevantClass`, `relation`, `broaderPartitive`, multiplicity, `prefLabel`, semantic
identifier predicates and the existing ordering columns drive the representation.
An outer collection definition defines a workbook, nested repeated records define
sheets, and singleton/scalar result details define columns. Instances do not each
create a new file or sheet.

Use the [SSN extensions Working Draft of 16 January 2020](https://www.w3.org/TR/2020/WD-vocab-ssn-ext-20200116/),
not the different collection-summary rules of the newer SOSA draft. Collections
can contain observations or nested collections. A physical Sample is a separate
entity, not an observation-collection member.

For groundwater:

```text
Kwaliteitsmetingen[] (one ObservationCollection per monster)
  hasFeatureOfInterest: Sample (identifier, sample details)
    isResultOf: Sampling (sampling time, provenance, technique, instrument)
  hasMember: parameter observations[] (property, lab timestamp, result, unit)
```

The generated `Kwaliteitsmeting` sheet holds sample-analysis collection rows with
their singleton Sample/Sampling details; `Parameter` holds their member
observations. These names follow existing source labels rather than hardcoded
Teepak names. No additional repeated monster level is introduced. A shared
collection property must agree across members: the monster's Sample can be shared,
but differing parameter/analysis timestamps belong on member observations.

Generated ODS row IDs, parent links and schema fingerprints remain necessary
transport information. They are not new code-list columns. Readable references
use declared identifier/name relations, otherwise a generated reference.

## Applied monster slice and remaining review

The first implementation slice focuses on the **monster**: one existing
kwaliteitsmeting is its analysis collection. This supersedes the initial proposal
for multiple monsters beneath a kwaliteitsmeting; the proposed Monsteranalyses
group will not be added. Any overarching grouping of multiple monsters stays out
of scope. Sample and Sampling are singleton details, not new repeatable levels.

Confirmed for the monster layer: use a distinct Sampling activity, keep lab
timestamps per parameter/result, represent Monsternummer as a string with
`dcterms:identifier`, and interpret detection information as an above/below
qualifier rather than a numeric threshold. A new inline qualifier list is approved,
as is mg/L (`csor_eenheid:E_1`) for the current six chemical parameters. Additional
parameters/units still need review. These decisions are not permission to write
source rows without their MCP previews.

All **18 individually previewed and approved source writes are applied**, with
successful SKOS regeneration. The current schema and populated ODS round-trip two
synthetic monsters with several parameter results. The JSON inventory's
`generated` entries now give exact schema and record-local column pointers for
the supported quality fields. It is a review artifact, not generator configuration.

| Teepak surface | Current generated representation | Status |
|---|---|---|
| `Monsters` | `Kwaliteitsmeting`; Sample and Sampling inline | Existing labels determine the name; one row per monster |
| `Meetresultaten` | `Parameter`, visibly linked to the monster | Member observations, no extra monster hierarchy |
| Analysis timestamp on monster row | `Parameter.resultTime` | Confirmed per result, not a shared monster timestamp |
| Multiple filters in one cell | `Peilfilter Pompfilter` linked value sheet | Preserves current multiplicity; accepted by the user |
| Multiple reference points in one cell | `Referentiepunt` linked value sheet | Preserves current multiplicity; accepted by the user |
| Key/value cover | Singleton wide `Voorblad` context row | Generic representation; accepted by the user |
| Sample/result identity | Visible references plus hidden transport IDs | Sample number stays a string; entity and transport identities remain distinct |
| Numeric values and units | Decimal Result with fixed E_1 (mg/L) | Approved for the current six chemical parameters only |
| Detectielimiet | Boven/Onder URI selection | Applied qualifier, no numeric threshold invented |

The debit slice also round-trips the actual source: `Onttrekking infiltratie`
contains a required reported volume and optional begin/end readings, all singleton
member observations inline on the same row. The three separately previewed and
approved source edits are applied and regenerated. Period endpoints are typed
date/datetime cells; the period remains reporting metadata, not a shared
observation time. No input-mode field, volume calculation or equality constraint
was added. Existing source ordering puts volume before the readings and keeps
the two period components adjacent. The example's `gewonnen` category and
spui-included flag still need domain review; existing URI values are not recoded.
The inventory includes exact generated pointers for seven debit columns.

## Applied level-measurement slice

The approved peilmeting source is one `riepr:Observatie` with exactly one required
reference point. Its required source-owned `riepr:Resultaat` is a `sosa:Result`
and `qb:Observation` through the supplied domain model, not another SOSA
observation or collection member. Depth is a required literal
`qudt:numericValue` with owning `qudt:hasUnit` (E_59); method uses
`schema:measurementMethod`. Pump state, stopped duration and the two contextual
volumes use `schema:additionalProperty`/`schema:PropertyValue`, with the existing
field URI as `schema:propertyID`. Their typed values and volume units are
`schema:value` and `schema:unitCode`. Feature, datetime and reference point stay
outside the result. No new authored columns or application-specific field rules
are introduced.

All 15 peilmeting write actions (including the superseded intermediate changes
and final ordering) were individually reviewed and regenerated. The actual
source now round-trips both pump states, zero/precise volumes and durations,
with all singleton result details inline on `Peilmeting`. Optional components
are not invented from prefilled constants; inactive values produce errors at the
actual value cell. These guarantees do not imply full RDF Data Cube DSD/integrity
validation.

The example's distance-to-ground-level field remains missing. Its physical
instrument column is not assumed equivalent to a measurement method. The
single datetime cell still differs from Teepak's separate date/time columns;
these presentation/domain gaps remain under review.

Generated XML passed the official ODF 1.3 schema. LibreOffice reopen/save remains
unverified because Calc is not installed; this is not yet a full office-application
compatibility claim.

## Applied other operational lists

All **73 previewed and approved MCP actions** are applied and regenerated:
ten groups/list declarations, 53 field/navigation changes and ten ordering
operations. No published identifiers were renamed or presentation columns added.
Fuel and normal discharge remain collections, as explicitly chosen by the user.

| Source section | Generated representation |
|---|---|
| `lucht:brandstof` | Three member Observations inline on `Verbruikte brandstof`; S/AS units stay unspecified, consumption retains E_89 |
| `lucht:emissie` | Reachable branch; `Emissie` rows own independent `Verontreinigende stof of BKG` rows; mass flow, frequency and percent deviation belong inside each Resultaat |
| `water:lozing` | Four member Observations inline on `Lozing`; shared pollutant context is a PropertyValue, one shared Procedure owns method/category |
| `water:abnormale-lozing` | Pollutant outside Resultaat; annual mass, duration PropertyValue and comment inside, with separate E_12/E_94 units |
| `zelfcontrole-water:meting` | Lab on `Meting`; linked `Parameter` rows own Resultaat, textual sample kind, concentration/E_1 and uncertainty/E_43 |

All eight working sections, including groundwater, have exact labeled CLI
round trips. Their sixteen populated/template workbooks pass official ODF 1.3 XML
and ZIP/manifest checks. Calc reopen/save remains unverified. These guarantees do
not cover every missing Teepak field or reproduce its arbitrary tab boundaries.
Normal/abnormal discharge remain separate section workbooks; the normal-discharge
collection is not replaced by a new pollutant hierarchy. Fuel is not merged with
the other material roles merely to reproduce the example's combined sheet.

Consumed/produced substances and waste have source-owned Resultaat groups but
retain their three TODO units. Air self-control has the same nested parameter
model but its requested TODO concentration unit blocks generation. Materials
have a Resultaat and an empty temporary material-code list, with no fabricated
options; real codes and the TODO quantity unit remain blockers. Contextual integer
production volume has its own typed Resultaat, but the contextual step remains
unreachable and its three consumption reports untyped. `operationeel_misc` remains
option-list metadata, not reporting Observations.

The user approved keeping destination variants as separate conditional JSON
properties. Their field identities, cardinalities, requiredness and conditions
are preserved; `x-related-concepts` supports a future unified UI presentation.
No singleton destination was made repeatable to force a sheet. Variable references
now resolve through ancestor/singleton contexts, including nested selected values,
without joining independent arrays. Root feature selectors with the same predicate
both survive under URI-derived names.

| Area | Decision required |
|---|---|
| Sampling performer | Existing lab/Agent is retained; clarify a separate sampling performer if the Teepak Uitvoerder column requires one. |
| Missing quality fields | Distance to ground level and field/laboratory distinction remain absent. Extending the current technique/parameter choices still requires approved list sources. |
| Additional results | Resolve units for any additional parameters; mg/L approval does not extend to unspecified future measurements. A numeric detection threshold, if requested, is a different fact from the applied qualifier. |
| Debit coverage | Volume/reading semantics are resolved and applied. The meaning of the example's `gewonnen` category and spui-included flag still requires review. |
| Missing fields | Approve the inventory's missing facts, datatypes, units, requiredness and any new published/inline selection lists. |
| Reused facts | Resolve installation vs facility totals and overlapping water-use sections before duplicating reported facts. |
| Layout differences | A singleton destination may inline rather than form a separate tab; role-specific material records need not become one table. Review these differences without adding layout columns or false class assertions. |

Use the MCP source tools with `dryRun: true`, show their exact CSV lines and
impact, and obtain confirmation before a real write. Published identifiers remain
unchanged. Every write must regenerate and validate SKOS. This inventory does not
approve source changes or invent official codes.
