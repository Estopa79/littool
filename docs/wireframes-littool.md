# LitTool – Text-Wireframes der Ansichten (v0.1, zur Durchsprache)

Navigation: feste Seitenleiste links (einklappbar) mit den acht Ansichten. Oben rechts: globale Schnellsuche (von überall erreichbar, springt in Ansicht „Suche") sowie ein Zahnrad-Icon für „Einstellungen" (nicht Teil der Haupt-Navigationsliste).

```
┌────┬────────────────────────────────┐
│ ☰  │  [Schnellsuche …...........🔍][⚙️]│
│ ✍️  │                                │
│ 📚 │        Inhaltsbereich          │
│ ❓ │                                │
│ 📐 │                                │
│ 📊 │                                │
│ 🔍 │                                │
│ ✅ │                                │
│ 📋 │                                │
└────┴────────────────────────────────┘
✍️ Schreibwerkstatt · 📚 Bibliothek · ❓ Forschungsfragen · 📐 Deskriptionsmatrix
📊 Evaluationsmatrix · 🔍 Suche · ✅ Verwendet · 📋 Protokolle
```

---

## 1. Schreibwerkstatt (Startansicht)

**Zweck:** Kapitelorientiertes Arbeiten mit dem Agenten-Team.

```
┌──────────────┬──────────────────────┐
│ Dokument: ▼  │ 2.3 Dynamic          │
│ [ISP]        │     Capabilities     │
│              │ ┌──────────────────┐ │
│ Gliederung   │ │ ENTWURF (v3)     │ │
│ 1. Einleitung│ │ Text mit [1][2]  │ │
│ 2. Grundlagen│ │ Belegmarkern …   │ │
│  2.1 …       │ └──────────────────┘ │
│ ▸2.3 … ●     │ ┌──────────────────┐ │
│ 3. …         │ │ PASSAGEN         │ │
│              │ │ [1] Teece 2007,  │ │
│ + Abschnitt  │ │     S.1319  ☐ 📄 │ │
│              │ │ [2] Wagner 2014, │ │
│              │ │     S.244   ☑ 📄 │ │
│              │ └──────────────────┘ │
│              │ ┌──────────────────┐ │
│              │ │ DISKUSSION       │ │
│              │ │ 🧑‍🏫 Prof: "Wieso  │ │
│              │ │ fehlt Weill/Ross?"│ │
│              │ │ Du: "…"          │ │
│              │ │ [Antwort … ➤]    │ │
│              │ └──────────────────┘ │
└──────────────┴──────────────────────┘
```

- Links: Dokument-Auswahl (ISP/Exposé/Diss) + Gliederungsbaum; ● = Abschnitt hat Entwurf.
- Auf schmalen Bildschirmen werden die drei Bereiche (Entwurf/Passagen/Diskussion) zu Tabs; am Desktop drei Spalten nebeneinander.
- Belegmarker [1], [2] im Entwurf: Klick hebt die Passage hervor; Hover zeigt Zitation.
- Buttons am Entwurf: „Entwurf anfordern ▼" (Agent wählen), „Kritik anfordern ▼", „Eigenen Text prüfen", „Version ▼", „Text kopieren (mit APA-Zitationen)".
- Aktionen der Agenten erscheinen im Diskussionsfaden und landen automatisch im KI-Verzeichnis.
- Abschnitt-Kopf: verknüpfte FFs/Themen als Chips; „Aus ISP übernehmen"-Button im Exposé/Diss-Dokument.

**Entschieden:** Beides – einzelne Reaktion pro Klick **und** „Debatte starten"-Button (Agenten diskutieren mehrere Runden autonom, mit Rundenlimit z. B. 3, jederzeit abbrechbar; Ergebnis als lesbarer Faden).

---

## 2. Bibliothek

**Zweck:** Bestand verwalten, Metadaten pflegen.

```
┌───────────────────────────────────────┐
│ [⬆ Upload] [+ Graue Literatur]        │
│ Suche […] Filter: [Typ▼][Rank▼][Them▼]│
│         [Status▼][Funktion▼]          │
│ Tabellenkopf anklicken zum Sortieren  │
├───────────────────────────────────────┤
│ Autor/Jahr▲  Titel      Rank  St. 🤖 🗑│
│ Teece 2007   Explicati… VHB A  ✔  ●  │
│ Wagner 2014  IT busin…  SJR Q1 ✔  KI │
│ BaFin 2023   Merkblatt… –      ⚠  KI │
│ …                                     │
└───────────────────────────────────────┘
```

- Status: ✔ vollständig · ⚠ Metadaten unvollständig · ⏳ in Verarbeitung.
- **Tabellenköpfe sind klickbare Sortierbuttons** (Autor/Jahr, Titel, Venue, Ranking, Status) statt nur einer Sortierung-Dropdown; zusätzlicher Themenfeld-Filter neben dem bestehenden Funktion-Filter.
- **KI-Einordnung direkt in der Zeile:** Badge „🤖 eingeordnet", sonst Button „KI-Einordnung" – ohne Umweg über die Detailseite auslösbar (Tabellenspalte im Desktop, Chip in der mobilen Karte).
- **Löschen-Button (🗑) je Zeile und auf der Detailseite**, mit Bestätigungsdialog; entfernt PDF aus dem Storage sowie die Quelle inkl. aller abhängigen Zeilen endgültig.
- Quellentyp umfasst auch „Doktorarbeit/wissenschaftliche Arbeit" (eigene Dissertation als Referenzquelle erfassbar).
- Zeile anklicken → **Quellen-Detailseite**, Layout von oben nach unten: Zurück-Link + Löschen-Button, Titel mit Status-/KI-Badges, Funktion-Chips, Themenfeld-Chips (direkt hier zuweisbar/entfernbar, nicht mehr nur über den QS-Workflow), auf-/zuklappbarer Bereich „Themen & Relevanz je Forschungsfrage" (Default zu, Kurzinfo im Kopf; „KI-Einordnung starten"-Button, Relevanz je FF von Hand änderbar), auf-/zuklappbares **Metadaten-Formular** (Default zu, zeigt Autor/Jahr/Typ als Kurzinfo; Speichern mit neuer/geänderter DOI reichert automatisch leere Felder über Crossref nach), darunter **PDF-Viewer über die volle Breite**, darunter Methodenprofil und Zitate der Quelle.
- **„Zitate erzeugen"-Button** an Zeile und Detailseite (nutzt aktiven Themen-/FF-Filter als Kontext): erzeugt Kandidaten-Karten mit Deep-Link → direkt prüfen → bestätigen (→ Zitat-Pool) oder verwerfen. Manuell: Text im Viewer markieren → „Als Zitat übernehmen".
- Filterleiste zusätzlich mit **[Studientyp ▼]** (qualitativ/quantitativ/mixed/konzeptionell/Review).
- Stapel-Upload zeigt Fortschritt je Datei (DOI gefunden? Metadaten? Ranking?); unklare Fälle sammeln sich in einer „Prüfen"-Liste.

