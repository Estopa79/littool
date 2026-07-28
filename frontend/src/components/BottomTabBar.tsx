import { NavLink } from 'react-router-dom'
import { navItems } from '../nav'

export function BottomTabBar() {
  return (
    // Bei acht Eintraegen reicht die Breite bei 375px nicht fuer gleich
    // breite (flex-1) Spalten - das erzwang bislang ein Ueberlaufen der
    // gesamten Seite nach rechts statt nur der Leiste selbst (dokumentierter
    // Bug seit Phase 2/3). Fix: Eintraege behalten eine feste Mindestbreite
    // (shrink-0 statt flex-1), die Leiste selbst scrollt bei Bedarf
    // horizontal (overflow-x-auto) - der Rest der Seite bleibt unberuehrt.
    <nav className="flex shrink-0 overflow-x-auto border-t border-slate-200 bg-slate-50 md:hidden dark:border-slate-800 dark:bg-slate-900">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) =>
            `flex w-16 shrink-0 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
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
