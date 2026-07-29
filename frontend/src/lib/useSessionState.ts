import { useEffect, useState } from 'react'

// Wiedereinstiegs-Komfort: Filter/Sortierung/Tab-Auswahl ueberleben einen
// Routenwechsel (die Komponente unmountet dabei komplett), aber nicht das
// Schliessen des Tabs - bewusst sessionStorage statt localStorage (kein
// dauerhaftes Setting), gleiches Prinzip wie der Schreibwerkstatt-
// Sitzungszustand (Schreibwerkstatt.tsx::SESSION_STORAGE_KEY).
export function useSessionState<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key)
      return raw !== null ? (JSON.parse(raw) as T) : defaultValue
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      // sessionStorage evtl. voll/deaktiviert - Wiedereinstiegs-Komfort ist optional, kein Fehler noetig
    }
  }, [key, value])

  return [value, setValue]
}
