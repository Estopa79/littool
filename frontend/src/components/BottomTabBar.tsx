import { NavLink } from 'react-router-dom'
import { navItems } from '../nav'

export function BottomTabBar() {
  return (
    <nav className="flex shrink-0 border-t border-slate-200 bg-slate-50 md:hidden dark:border-slate-800 dark:bg-slate-900">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              isActive
                ? 'text-slate-900 dark:text-white'
                : 'text-slate-500 dark:text-slate-400'
            }`
          }
        >
          <span className="text-lg leading-none">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
