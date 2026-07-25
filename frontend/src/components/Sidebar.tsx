import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { navItems } from '../nav'

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`hidden shrink-0 flex-col border-r border-slate-200 bg-slate-50 transition-all duration-150 md:flex dark:border-slate-800 dark:bg-slate-900 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex h-12 items-center justify-center text-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        aria-label={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
      >
        ☰
      </button>
      <nav className="flex flex-1 flex-col gap-1 px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                isActive
                  ? 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60'
              }`
            }
            title={item.label}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
