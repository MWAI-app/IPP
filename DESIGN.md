# IPP Procesmanager — Technisch Ontwerp

*Bijgewerkt: 8 oktober 2026*

## Bestandsstructuur
```
IPP/
  ipp-procesmanager.html   <- HTML-structuur: header, sidebar, werkbalk, modals
  ipp-stijl.css            <- alle stijlen
  ipp-logica.js            <- alle logica en modules
  ipp-procesmanagement-antea-group-MWE.json  <- werkdata (buiten git)
  DATA/                    <- oudere JSON-versies, Relatics-exports, handleiding
  CONTEXT.md / DESIGN.md / readme.md
```
Waar wijzig je wat:
- CSS-wijzigingen → `ipp-stijl.css`
- JS-wijzigingen → `ipp-logica.js`
- HTML-structuur → `ipp-procesmanager.html`

## KRITIEKE TECHNISCHE REGELS

### 1. Geen bash heredoc voor HTML/JS
Een heredoc knipt de inhoud af zodra `</script>` in de tekst voorkomt. Gebruik daarvoor de Edit/Write-tools of Python.

### 2. Geen unicode/emoji in JS string literals
Tekens zoals ✓ ⚠ ▶ in JS-strings geven problemen.
- In HTML: gebruik entities (`&#9654;`, `&#8594;`)
- In JS-strings: gebruik ASCII-tekst (`'OK'`, `'[!]'`) of entities in de HTML-output

### 3. Altijd JS valideren na wijzigingen
```bash
node --check ipp-logica.js
```

### 4. Browsertest
Gebruik Playwright via `npx`, geïnstalleerd in een tijdelijke map. Voeg `page.addInitScript(() => delete window.showOpenFilePicker)` toe, zodat de headless browser de `<input type=file>`-fallback gebruikt.

---

## Data-architectuur (versie 1.1)

```json
{
  "versie": "1.1",
  "project": "IPP Procesmanagement Antea Group",
  "aangepast": "2026-09-01",
  "clusters":   [ /* hiërarchisch, zie hieronder */ ],
  "rollen":     ["Projectmanager", "..."],
  "systemen":   ["Relatics", "GIS", "SharePoint", "..."],
  "documenten": [ { "code": "...", "naam": "..." } ],
  "eaLinks":    [ /* SOLL-koppelingen tussen elementen */ ],
  "eaGroepConfig": { },
  "processen":  [ /* zie proces-object */ ]
}
```
**Migratie:** `migr()` zet bij het laden oudere JSON om. Het zet `categorieen` om naar `clusters`, vult ontbrekende arrays aan (`rollen`, `systemen`, `documenten`, `medeverantwoordelijken`, `branches`, `bronStappen`) en zet beslissing-outputs met het patroon "X → Y" om naar `branches`.

### Cluster
```json
{ "id": "beheersing", "label": "Projectbeheersingsprocessen", "kleur": "#00619b",
  "afkorting": "PB", "volgorde": 6, "subclusters": [ /* max 3 niveaus totaal */ ] }
```
`afkorting` (max. 6 tekens, bijv. `IPP-30`) is het prefix voor het procesnummer. Er is geen vaste `CAT_PFX` meer.

### Proces
```json
{ "id": "pm_planning", "naam": "Planningsmanagement", "categorie": "<cluster.id>",
  "volgorde": 1, "eigenaar": "Projectmanager", "beschrijving": "...",
  "status": "concept", "versie": "0.1", "aangepast": "2026-09-01",
  "stappen": [ ], "informatiebehoefte": { "gesproken_met": "", "datum": "", "status": "", "items": [] } }
```

### Stap (recursief via `substappen`, max N1/N2/N3)
```json
{
  "id": "pp_01", "naam": "Projectopdracht ontvangen",
  "type": "activiteit",               // activiteit | start | einde | beslissing | document
  "verantwoordelijke": "Projectmanager",
  "medeverantwoordelijken": ["Contractmanager"],
  "systeem": "SharePoint", "beschrijving": "...", "volgorde": 1,
  "input":  [ { "label": "Risicomatrix", "bron": "pm_risico", "stadium": "concept", "attributen": [] } ],
  "output": [ { "label": "Geregistreerde opdracht", "doel": "intern", "stadium": "vastgesteld" } ],
  "branches":    [ { "id": "b_..", "conditie": "Ja", "label": "..." } ],   // alleen bij beslissing
  "bronStappen": [ ],                                                      // alleen bij start
  "substappen":  [ ]
}
```
- `stadium` is optioneel. Het formulier biedt autocomplete op alle eerder gebruikte waarden (`ioAlleStadia()`) en de weergave toont het als badge (`ioWeergave()`).
- `leesIO()` leest de I/O-regels via class-selectors (`.io-stadium` enz.), niet op positie.

### IB-item
```json
{ "id": "ib_001", "naam": "Vergunningenregister", "categorie": "bijhoudt",
  "omschrijving": "...", "velden": ["..."], "bestemming": ["pm_planning"] }
```
Bij categorie `uitgangspunt` heet het veld `herkomst` in plaats van `bestemming`.

### EA-links (SOLL)
Een "zelfde info"-link is transitief. Zulke links worden met union-find samengevoegd tot groepen (`eaZelfdeGroepen()`). Een "moet koppelen aan"-link is pairwise. De links staan los van de IST-stapdata.

