# Arbeitsplan Phase 2 – Volltext, Embeddings, Suche

Ziel der Phase: Der gesamte Bestand ist im Volltext erfasst, in Chunks mit Seitenzuordnung zerlegt, eingebettet – und über eine kombinierte Volltext- + semantische Suche mit Fundstellen-Sprung durchsuchbar.

Voraussetzung: Phase 1 abgeschlossen (alle Quellen `complete` oder bewusst `grau`).

---

## Paket 0 – Rückblick & Aufräumen ☑

- Kurzer Check mit Claude Code: Gibt es aus Phase 1 offene `needs_review`-Fälle, TODOs oder Provisorien? Liste erstellen, kritisches beheben, Rest dokumentieren.
- Wie viele Quellen sind Scans ohne Textebene? (Bestimmt, wie wichtig der OCR-Pfad in Paket 2 ist.)
- **Fertig, wenn:** Sauberer Ausgangszustand, Scan-Anteil bekannt.

**Notizen:**

*needs_review (88 von 155), aufgeschlüsselt:*
- 53 – weder DOI noch Metadaten automatisch gefunden (v. a. Fachpresse/deutschsprachige Quellen, nicht in Crossref/OpenAlex indiziert)
- 18 – Titelsuche fand etwas, aber zu unsicher (Ähnlichkeitsschwelle nicht erreicht → bewusst nicht automatisch übernommen)
- 11 – Titel-Dubletten-Hinweis (Fuzzy-Check)
- 3 – DOI-Dublette (die übrigen 4 der ursprünglich 7 DOI-Dubletten wurden vom später gelaufenen Fuzzy-Titel-Check überschrieben – siehe Provisorien)
- 3 – Pflichtfelder unvollständig trotz gefundener DOI

Kein kritischer Fund, alles erwartbares Ergebnis der Automatik – echte Redaktionsarbeit für den Nutzer, kein Bug.

*Provisorien / TODOs (dokumentiert, nicht kritisch für Phase 2):*
- `supabase link`/CLI-DB-Zugriff weiterhin nicht eingerichtet – Migrationen laufen manuell im SQL-Editor. Für Phase 2 relevant (pgvector/chunks-Migration kommt in Paket 1), aber kein Blocker.
- Wenn eine Quelle sowohl DOI- als auch Titel-Dublette ist, überschreibt der zuletzt gelaufene Job (`detect-duplicates`) den `status_hint` der DOI-Dublette – Status bleibt korrekt `needs_review`, aber der ursprüngliche DOI-Dublette-Grund geht in der Anzeige verloren. Kein Datenfehler, nur ungenaue Begründung; bei Bedarf später auf Hinweis-Anhängen statt Überschreiben umstellen.
- Keine Lösch-/Zusammenführen-Funktion für bestätigte Dubletten in der App – Bereinigung aktuell nur manuell in Supabase möglich.
- CORE-Rankingliste (Konferenzen) noch nicht beschafft; VHB-Liste deckt nur die Fachbereiche Wirtschaftsinformatik + Strategisches Management ab, SJR nur den Bereich Business/Management/Accounting (bewusste Teillisten aus Paket 6, kein Fehler, aber Grund für gelegentliche "kein Ranking gefunden"-Fälle bei tatsächlich gelisteten Journals außerhalb dieser Bereiche).
- Worker läuft weiterhin nur lokal auf diesem Rechner, kein Deployment/Scheduling.

*Scan-Anteil:* 151 von 155 Quellen haben ein PDF hinterlegt. Davon 1 PDF komplett ohne Textebene (echter Scan), 9 mit einzelnen textlosen Seiten (Deckblätter/Abbildungen), Rest sauber textextrahierbar. OCR-Fallback in Paket 2 ist damit ein Sicherheitsnetz für Einzelfälle, keine Kernanforderung.

## Paket 1 – Schema: Chunks & Suchinfrastruktur ☑

- Migration: pgvector-Extension aktivieren; Tabelle `chunks` (source_id, page, chunk_index, text, embedding vector, tsvector-Spalte).
- FTS-Konfiguration für gemischtsprachigen Bestand (deutsch + englisch): tsvector aus beiden Konfigurationen kombinieren oder `simple` + unaccent – Claude Code soll beide Varianten kurz begründen und eine wählen.
- Indexe: GIN auf tsvector, HNSW auf embedding.
- **Fertig, wenn:** Migration läuft, Test-Chunks per SQL such- und vektorabfragbar.

