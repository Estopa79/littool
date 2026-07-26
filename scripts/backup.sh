#!/usr/bin/env bash
# Datensicherung (CLAUDE.md: Pflicht) - DB-Dump + PDF-Bucket-Sync des
# verlinkten Supabase-Projekts. Voraussetzung: `npx supabase login` +
# `npx supabase link` sind bereits einmalig erledigt (siehe
# docs/notizen-phase-1-2.md). Laeuft komplett gegen das Remote-Projekt
# (--linked), kein lokaler Supabase-Stack noetig.
#
# Aufruf: ./scripts/backup.sh
# Woechentlich ausfuehren (Erinnerung/Kalendereintrag) und vor jeder Migration.

set -euo pipefail
cd "$(dirname "$0")/.."

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups/${TIMESTAMP}"
mkdir -p "${BACKUP_DIR}"

echo "== DB-Dump (Schema) =="
# `supabase db dump --linked` ist per Default IMMER --schema-only (keine
# Zeilendaten) - Schema liegt ohnehin schon versioniert in
# supabase/migrations/, hier nur als zusaetzliche Absicherung/Referenzstand.
npx supabase db dump --linked -f "${BACKUP_DIR}/schema.sql"

echo "== DB-Dump (Daten) =="
# Die eigentlich schuetzenswerten Zeilendaten (Quellen, Chunks+Embeddings,
# Passagen, ...) - --use-copy fuer effizienten Export der grossen Tabellen.
npx supabase db dump --linked --data-only --use-copy -f "${BACKUP_DIR}/data.sql"

echo "== PDF-Bucket-Sync (pdfs) =="
npx supabase storage cp -r --linked --experimental "ss:///pdfs" "${BACKUP_DIR}/pdfs"

echo "== Backup fertig: ${BACKUP_DIR} =="
