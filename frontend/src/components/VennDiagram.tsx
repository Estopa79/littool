import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchSources, type Source } from '../lib/sources'
import { formatAuthorYear } from '../lib/sourceFormat'
import { fetchAllSourceTopics, fetchAllTopics, type SourceTopicRow, type TopicOption } from '../lib/qsReview'

// Themenfelder-Ueberschneidungen als klassisches symmetrisches 3-Kreis-Venn-
// Diagramm (Standard-Layout: drei gleich grosse Kreise im Dreieck). Nur fuer
// genau 3 Themenfelder sinnvoll darstellbar - bei abweichender Anzahl zeigen
// wir stattdessen einen Hinweistext statt ein n-Kreise-Venn nachzubauen.

const R = 110
const CENTERS: Array<[number, number]> = [
  [150, 145],
  [250, 145],
  [200, 225],
]
const COLORS = ['#4FC3F7', '#66BB6A', '#FFA726']
const REGION_LABEL_POS: Record<string, [number, number]> = {
  a: [95, 105],
  b: [305, 105],
  c: [200, 300],
  ab: [200, 95],
  ac: [130, 220],
  bc: [270, 220],
  abc: [200, 175],
}

type Region = 'a' | 'b' | 'c' | 'ab' | 'ac' | 'bc' | 'abc'

function regionOf(inA: boolean, inB: boolean, inC: boolean): Region | null {
  if (inA && inB && inC) return 'abc'
  if (inA && inB) return 'ab'
  if (inA && inC) return 'ac'
  if (inB && inC) return 'bc'
  if (inA) return 'a'
  if (inB) return 'b'
  if (inC) return 'c'
  return null
}

export function VennDiagram() {
  const [topics, setTopics] = useState<TopicOption[]>([])
  const [sourceTopics, setSourceTopics] = useState<SourceTopicRow[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [activeRegion, setActiveRegion] = useState<{ region: Region; label: string; sources: Source[] } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    Promise.all([fetchAllTopics(), fetchAllSourceTopics(), fetchSources()])
      .then(([t, st, s]) => {
        setTopics(t)
        setSourceTopics(st)
        setSources(s)
      })
      .finally(() => setLoading(false))
  }, [])

  const regions = useMemo(() => {
    if (topics.length !== 3) return null
    const [t1, t2, t3] = topics
    const topicIdsBySource = new Map<string, Set<string>>()
    for (const row of sourceTopics) {
      if (!topicIdsBySource.has(row.source_id)) topicIdsBySource.set(row.source_id, new Set())
      topicIdsBySource.get(row.source_id)!.add(row.topic_id)
    }
    const buckets: Record<Region, Source[]> = { a: [], b: [], c: [], ab: [], ac: [], bc: [], abc: [] }
    for (const s of sources) {
      const ids = topicIdsBySource.get(s.id) ?? new Set()
      const region = regionOf(ids.has(t1.id), ids.has(t2.id), ids.has(t3.id))
      if (region) buckets[region].push(s)
    }
    return { topics: [t1, t2, t3], buckets }
  }, [topics, sourceTopics, sources])

  function regionLabel(region: Region): string {
    if (!regions) return ''
    const { topics: [t1, t2, t3] } = regions
    if (region === 'a') return t1.name
    if (region === 'b') return t2.name
    if (region === 'c') return t3.name
    if (region === 'ab') return `${t1.name} ∩ ${t2.name}`
    if (region === 'ac') return `${t1.name} ∩ ${t3.name}`
    if (region === 'bc') return `${t2.name} ∩ ${t3.name}`
    return `${t1.name} ∩ ${t2.name} ∩ ${t3.name}`
  }

  function openRegion(region: Region) {
    if (!regions) return
    setActiveRegion({ region, label: regionLabel(region), sources: regions.buckets[region] })
  }

  function exportImage() {
    const svg = svgRef.current
    if (!svg) return
    const serializer = new XMLSerializer()
    const source = serializer.serializeToString(svg)
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 800
      canvas.height = 720
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => {
        if (!blob) return
        const pngUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = pngUrl
        a.download = 'themenfelder-venn.png'
        a.click()
        URL.revokeObjectURL(pngUrl)
      }, 'image/png')
    }
    img.src = url
  }

  if (loading) return null

  return (
    <section className="mb-6 rounded-lg border border-slate-200 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2 text-left text-sm font-medium text-slate-700 dark:text-slate-300"
      >
        <span>{open ? '▾' : '▸'} Themenfelder-Überschneidungen {open ? 'verbergen' : 'anzeigen'}</span>
        <span className="text-xs font-normal text-slate-400">{topics.length} Themenfelder</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 p-4 dark:border-slate-800">
          {!regions ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Venn-Diagramm ist nur für genau drei Themenfelder verfügbar (aktuell {topics.length}).
            </p>
          ) : (
            <>
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  onClick={exportImage}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Als Bild exportieren
                </button>
              </div>
              <div className="flex justify-center">
                <svg ref={svgRef} viewBox="0 0 400 360" className="w-full max-w-lg">
                  <rect x="0" y="0" width="400" height="360" fill="white" />
                  {CENTERS.map(([cx, cy], i) => (
                    <circle key={i} cx={cx} cy={cy} r={R} fill={COLORS[i]} fillOpacity="0.35" stroke={COLORS[i]} strokeWidth="1.5" />
                  ))}
                  {regions.topics.map((t, i) => {
                    const [cx, cy] = CENTERS[i]
                    // A und B liegen nebeneinander oben - Zeilen versetzt, um
                    // Ueberlappung bei langen Themenfeld-Namen zu vermeiden.
                    const labelY = i === 2 ? cy + R + 20 : i === 0 ? cy - R - 24 : cy - R - 8
                    return (
                      <text key={t.id} x={cx} y={labelY} textAnchor="middle" fontSize="11" fontWeight="600" fill="#334155">
                        {t.name}
                      </text>
                    )
                  })}
                  {(Object.keys(REGION_LABEL_POS) as Region[]).map((region) => {
                    const [x, y] = REGION_LABEL_POS[region]
                    const count = regions.buckets[region].length
                    return (
                      <g
                        key={region}
                        onClick={() => openRegion(region)}
                        className="cursor-pointer"
                        title={`${regionLabel(region)}: ${count} Quellen`}
                      >
                        <circle cx={x} cy={y} r="16" fill="white" fillOpacity="0.85" stroke="#334155" strokeWidth="0.5" />
                        <text x={x} y={y + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill="#1e293b">
                          {count}
                        </text>
                      </g>
                    )
                  })}
                </svg>
              </div>
              <p className="mt-2 text-center text-xs text-slate-400">Zahl anklicken, um die Quellen der Schnittmenge zu sehen.</p>
            </>
          )}
        </div>
      )}

      {activeRegion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setActiveRegion(null)}>
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
              <h2 className="text-sm font-medium text-slate-800 dark:text-slate-100">{activeRegion.label}</h2>
              <button
                type="button"
                onClick={() => setActiveRegion(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-sm">
              {activeRegion.sources.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400">Keine Quellen in dieser Schnittmenge.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {activeRegion.sources.map((s) => (
                    <li key={s.id}>
                      <Link
                        to={`/bibliothek/${s.id}`}
                        className="block rounded-md border border-slate-200 p-2 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                      >
                        <span className="font-medium text-slate-800 dark:text-slate-100">{formatAuthorYear(s)}</span>
                        <span className="block text-slate-600 dark:text-slate-400">{s.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
