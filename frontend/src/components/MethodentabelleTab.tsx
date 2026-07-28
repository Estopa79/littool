import { useEffect, useMemo, useState } from 'react'
import { fetchSources, type Source } from '../lib/sources'
import { fetchAllSourceTopics, fetchAllTopics, type TopicOption } from '../lib/qsReview'
import { fetchAllMethodProfiles, STUDY_TYPE_LABEL, type MethodProfile, type StudyType } from '../lib/methodProfiles'
import { formatAuthorYear, TYPE_LABEL } from '../lib/sourceFormat'
import { copyTableToClipboard, downloadCsv } from '../lib/copyTable'

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Alle Typen' },
  ...Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
]

const RANKING_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Alle Rankings' },
  { value: 'VHB', label: 'VHB' },
  { value: 'SJR', label: 'SJR' },
  { value: 'CORE', label: 'CORE' },
  { value: 'kein Ranking', label: 'Kein Ranking' },
]

const STUDY_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Alle Studientypen' },
  ...Object.entries(STUDY_TYPE_LABEL).map(([value, label]) => ({ value, label })),
]

type Row = Source & Partial<MethodProfile>

const COLUMNS = ['Autor/Jahr', 'Titel', 'Studientyp', 'Methode', 'Datengrundlage/Stichprobe', 'Auswertungsverfahren']

function rowValues(r: Row): string[] {
  return [
    formatAuthorYear(r),
    r.title,
    r.study_type ? STUDY_TYPE_LABEL[r.study_type] : '',
    r.method ?? '',
    r.data_basis ?? '',
    r.analysis_method ?? '',
  ]
}

export function MethodentabelleTab() {
  const [sources, setSources] = useState<Source[]>([])
  const [profiles, setProfiles] = useState<Map<string, MethodProfile>>(new Map())
  const [allTopics, setAllTopics] = useState<TopicOption[]>([])
  const [sourceIdsByTopic, setSourceIdsByTopic] = useState<Map<string, Set<string>>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterType, setFilterType] = useState('')
  const [filterRanking, setFilterRanking] = useState('')
  const [filterTopic, setFilterTopic] = useState('')
  const [filterStudyType, setFilterStudyType] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  useEffect(() => {
    Promise.all([fetchSources(), fetchAllMethodProfiles()])
      .then(([srcs, profileRows]) => {
        setSources(srcs)
        setProfiles(new Map(profileRows.map((p) => [p.source_id, p])))
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
    fetchAllTopics().then(setAllTopics)
    fetchAllSourceTopics().then((rows) => {
      const map = new Map<string, Set<string>>()
      for (const row of rows) {
        if (!map.has(row.topic_id)) map.set(row.topic_id, new Set())
        map.get(row.topic_id)!.add(row.source_id)
      }
      setSourceIdsByTopic(map)
    })
  }, [])

  const rows: Row[] = useMemo(
    () => sources.map((s) => ({ ...s, ...profiles.get(s.id) })),
    [sources, profiles],
  )

  const visible = useMemo(() => {
    let result = rows
    if (filterType) result = result.filter((r) => r.type === filterType)
    if (filterRanking === 'kein Ranking') result = result.filter((r) => !r.ranking_system)
    else if (filterRanking) result = result.filter((r) => r.ranking_system === filterRanking)
    if (filterTopic) {
      const ids = sourceIdsByTopic.get(filterTopic) ?? new Set()
      result = result.filter((r) => ids.has(r.id))
    }
    if (filterStudyType) result = result.filter((r) => r.study_type === (filterStudyType as StudyType))
    return [...result].sort((a, b) => formatAuthorYear(a).localeCompare(formatAuthorYear(b)))
  }, [rows, filterType, filterRanking, filterTopic, filterStudyType, sourceIdsByTopic])

  async function handleCopy() {
    const ok = await copyTableToClipboard(COLUMNS, visible.map(rowValues))
    setCopyState(ok ? 'copied' : 'error')
    setTimeout(() => setCopyState('idle'), 1500)
  }

  function handleExportCsv() {
    downloadCsv(COLUMNS, visible.map(rowValues), 'methodentabelle.csv')
  }

  if (loading) return <p className="text-sm text-slate-400">Lädt …</p>
  if (error) return <p className="text-sm text-red-600 dark:text-red-400">Fehler: {error}</p>

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        Quellen × Methodenprofil (Studientyp, Methode, Datengrundlage/Stichprobe, Auswertungsverfahren) - als
        kopierbare Word-Tabelle oder CSV für den Methodik-/Literaturreview-Teil der Arbeit.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={filterRanking}
          onChange={(e) => setFilterRanking(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          {RANKING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={filterTopic}
          onChange={(e) => setFilterTopic(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Alle Themenfelder</option>
          {allTopics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={filterStudyType}
          onChange={(e) => setFilterStudyType(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          {STUDY_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {copyState === 'copied' ? '✓ kopiert' : copyState === 'error' ? '✗ fehlgeschlagen' : '📋 Als Word-Tabelle kopieren'}
        </button>
        <button
          type="button"
          onClick={handleExportCsv}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          ⬇ CSV exportieren
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="w-32 py-2 pr-3 font-medium">Autor/Jahr</th>
              <th className="w-56 py-2 pr-3 font-medium">Titel</th>
              <th className="w-28 py-2 pr-3 font-medium">Studientyp</th>
              <th className="w-32 py-2 pr-3 font-medium">Methode</th>
              <th className="w-40 py-2 pr-3 font-medium">Datengrundlage/Stichprobe</th>
              <th className="w-40 py-2 pr-3 font-medium">Auswertungsverfahren</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 align-top dark:border-slate-900">
                <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{formatAuthorYear(r)}</td>
                <td className="py-2 pr-3 text-slate-800 dark:text-slate-100">{r.title}</td>
                <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">
                  {r.study_type ? STUDY_TYPE_LABEL[r.study_type] : '–'}
                </td>
                <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{r.method ?? '–'}</td>
                <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{r.data_basis ?? '–'}</td>
                <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{r.analysis_method ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="mt-3 text-sm text-slate-400">Keine Quellen für diese Filter.</p>}
      </div>
      <p className="mt-2 text-xs text-slate-400">{visible.length} Quellen</p>
    </div>
  )
}
