import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActiveDocument } from '../lib/ActiveDocumentContext'
import { UsedCitationCheckbox } from '../components/UsedCitationCheckbox'
import { CitationCopyButtons } from '../components/CitationCopyButtons'
import { fetchUsedCitations, type UsedCitationEntry } from '../lib/usedCitations'
import { formatAuthorYear } from '../lib/sourceFormat'
import { fetchUsedSources, buildLiteratureList, type LiteratureEntry } from '../lib/literatureList'

type GroupBy = 'source' | 'rq'

function CitationCard({ entry }: { entry: UsedCitationEntry }) {
  return (
    <li className="rounded-md border border-slate-100 p-2 text-sm dark:border-slate-800">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {entry.rq_code}
        </span>
        <Link
          to={`/bibliothek/${entry.source_id}?page=${entry.page}`}
          className="text-xs text-slate-500 hover:underline dark:text-slate-400"
        >
          PDF S. {entry.page} →
        </Link>
      </div>
      <p className="italic text-slate-700 dark:text-slate-300">„{entry.original}"</p>
      {entry.translation && <p className="mt-1 text-slate-600 dark:text-slate-400">{entry.translation}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-slate-500 dark:text-slate-500">{entry.citation}</span>
        <CitationCopyButtons
          original={entry.original}
          translation={entry.translation}
          paraphrase={entry.paraphrase}
          citation={entry.citation}
        />
        <UsedCitationCheckbox passageId={entry.passage_id} />
      </div>
    </li>
  )
}

function CitationGroup({ label, entries }: { label: string; entries: UsedCitationEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <li className="border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left text-sm font-medium text-slate-700 dark:text-slate-300"
      >
        <span>
          {expanded ? '▾' : '▸'} {label}
        </span>
        <span className="text-xs font-normal text-slate-400">
          {entries.length} {entries.length === 1 ? 'Zitat' : 'Zitate'}
        </span>
      </button>
      {expanded && (
        <ul className="mt-2 flex flex-col gap-2 pl-4">
          {entries.map((e) => (
            <CitationCard key={e.passage_id} entry={e} />
          ))}
        </ul>
      )}
    </li>
  )
}

function LiteratureEntryRow({ entry }: { entry: LiteratureEntry }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  async function copyEntry() {
    try {
      await navigator.clipboard.writeText(entry.text)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
    setTimeout(() => setCopyState('idle'), 1500)
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-slate-100 p-2 text-sm dark:border-slate-800">
      <p className="flex-1 text-slate-700 dark:text-slate-300">{entry.text}</p>
      <button
        type="button"
        onClick={copyEntry}
        className="shrink-0 text-xs text-slate-500 hover:underline dark:text-slate-400"
      >
        {copyState === 'copied' ? '✓ kopiert' : copyState === 'error' ? '✗ fehlgeschlagen' : 'kopieren'}
      </button>
    </li>
  )
}

function LiteraturverzeichnisSection({ documentId }: { documentId: string }) {
  const [entries, setEntries] = useState<LiteratureEntry[] | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copyAllState, setCopyAllState] = useState<'idle' | 'copied' | 'error'>('idle')

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      const sources = await fetchUsedSources(documentId)
      setEntries(buildLiteratureList(sources))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  async function copyAll() {
    if (!entries) return
    try {
      await navigator.clipboard.writeText(entries.map((e) => e.text).join('\n\n'))
      setCopyAllState('copied')
    } catch {
      setCopyAllState('error')
    }
    setTimeout(() => setCopyAllState('idle'), 1500)
  }

  return (
    <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
      <button
        type="button"
        disabled={generating}
        onClick={handleGenerate}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        📋 {generating ? 'Erzeugt …' : 'Literaturverzeichnis erzeugen'}
      </button>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Alphabetisch nach Erstautor, APA 7.</p>

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">Fehler: {error}</p>}

      {entries && (
        <>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {entries.length} {entries.length === 1 ? 'Eintrag' : 'Einträge'}
            </span>
            <button
              type="button"
              onClick={copyAll}
              className="text-xs text-slate-600 hover:underline dark:text-slate-300"
            >
              {copyAllState === 'copied'
                ? '✓ kopiert'
                : copyAllState === 'error'
                  ? '✗ fehlgeschlagen'
                  : 'Ganzes Verzeichnis kopieren'}
            </button>
          </div>
          {entries.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Keine verwendeten Zitate für dieses Dokument.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {entries.map((entry) => (
                <LiteratureEntryRow key={entry.sourceId} entry={entry} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

export function Verwendet() {
  const { activeDocumentId, isUsed } = useActiveDocument()
  const [entries, setEntries] = useState<UsedCitationEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<GroupBy>('source')

  useEffect(() => {
    if (!activeDocumentId) return
    setLoading(true)
    setError(null)
    fetchUsedCitations(activeDocumentId)
      .then(setEntries)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [activeDocumentId])

  // Abhaken direkt in dieser Ansicht entfernt den Eintrag ueber den geteilten
  // ActiveDocumentContext - kein erneutes Laden noetig, `isUsed` filtert die
  // schon geladene Liste live.
  const visible = entries.filter((e) => isUsed(e.passage_id))
  const sourceCount = new Set(visible.map((e) => e.source_id)).size

  const groupMap = new Map<string, { label: string; entries: UsedCitationEntry[] }>()
  for (const e of visible) {
    const key = groupBy === 'source' ? e.source_id : e.research_question_id
    const label = groupBy === 'source' ? formatAuthorYear(e) : e.rq_code
    const existing = groupMap.get(key)
    if (existing) existing.entries.push(e)
    else groupMap.set(key, { label, entries: [e] })
  }
  const groups = [...groupMap.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.label.localeCompare(b.label))

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-1 text-lg font-semibold text-slate-800 dark:text-slate-100">Verwendet</h1>

      {!activeDocumentId ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Kein Dokument ausgewählt.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
            {visible.length} verwendete {visible.length === 1 ? 'Zitat' : 'Zitate'} aus {sourceCount}{' '}
            {sourceCount === 1 ? 'Quelle' : 'Quellen'}
          </p>

          <div className="mb-4 flex items-center gap-4 text-sm text-slate-700 dark:text-slate-300">
            <span className="text-slate-500 dark:text-slate-400">Gruppierung:</span>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="group-by"
                checked={groupBy === 'source'}
                onChange={() => setGroupBy('source')}
              />
              Quelle
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="group-by" checked={groupBy === 'rq'} onChange={() => setGroupBy('rq')} />
              Forschungsfrage
            </label>
          </div>

          {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">Fehler: {error}</p>}
          {loading && <p className="text-sm text-slate-400">Lädt …</p>}

          {!loading && visible.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Noch keine verwendeten Zitate für dieses Dokument. Häkchen setzt du in der Forschungsfragen-Ansicht
              oder an der Quelle.
            </p>
          )}

          <ul className="flex flex-col">
            {groups.map((g) => (
              <CitationGroup key={g.key} label={g.label} entries={g.entries} />
            ))}
          </ul>

          <LiteraturverzeichnisSection documentId={activeDocumentId} />
        </>
      )}
    </div>
  )
}