**Entschieden:** Einfacher Viewer – anzeigen + Fundstellen-Sprung, kein Markieren/Kommentieren im PDF. Löschen ist endgültig (kein Soft-Delete/Archiv), immer mit Bestätigungsdialog abgesichert.

---

## 3. Forschungsfragen

**Zweck:** Systematischer Überblick, was auf welche Frage einzahlt.

```
┌────────┬────────────────────────────┐
│ FF1 ●12│ FF2: Wie wirken soziale …  │
│ FF2 ●23│ Sortierung: [Relevanz ▼]   │
│ FF3 ● 8│ ┌────────────────────────┐ │
│ [Matrix]│ │ ★★★ Karahanna 2013,   │ │
│        │ │ S.87 · VHB A          │ │
│        │ │ "Social capital …"    │ │
│        │ │ DE: "Soziales Kapital…"│ │
│        │ │ ☐ verwendet  [📄] [💬] │ │
│        │ └────────────────────────┘ │
│        │ ┌ weitere Karten … ┐       │
└────────┴────────────────────────────┘
```

- Links FF-Liste mit Passagen-Zähler; unten Umschalter zur **Relevanz-Matrix** (Quellen × FF, Zellen = Relevanz 0–3, Filter Themenfeld/Ranking/Studientyp, Sortierung, Zelle anklicken öffnet Begründung + bestätigte Zitate, Export CSV). Direkt über der Tabelle eingebettet: das **auf-/zuklappbare Venn-Diagramm** der Themenfelder-Überschneidungen (klassisches 3-Kreis-Venn für genau drei Themenfelder) – Zahl je Schnittmenge anklickbar öffnet die zugehörigen Quellen, Export als PNG-Bild.
- Die frei definierbare **Evaluationsmatrix** (Kriterien × Quellen) ist ein eigener Menüpunkt (nicht mehr Teil dieses Umschalters) – siehe Abschnitt 5.
- Karte: Relevanz-Sterne, Original einklappbar/DE-Übersetzung, Zitation kopieren, Häkchen, PDF-Sprung, 💬 = Passage in Schreibwerkstatt-Diskussion ziehen, **¶ = Paraphrase erzeugen** (sinngemäßes Zitat mit Zitation, erscheint als prüfbarer Vorschlag unter dem Original, Übernahme per Klick; wird im KI-Verzeichnis protokolliert).
- QS-Leiste oben: „12 unbestätigte KI-Zuordnungen prüfen" → Karte für Karte bestätigen/korrigieren. Die Zahl summiert unbestätigte Einträge über fünf Dimensionen (Themen, Relevanz, Zitate, Methodenprofil, Funktion) – kein reiner Zitate-Zähler.

