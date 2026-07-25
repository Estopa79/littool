# LitTool – Text-Wireframes der Ansichten (v0.1, zur Durchsprache)

Navigation: feste Seitenleiste links (einklappbar) mit den sechs Ansichten. Oben rechts: globale Schnellsuche (von überall erreichbar, springt in Ansicht „Suche").

```
┌────┬────────────────────────────────┐
│ ☰  │  [Schnellsuche …........... 🔍]│
│ ✍️  │                                │
│ 📚 │        Inhaltsbereich          │
│ ❓ │                                │
│ 🔍 │                                │
│ ✅ │                                │
│ 📋 │                                │
└────┴────────────────────────────────┘
✍️ Schreibwerkstatt · 📚 Bibliothek · ❓ Forschungsfragen
🔍 Suche · ✅ Verwendet · 📋 Protokolle
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
┌─────────────────────────────────────┐
│ [⬆ Upload] [+ Graue Literatur]      │
│ Filter: [Typ ▼][Ranking ▼][Thema ▼] │
│         [Status ▼]  Sortierung ▼    │
├─────────────────────────────────────┤
│ Autor/Jahr    Titel      Rank  St.  │
│ Teece 2007    Explicati… VHB A  ✔   │
│ Wagner 2014   IT busin…  SJR Q1 ✔   │
│ BaFin 2023    Merkblatt… –      ⚠   │
│ …                                   │
└─────────────────────────────────────┘
```

- Status: ✔ vollständig · ⚠ Metadaten unvollständig · ⏳ in Verarbeitung.
- Zeile anklicken → **Quellen-Detailseite**: Metadaten (editierbar), Abstract, Ranking mit Herkunft, Themen-Chips, Relevanz je FF, alle Passagen, eingebetteter PDF-Viewer.
- Stapel-Upload zeigt Fortschritt je Datei (DOI gefunden? Metadaten? Ranking?); unklare Fälle sammeln sich in einer „Prüfen"-Liste.

**Entschieden:** Einfacher Viewer – anzeigen + Fundstellen-Sprung, kein Markieren/Kommentieren im PDF.

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

- Links FF-Liste mit Passagen-Zähler; unten Umschalter zur **Matrix** (Quellen × FF, Zellen = Relevanz, Klick öffnet Passagen).
- Karte: Relevanz-Sterne, Original einklappbar/DE-Übersetzung, Zitation kopieren, Häkchen, PDF-Sprung, 💬 = Passage in Schreibwerkstatt-Diskussion ziehen.
- QS-Leiste oben: „12 unbestätigte KI-Zuordnungen prüfen" → Karte für Karte bestätigen/korrigieren.

**Entschieden:** Relevanz als Sterne (1–3) – ehrlicher für eine KI-Schätzung als Prozentwerte.

---

## 4. Suche

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

## 5. Verwendet

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

## 6. Protokolle

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
