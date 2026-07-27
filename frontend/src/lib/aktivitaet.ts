import { supabase } from './supabase'

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

// "Aktive Tage" werden aus mehreren, unabhaengig voneinander zuverlaessig
// datierten Aktionen abgeleitet (Upload, jede KI-Aktion, Verwendet-Haekchen,
// QS-Bestaetigung von Relevanz/Zitaten via updated_at). Reine Bestaetigungen
// an Themenfeld/Funktion/Methodenprofil haben keine eigene Zeitstempel-Spalte
// und fehlen deshalb - abgestimmt mit dem Nutzer als akzeptable Luecke fuer
// eine Gedaechtnisstuetze, kein Audit-Anspruch.
async function fetchColumn(table: string, column: string): Promise<string[]> {
  const { data, error } = await supabase.from(table).select(column)
  if (error) throw error
  return (data ?? [])
    .map((row) => (row as unknown as Record<string, string | null>)[column])
    .filter((v): v is string => !!v)
}

function toLocalDateKey(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function fetchActiveDates(): Promise<Set<string>> {
  const lists = await Promise.all([
    fetchColumn('sources', 'created_at'),
    fetchColumn('ai_log_entries', 'created_at'),
    fetchColumn('used_citations', 'used_at'),
    fetchColumn('source_rq_relevance', 'updated_at'),
    fetchColumn('passages', 'updated_at'),
  ])
  return new Set(lists.flat().map(toLocalDateKey))
}

export function monthKeyOfDate(dateKey: string): string {
  return dateKey.slice(0, 7)
}

export function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
}

// ISO-8601-Kalenderwoche (Woche mit dem ersten Donnerstag des Jahres = KW1).
function isoWeek(dateKey: string): { year: number; week: number } {
  const d = new Date(`${dateKey}T00:00:00`)
  const target = new Date(d.getTime())
  target.setDate(d.getDate() + 4 - (d.getDay() || 7))
  const yearStart = new Date(target.getFullYear(), 0, 1)
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year: target.getFullYear(), week }
}

export type WeekRow = { key: string; label: string; weekdays: boolean[]; count: number }

export function groupByWeek(datesInMonth: string[]): WeekRow[] {
  const weeks = new Map<string, boolean[]>()
  for (const dateKey of datesInMonth) {
    const { year, week } = isoWeek(dateKey)
    const key = `${year}-KW${week}`
    const flags = weeks.get(key) ?? [false, false, false, false, false, false, false]
    const weekdayIndex = (new Date(`${dateKey}T00:00:00`).getDay() + 6) % 7 // Mo=0 .. So=6
    flags[weekdayIndex] = true
    weeks.set(key, flags)
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, weekdays]) => ({
      key,
      label: key.split('-')[1],
      weekdays,
      count: weekdays.filter(Boolean).length,
    }))
}

export function buildCopyText(monthLbl: string, weeks: WeekRow[], total: number): string {
  const lines = [monthLbl]
  for (const w of weeks) {
    const active = WEEKDAY_LABELS.filter((_, i) => w.weekdays[i])
    lines.push(`${w.label}: ${active.join(', ')} (${w.count} ${w.count === 1 ? 'Tag' : 'Tage'})`)
  }
  lines.push(`Gesamt: ${total} aktive ${total === 1 ? 'Tag' : 'Tage'}`)
  return lines.join('\n')
}

export { WEEKDAY_LABELS }