**Notizen:** Embedding-Anbieter-Entscheidung (eigentlich erst „vor Paket 4" geplant) musste vorgezogen werden, weil die `embedding vector(N)`-Spalte schon jetzt eine feste Dimension braucht – Entscheidung im Chat: **Voyage AI voyage-3.5, 1024 Dimensionen** (bessere Qualität bei gemischt DE/EN-Fachtext, Kosten bei diesem Bestand vernachlässigbar). FTS-Entscheidung (an Claude Code delegiert): kombiniertes `to_tsvector('german', text) || to_tsvector('english', text)` statt `simple`+unaccent, weil Chunks nicht einzeln nach Sprache getaggt sind und Stemming in beiden Sprachen für den Recall wichtiger ist als die etwas größere Indexgröße. `chunks`-Tabelle mit RLS + Policy + GRANT (Lehre aus Paket-2-Bug in Phase 1 gleich mitgemacht), Unique-Index auf `(source_id, chunk_index)`. Getestet mit 3 echten Text-Chunks (Englisch, Deutsch, thematisch unpassend) und echten 1024-dim-Vektoren: Volltextsuche findet Stamm-Varianten in beiden Sprachen (`capability`→„capabilities", `strategie`→„Geschaeftsstrategie"), Vektorsuche liefert korrekte Distanz-Reihenfolge (0 → 0.18 → 25.27). Test-Chunks danach gelöscht.

## Paket 2 – Volltextextraktion (Worker) ☑

- Worker-Job: pro Quelle PDF laden, Text seitenweise extrahieren (PyMuPDF).
- Erkennung „keine/kaum Textebene" → OCR-Fallback (ocrmypdf), danach erneut extrahieren.
- Extraktionsstatus an der Quelle (`extracted`, `ocr_done`, `extraction_failed`).
- **Fertig, wenn:** 10 Testquellen (darunter mind. 1 Scan, falls vorhanden) sauber seitenweise extrahiert sind.

**Notizen:** Neue Spalten `extraction_status`/`extraction_hint` an `sources` (Migration 0008) - eigener Status, unabhängig vom Ingest-Status aus Phase 1. Systemvoraussetzungen auf diesem Rechner nachinstalliert: Tesseract OCR + Ghostscript per `winget` (Ghostscript-winget-Paket existierte nicht mehr unter der erwarteten ID, direkt vom offiziellen GitHub-Release geladen), deutsches Tesseract-Sprachpaket (`deu.traineddata`) zusätzlich zu Englisch nachgeladen. Da `Program Files` ohne Adminrechte nicht beschreibbar ist, liegen Sprachdaten + `configs`/`tessconfigs` in einem eigenen `worker/.tessdata/`-Verzeichnis (gitignored), `TESSDATA_PREFIX` wird vom Worker zur Laufzeit gesetzt; PATH für Tesseract/Ghostscript wird ebenfalls im Code ergänzt, da die Programme nach Neuinstallation in der laufenden Shell-Session noch nicht gefunden wurden. OCR-Erkennung: Durchschnitt < 30 Zeichen/Seite (erste Heuristik, gleiche Grössenordnung wie der Scan-Check aus Paket 0) löst `ocrmypdf --skip-text --language deu+eng` aus; OCR'te PDF ersetzt die Originaldatei im Bucket (Storage-`update`), damit auch der PDF-Viewer aus Phase-1-Paket-8 künftig durchsuchbaren Text zeigt. Test: kompletten Bestand laufen lassen (weit mehr als die geforderten 10) - 150 `extracted`, 1 `ocr_done` (der einzige echte Scan aus Paket 0, „Unraveling_the_Alignment_Parad.PDF": vorher 0 Zeichen/Seite, nach OCR Ø 5689 Zeichen/Seite, Text inhaltlich korrekt und lesbar), 0 Fehler; die 4 Quellen ohne PDF (graue Literatur) bleiben erwartungsgemäß ohne Extraktionsstatus. Wieder das bekannte kosmetische Zähl-Artefakt bei Hintergrund-Läufen beobachtet (Job-Ausgabe zählte nur 109 statt 151) - Datenbankstand direkt verifiziert und stimmt exakt, kein Datenfehler.

## Paket 3 – Chunking mit Seitenzuordnung ☑

- Chunking-Strategie: ca. 800–1200 Zeichen mit Überlappung, Schnitt bevorzugt an Absatzgrenzen; jeder Chunk trägt Seite + Index. Kapitel-/Abschnittsüberschrift, falls erkennbar, als Kontextpräfix.
- Seitenübergreifende Absätze: Chunk gehört zur Seite, auf der er beginnt.
- **Fertig, wenn:** Stichprobe zeigt: Chunks sind lesbar, Seitenangaben stimmen mit dem PDF überein (manuell 5 Fälle prüfen!).

**Notizen:** Absatzbasiertes Chunking (Volltext wird an Leerzeilen in Absätze zerlegt, zu lange Absätze zusätzlich an Wortgrenzen), Ziel 1000/max 1200 Zeichen, ~150 Zeichen Überlappung aus dem Ende des Vorgängerchunks. Seitenzuordnung über eine Offset-Landkarte (Volltext = alle Seiten aneinandergehängt, pro Zeichen-Offset ist die Ursprungsseite bekannt) - der Chunk bekommt die Seite seines ersten eigenen Absatzes (die vorangestellte Überlappung zählt dafür nicht mit), genau wie im Arbeitsplan gefordert. Überschriften-Heuristik: Zeilen mit deutlich größerer oder fetter Schrift als der Seiten-Median (PyMuPDF `get_text("dict")`-Fontinfo) gelten als Überschrift, die jeweils letzte bekannte wird als `[Kontext]`-Präfix vorangestellt - funktioniert gut bei echten Abschnittsüberschriften ("Introduction", "Theoretical background"), erzeugt auf Titel-/Deckblättern mit vielen groß gesetzten Elementen auch mal Rauschen (Autorennamen als "Überschrift") - laut Plan ausdrücklich "falls erkennbar", kein Anspruch auf Perfektion.

Zwei echte Bugs unterwegs gefunden und behoben: (1) Beim Aufsplitten überlanger Absätze wurden Text und Seiten-Offset vertauscht zurückgegeben - führte zu einem Typfehler, sobald ein Absatz über 1200 Zeichen vorkam. (2) Manche PDFs liefern NUL-Bytes (`\x00`) im extrahierten Text (kaputte/eingebettete Fonts) - Postgres' `text`-Typ akzeptiert das grundsätzlich nicht, betraf 2 von 151 Quellen; jetzt beim Einlesen herausgefiltert. Außerdem einen Performance-/Korrektheitsbug in der Dublettenprüfung des Jobs selbst gefunden: die Prüfung "ist diese Quelle schon gechunkt" holte anfangs alle `chunks.source_id` auf einmal, PostgREST liefert davon aber nur eine begrenzte Zeilenzahl zurück (Default-Seitengröße) - bei mittlerweile >18.000 Chunks wurden dadurch bereits fertige Quellen fälschlich erneut verarbeitet und liefen in den Unique-Constraint. Behoben durch gezielte Existenzprüfung pro Quelle statt Komplettabzug.

Test am kompletten Bestand (weit mehr als die 10 aus Paket 2): 151 Quellen, 18.886 Chunks erzeugt, 0 Fehler nach den Fixes. 5 Stichproben manuell gegen die Quelle geprüft (Hörimplantate-Buchkapitel, Aligning-IT-Portfolio-Journalartikel, der OCR'te Scan auf Seite 2, das deutsche Springer-Buch auf Seite 1+3, Amarilli et al. auf Seite 3) - Text durchgehend lesbar, Seitenangaben stimmen, Überlappung und Kontextpräfixe funktionieren wie vorgesehen.

## Paket 4 – Embeddings ☑

- **Entscheidung nötig (siehe unten):** Embedding-Anbieter. Vorschlag: Voyage AI (`voyage-3.5`) per API – starke Qualität auf wissenschaftlichem, gemischtsprachigem Text; Alternative kostenlos: `gte-small` via Supabase Edge Function (schwächer bei Deutsch/Englisch gemischt).
- Worker-Job: alle Chunks einbetten, Batch-weise, mit Wiederaufnahme bei Abbruch.
- **Fertig, wenn:** Kompletter Bestand eingebettet; Kostenkontrolle: einmaliger Lauf, Betrag notieren (bei ~100 Quellen erwartbar einstellig in Euro).

**Notizen:** Entscheidung war schon in Paket 1 vorgezogen worden (Voyage AI voyage-3.5, 1024 Dimensionen), hier nur noch umgesetzt. CLI-Subcommand `embed`: holt Chunks mit `embedding IS NULL` batchweise (100/Aufruf), `input_type="document"` (Gegenstück `"query"` kommt bei der Suche in Paket 5/6). Wiederaufnahme bei Abbruch ergibt sich von selbst aus der `IS NULL`-Abfrage, kein separater Checkpoint nötig. Ohne hinterlegte Zahlungsmethode erlaubt Voyage nur 3 Requests/Minute (Free Trial) - eigenes Pacing (21s zwischen Aufrufen) plus Retry-mit-Backoff bei 429 ergänzt, nachdem der erste Lauf sofort daran gescheitert war. Nutzer hat während des Laufs eine Zahlungsmethode hinterlegt (höheres Rate-Limit ab sofort für künftige Aufrufe), laufenden Job bewusst nicht neugestartet, um keine Wettlaufsituation um dieselben Chunks zu riskieren - Job lief mit dem ursprünglichen (langsameren) Pacing sicher durch.

Ergebnis: **18.886 von 18.886 Chunks eingebettet, 0 fehlend.** 5.389.072 Tokens verbraucht, macht bei $0.06/1 Mio. Token ca. **$0,32** - liegt komplett innerhalb von Voyages 200-Mio.-Token-Freikontingent für neue Accounts, tatsächliche Kosten also voraussichtlich $0.

## Paket 5 – Volltextsuche (Backend) ☑

- Suchfunktion (RPC/Edge Function): websearch-Syntax, Treffer mit Quelle, Seite, Snippet mit Hervorhebung (ts_headline), Ranking.
- Filter: Themenfeld (ab Phase 3), Ranking, Quellentyp, Studientyp.
- **Fertig, wenn:** Bekannte Begriffe („dynamic capabilities", deutscher Begriff aus einer grauen Quelle) liefern die erwarteten Stellen.

**Notizen:** Migration 0009 – Funktion `search_fulltext(search_query, filter_ranking_system, filter_type, match_limit)`, kombiniertes `websearch_to_tsquery('german', …) || websearch_to_tsquery('english', …)` passend zur `chunks.fts`-Spalte aus Paket 1, Rückgabe inkl. `ts_headline`-Snippet und `ts_rank`. Themenfeld-/Studientyp-Filter bewusst noch nicht implementiert (Schema dafür kommt erst in Phase 3). `revoke ... from public` + `grant execute ... to authenticated`, wie bei allen sicherheitsrelevanten Objekten in diesem Projekt.

Test: „dynamic capabilities" (Englisch) und „Risikostrategie" gefiltert auf `type=grau` (Deutsch) liefern beide die erwarteten Stellen mit korrektem Snippet/Hervorhebung/Seite.

Bei diesem Test als graue Testquelle zunächst eine erfundene Angabe verwendet ("Rundschreiben 5/2023 (VA)") – das existiert nicht und wäre ein Verstoß gegen das Belegbarkeits-Prinzip gewesen. Korrigiert auf die echte Quelle: BaFin-Rundschreiben 3/2009 (VA), "MaRisk VA" (2009, aufgehoben 2016), reales PDF von bafin.de nachgeladen.

Bei dieser echten Testquelle zwei zusätzliche, tiefere Fehlerklassen gefunden und behoben, die über den ursprünglichen Testfall hinaus für den gesamten Bestand relevant sind:
1. **OCR-Erkennung zu schwach:** reine Zeichenanzahl pro Seite erkennt keine kaputte Font-Kodierung (viele, aber falsch gemappte Zeichen). Ergänzt um einen Alphabetanteil-Schwellwert (`MIN_ALPHA_RATIO = 0.4`). Zusätzlich `--skip-text` durch `--force-ocr` ersetzt, weil `--skip-text` Seiten mit *irgendeiner* (auch kaputter) Textebene überspringt.
2. **Cloudflare-CDN-Cache-Bug:** Nach dem Überschreiben einer Storage-Datei (z. B. OCR ersetzt das Original) lieferte ein einfacher `download()` teils dauerhaft die alte Version zurück, obwohl der Upload serverseitig korrekt durchgelaufen war (per curl mit Cache-Buster-Query-Parameter und `CF-Cache-Status`-Header verifiziert). Behoben durch einen zentralen `download_pdf()`-Helper (`supabase_client.py`) mit zufälligem Cache-Buster-Query-Parameter bei jedem Download, in allen drei Aufrufern (`doi.py`, `chunking.py`, `fulltext.py`) verwendet.

Anschließend proaktiv den gesamten Bestand auf dieselbe Fehlerklasse geprüft (über den ursprünglichen Testfall hinaus, aber notwendig, um „Fertig, wenn"-Kriterium seriös zu erfüllen): 2 weitere Quellen gefunden mit sichtbar kaputten Umlauten (`949184f9…`/„BF03353515" und `95c74c8a…`/„Business Alignment Versicherungsfachwissen als Kompetenz der IT" – beide Duplikate desselben Aufsatzes, Gruhn/Ringel/Rosenbaum, ZVersWiss 95 (2006), DOI 10.1007/BF03353515). Hier liegt der Defekt nicht in der Textebene, sondern schon im gerenderten Bild der PDF-Seite selbst (kaputtes Font-Encoding im Original) – auch `--force-ocr` liest an den Umlaut-Stellen dieselbe Kodierungsstörung, weil OCR die tatsächlich gezeichneten (fehlerhaften) Pixel liest. Keine sauberere Version auffindbar (Springer-Artikel, paywalled). Beide Quellen als `extraction_status = 'extraction_failed'` mit erklärendem `extraction_hint` markiert statt fehlerhaften Text durchsuchbar/zitierbar zu machen (Belegbarkeits-Prinzip).

Da dieser Fehlerfall (Extraktion technisch „erfolgreich", Inhalt aber Müll) bisher nirgends in der UI sichtbar war – nur der Ingest-`status` aus Phase 1 wurde angezeigt, nicht `extraction_status`/`extraction_hint` –, auf Wunsch des Nutzers ergänzt: Bibliothek zeigt einen Sammel-Hinweis „📄⚠️ N Extraktionsfehler" (analog zum bestehenden „zu prüfen"-Hinweis) plus Icon je betroffener Zeile/Karte mit Tooltip; Detailseite zeigt eine ausführliche Warnbox mit dem `extraction_hint`-Text über dem PDF-Viewer. So kann der Nutzer selbst entscheiden, ob er die Datei ersetzt oder mit der Einschränkung lebt.

Bestandsweite Prüfung final: 148 `extracted`, 2 `ocr_done`, 2 `extraction_failed` (die zwei genannten Duplikate), 3 ohne PDF (keine Extraktion nötig) – macht zusammen alle 155 Quellen. `search_fulltext`-RPC danach erneut gegen den vollen Bestand getestet, funktioniert weiterhin korrekt.

## Paket 6 – Semantische Suche (Backend) ☑

- Query-Embedding + pgvector-Ähnlichkeitssuche (Cosine, Schwellwert, Top-k), gleiche Rückgabestruktur wie Paket 5.
- **Fertig, wenn:** Eine inhaltliche Frage („Wie wird Vertrauen zwischen Business und IT operationalisiert?") findet passende Stellen, die die Volltextsuche nicht findet.

**Notizen:** Migration 0010 – Funktion `search_semantic(query_embedding, filter_ranking_system, filter_type, match_limit, match_threshold)`, Cosine-Ähnlichkeit (`1 - (embedding <=> query_embedding)`) über den HNSW-Index aus Paket 1, gleiche Rückgabestruktur wie `search_fulltext` (Voraussetzung für die Zusammenführung in Paket 7). „snippet" ist hier der volle Chunk-Text ohne Hervorhebung, da es keine Suchbegriffe zum Markieren gibt.

Bewusste Scope-Abgrenzung: Das Query-Embedding selbst braucht den Voyage-Key, der niemals ins Frontend darf. Für dieses Paket reicht ein Python-Testwerkzeug (`worker/littool_worker/search.py`, CLI-Befehl `search-semantic "Frage"`); die dafür nötige serverseitige Vermittlung fürs Frontend (vermutlich eine Supabase Edge Function) ist Sache von Paket 8, wenn die Such-Ansicht tatsächlich gebaut wird. `embeddings.py:embed_batch` um einen `input_type`-Parameter erweitert (Default weiterhin `"document"` fürs Ingest, `"query"` für die neue `embed_query()"`-Funktion – Voyage optimiert beide Modi unterschiedlich, sogenannte asymmetrische Suche).

Echter Bug unterwegs gefunden: die erste Version von `search_semantic` (Migration 0010) lief beim ersten Test gegen den vollen Bestand (18.886 Chunks) in einen Postgres-Statement-Timeout, weil der optionale Schwellwert-Filter die Distanz ein zweites Mal in der WHERE-Klausel berechnete – der Planer konnte die „ORDER BY ... LIMIT"-Form dadurch nicht mehr sauber auf den HNSW-Index abbilden. Migration 0011 behebt das: die Nächste-Nachbarn-Suche läuft unverändert in einer inneren Subquery (Index wird genutzt), der Schwellwert filtert erst danach auf dem bereits kleinen Ergebnis. Zusätzlich stellte sich heraus, dass nach dem Bulk-Chunking/-Embedding noch kein `ANALYZE` auf `chunks` gelaufen war – veraltete Tabellenstatistik hätte den Planer auch bei korrekter Query-Form zu falschen Entscheidungen verleiten können; `VACUUM ANALYZE public.chunks` als Wartungsschritt ergänzt (keine eigene Migration, da keine Schemaänderung).

Nebenbei einen Absturz im CLI-Testbefehl behoben: Windows-Konsole (cp1252) kann nicht jedes Unicode-Zeichen aus Quellentiteln darstellen (z. B. U+2010-Bindestrich) – `sys.stdout` wird jetzt in `cli.py` auf UTF-8 mit Ersatzzeichen umgestellt, damit die Ausgabe nicht abstürzt.

Test bestanden: Die Beispielfrage „Wie wird Vertrauen zwischen Business und IT operationalisiert?" liefert per semantischer Suche 5 inhaltlich einschlägige Treffer zu Kommunikation, geteiltem Domänenwissen und sozialer Angleichung zwischen Business und IT – keiner enthält das Wort „Vertrauen" wörtlich. Die Volltextsuche nach „Vertrauen" liefert 5 komplett andere Quellen (Deloitte-Trendstudie, Digitalisierungsstrategie-Arbeit u. a.) – keine Überschneidung mit den semantischen Treffern, damit ist das Fertig-Kriterium klar erfüllt.

## Paket 7 – Hybrid-Ranking ☑

- Kombination beider Suchen per Reciprocal Rank Fusion (RRF); Modus wählbar: Hybrid (Standard) / nur Volltext / nur semantisch.
- **Fertig, wenn:** Hybrid liefert bei 5 Testfragen subjektiv die beste Trefferliste.

**Notizen:** Migration 0012 – Funktion `search_hybrid(search_query, query_embedding, filter_ranking_system, filter_type, match_limit, search_mode)`, `search_mode` ∈ {`hybrid` (Standard), `fulltext`, `semantic`}. RRF-Score je Treffer: 1/(60+Rang) pro Liste, bei Überschneidung aufsummiert (k=60, Standardwert aus der RRF-Literatur). Beide Kandidatenlisten (Volltext/semantisch) werden pro Aufruf auf `greatest(match_limit*3, 50)` begrenzt, bevor fusioniert wird. `search_query`/`query_embedding` bewusst beide nullable, damit z. B. der "nur Volltext"-Modus keine Voyage-Embedding-Berechnung braucht (spart den API-Call). Testwerkzeug analog Paket 5/6: `worker/littool_worker/search.py:run_hybrid_search` + CLI-Befehl `search-hybrid "Frage" [--mode hybrid|fulltext|semantic]`.

Ein echter Bug direkt beim Schreiben gefunden und noch vor dem ersten Test behoben: die Volltext-Kandidatenliste berechnete zwar einen `row_number()`-Rang, aber ohne explizites `ORDER BY` unmittelbar vor dem `LIMIT` - SQL garantiert dann nicht, dass die per Fensterfunktion ermittelten Top-Ränge auch tatsächlich die zurückgegebenen Zeilen sind. Ergänzt.

Test mit 5 Fragen, jeweils alle drei Modi verglichen:
1. „dynamic capabilities" (Englisch, präziser Fachbegriff) - Hybrid und Volltext liefern nahezu identische, klar einschlägige Trefferliste; semantisch findet zusätzlich einen thematisch passenden Klassiker (Teece/Pisano/Shuen 1997), der im Volltext-Fenster nicht auftaucht.
2. „Wie wird Vertrauen zwischen Business und IT operationalisiert?" (Deutsch, ganzer Satz) - **Volltext liefert 0 Treffer** (websearch_to_tsquery verundet alle Wörter eines ganzen Satzes, kein Chunk enthält sie alle) - Hybrid fällt sauber auf die semantischen Treffer zurück (identische RRF-Werte wie reines Semantik-Ranking, da nur ein Zweig beiträgt) und findet trotzdem 5 einschlägige Stellen zu Kommunikation/sozialer Angleichung.
3. „Risikostrategie" gefiltert auf `type=grau` (Deutsch, Fachbegriff) - Hybrid liefert exakt die erwarteten <mark>-hervorgehobenen Stellen aus der MaRisk-VA-Testquelle.
4. „IT governance maturity models" (Englisch, mittlere Präzision) - Hybrid liefert eine durchgehend einschlägige, stark hervorgehobene Trefferliste zu Reifegradmodellen.
5. „Wie beeinflusst Digitalisierung die Zusammenarbeit zwischen Fachbereich und IT?" (Deutsch, ganzer Satz) - wie bei Frage 2: Volltext 0 Treffer, Hybrid fällt auf semantische Treffer zurück, alle 5 inhaltlich einschlägig (IT-Organisation im Wandel, Business-IT-Integration, Silos).

Subjektives Fazit: Hybrid ist nie schlechter als der jeweils bessere Einzelmodus - bei präzisen Fachbegriffen deckt er sich mit der Volltextsuche, bei natürlichsprachigen Fragen (2 von 5 Testfragen, und vermutlich der Regelfall für echte Recherchefragen dieser Arbeit) rettet er die Suche komplett, wo die Volltextsuche allein leer ausgeht. Damit klar die beste Standardeinstellung.

## Paket 8 – Such-Ansicht (Frontend) ☐

- UI gemäß Wireframe: Suchfeld, Modus-Umschalter, Filter, Trefferkarten (Snippet mit Markierung, Kurzzitation, Seite, Ranking, PDF-Sprung zur Fundstelle).
- Globale Schnellsuche oben rechts springt hierher.
- Mobil vollwertig (Karten, Filter als Bottom-Sheet).
- **Fertig, wenn:** Suche fühlt sich am Desktop und am Handy schnell und brauchbar an.

## Paket 9 – Backfill & Qualitätscheck ☐

- Gesamten Bestand durch Extraktion → Chunking → Embedding laufen lassen; Fehlerfälle abarbeiten.
- Qualitätscheck mit 10 Stichproben: bekannte Textstellen suchen, Seitenangabe im PDF verifizieren, PDF-Sprung testen.
- **Fertig, wenn:** Der komplette reale Bestand durchsuchbar ist → Phase 2 abgeschlossen. 🎉

---

## Entscheidung vor Paket 4: Embedding-Anbieter

| Option | Qualität | Kosten | Aufwand |
|---|---|---|---|
| **Voyage AI voyage-3.5 (Empfehlung)** | sehr gut, mehrsprachig | einmalig wenige Euro für den Bestand, danach Cent-Beträge | API-Key nötig |
| gte-small via Supabase Edge Function | okay, schwächer bei DE/EN gemischt | kostenlos | kein externer Dienst |

Wichtig: Anbieter einmal wählen und dabei bleiben – ein Wechsel bedeutet komplettes Neu-Einbetten (bei diesem Bestand aber verkraftbar).

## Danach

Arbeitsplan Phase 3 (Forschungsfragen, Themen-Zuordnung, Passagen, Übersetzung, Paraphrase, Methodenprofile, QS-Workflow) im Chat erstellen – dort fällt auch die Entscheidung „Übersetzung on demand vs. vorab".