---

## Nummeringssysteem
| Niveau | Voorbeeld    | Opbouw |
|--------|--------------|--------|
| Proces | PB-A         | cluster-afkorting + letter op volgorde |
| N1     | PB-A01       | procesnummer + 2 cijfers |
| N2     | PB-A01.01    | N1 + punt + 2 cijfers |
| N3     | PB-A01.01.01 | N2 + punt + 2 cijfers |

---

## State
```javascript
const S = {data:null, hid:null, pad:[], view:'v', bpid:null, bsid:null, gw:false,
           eaMode:'ist', eaSollProcs:[], eaGekozen:null};
```
`view`: `'v'` verticaal, `'t'` tabel, `'sl'` swimlane. `pad`: `[]`, `[n1Id]` of `[n1Id, n2Id]`.

---

## Layout
```
HEADER:   Nieuw | Laden | Relatics IPP | Relatics IPP v2 | Relatics SE | Importeer processen
          | Opslaan | Opslaan als | Overzicht | Beheer | + Nieuw proces   (+ bestandsnaam)
SIDEBAR:  zoeken, clusterboom (3 niveaus), footer: PDF | CSV | Informatiemodel exporteren
WERKBALK: breadcrumb | v/t/s | + Stap | Bewerk | IB Inventarisatie | Elementen & Attributen
CANVAS:   N1-stappen  +  SUB-PANEEL (N2/N3) rechts
```
Het Procesoverzicht, de IB-inventarisatie en het EA-scherm vervangen het canvas tijdelijk.

## Modals
| ID       | Doel |
|----------|------|
| `mp`     | Nieuw/bewerk proces |
| `ms`     | Nieuw/bewerk stap (met expliciete niveaukeuze N1/N2/N3 bij toevoegen) |
| `mdet`   | Stapdetail (read-only) |
| `mbeh`   | Beheer: clusters, rollen, systemen, documenten |
| `mclust` | Cluster aanmaken/bewerken |
| `mcsv`   | CSV import/export-wizard |
| `mib`    | IB-item toevoegen/bewerken |
| `meap`   | Processen kiezen voor EA SOLL-matchen |
| `mpi`    | Importeer processen (wizard: behouden/vervangen per stap) |

---

## Importfuncties
| Knop | Functie | Bron |
|------|---------|------|
| Relatics IPP | `importeerRelatics()` | platte export cluster > proces > N1 (aug. 2026). Kolommen worden op koptekst herkend (`groepStart()`). Gebruikt een eigen `parseCSV()` die aanhalingstekens respecteert. |
| Relatics IPP v2 | `importeerRelaticsV2()` | nieuw formaat (sept. 2026). RASCI: accountable wordt verantwoordelijke, de rest medeverantwoordelijken. Stadium komt uit "Productnaam \| stadium" en wordt 1-op-1 overgenomen (`stadiumVan()`). De "Is onderdeel van Proces"-hiërarchie wordt platgeslagen tot N1/N2. |
| Relatics SE | `importeerRelaticsSE()` | SE-processen |
| Importeer processen | `importeerProcWizard()` | processen uit een ander JSON-bestand samenvoegen |

## CSV-structuur (processen)
Puntkomma-gescheiden, commentaarregels met `#`. Kolommen (`CSV_COLS`):
```
proces_id ; proces_naam ; stap_nr ; ouder_stap_nr ; stap_naam ; type ;
verantwoordelijke ; systeem ; beschrijving ;
input_1 ; input_1_bron ; input_1_stadium ; ... t/m input_3 ;
output_1 ; output_1_doel ; output_1_stadium ; ... t/m output_3 ;
volgorde ; status
```
- Hiërarchie: N1 `PM-B01` (geen ouder), N2 `PM-B01.01` (ouder `PM-B01`), N3 `PM-B01.01.01`.
- `stap_nr` en `ouder_stap_nr` mogen **niet** gelijk zijn.

## CSV-structuur (informatiebehoefte)
```
naam ; categorie ; omschrijving ; veld_1..veld_5 ; herkomst_bestemming_1 ; herkomst_bestemming_2
```

---

## Openstaande punten

### Direct
- [ ] **EA-module stadium-bewust maken:** EA groepeert elementen nu alleen op label, nog niet op label + stadium. Dit is aangekondigd in commit `e13adba`.
- [ ] Stadium-waarden uit Relatics controleren en corrigeren. Relatics is nog niet overal logisch ingevuld, dus de stadium is soms gelijk aan de productnaam.

### Korte termijn
- [ ] KL-A, KL-B en SE-A uitwerken
- [ ] IB-module vullen via informatiegesprekken
- [ ] Brug IB ↔ EA (wacht op terugkoppeling van het IPP-team)

### Middellange termijn
- [ ] "Moet koppelen aan"-relaties als lijnen/pijlen op het SOLL-bord tonen (opstap naar een relatiecanvas)
- [ ] ERD-module: entiteiten en attributen, synoniemen samenvoegen, normalisatiesignalen
- [ ] Drag-and-drop voor stappen en clusters (stappen hebben nu op/neer-knoppen)

### Lange termijn
- [ ] Relatics-sync in twee richtingen
- [ ] Publicatie op SharePoint
- [ ] Versiebeheer op processen
