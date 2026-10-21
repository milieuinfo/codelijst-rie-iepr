# 07 — Tests en kwaliteit

## Taken
1. **Dataconsistentie** (vitest, op de echte CSV/JSON-LD): elke `relevantRiepr` van een eigenschap
   verwijst naar een bestaand type of `riepr:*`; elke `relevantCodeList` en `relevantUnit` resolvet;
   elke `broaderPartitive` verwijst naar een bestaande composite. Ook: elke composite heeft minstens één kind met `relevantRiepr`, en geen standalone eigenschap heeft een lege `relevantRiepr`. Fouten wijzen op bronfouten in
   de CSV's en worden gemeld, niet in de POC omzeild.
2. **Playwright smoke** per systeem: selecteer een type, controleer dat de naam- en
   beschrijvingsvelden en minstens één eigenschap zichtbaar zijn.
3. `pnpm lint --max-warnings=0`, `pnpm build`, `pnpm test:unit`, `pnpm test` groen.
4. `docs/`: `ARCHITECTURE.md` (korte beschrijving + dataflow), `COMPONENTS.md`, `ISSUES.md` met de
   gevonden bron-problemen (bv. ontbrekende CSOR-ids) voor het datateam.
5. CI: dezelfde stappen als `poc-flow-operationeel` (indien daar een pipeline voor bestaat).

## Klaar wanneer
Alle checks groen en `ISSUES.md` bevat de bevindingen uit taak 1.
