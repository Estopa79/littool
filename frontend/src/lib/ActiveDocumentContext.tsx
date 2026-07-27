import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'

export type DocumentRow = { id: string; type: string; title: string; status: string }

const STORAGE_KEY = 'littool.activeDocumentId'
const TYPE_ORDER = ['isp', 'expose', 'dissertation']

type ActiveDocumentContextValue = {
  documents: DocumentRow[]
  activeDocumentId: string | null
  setActiveDocumentId: (id: string) => void
  isUsed: (passageId: string) => boolean
  toggleUsed: (passageId: string) => Promise<void>
}

const ActiveDocumentContext = createContext<ActiveDocumentContextValue | undefined>(undefined)

// Haekchen gelten pro Dokument (used_citations.document_id) - der komplette
// Satz verwendeter passage_ids des aktiven Dokuments wird einmal je
// Dokumentwechsel geladen (Bestandsgroesse macht Einzelabfragen pro Karte
// unnoetig, gleiches Muster wie qsReview.ts).
export function ActiveDocumentProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [activeDocumentId, setActiveDocumentIdState] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  )
  const [usedPassageIds, setUsedPassageIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase
      .from('documents')
      .select('id, type, title, status')
      .then(({ data, error }) => {
        if (error || !data) return
        const rows = (data as DocumentRow[]).sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))
        setDocuments(rows)
        setActiveDocumentIdState((prev) => (prev && rows.some((d) => d.id === prev) ? prev : (rows[0]?.id ?? null)))
      })
  }, [])

  useEffect(() => {
    if (!activeDocumentId) {
      setUsedPassageIds(new Set())
      return
    }
    supabase
      .from('used_citations')
      .select('passage_id')
      .eq('document_id', activeDocumentId)
      .then(({ data, error }) => {
        if (error || !data) return
        setUsedPassageIds(new Set(data.map((r) => r.passage_id as string)))
      })
  }, [activeDocumentId])

  function setActiveDocumentId(id: string) {
    localStorage.setItem(STORAGE_KEY, id)
    setActiveDocumentIdState(id)
  }

  function isUsed(passageId: string) {
    return usedPassageIds.has(passageId)
  }

  async function toggleUsed(passageId: string) {
    if (!activeDocumentId) return
    const wasUsed = usedPassageIds.has(passageId)

    setUsedPassageIds((prev) => {
      const next = new Set(prev)
      if (wasUsed) next.delete(passageId)
      else next.add(passageId)
      return next
    })

    const { error } = wasUsed
      ? await supabase.from('used_citations').delete().eq('passage_id', passageId).eq('document_id', activeDocumentId)
      : await supabase.from('used_citations').insert({ passage_id: passageId, document_id: activeDocumentId })

    if (error) {
      // Revert bei Fehler - der Haken darf nie faelschlich als gesetzt/entfernt angezeigt werden.
      setUsedPassageIds((prev) => {
        const next = new Set(prev)
        if (wasUsed) next.add(passageId)
        else next.delete(passageId)
        return next
      })
      throw error
    }
  }

  return (
    <ActiveDocumentContext.Provider
      value={{ documents, activeDocumentId, setActiveDocumentId, isUsed, toggleUsed }}
    >
      {children}
    </ActiveDocumentContext.Provider>
  )
}

export function useActiveDocument() {
  const ctx = useContext(ActiveDocumentContext)
  if (!ctx) {
    throw new Error('useActiveDocument muss innerhalb von ActiveDocumentProvider verwendet werden')
  }
  return ctx
}
