'use client'

/**
 * Small presentational parts shared by the report pages (Tax, Personal):
 * cards, tables, notices and the flag lists. No data fetching, no state.
 */
import { AlertTriangle, Info } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/calculations'

export function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{title}</h2>
      {children}
    </section>
  )
}

export function Stat({ label, value, note, accent }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg shadow p-5 ${accent ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800'}`}>
      <p className={`text-xs uppercase tracking-wide ${accent ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent ? '' : 'text-gray-900 dark:text-white'}`}>{value}</p>
      <p className={`mt-1 text-xs ${accent ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>{note}</p>
    </div>
  )
}

export function Row({ k, v, strong, muted, tone }: { k: string; v: string; strong?: boolean; muted?: boolean; tone?: 'good' | 'bad' }) {
  const color = tone === 'good' ? 'text-green-600 dark:text-green-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : muted ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={muted ? 'text-gray-500 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'}>{k}</dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold' : ''} ${color}`}>{v}</dd>
    </div>
  )
}

export function Money({ v, strong, muted }: { v: number; strong?: boolean; muted?: boolean }) {
  return <span className={`tabular-nums ${strong ? 'font-semibold' : ''} ${muted ? 'text-gray-500 dark:text-gray-400' : ''}`}>{formatCurrency(v)}</span>
}

export function Badge({ tone, children }: { tone: 'warn' | 'bad' | 'info' | 'muted'; children: React.ReactNode }) {
  const styles = {
    warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    bad: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    muted: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  }[tone]
  return <span className={`ml-2 inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium ${styles}`}>{children}</span>
}

export function Notice({ tone, children, onDismiss }: { tone: 'error' | 'info'; children: React.ReactNode; onDismiss?: () => void }) {
  const styles = tone === 'error'
    ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
    : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
  return (
    <div className={`mb-4 p-3 rounded-lg text-sm flex items-center justify-between gap-3 ${styles}`}>
      <span>{children}</span>
      {onDismiss && <button type="button" onClick={onDismiss} className="hover:underline">Dismiss</button>}
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500 dark:text-gray-400">{children}</p>
}

/** Flags of one severity under a heading. `action` adds a link after a flag's text. */
export function FlagList<F extends { code: string; message: string }>({ title, tone, flags, action }: {
  title: string
  tone: 'bad' | 'warn' | 'info'
  flags: F[]
  action?: (flag: F) => React.ReactNode
}) {
  if (flags.length === 0) return null
  const Icon = tone === 'info' ? Info : AlertTriangle
  const color = { bad: 'text-red-600 dark:text-red-400', warn: 'text-amber-600 dark:text-amber-400', info: 'text-blue-600 dark:text-blue-400' }[tone]
  return (
    <div className="mb-4 last:mb-0">
      <h3 className={`text-sm font-semibold mb-2 ${color}`}>{title}</h3>
      <ul className="space-y-2">
        {flags.map((flag, i) => (
          <li key={`${flag.code}-${i}`} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
            <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${color}`} />
            <span>{flag.message}{action && <> {action(flag)}</>}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * A report's flags grouped by severity, most urgent first. Shared so the
 * business and personal pages word their warnings the same way.
 */
export function FlagGroups<F extends { severity: 'action' | 'review' | 'info'; code: string; message: string }>({ flags, action }: {
  flags: F[]
  action?: (flag: F) => React.ReactNode
}) {
  const of = (severity: F['severity']) => flags.filter((flag) => flag.severity === severity)
  return (
    <>
      <FlagList title="Fix" tone="bad" flags={of('action')} action={action} />
      <FlagList title="Check with your preparer" tone="warn" flags={of('review')} action={action} />
      <FlagList title="Good to know" tone="info" flags={of('info')} action={action} />
    </>
  )
}

/** One tab per year, newest first as given. */
export function YearTabs({ years, selected, onSelect, label }: {
  years: number[]
  selected: number | null
  onSelect: (year: number) => void
  label: string
}) {
  if (years.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label={label}>
      {years.map((candidate) => (
        <button
          key={candidate}
          role="tab"
          aria-selected={candidate === selected}
          type="button"
          onClick={() => onSelect(candidate)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
            candidate === selected
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          {candidate}
        </button>
      ))}
    </div>
  )
}

export function Table({ head, rows, foot, numeric = [] }: {
  head: string[]
  rows: React.ReactNode[][]
  foot?: React.ReactNode[]
  numeric?: number[]
}) {
  const align = (i: number) => (numeric.includes(i) ? 'text-right' : 'text-left')
  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
            {head.map((h, i) => <th key={h} className={`py-2 pr-4 ${align(i)}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r} className="border-b border-gray-100 dark:border-gray-700/60 text-gray-900 dark:text-white">
              {cells.map((c, i) => <td key={i} className={`py-2 pr-4 ${align(i)}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr className="text-gray-900 dark:text-white">
              {foot.map((c, i) => <td key={i} className={`py-2 pr-4 ${align(i)}`}>{c}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