**Entschieden:** Relevanz als Sterne (1–3) – ehrlicher für eine KI-Schätzung als Prozentwerte.

---

## 4. Deskriptionsmatrix

**Zweck:** Klassische Literatur-Synthese-Tabelle als Vorstufe zur Evaluationsmatrix – legt fest, welche Quellen dort als Zeilen erscheinen.

```
┌───────────────────────────────────────────┐
│ ☐ Nur ausgewählte anzeigen (6)  [Thema▼]  │
│ [CSV exportieren]                          │
│ Tabellenkopf anklicken zum Sortieren       │
├───────────────────────────────────────────┤
│ ☑ Autor/Jahr▲ Titel   Einordnung  … [KI]  │
│ ☑ Teece 1997  Dynamic…Grundlagenm…  ✔    │
│ ☐ Vial 2019   Underst…Review        [KI]  │
│ …                                          │
└───────────────────────────────────────────┘
```

- Spalten: Checkbox „ausgewählt", Autor/Jahr, Titel, Einordnung, Theoretische Fundierung, Art der Stichprobe, Analysemethode, Wesentliche Erkenntnisse – jede Zelle einzeln editierbar (Speichern per Fokusverlust), manuelle Bearbeitung setzt „bestätigt".
- Button „KI-Einschätzung" je Zeile füllt alle fünf Textfelder auf einmal; lässt Stichprobe/Analysemethode bewusst leer, wenn die Quelle rein konzeptionell ist (kein eigenes empirisches Studiendesign).
- Themenfeld-Filter, sortierbare Tabellenköpfe, Checkbox „Nur ausgewählte anzeigen" als Vorschau auf die Evaluationsmatrix-Auswahl, Export als CSV.

---

## 5. Evaluationsmatrix

**Zweck:** Frei definierte Kriterien gegen die in der Deskriptionsmatrix ausgewählten Quellen bewerten – Forschungslücken-Argument.

```
┌───────────────────────────────────────────┐
│ ▸ Evaluationskriterien anzeigen (16)       │
│   [KI-Vorschlag] [+ Kriterium]             │
├───────────────────────────────────────────┤
│ [Thema▼] [CSV exportieren][HTML exportier.]│
│ Tabellenkopf anklicken zum Sortieren       │
│ Autor/Jahr▲ Titel    BITA-K.  DynCap … [KI]│
│ Teece 1997  Dynamic… ○ leer   ● voll   ✔  │
│ Vial 2019   Underst… ◑ halb   ○ leer  [KI]│
└───────────────────────────────────────────┘
```

- **Kriterien-Bereich** (auf-/zuklappbar, Default zu, zeigt Kriterienzahl im Kopf): Kriterien einzeln anlegen/bearbeiten/löschen (Beschreibung + Herleitung), oder per „KI-Vorschlag" auf Basis von Thema/FFs/Themenfeldern und den ausgewählten Quellen (inkl. deren Einordnung/Fundierung/Erkenntnisse) vorschlagen lassen – jeder Vorschlag mit Begründung, einzeln übernehmbar.
- **Zeilen** = nur die in der Deskriptionsmatrix angehakten Quellen (kein Gruppieren nach Schnittmengen, keine VHB-Spalte).
- **Zellen:** vierstufige Skala nicht (○) / zu einem Viertel (◔) / zur Hälfte (◑) / voll abgedeckt (●) – Dropdown je Zelle für manuelles Setzen, Button „KI-Einschätzung" je Zeile bewertet die Quelle gegen alle Kriterien auf einmal (mit Begründung als Tooltip).
- Themenfeld-Filter, sortierbare Tabellenköpfe (auch je Kriteriums-Spalte nach Zellwert).
- **Export HTML:** eigenständige interaktive Datei im Stil der Design-Referenz `docs/Evaluationsmatrix_Interaktiv.html` (Themenfeld-Filter, Suche, Legende, Kernaussage-Callout, Score-Statistik) – ohne Abhängigkeit zum Tool weitergebbar, hebt die eigene Dissertation als Referenzquelle farblich hervor.
- **Export CSV.**

