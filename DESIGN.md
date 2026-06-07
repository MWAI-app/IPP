# IPP Procesmanager — Technisch Ontwerp

## Bestandsstructuur
```
IPP-Procesmanager/
  ipp-procesmanager.html              ← de volledige app (HTML + CSS + JS)
  ipp-procesmanagement-antea.json     ← projectdata
  klant_vergund_import.csv            ← CSV voor vergunningenproces
  CONTEXT.md                          ← projectcontext
  DESIGN.md                           ← dit bestand
```

## KRITIEKE TECHNISCHE REGELS

### 1. Nooit bash heredoc gebruiken voor HTML/JS
Bash heredocs knippen de inhoud af zodra `</script>` in de tekst voorkomt.
**Altijd Python gebruiken voor bestandsmanipulatie:**
```python
with open('ipp-procesmanager.html', 'w') as f:
    f.write(content)
```

### 2. Nooit unicode/emoji in JS string literals
Tekens zoals ✓ ⚠ ── ▶ in JS strings veroorzaken syntaxfouten in sommige browsers.
**Gebruik HTML entities in HTML, ASCII in JS:**
- In HTML: `&#9881;` &#9654; &#9670; etc.
- In JS strings: gewone tekst zoals `'OK'` of `'[!]'`

### 3. Altijd JS valideren na wijzigingen
```bash
python3 -c "
with open('ipp-procesmanager.html') as f:
    c = f.read()
js = c[c.index('<script>')+8:c.find('</script>')]
with open('/tmp/t.js','w') as f: f.write(js)
"
node --check /tmp/t.js
```

### 4. Syntaxfouten opsporen
```javascript
// In Node.js:
const lines = js.split('\n');
for(let j=1; j<=lines.length; j++){
  try { new Function(lines.slice(0,j).join('\n')); }
  catch(e){ console.log('Fout op lijn', j, ':', lines[j-1]?.slice(0,80)); break; }
}
```

---

## Data-architectuur

### Één JSON-bestand
```json
{
  "versie": "1.0",
  "project": "IPP Procesmanagement Antea Group",
  "aangepast": "2026-05-24",
  "categorieen": [ { "id": "pm", "label": "Projectmanagement", "kleur": "#1a3c34" } ],
  "rollen": ["Projectmanager", "Senior Adviseur", ...],
  "systemen": ["Relatics", "GIS", "SharePoint", ...],
  "processen": [ /* zie hieronder */ ]
}
```

### Proces-object
```json
{
  "id": "pm_planning",
  "naam": "Planningsmanagement",
  "categorie": "pm",
  "volgorde": 1,
  "eigenaar": "Projectmanager",
  "beschrijving": "...",
  "status": "concept",
  "versie": "0.1",
  "aangepast": "2026-05-24",
  "stappen": [ /* zie stap-structuur */ ],
  "informatiebehoefte": {
    "gesproken_met": "Jan de Vries",
    "datum": "2026-05-24",
    "status": "concept",
    "items": [ /* zie IB-item structuur */ ]
  }
}
```

### Stap-structuur (recursief, max 3 niveaus)
```json
{
  "id": "pp_01",
  "naam": "Projectopdracht ontvangen",
  "type": "activiteit",
  "verantwoordelijke": "Projectmanager",
  "systeem": "SharePoint",
  "beschrijving": "...",
  "volgorde": 1,
  "input": [
    { "label": "Projectopdracht", "bron": "intern" },
    { "label": "Contractdocument", "bron": "pm_risico" }
  ],
  "output": [
    { "label": "Geregistreerde opdracht", "doel": "intern" }
  ],
  "substappen": [ /* zelfde structuur */ ]
}
```

### IB-item structuur
```json
{
  "id": "ib_001",
  "naam": "Vergunningenregister",
  "categorie": "bijhoudt",
  "omschrijving": "Lijst van alle benodigde vergunningen met status",
  "velden": ["vergunningtype", "bevoegd gezag", "indieningsdatum", "doorlooptijd", "status"],
  "bestemming": ["pm_planning", "pm_risico"]
}
```
Voor categorie `uitgangspunt`: veld heet `herkomst` in plaats van `bestemming`.

---

## Nummeringssysteem

Formaat: `{CATEGORIE-PREFIX}-{PROCESLETTER}{STAP-NR}`

