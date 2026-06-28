# IPP Procesmanager — Projectcontext

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
- **Procestypen in scope:**
  - Projectmanagementprocessen (PM)
  - Klantprocessen (KL)
  - Structureringsprocessen (ST)
  - Ontwerpprocessen (ON)
  - Onderzoekprocessen (OZ)
  - Projectbeheersingsprocessen (PB) — incl. plannings- en risicomanagement
  - Systemsengineeringprocessen (SE)

## Ingevoerde processen (mei 2026)
| Nr   | ID                  | Naam                              | Status  |
|------|---------------------|-----------------------------------|---------|
| PB-A | pm_planning         | Planningsmanagement               | Concept |
| PB-B | pm_risico           | Risicomanagement                  | Concept |
| SE-A | se_requirements     | Requirements Management ISO 15288 | Leeg    |
| KL-A | klant_scope         | Klantscope proces                 | Leeg    |
| KL-B | klant_stakeholder   | Stakeholderproces                 | Leeg    |
| KL-C | klant_vergund       | Vergunningenproces                | Concept |

PB-A en PB-B hebben volledig uitgewerkte N1-stappen inclusief N2-substappen.
KL-C heeft uitgewerkte N1-stappen, nog geen N2.
PB-A en PB-B hebben cross-proces koppelingen naar elkaar en naar KL-C.

## Technische context
- **Geen server beschikbaar** — puur lokale HTML-app
- **Samenwerking:** JSON-bestand gedeeld via OneDrive
- **Browser:** Chrome of Edge (geen Firefox-specifieke features gebruikt)
- **Geen buildstep, geen framework** — vanilla HTML/CSS/JS in één bestand
- **Persistentie:** localStorage als noodkopie + bewust opslaan als JSON-download

## Informatiebehoeftemodule (nieuw, mei 2026)
Per proces kan een informatiegesprek worden vastgelegd:
- **Bijhoudt** — informatie die het proces zelf aanmaakt en beheert
- **Produceert** — informatie die geleverd wordt aan andere processen
- **Uitgangspunt** — informatie die van buiten nodig is

Per informatie-item worden vastgelegd: naam, omschrijving, velden/attributen (ruw), en herkomst/bestemming (koppeling naar andere processen).

Dit is de grondstof voor de ERD-fase (volgende stap na processchema's).

## ERD-visie (volgende fase)
De informatiebehoeftemodule vormt de brug tussen processchema en ERD:
1. Processchema (wat doe je) → al gebouwd
2. Informatiebehoefte per proces (wat wissel je uit) → in ontwikkeling
3. ERD entiteitniveau (welke objecten bestaan, hoe hangen ze samen) → gepland
4. ERD attribuutniveau (welke velden per object) → gepland
5. Datamodel / Relatics-objectmodel → toekomst

Normalisatielogica die de app ondersteunt:
- Attribuut dat bij meerdere entiteiten voorkomt → kandidaat aparte entiteit
- Attribuut met meerdere waarden (array) → kandidaat koppeltabel
- Gedeelde waarden in meerdere records → kandidaat opzoektabel

## Relatics-koppeling
CSV-export is ontworpen voor Relatics-import:
- Puntkomma als separator
- Commentaarregels met #
- Hiërarchie via stap_nr / ouder_stap_nr (PM-A01, PM-A01.01, PM-A01.01.01)
- Informatiebehoefte-CSV voor informatiegesprekken met deskundigen

## Designrichtlijnen
- **Huisstijl:** Antea Group — donkerblauw (#004874, Calcite-blauwschaal) met oranjegeel accent (#f0a500)
- **Taal:** Volledig Nederlands
- **Doelgroep output:** Management (N1), operationeel team (N2), uitvoerend medewerker (N3)
- **Nooit unicode bullets of emoji in JS strings** — veroorzaakt syntaxfouten
- **Nooit bash heredoc met HTML erin** — </script> knipt de inhoud af; gebruik Python