---

## 6. Suche

**Zweck:** Gezielt Belege finden.

```
┌─────────────────────────────────────┐
│ [ Suchbegriff …................. 🔍]│
│ ◉ Hybrid  ○ Nur Volltext ○ Semantik │
│ Filter: [Thema ▼][Ranking ▼][FF ▼]  │
├─────────────────────────────────────┤
│ Ergebnis-Karten (wie in Ansicht 3)  │
│ + Fundstellen-Snippet mit Markierung│
└─────────────────────────────────────┘
```

- Standard: Hybrid (Volltext + semantisch, zusammen gerankt).
- Jede Trefferkarte: Snippet mit markiertem Treffer, Kurzzitation, Seite, Ranking, Häkchen, PDF-Sprung.

---

## 7. Verwendet

**Zweck:** Zitate-Buchhaltung pro Dokument, Literaturverzeichnis.

```
┌─────────────────────────────────────┐
│ Dokument: [ISP ▼]                   │
│ 47 verwendete Zitate aus 31 Quellen │
│ Gruppierung: ◉ Quelle ○ Abschnitt   │
├─────────────────────────────────────┤
│ ▸ Teece 2007 (3 Zitate)             │
│ ▸ Wagner 2014 (2 Zitate)            │
│ …                                   │
├─────────────────────────────────────┤
│ [Literaturverzeichnis erzeugen 📋]  │
│ → alphabetisch, APA 7, kopierbar    │
└─────────────────────────────────────┘
```

- Häkchen gelten pro Dokument; Übernahme ISP → Exposé übernimmt auch die Häkchen (abwählbar).
- Verzeichnis erscheint als kopierbarer Textblock; einzelne Einträge auch separat kopierbar.

---

## 8. Protokolle

**Zweck:** Nachweise ohne Zusatzaufwand.

```
┌─────────────────────────────────────┐
│ Tab: [KI-Verzeichnis] [Aktivität]   │
├─────────────────────────────────────┤
│ KI-Verzeichnis   Monat: [Juli ▼]    │
│ Datum  Art          Bezug           │
│ 03.07. Übersetzung  Teece 2007      │
│ 05.07. Entwurf      ISP 2.3         │
│ …            [Als Tabelle kopieren] │
├─────────────────────────────────────┤
│ Aktivität        Monat: [Juli ▼]    │
│ KW27: Mo ▪ Di ▪ Do ▪   (3 Tage)     │
│ KW28: Mi ▪ Sa ▪        (2 Tage)     │
│ Juli gesamt: 11 aktive Tage         │
│              [Übersicht kopieren]   │
└─────────────────────────────────────┘
```

- KI-Verzeichnis: gleichartige Aktionen pro Tag werden zusammengefasst („Übersetzung von 6 Passagen"), damit die Tabelle lesbar bleibt.
- Aktivität: nur aktive Tage je KW, bewusst ohne Stunden – Zuarbeit fürs händische Dissertationsprotokoll.

---

## Design-Entscheidungen (Stand Juli 2026)

1. **Agenten-Diskussion:** einzelne Reaktion per Klick **und** „Debatte starten" (mehrere autonome Runden mit Limit, abbrechbar).
2. **PDF-Viewer:** nur anzeigen + Fundstellen-Sprung.
3. **Relevanz:** Sterne (1–3).
4. **Mobil:** Vollständig mobil nutzbar, inkl. Schreibwerkstatt. Konsequenzen:
   - Mobile-First-Responsive-Design; Drei-Spalten-Ansichten werden am Handy zu Tabs mit Hinweis-Badges (z. B. neue Diskussionsbeiträge).
   - Länger laufende Agenten-Aktionen (Entwurf, Debatte) laufen als Hintergrund-Jobs weiter, auch wenn das Handy die Seite verlässt; Ergebnis wartet beim nächsten Öffnen.
   - Als PWA installierbar (Icon auf dem Homescreen).
