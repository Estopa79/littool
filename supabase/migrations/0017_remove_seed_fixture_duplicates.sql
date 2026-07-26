-- Phase 3, Paket 3: Aufraeumen verwaister Testdatensaetze
--
-- 0004_sources_seed.sql (Phase 1, Paket 2) fuegte drei "Testquellen (Fixtures,
-- keine echten Bestandsdaten)" direkt in die produktive sources-Tabelle ein.
-- Beim spaeteren echten Stapel-Upload (Phase 1, Paket 10) wurde die Teece-2007-
-- Quelle zusaetzlich mit echtem PDF hochgeladen (echte Dublette, dokumentiert
-- in notizen-phase-1-2.md) - die anderen beiden (Wagner 2014, BaFin-Merkblatt)
-- blieben als Karteileichen ohne PDF/Chunks stehen und wurden bei der
-- Kalibrierung in Paket 3 (Themen-/Relevanz-Analyse) als Zufallsfund entdeckt.
--
-- Alle drei geprueft: kein storage_path, keine chunks, keine source_topics/
-- source_rq_relevance/ai_log_entries - unbedenklich zu loeschen (on delete
-- cascade wuerde ohnehin nichts Reales mitreissen).

delete from public.sources
where id in (
  'f73bc0d7-3ca0-433c-a220-abfba1c67529', -- Fixture-Dublette "Explicating Dynamic Capabilities" (Teece 2007)
  '95108092-f824-4a27-ac9c-53b2c43473b6', -- Fixture "How Social Capital ..." (Wagner et al. 2014), nie mit echtem PDF ersetzt
  '875fc6e2-6480-43de-a542-e16243cfc8d9'  -- Fixture "Merkblatt zur Auslagerung von Versicherungsunternehmen", nie mit echtem PDF ersetzt
);
