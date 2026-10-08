# IPP Procesmanager — Projectcontext

*Bijgewerkt: 8 oktober 2026 (laatste ontwikkelsessie: 1 september 2026)*

## Eigenaar & gebruikers
- **Primaire gebruiker:** Marcel, Senior Adviseur Contracts bij Antea Group (Breda)
- **Team:** 3 personen (Marcel + 2 collega's) — samenwerking via gedeelde OneDrive-map
- **Organisatie:** Antea Group — ingenieurs- en adviesbureau, actief in GWW-sector

## Wat dit project is
Een lokale webapplicatie voor het **visueel ontwerpen, beheren en presenteren van processchema's** binnen het IPP-ontwikkeltraject (Integraal Programma- en Projectmanagement) van Antea Group.

Het is de eerste bouwsteen naar een volledig procesmanagement-systeem dat later:
- De basis vormt voor een ERD en databaseontwerp
- Koppelt aan Relatics (SE-tool die Antea al gebruikt)
- Koppelt aan GIS, SharePoint en MS Project
- Uitgroeit tot tooling voor integraal programma- en projectmanagement

## Procescontext
Antea werkt aan implementatie van:
- **Systems Engineering (ISO 15288)** — Relatics wordt al gebruikt als SE-tool
- **IPP (Integraal Programma- en Projectmanagement)** — nieuw te ontwikkelen

De processen worden inmiddels primair in **Relatics** vastgelegd en via de import in de app gezet. De clusterindeling komt daarbij uit Relatics (codes zoals `IPP-30`). De oorspronkelijke clusters waren:
PM (Projectmanagement), KL (Klant), ST (Structurering), ON (Ontwerp), OZ (Onderzoek), PB (Projectbeheersing), SE (Systems Engineering).

## Datastand
- De werkdata staat in `ipp-procesmanagement-antea-group-MWE.json` in de projectmap. Dit bestand staat bewust buiten git.
- De laatste Relatics IPP v2-export (1 september 2026) bevat 53 processen, 8 clusters en 329 documenten.
- Eerder handmatig uitgewerkte processen (mei/juni 2026): Planningsmanagement en Risicomanagement (N1 + N2) en het Vergunningenproces (N1).
- Oudere JSON-versies en Relatics-exports staan in de map `DATA/`. Daar staat ook de handleiding (`IPP-Procesmanager-Handleiding.docx`).

## Technische context
- **Geen server** — lokale HTML-app, ook gepubliceerd via GitHub/Netlify
- **Drie bronbestanden:** `ipp-procesmanager.html`, `ipp-stijl.css`, `ipp-logica.js` (zie DESIGN.md)
- **Samenwerking:** JSON-bestand gedeeld via OneDrive
- **Browser:** Chrome of Edge
- **Geen buildstep, geen framework** — vanilla HTML/CSS/JS
- **Persistentie:** localStorage als noodkopie + bewust opslaan als JSON (File System Access API, met download als terugvaloptie)

## Functionaliteit in hoofdlijnen
- **Processchema's:** N1/N2/N3-stappen met drie weergaven (verticaal, tabel, swimlane) en een sub-paneel. Staptypen: activiteit, start, einde, beslissing en document. Beslissingen hebben paden (branches) en startstappen hebben bronstappen. Stappen kunnen omhoog/omlaag verplaatst worden.
- **Rollen:** een hoofdverantwoordelijke plus medeverantwoordelijken (bij Relatics-import afgeleid uit RASCI).
- **Input/output met stadium:** elk informatie-element kan een stadium hebben, bijvoorbeeld concept, besproken of vastgesteld.
- **Clusters:** hiërarchisch tot 3 niveaus, beheerbaar via de Beheer-modal of de sidebar.
- **Procesoverzicht:** geneste clusterblokken met het aantal stappen per proces.
- **Informatiebehoefte (IB):** per proces de categorieën bijhoudt / produceert / uitgangspunt.
- **Elementen & Attributen (EA):** attributen per informatie-element. In de SOLL-modus kunnen elementen gematcht worden als "zelfde info" (gegroepeerd) of als "moet koppelen aan".
- **Import:** Relatics IPP, Relatics IPP v2, Relatics SE, een importeer-wizard voor processen en CSV.
- **Export:** CSV, PDF (A3 liggend) en het informatiemodel als losse HTML.

## ERD-visie (volgende fase)
1. Processchema (wat doe je) → gebouwd
2. Informatiebehoefte en elementen/attributen (wat wissel je uit) → gebouwd, nog vullen
3. SOLL-matchen van elementen → gebouwd (eerste stap richting ERD)
4. ERD entiteitniveau (welke objecten bestaan, hoe hangen ze samen) → gepland
5. ERD attribuutniveau → gepland
6. Datamodel / Relatics-objectmodel → toekomst

Normalisatielogica die de app moet ondersteunen:
- Attribuut dat bij meerdere entiteiten voorkomt → kandidaat aparte entiteit
- Attribuut met meerdere waarden (array) → kandidaat koppeltabel
- Gedeelde waarden in meerdere records → kandidaat opzoektabel

## Designrichtlijnen
- **Huisstijl:** Antea Group — donkerblauw (#004874, Calcite-blauwschaal) met oranjegeel accent (#f0a500)
- **Weinig donkere vlakken:** lichte achtergrond met donkerblauwe tekst. Alleen kleine selectie- en statuselementen mogen donker zijn.
- **Taal:** volledig Nederlands
- **Doelgroep output:** management (N1), operationeel team (N2), uitvoerend medewerker (N3)

## Werkafspraken
- Pas committen/pushen na expliciete toestemming van Marcel.
- Databestanden (JSON, Relatics-CSV's) blijven buiten git.
- Na JS-wijzigingen altijd `node --check ipp-logica.js` uitvoeren.
- Browsertests: Playwright via `npx`, geïnstalleerd in een tijdelijke map, niet in het project.
