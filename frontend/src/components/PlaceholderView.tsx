type PlaceholderViewProps = {
  titel: string
  beschreibung: string
}

export function PlaceholderView({ titel, beschreibung }: PlaceholderViewProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">{titel}</h1>
      <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">{beschreibung}</p>
    </div>
  )
}
