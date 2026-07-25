import { Outlet, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomTabBar } from './BottomTabBar'

export function AppLayout() {
  const navigate = useNavigate()

  function handleSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    navigate('/suche')
  }

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center border-b border-slate-200 px-4 dark:border-slate-800">
          <form onSubmit={handleSearchSubmit} className="w-full max-w-sm">
            <input
              type="search"
              placeholder="Schnellsuche …"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </form>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
        <BottomTabBar />
      </div>
    </div>
  )
}
