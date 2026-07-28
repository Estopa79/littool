// Phase 5, Paket 0: dezenter, permanenter Hinweis ueber dem Drei-Spalten-
// Bereich - kein Modal/Toast, da dauerhaft sichtbar gefordert (s. Notizen zu
// Paket 0 im Arbeitsplan). Erst hier eingebunden, weil die Drei-Spalten-
// Ansicht (Paket 4) der erste tatsaechliche Einbauort ist.
export function DraftNoticeBanner() {
  return (
    <p className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 sm:px-6">
      Entwürfe sind KI-Vorschläge – prüfen, umformulieren, verantworten. Nutzung wird im KI-Verzeichnis protokolliert.
    </p>
  )
}
