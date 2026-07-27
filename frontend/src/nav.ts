export type NavItem = {
  path: string
  label: string
  icon: string
}

export const navItems: NavItem[] = [
  { path: '/', label: 'Schreibwerkstatt', icon: '✍️' },
  { path: '/bibliothek', label: 'Bibliothek', icon: '📚' },
  { path: '/forschungsfragen', label: 'Forschungsfragen', icon: '❓' },
  { path: '/deskriptionsmatrix', label: 'Deskriptionsmatrix', icon: '📐' },
  { path: '/evaluationsmatrix', label: 'Evaluationsmatrix', icon: '📊' },
  { path: '/suche', label: 'Suche', icon: '🔍' },
  { path: '/verwendet', label: 'Verwendet', icon: '✅' },
  { path: '/protokolle', label: 'Protokolle', icon: '📋' },
]
