import { Outlet, useNavigate, Link } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomTabBar } from './BottomTabBar'
import { supabase } from '../lib/supabase'

export function AppLayout() {
  const navigate = useNavigate()

  function handleSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const input = e.currentTarget.elements.namedItem('q') as HTMLInputElement
    const q = input?.value.trim()
    navigate(q ? `/suche?q=${encodeURIComponent(q)}` : '/suche')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
          <form onSubmit={handleSearchSubmit} className="w-full max-w-sm">
            <input
              type="search"
              name="q"
              placeholder="Schnellsuche …"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </form>
          <div className="ml-4 flex shrink-0 items-center gap-3">
            <Link
              to="/einstellungen"
              title="Einstellungen"
              aria-label="Einstellungen"
              className="text-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
            >
              ⚙️
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Abmelden
            </button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
        <BottomTabBar />
      </div>
    </div>
  )
}
