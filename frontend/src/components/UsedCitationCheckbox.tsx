import { useState } from 'react'
import { useActiveDocument } from '../lib/ActiveDocumentContext'

export function UsedCitationCheckbox({ passageId }: { passageId: string }) {
  const { activeDocumentId, isUsed, toggleUsed } = useActiveDocument()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)

  async function handleChange() {
    setPending(true)
    setError(false)
    try {
      await toggleUsed(passageId)
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  if (!activeDocumentId) return null

  return (
    <label className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
      <input
        type="checkbox"
        checked={isUsed(passageId)}
        disabled={pending}
        onChange={handleChange}
        className="disabled:opacity-60"
      />
      verwendet
      {error && (
        <span className="text-red-600 dark:text-red-400" title="Speichern fehlgeschlagen">
          ✗
        </span>
      )}
    </label>
  )
}
