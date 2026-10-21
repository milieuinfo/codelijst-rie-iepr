# Architectuur — poc-flow-structuur

## Dataflow

```
src/source/<systeem>_type.csv ─────┐
src/source/<systeem>_eigenschappen.csv ─┐
                                   │    │
                (repo-generator)   ▼    ▼
src/main/resources/.../rie-iepr.jsonld
        │
        │ scripts/sync-codelist.mjs  (ook: src/generated/csv-volgorde.json)
        ▼
public/resources/.../rie-iepr.jsonld
        │
        │ services/codelist-service.ts  →  services/codelist-parse.ts
        ▼
   CodelistResult (concepts, schemes, collections)
        │
        │ services/structuur-service.ts   (scoperegel, boom, volgorde)
        ▼
 Systeem → StructuurType[] → Eigenschap[] → SelectieOptie[]
        │
        ▼
 componenten (selectie → vaste velden → eigenschappen → debugpaneel)


riepr.ttl ── scripts/build-systeemvelden.mjs ──► src/generated/systeemvelden.json
GitHub CSOR ─ scripts/sync-csor.mjs ───────────► src/generated/csor.json
```

De browser doet geen netwerkoproepen behalve het laden van het JSON-LD-bestand uit `public/`. De
CSOR-labels zitten dus in de bundle.

## Lagen

| Laag | Bestanden | Verantwoordelijkheid |
|---|---|---|
| Laden | `services/codelist-service.ts` | JSON-LD ophalen en parsen |
| Parsen | `services/codelist-parse.ts` | Alles afvlakken naar één id-index; typed views |
| Model | `services/structuur-service.ts` | Scoperegel, zichtbare types, boomvolgorde, eigenschappen, keuzelijsten, eenheden |
| CSOR | `services/csor.ts` | Labels/symbolen/definities van `csor.json`; onbekende id → lokale naam + één waarschuwing |
| Weergave | `components/structuur-*.ts` | Formulier; enkel `structuur-waarde`/`structuur-rijen` als state |
| Generatie | `scripts/*.mjs` | Sync en build-stappen; draaien vóór `dev`/`build` |

## Scoperegel in code

`getEigenschappen(result, systeem, typeId)`:

1. neem alle concepten met `inScheme = conceptscheme:<systeem>_eigenschappen` (ook composite-kinderen);
2. wortels = concepten zonder `broaderPartitive`;
3. `scopeVan(concept)` = eigen `relevantRiepr` (of geërfd) en, voor een composite, de unie van de
   scopes van de kinderen;
4. houd een wortel als de scope het gekozen type of een van zijn `broader`-voorouders bevat;
5. kinderen worden altijd mee gerenderd, nooit apart gefilterd.

## Foutafhandeling

- Codelijst niet laadbaar → `vl-alert` met de fout, geen crash.
- Onbekend CSOR-id → lokale naam (`E_59`) en één `console.warn`.
- Onbekende/externe keuzelijst → vrije tekst met een aanduiding; geen crash.
- Bronfouten (lege scope, onbekende `relevantRiepr`, ...) worden door de dataconsistentietest gemeld
  en in `docs/ISSUES.md` bijgehouden.