| Niveau | Voorbeeld     | Opbouw |
|--------|---------------|--------|
| Proces | PM-A          | Prefix + letter op volgorde |
| N1     | PM-A01        | Procesnummer + 2-cijferig |
| N2     | PM-A01.01     | N1-nummer + punt + 2-cijferig |
| N3     | PM-A01.01.01  | N2-nummer + punt + 2-cijferig |

Categorie-prefixen:
```javascript
const CAT_PFX = {
  pm:'PM', klant:'KL', se:'SE',
  ontwerp:'ON', onderzoek:'OZ',
  structuur:'ST', beheersing:'PB'
};
```

Procesletter = volgorde van het proces binnen zijn categorie, gesorteerd op `p.volgorde`.

---

## State
```javascript
const S = {
  data: null,    // het volledige JSON-object
  hid: null,     // id van geselecteerd proces
  pad: [],       // sub-paneel pad: [] | [n1Id] | [n1Id, n2Id]
  view: 'v',     // 'v' | 't' | 'sl'
  bpid: null,    // proces-id in bewerking
  bsid: null,    // stap-id in bewerking
  gw: false      // gewijzigd (niet opgeslagen)
};
```

---

## Layout
```
┌──────────────────────────────────────────────────────────┐
│ HEADER: logo | status | Laden | Opslaan | Beheer | +Proc │
├─────────────┬────────────────────────────────────────────┤
│             │ WERKBALK: breadcrumb | v/t/sl | +Stap |    │
│   SIDEBAR   │           Bewerk | IB Inventarisatie       │
│   272px     ├──────────────────────────┬─────────────────┤
│  - zoeken   │                          │  SUB-PANEEL     │
│  - filter   │  CANVAS                  │  390px          │
│  - lijst    │  Altijd N1-stappen       │  N2/N3 substap- │
│  - CSV/PDF  │                          │  pen, opent bij │
│             │                          │  klik op kaart  │
└─────────────┴──────────────────────────┴─────────────────┘
```

IB-inventarisatie vervangt het canvas tijdelijk (canvas wordt verborgen, IB-canvas zichtbaar).

---

## Modals

| ID    | Doel |
|-------|------|
| `mp`  | Nieuw/bewerk proces |
| `ms`  | Nieuw/bewerk stap (niveau = S.pad.length + 1) |
| `mdet`| Stap detail (read-only) |
| `mbeh`| Beheer rollen & systemen |
| `mcsv`| CSV import/export wizard (processen) |
| `mib` | IB informatie-item toevoegen/bewerken |

---

## CSV-structuur (processen)
Puntkomma-gescheiden, commentaarregels met `#`:
```
proces_id ; proces_naam ; stap_nr ; ouder_stap_nr ; stap_naam ; type ;
verantwoordelijke ; systeem ; beschrijving ;
input_1 ; input_1_bron ; input_2 ; input_2_bron ; input_3 ; input_3_bron ;
output_1 ; output_1_doel ; output_2 ; output_2_doel ; output_3 ; output_3_doel ;
volgorde ; status
```

Nummering:
- N1: stap_nr = PM-B01, ouder_stap_nr = leeg
- N2: stap_nr = PM-B01.01, ouder_stap_nr = PM-B01
- N3: stap_nr = PM-B01.01.01, ouder_stap_nr = PM-B01.01

**Veelgemaakte fout:** stap_nr en ouder_stap_nr mogen NIET gelijk zijn.

## CSV-structuur (informatiebehoefte)
```
naam ; categorie ; omschrijving ;
veld_1 ; veld_2 ; veld_3 ; veld_4 ; veld_5 ;
herkomst_bestemming_1 ; herkomst_bestemming_2
```
Categorie: `bijhoudt` | `produceert` | `uitgangspunt`

---

## Geplande volgende stappen

### Korte termijn
- [ ] KL-C (Vergunningenproces) N2-stappen invoeren via CSV
- [ ] KL-A en KL-B uitwerken
- [ ] SE-A Requirements Management uitwerken
- [ ] Informatiegesprekken voeren en IB-module vullen

### Middellange termijn
- [ ] ERD-module: entiteiten aanmaken, attributen koppelen
- [ ] Synoniemen samenvoegen (trekker = verantwoordelijke = eigenaar → Persoon)
- [ ] Normalisatiesignalen: gedeelde attributen, meervoudige waarden
- [ ] Stappen herordenen via drag-and-drop

### Lange termijn
- [ ] Relatics bi-directionele sync
- [ ] SharePoint publicatie
- [ ] Versiebeheer op processen
