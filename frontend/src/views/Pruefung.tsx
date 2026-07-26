import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchReviewCounts, type ReviewCount } from '../lib/qsReview'

export function Pruefung() {
  const [counts, setCounts] = useState<ReviewCount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchReviewCounts()
      .then(setCounts)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <Link to="/bibliothek" className="text-sm text-slate-500 hover:underline dark:text-slate-400">
        ← Zurück zur Bibliothek
      </Link>
      <h1 className="mb-4 mt-2 text-xl font-semibold text-slate-800 dark:text-slate-100">
        Unbestätigte KI-Zuordnungen
      </h1>

      {loading && <p className="text-sm text-slate-400">Lädt …</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">Fehler: {error}</p>}

      {!loading && !error && counts.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">🎉 Alles bestätigt - nichts zu prüfen.</p>
      )}

      {!loading && !error && counts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {counts.map((c) => (
            <li key={c.source_id}>
              <Link
                to={`/pruefen/${c.source_id}`}
                className="flex items-center justify-between rounded-md border border-slate-200 p-3 text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
              >
                <span className="truncate text-slate-800 dark:text-slate-100">{c.title}</span>
                <span className="ml-2 shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  {c.count} unbestätigt
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
