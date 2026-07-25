import { useRef, useState } from 'react'

type UploadDropzoneProps = {
  onFiles: (files: File[]) => void
}

export function UploadDropzone({ onFiles }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    onFiles(Array.from(fileList))
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        handleFiles(e.dataTransfer.files)
      }}
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
        dragOver
          ? 'border-slate-500 bg-slate-100 dark:border-slate-400 dark:bg-slate-800'
          : 'border-slate-300 dark:border-slate-700'
      }`}
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">PDFs hierher ziehen</p>
      <p className="text-xs text-slate-400 dark:text-slate-500">oder</p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        Dateien auswählen
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
