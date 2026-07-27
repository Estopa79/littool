import { supabase } from './supabase'

export type AiLogTableRow = {
  id: string
  createdAt: string
  datum: string
  kiInstrument: string
  verwendung: string
  kritischePruefung: string
  betroffeneStelle: string
}

const KI_INSTRUMENT = 'Claude (claude-sonnet-4-6)'

type RawRow = {
  id: string
  action_type: string
  description: string
  created_at: string
  sources: { title: string } | null
  passages: { sources: { title: string } | null } | null
}

function formatDatum(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

// Standardtext je Aktionstyp statt individuellem Freitext - die "kritische
// Ueberpruefung" beschreibt den tatsaechlich verdrahteten Pruefmechanismus
// (QS-Workflow, Bestaetigen-Dialoge), keine erfundene Einzelfall-Begruendung.
// Nicht erkannte Faelle werden sichtbar markiert statt geraten (CLAUDE.md,
// Belegbarkeits-Prinzip).
function classify(
  row: RawRow,
  sourceTitle: string | null,
): { verwendung: string; kritischePruefung: string; betroffeneStelle: string } {
  const d = row.description
  const quelle = sourceTitle ? `Quelle: ${sourceTitle}` : '?'

  if (row.action_type === 'passagen_extraktion') {
    const rqCode = d.match(/^(\S+):/)?.[1] ?? '?'
    return {
      verwendung: `Zitat-Kandidaten erzeugt (${d})`,
      kritischePruefung:
        'Automatischer Textabgleich der Kandidaten gegen den PDF-Chunk bei der Erzeugung (nicht nachweisbare Kandidaten werden verworfen); verbleibende Kandidaten werden zusätzlich manuell im PDF-Viewer geprüft und über die Prüfen-Ansicht einzeln bestätigt oder verworfen.',
      betroffeneStelle: sourceTitle ? `Quelle: ${sourceTitle} (FF ${rqCode})` : `FF ${rqCode}`,
    }
  }

  if (row.action_type === 'methodenprofil') {
    return {
      verwendung: d,
      kritischePruefung:
        'Vorschlag wird auf der Quellen-Detailseite gegen den Methodenteil der Quelle geprüft und über einen Bestätigen-Button freigegeben.',
      betroffeneStelle: quelle,
    }
  }

  if (row.action_type === 'paraphrase') {
    return {
      verwendung: 'Paraphrase eines Zitats erzeugt',
      kritischePruefung:
        'Vorschlag wird gegen den Originaltext geprüft und erst durch manuelles Übernehmen freigegeben; unpassende Vorschläge werden verworfen.',
      betroffeneStelle: quelle,
    }
  }

  if (/^Funktion vorgeschlagen:/.test(d)) {
    return {
      verwendung: d,
      kritischePruefung:
        'Vorschlag wird in Bibliothek/Quellen-Detail gegen den Inhalt der Quelle geprüft und über einen Bestätigen-/Ändern-Dialog freigegeben.',
      betroffeneStelle: quelle,
    }
  }
  if (/Themenfeld\(er\) zugeordnet/.test(d)) {
    return {
      verwendung: d,
      kritischePruefung:
        'Themen- und Relevanz-Zuordnung werden in der Prüfen-Ansicht einzeln gegen den Inhalt der Quelle geprüft, korrigiert oder bestätigt.',
      betroffeneStelle: quelle,
    }
  }
  if (/^\d+ Kriterien bewertet$/.test(d)) {
    return {
      verwendung: d,
      kritischePruefung:
        'Bewertung je Kriterium wird in der Evaluationsmatrix gegen den Inhalt der Quelle geprüft und ggf. manuell korrigiert.',
      betroffeneStelle: quelle,
    }
  }
  if (/^\d+ Evaluationskriterien vorgeschlagen$/.test(d)) {
    return {
      verwendung: d,
      kritischePruefung:
        'Kriterien-Vorschläge werden einzeln gegen Forschungsfragen und Themenfelder geprüft; nicht passende Kriterien werden gelöscht oder umformuliert.',
      betroffeneStelle: 'Gesamter Quellenbestand (Kriterien-Set)',
    }
  }
  if (d === 'Deskriptionsmatrix-Eintrag vorgeschlagen') {
    return {
      verwendung: d,
      kritischePruefung:
        'Vorschlag wird in der Deskriptionsmatrix zellenweise gegen den Inhalt der Quelle geprüft und manuell korrigiert.',
      betroffeneStelle: quelle,
    }
  }

  return {
    verwendung: d,
    kritischePruefung: '[Kritische Überprüfung nicht automatisch klassifizierbar - bitte manuell ergänzen]',
    betroffeneStelle: quelle,
  }
}

export async function fetchAiLogEntries(): Promise<AiLogTableRow[]> {
  const { data, error } = await supabase
    .from('ai_log_entries')
    .select(
      `id, action_type, description, created_at,
       sources ( title ),
       passages ( sources ( title ) )`,
    )
    .order('created_at', { ascending: true })
  if (error) throw error

  return (data as unknown as RawRow[]).map((row) => {
    const sourceTitle = row.sources?.title ?? row.passages?.sources?.title ?? null
    const { verwendung, kritischePruefung, betroffeneStelle } = classify(row, sourceTitle)
    return {
      id: row.id,
      createdAt: row.created_at,
      datum: formatDatum(row.created_at),
      kiInstrument: KI_INSTRUMENT,
      verwendung,
      kritischePruefung,
      betroffeneStelle,
    }
  })
}

export function monthKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 1)))
}
