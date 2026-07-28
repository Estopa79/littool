# Arbeitsplan Phase 5 – Schreibwerkstatt (Ko-Autoren-Modell)

Ziel der Phase: Die Gliederung der realen Dokumente (ISP → Exposé → Dissertation) lebt im Tool. Pro Abschnitt: Drei-Spalten-Arbeit (Entwurf / Zitat-Pool / Diskussion), Agenten-Entwürfe mit Belegpflicht, Einzelreaktionen und Mehr-Runden-Debatte, Prüfung eigener Texte, Versionierung, Kopplung an Verwendet-Häkchen und KI-Verzeichnis. Dazu der freie, belegte Chat über den Bestand.

Voraussetzung: Phase 4 abgeschlossen. **Grundsatz (CLAUDE.md, Prinzip „Vorschläge, nie Endtext"):** Alle Agenten-Entwürfe sind Denkmaterial – die UI kennzeichnet sie entsprechend, jede Erzeugung landet im KI-Verzeichnis.

---

## Paket 0 – Rückblick & Leitplanken ☑

- Stand Phase 4 prüfen (Häkchen, Verzeichnisse, AiLog lückenlos?).
- In der Schreibwerkstatt-UI einen dezenten, permanenten Hinweis vorsehen: „Entwürfe sind KI-Vorschläge – prüfen, umformulieren, verantworten. Nutzung wird im KI-Verzeichnis protokolliert."
- **Fertig, wenn:** Ausgangszustand sauber, Hinweis-Konzept steht.

**Notizen:**

*Stand Phase 4 (per Direktabfrage der Produktions-DB, 2026-07-28):* Pakete 0–7 ☑. Paket 8 (End-to-End-Abnahme) bewusst weiterhin ☐ – wartet laut Entscheidung am Ende des Phase-4-Plans auf mehr QS-Arbeit des Autors (`/pruefen`), kein Blocker für Phase 5. Bestätigt: 3 von 169 Zitaten bestätigt, 0 `used_citations` (Häkchen), 433 `ai_log_entries` weiterhin lückenlos (Pakete 4–7 riefen alle kein Claude auf: `apaFormat.ts`, `CitationCopyButtons.tsx`, `aiVerzeichnis.ts`, `aktivitaet.ts` sind reine Lese-/Formatierungslogik). Literaturverzeichnis- und KI-Verzeichnis-Generator funktional fertig, aktuell mangels Häkchen leer – erwartungsgemäß. Weitere offene Punkte aus Phase 4 (28 unmatched BibTeX-Einträge, QS-Durchgang unvollständig, drei bekannte Datenqualitätsfehler, `dissertation`-Formatierung ungetestet, a/b-Suffix-Limitation, generische KI-Verzeichnis-Prüftexte, mobiler Overflow durch `BottomTabBar`) unverändert und ohne Bezug zu Phase 5 – nicht erneut aufgegriffen.

*Hinweis-Konzept für die Schreibwerkstatt-UI:* Die eigentliche Drei-Spalten-Ansicht existiert erst ab Paket 4 (aktuell nur `PlaceholderView` in `views/Schreibwerkstatt.tsx`) – der Hinweis wird deshalb hier nur als Konzept festgelegt, nicht als verwaiste Komponente ohne Einbauort vorgebaut:

- **Wortlaut** (wörtlich aus dem Arbeitsplan): „Entwürfe sind KI-Vorschläge – prüfen, umformulieren, verantworten. Nutzung wird im KI-Verzeichnis protokolliert."
- **Platzierung:** schmale, permanente Kopfzeile direkt über dem Drei-Spalten-Bereich (Entwurf/Zitat-Pool/Diskussion), auf jeder Abschnittsseite sichtbar, nicht wegklickbar – kein Modal, kein Toast, da dauerhaft sichtbar gefordert ist.
- **Stil:** dezent = gedeckte Info-Farbe (z. B. `slate`/`blue-50`-Hintergrund, kleine Schrift), bewusst keine Warnfarbe (Rot/Gelb) – der Hinweis ist Dauerzustand, kein Fehler.
- **Umsetzung:** eigene, wiederverwendbare Komponente (Arbeitstitel `components/DraftNoticeBanner.tsx`), damit sie später auch in Diskussion/Debatte (Pakete 6/7) ohne Duplikation wiederverwendet werden kann. Wird tatsächlich gebaut und eingebunden, sobald Paket 4 die Drei-Spalten-Ansicht erstellt – vorher gäbe es keinen Einbauort, ein Alleingang-Rendering würde CLAUDE.md-Prinzip 4 („kein Feature bauen, das nicht gebraucht wird") verletzen.

Kein Code in diesem Paket geändert (reine Bestandsaufnahme + Konzeptentscheidung, dokumentiert statt vorab implementiert).

## Paket 1 – Schema: Gliederung, Entwürfe, Diskussion ☑

- Migrationen: `sections` (document_id, parent_id, nummer, titel, rq_ids, topic_ids, sortierung), `drafts` (section_id, version, text, verwendete zitat-ids, erstellt_von: persona/autor, status), `discussion_entries` (section_id, draft_id, autor: persona/user, text, zeitstempel), `personas` (name, rolle, haltung/kritikstil, systemprompt, aktiv), `chat_sessions` (persona_id optional, filter, verlauf).
- Job-Infrastruktur für lange Läufe: Tabelle `jobs` (typ, status, fortschritt, ergebnis) – Entwürfe und Debatten laufen asynchron weiter, wenn der Client (Handy) die Seite verlässt.
- **Fertig, wenn:** Migrationen laufen, ein Dummy-Job lässt sich starten, pollen und abschließen.

**Notizen:**

Migration `0032_schreibwerkstatt_schema.sql`, per `supabase db push` angewendet (History synchron, `migration list` bestätigt 0032 lokal = remote).

**Scope-Entscheidung (technische Umsetzung, keine inhaltliche Abweichung):** „rq_ids"/„topic_ids"/„verwendete zitat-ids" aus dem Plan sind n:m-Beziehungen und wurden wie überall sonst im Schema (`source_topics`, `source_rq_relevance`, Migration 0014) als eigene Verknüpfungstabellen gebaut, nicht als Array-Spalten: `section_research_questions`, `section_topics`, `draft_passages`.

Neun neue Tabellen: `jobs` (generische Infrastruktur für asynchrone Aktionen – die erste im Tool, bisherige lange Aktionen wie `generate-citations` liefen synchron innerhalb der Edge-Function-Anfrage; `type` per Check auf `dummy`/`draft_generation`/`debate` eingeschränkt, `dummy` bleibt als dauerhafter Diagnose-Typ), `sections` (Baum via `parent_id`, `number` bewusst nullable für die Schnellerfassung aus Paket 2, `sort_order` für Geschwister-Reihenfolge), `section_research_questions`, `section_topics`, `personas` (Schema nur – Seed der drei Standard-Personas folgt in Paket 3), `drafts` (`created_by`/`persona_id`-Diskriminator für „erstellt_von: persona/autor", `persona_id` mit `ON DELETE RESTRICT` – Personas werden laut Paket 3 deaktiviert statt gelöscht, ein Löschversuch mit vorhandenen Entwürfen soll fehlschlagen statt Historie zu verwaisen; `job_id` mit `ON DELETE SET NULL`), `draft_passages`, `discussion_entries` (gleiches Diskriminator-Muster wie `drafts`, Pflicht-Bezug auf `draft_id`), `chat_sessions` (Paket 9, weit später – Schema hier mit angelegt, da Paket 1 laut Plan die komplette Basisinfrastruktur der Phase liefert; `filters`/`messages` als jsonb wie `sources.authors` seit Migration 0003). RLS + Grants nach dem Muster aus Migration 0001 für alle neun Tabellen.

Test direkt gegen die echte Produktions-DB per REST API: (1) Dummy-Job-Lebenszyklus komplett durchgespielt – anlegen (`pending`) → pollen → auf `running`/Fortschritt 50 setzen → pollen → auf `done` mit `result` abschließen → final pollen, jeder Schritt korrekt persistiert, Testzeile danach gelöscht. (2) Constraints gegengetestet: ungültiger `jobs.type` (`23514`, `jobs_type_check`) und `drafts` mit `created_by='persona'` ohne `persona_id` (`23514`, `drafts_check`) korrekt abgelehnt; gültiger Autoren-Entwurf (`created_by='author'`, `persona_id=null`) an einer echten (danach wieder gelöschten) Test-Section erfolgreich angelegt; Kaskade section → drafts beim Löschen der Test-Section bestätigt (kein verwaister Datensatz). Keine bleibenden Testdaten.

## Paket 2 – Gliederungs-Verwaltung ☑

- Dokument-/Gliederungsbaum in der Schreibwerkstatt: Abschnitte anlegen, verschachteln, nummerieren, sortieren; je Abschnitt FFs und Themenfelder als Chips verknüpfen.
- Schnellerfassung: Gliederung als eingerückten Text einfügen → Baum wird erzeugt (spart Klickarbeit).
- Die reale ISP-Gliederung erfassen (Autor liefert sie in der Sitzung).
- **Fertig, wenn:** Die echte ISP-Gliederung vollständig im Tool steht.

**Notizen:**

`lib/sections.ts` (Datenzugriff + reine Hilfsfunktionen) und `views/Schreibwerkstatt.tsx` (ersetzt den Platzhalter). Baum clientseitig aus der flachen `sections`-Liste aufgebaut (`buildTree`, gleiche Bestandsgrößen-Annahme wie anderswo im Tool). Sortieren bewusst per ↑/↓-Buttons (Tausch von `sort_order` mit dem Nachbarn) statt Drag&Drop - keine zusätzliche Abhängigkeit für etwas, das zwei Buttons genauso gut leisten (CLAUDE.md „schlank bleiben"). Reparenting über ein Dropdown „Übergeordneter Abschnitt" im Detailbereich (nicht per Drag&Drop im Baum), mit `collectDescendantIds` gegen Zyklen abgesichert (ein Abschnitt kann nicht unter sich selbst oder einen eigenen Nachfahren gehängt werden - diese Optionen fehlen im Dropdown). Löschen kaskadiert per DB-FK (`ON DELETE CASCADE`, Migration 0032); der Bestätigungsdialog nennt vorab die Anzahl mitgelöschter Unterabschnitte.

FF-/Themen-Chips: Klick toggelt direkt gegen `section_research_questions`/`section_topics` (kein Speichern-Button nötig, gleiches Sofort-Muster wie `UsedCitationCheckbox`).

**Schnellerfassung:** `parseOutline` erkennt Einrückungstiefe über die Menge der im Text vorkommenden eindeutigen Einrückungsbreiten (nicht über feste Zwei-/Vierer-Schritte - toleriert unterschiedliche Einrückungsstile), eine optional führende Nummer/Label (`1`, `1.2.3`, `A.1` …) wird als `number` abgetrennt, sonst bleibt `number` null (dafür in Migration 0032 bewusst nullable). `createSectionsFromOutline` legt Zeile für Zeile sequenziell an (Kind braucht die echte DB-`id` des zuletzt eingefügten Elternteils, kein Batch-Insert möglich) und hängt am bestehenden Bestand an, statt ihn zu ersetzen - kein stillschweigendes Löschen vorhandener Abschnitte.

Live gegen die echte DB getestet (Testdaten danach vollständig entfernt): (1) CRUD-Zyklus - Abschnitt anlegen, Unterabschnitt anlegen, umbenennen, FF-/Themen-Chip togglen und zurück-togglen (Join-Zeile jeweils per Direktabfrage bestätigt), zwei Wurzel-Abschnitte per ↑ vertauscht (`sort_order`-Tausch bestätigt), ein Abschnitt reparented (neue `parent_id` + ans Ende der neuen Geschwisterliste einsortiert, bestätigt), Löschen mit 2 Unterabschnitten - Dialog nannte korrekt „2 Unterabschnitt(e)", Kaskade per Direktabfrage bestätigt (alle 3 Zeilen weg). (2) Schnellerfassung mit einem synthetischen 7-Zeilen-Beispiel (3 Ebenen, ein Eintrag ohne Nummer) - Baum-Struktur exakt wie erwartet, Zeile ohne Nummer korrekt mit `number: null`. (3) **Echte ISP-Gliederung** (vom Autor als Screenshot des Inhaltsverzeichnisses geliefert, 52 Einträge, bis Ebene 4 verschachtelt) per Schnellerfassung importiert - Baum-Struktur per Direktabfrage gegen die transkribierte Vorlage geprüft, exakte Übereinstimmung (Nummern, Titel, Verschachtelung, Reihenfolge). TypeScript-Build (`tsc -b`) und `vite build` fehlerfrei. Mobiler Seiten-Overflow (375px) geprüft - identisch mit dem bereits dokumentierten, vorbestehenden `BottomTabBar`-Fall (auf der unveränderten Bibliothek-Seite reproduziert), keine neue Regression durch diese Ansicht.

**Auffälligkeit in der Vorlage (dem Autor gemeldet, unverändert übernommen):** Punkt 5 und Punkt 10 des Inhaltsverzeichnisses heißen beide „Literaturverzeichnis" (S. 38 bzw. 39) - wirkt wie eine Dopplung/ein Tippfehler im Original-Dokument. Bewusst nicht stillschweigend korrigiert (CLAUDE.md „nie stillschweigend ändern"); Rückmeldung des Autors zur korrekten Bezeichnung von Punkt 10 steht noch aus.

**Nicht Teil dieses Pakets (bewusst, siehe Wireframe/Plan):** Entwurf/Zitat-Pool/Diskussion-Spalten (Paket 4/5/6), „●"-Marker im Baum für „hat Entwurf" (setzt `drafts` mit echten Daten voraus), Drag&Drop-Umsortierung.

## Paket 3 – Personas ☑

- Personas-Verwaltung (in Einstellungen): Name, Rolle, Haltung/Kritikstil, Systemprompt; aktivierbar/deaktivierbar.
- Drei Standard-Personas als Seed: kritischer Professor (hinterfragt Argumentation, Quellenwahl, Stringenz), wohlwollender Lektor (Struktur, Sprache, Lesefluss), naiver Student (versteht er es? wo hakt es?). Systemprompts enthalten die Belegpflicht: keine inhaltliche Behauptung ohne Verweis auf ein Zitat aus dem Pool.
- **Fertig, wenn:** Personas anleg-, editier- und wählbar sind.

**Notizen:**

Migration `0033_personas_seed.sql` (echte Konfiguration, kein Testfixture - analog zum Dokumente-Seed aus Migration 0031) legt die drei Standard-Personas mit ausformulierten Systemprompts an; jeder Prompt enthält die Belegpflicht explizit ausformuliert (keine inhaltliche Behauptung ohne Verweis auf ein Zitat aus dem Pool, sonst als unbelegte Vermutung/Frage kennzeichnen) - das ist die Stelle, an der diese Regel fuer die Agenten in Paket 5 ff. tatsaechlich technisch durchgesetzt wird, nicht nur eine UI-Kennzeichnung.

`lib/personas.ts` (CRUD, gleiches Muster wie `lib/settings.ts`) + `PersonasCard` in `views/Einstellungen.tsx` (gleiche Karten-Struktur wie `ForschungsfragenCard`/`ThemenfelderCard`: Inline-Felder mit Speichern-bei-Blur, Formular zum Hinzufuegen unten, Loeschen mit Bestaetigung). Systemprompt ist standardmaessig eingeklappt (`+ Systemprompt bearbeiten`), da er lang ist und in der Uebersicht nicht stoeren soll. `active`-Checkbox schaltet sofort (kein Speichern-Button), gleiches Sofort-Muster wie die Chip-Toggles aus Paket 2.

Live gegen die echte DB getestet: drei Standard-Personas laden korrekt (Name/Rolle/Haltung/Systemprompt exakt wie geseedet), Systemprompt-Anzeige beim Aufklappen inhaltlich verifiziert, `active`-Toggle aus/an mit Direktabfrage bestaetigt, Haltung-Feld editiert und per Blur gespeichert (danach zurueckgesetzt), eine Test-Persona ueber das Formular angelegt und ueber den Loeschen-Button wieder entfernt. Zusaetzlich der Loeschschutz aus Migration 0032 (`ON DELETE RESTRICT`) gezielt geprueft: Testabschnitt + Testentwurf mit echter Persona-Referenz angelegt, Loeschversuch der referenzierten Persona schlaegt korrekt mit Fremdschluessel-Fehler fehl (`23503`), Testdaten (Abschnitt, kaskadiert zum Entwurf) danach entfernt, Persona selbst blieb unangetastet. TypeScript-Build und `vite build` fehlerfrei.

**Noch nicht Teil dieses Pakets:** eine tatsaechliche Persona-Auswahl beim Anfordern eines Entwurfs/einer Reaktion - dafuer gibt es vor Paket 5/6 noch keinen Konsumenten; `active` legt nur fest, welche Personas dort spaeter zur Wahl stehen.

## Paket 4 – Drei-Spalten-Ansicht ☑ (Hinweis-Badges noch ohne Datenbasis, s. u.)

- Layout gemäß Wireframe: links Gliederungsbaum, dann Entwurf / Zitat-Pool / Diskussion; mobil als Tabs mit Hinweis-Badges (neue Diskussionsbeiträge, fertiger Job).
- Zitat-Pool-Spalte: bestätigte Zitate, vorgefiltert auf die FFs/Themen des Abschnitts, umschaltbar auf „alle"; Karten mit Häkchen-Status; Zitate für den Entwurf an-/abwählbar.
- **Fertig, wenn:** Navigation Abschnitt → drei Bereiche flüssig funktioniert, Desktop und mobil.

**Notizen:**

Layout in `views/Schreibwerkstatt.tsx` erweitert: Abschnitts-Kopf (Nummer/Titel/Speichern/Löschen) bleibt oben, „Übergeordneter Abschnitt"/FF-/Themen-Chips jetzt in einem `<details>`-Element eingeklappt (waren in Paket 2 permanent sichtbar - mussten fuer die drei Spalten platzsparender werden). Direkt darunter der `DraftNoticeBanner` aus Paket 0 - hier zum ersten Mal tatsaechlich eingebunden, da dies der erste echte Einbauort ist. Danach Desktop: `grid grid-cols-3` mit `divide-x`; mobil (`md:hidden`): Tab-Leiste + einspaltiger Inhalt, gleiche Spalten-Komponenten wiederverwendet (kein Duplikat).

**Zitat-Pool-Spalte** (`lib/sectionPool.ts` + `ZitatPoolColumn`/`PoolPassageCard`): laedt einmalig alle bestaetigten Zitate (Bestandsgroesse macht das unproblematisch, gleiches Muster wie andernorts), Filterung auf den Abschnitt rein clientseitig (`filterPassagesForSection` - passt, wenn die Forschungsfrage ODER ein bestaetigtes Themenfeld des Zitats mit den Verknuepfungen des Abschnitts uebereinstimmt), Umschalter „alle anzeigen"/„nur passende". Karten nutzen die bestehenden Komponenten `CitationCopyButtons` und `UsedCitationCheckbox` wieder (kein Duplikat der Kopier-/Haekchen-Logik aus Phase 3/4).

**„Zitate fuer den Entwurf an-/abwaehlbar":** eigene Checkbox je Karte, getrennt vom „verwendet"-Haekchen. Bewusste Scope-Entscheidung: Diese Auswahl ist reiner Client-State (`Record<sectionId, Set<passageId>>`), nicht in `draft_passages` persistiert - die Junction-Tabelle aus Migration 0032 ist an eine konkrete Entwurfsversion gebunden, die es vor Paket 5 noch nicht gibt. Die Auswahl ueberlebt das Wechseln zwischen Abschnitten innerhalb der Sitzung (pro Abschnitt gemerkt), aber keinen Reload - Paket 5 entscheidet, wie „Entwurf anfordern" diese Auswahl tatsaechlich in `draft_passages` ueberfuehrt.

**Entwurf-Spalte:** Platzhalter-Text + Hinweis auf die Anzahl vorgemerkter Pool-Zitate (einzige heute schon echte Information - der eigentliche Entwurf/Versionen/Buttons sind Paket 5). **Diskussion-Spalte:** reiner Platzhalter - `discussion_entries.draft_id` ist laut Migration 0032 `NOT NULL`, ohne existierenden Entwurf (Paket 5) kann technisch noch keine einzige Zeile entstehen, nicht nur eine UI-Entscheidung.

**Hinweis-Badges („neue Diskussionsbeiträge, fertiger Job") aus dem Plan:** bewusst noch nicht gebaut. Beide brauchen Daten, die es vor Paket 5 (Jobs pro Abschnitt) bzw. Paket 6 (Diskussionsbeiträge) gar nicht geben kann - eine Badge-Anzeige waere sonst dauerhaft totes 0-Icon. Wird nachgezogen, sobald die jeweilige Datengrundlage existiert.

Live gegen die echte DB getestet (Testverknuepfung danach entfernt): Abschnitt „1 Einleitung" testweise mit FF „HFF" verknuepft - Zitat-Pool zeigt korrekt genau das eine passende Zitat (Luftman 2000, S. 4), „alle anzeigen" zeigt alle 3 bestaetigten Zitate im Bestand, Umschalten zurueck auf „nur passende" korrekt. Auswahl-Checkbox getoggelt - Entwurf-Spalte zeigt „1 Zitat(e) ... vorgemerkt", Auswahl blieb beim Umschalten auf „alle anzeigen" korrekt nur auf dem einen ausgewaehlten Zitat (nicht auf alle 3 uebergesprungen). Zu Abschnitt „2 Stand der Forschung" gewechselt (kein Treffer, 0 vorgemerkt, `showAllPool` korrekt zurueckgesetzt) und zurueck zu „1 Einleitung" - Auswahl und FF-Verknuepfung beide korrekt erhalten geblieben (Sitzungs-Persistenz clientseitig bestaetigt). Desktop-Breakpoint (1280px) zeigt drei echte Spalten nebeneinander, kein „← Zur Gliederung"; mobile Breite (375px) zeigt Tab-Leiste, alle drei Tabs durchgeklickt (Entwurf/Zitat-Pool/Diskussion), Inhalte korrekt je Tab. Mobiler Seiten-Overflow identisch mit dem bereits dokumentierten, vorbestehenden `BottomTabBar`-Fall - keine neue Regression. TypeScript-Build und `vite build` fehlerfrei.

## Paket 5 – Agenten-Entwurf mit Belegpflicht ☐

- „Entwurf anfordern" (Persona wählbar): Claude schreibt auf Basis der angewählten Pool-Zitate einen Entwurf mit Belegmarkern [1], [2] …, die auf die Zitate zeigen; Klick auf Marker hebt das Zitat hervor.
- **Belegprüfung:** Jede inhaltliche Aussage muss einem Marker zugeordnet sein; Aussagen ohne Beleg werden von der Nachprüfung markiert („unbelegt") statt stillschweigend akzeptiert. Marker auf nicht angewählte/nicht existierende Zitate → Entwurf wird abgelehnt.
- Versionierung: jeder Entwurf als neue Version, Versionswechsler, Diff-Ansicht (einfach: alt/neu nebeneinander).
- Läuft als Hintergrund-Job; AiLog-Eintrag je Entwurf.
- **Fertig, wenn:** Ein Entwurf für einen echten ISP-Abschnitt entsteht, alle Marker stimmen, Unbelegtes wird sichtbar markiert.

## Paket 6 – Diskussion & Text-Prüfung ☐

- Diskussionsfaden je Abschnitt: eigener Kommentar, „Reaktion anfordern" mit Persona-Wahl (eine Reaktion pro Klick), Bezug auf Entwurf-Version.
- „Eigenen Text prüfen": Autor fügt eigenen Text ein → gewählte Persona prüft: Passt er zum Abschnitt? Ist er durch Pool-Zitate gedeckt? Was fehlt/ist abwegig? Antwort mit Belegverweisen.
- **Fertig, wenn:** Frage-Antwort-Zyklen mit Personas am echten Abschnitt funktionieren; AiLog vollständig.

## Paket 7 – Debatte (Mehr-Runden) ☐

- „Debatte starten": gewählte Personas (2–3) diskutieren den aktuellen Entwurf autonom, Rundenlimit 3 (konfigurierbar), jederzeit abbrechbar; Verlauf erscheint als lesbarer Faden mit Sprecher-Kennzeichnung.
- Als Hintergrund-Job (Handy-tauglich: starten, weglegen, Ergebnis wartet); Kosten je Debatte im AiLog.
- Abschluss-Zusammenfassung: „Kernpunkte der Debatte" als letzter Eintrag.
- **Fertig, wenn:** Eine Debatte über einen echten Entwurf einen brauchbaren, nachvollziehbaren Faden liefert und das Limit greift.

## Paket 8 – Übernahme, Häkchen-Kopplung & Export ☐

- „Version übernehmen": markiert die Version als Arbeitsstand; alle darin per Marker verwendeten Zitate werden automatisch im aktiven Dokument angehakt (Verwendet-Liste, Phase 4).
- „Text kopieren": Entwurf mit ausformulierten APA-Zitationen statt Markern (inkl. Übersetzungs-Kennzeichnung, Regeln aus Phase 4).
- Abschnitts-Übernahme zwischen Dokumenten (ISP → Exposé): Abschnitt samt Entwürfen und Häkchen kopieren, Häkchen abwählbar.
- **Fertig, wenn:** Übernehmen → Verwendet-Liste stimmt → kopierter Text landet korrekt zitiert in Word.

## Paket 9 – Freier Chat mit dem Bestand ☐

- Chat-Ansicht: optional Persona, Filter (Themenfeld, Ranking, Studientyp, einzelne Quellen); RAG über Phase-2-Suche; **jede inhaltliche Aussage mit Beleg (Quelle + Seite)**, sonst „dazu habe ich keine Quelle".
- Verläufe speichern, benennen, durchsuchen; aus einer Chat-Antwort heraus: „Stelle als Zitat-Kandidat übernehmen" (läuft durch die normale Prüfung aus Phase 3).
- **Fertig, wenn:** Fachfragen an den Bestand belegte, nachprüfbare Antworten liefern.

## Paket 10 – End-to-End-Abnahme ☐

- Kompletter Zyklus an einem echten ISP-Abschnitt: Zitate erzeugen/prüfen → Entwurf anfordern → Debatte → eigene Überarbeitung einfügen und prüfen lassen → Version übernehmen → Text mit Zitationen kopieren → Literaturverzeichnis aktualisieren → KI-Verzeichnis kontrollieren → Backup.
- **Fertig, wenn:** Der Zyklus rund läuft → Phase 5 abgeschlossen, das Tool ist komplett. 🎉

---

## Danach

Kein Arbeitsplan Phase 6. Jetzt wird die ISP geschrieben. Phase 6 (Confluence-Import, BibTeX-Export, weitere Tabellen/Grafiken, externe Datenbanken) und die Ideen-Liste nur angehen, wenn beim Schreiben konkret etwas fehlt.
