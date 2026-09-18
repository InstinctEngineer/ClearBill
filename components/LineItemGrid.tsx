'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Trash2, AlertCircle, Check, Info } from 'lucide-react'
import type { LineItem } from '@/lib/types/database.types'
import { ITEM_TYPES } from '@/lib/lineItems'
import { formatCurrency } from '@/lib/utils/calculations'
import {
  GRID_COLUMNS,
  draftTotal,
  emptyDraft,
  isBlank,
  parseClipboard,
  tableMinWidthPx,
  type ColumnKey,
  type GridColumn,
  type GridRow,
} from '@/lib/lineItemGrid'
import { useLineItemGrid } from '@/lib/hooks/useLineItemGrid'

interface Props {
  invoiceId: number
  lineItems: LineItem[]
  /** Date used for new rows, normally the invoice date. */
  defaultDate?: string
  /** Show the "to debt" column. Driven by the debt tracking setting. */
  showDebtColumn: boolean
  /** Called after any successful write so the parent can refetch totals. */
  onChanged: () => void | Promise<void>
}

/**
 * Spreadsheet-style editor for an invoice's line items.
 *
 * Everything is typed inline: no add form, no edit modal. Arrow keys and Enter
 * move between cells, a blank row sits at the bottom ready for the next entry,
 * and pasting a block from Excel fills as many rows as the clipboard holds.
 * Each row saves on its own as soon as focus leaves it.
 */
export default function LineItemGrid({
  invoiceId,
  lineItems,
  defaultDate,
  showDebtColumn,
  onChanged,
}: Props) {
  const grid = useLineItemGrid(lineItems, defaultDate, onChanged)
  const { rows, reset, editCell, commitRow, deleteRow, pasteRows } = grid
  const containerRef = useRef<HTMLDivElement>(null)
  const [showHelp, setShowHelp] = useState(false)

  // Latest rows, readable from effects without making them re-run on every keystroke
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  const columns = GRID_COLUMNS.filter(
    (column) => column.feature !== 'debt' || showDebtColumn
  )

  // Adopt the server's copy only when it genuinely diverges from what the grid
  // holds. Every row save triggers a refetch, and rebuilding the rows on each
  // one would remount the inputs and steal the caret mid-entry.
  useEffect(() => {
    const serverIds = new Set(lineItems.map((item) => item.id))
    const localIds = new Set(
      rowsRef.current.filter((row) => row.id !== null).map((row) => row.id as number)
    )
    const sameRows =
      serverIds.size === localIds.size &&
      [...serverIds].every((id) => localIds.has(id))
    const editing = rowsRef.current.some(
      (row) => row.status === 'dirty' || row.status === 'saving'
    )

    if (!sameRows && !editing) reset(lineItems)
  }, [lineItems, reset])

  /** Move focus to another cell by (row, column) address. */
  const focusCell = (rowIndex: number, columnIndex: number) => {
    const target = containerRef.current?.querySelector<HTMLElement>(
      `[data-cell="${rowIndex}-${columnIndex}"]`
    )
    target?.focus()
    if (target instanceof HTMLInputElement && target.type !== 'checkbox') target.select()
  }

  const handleKeyDown = (
    event: React.KeyboardEvent,
    rowIndex: number,
    columnIndex: number
  ) => {
    const lastRow = rows.length - 1

    switch (event.key) {
      case 'Enter':
        event.preventDefault()
        focusCell(
          event.shiftKey ? Math.max(0, rowIndex - 1) : Math.min(lastRow, rowIndex + 1),
          columnIndex
        )
        break
      case 'ArrowDown':
        event.preventDefault()
        focusCell(Math.min(lastRow, rowIndex + 1), columnIndex)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusCell(Math.max(0, rowIndex - 1), columnIndex)
        break
      case 'Escape':
        event.preventDefault()
        ;(event.target as HTMLElement).blur()
        break
      default:
        // Let Tab and text editing keys behave natively. Arrow left/right must
        // stay usable for moving the caret inside a cell.
        break
    }
  }

  const handlePaste = (
    event: React.ClipboardEvent,
    row: GridRow,
    columnIndex: number
  ) => {
    const text = event.clipboardData.getData('text/plain')
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return // ordinary paste

    event.preventDefault()
    const base = isBlank(row.draft) ? emptyDraft(defaultDate) : row.draft
    const drafts = parseClipboard(text, columns, columnIndex, base)
    void pasteRows(row.key, drafts, invoiceId)
  }

  const cellClasses =
    'w-full min-w-0 bg-transparent px-1.5 py-1.5 text-sm text-gray-900 dark:text-white border border-transparent rounded focus:border-blue-500 focus:bg-white dark:focus:bg-gray-900 focus:outline-none'

  return (
    <div ref={containerRef}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setShowHelp((open) => !open)}
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          <Info className="h-3.5 w-3.5" />
          How to use this grid
        </button>
        {grid.unsavedCount > 0 && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            {grid.unsavedCount} row{grid.unsavedCount === 1 ? '' : 's'} not saved yet
          </span>
        )}
      </div>

      {showHelp && (
        <div className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700 space-y-1">
          <p><strong>Type straight into any cell.</strong> Each row saves by itself once you move off it.</p>
          <p><strong>Tab</strong> moves across, <strong>Enter</strong> and the <strong>arrow keys</strong> move down and up, <strong>Esc</strong> leaves the cell.</p>
          <p><strong>Paste a block from Excel</strong> into any cell and it fills that many rows, starting at the column you pasted into.</p>
          <p>The empty row at the bottom is always ready for the next entry.</p>
        </div>
      )}

      {grid.banner && (
        <div className="px-4 py-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 flex items-center justify-between gap-3">
          <span>{grid.banner}</span>
          <button
            type="button"
            onClick={() => grid.setBanner(null)}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/*
        The table is given an explicit minimum width so a narrow container
        scrolls it instead of squeezing every column until the text clips.
        Total and the row actions are pinned to the right edge, so the money
        stays readable however far the rest is scrolled.
      */}
      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-sm"
          style={{ minWidth: `${tableMinWidthPx(columns)}px` }}
        >
          <thead>
            <tr className="text-left">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`${column.width} bg-gray-50 dark:bg-gray-900/40 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 ${
                    column.kind === 'check' ? 'text-center' : ''
                  }`}
                >
                  {column.label}
                </th>
              ))}
              <th
                scope="col"
                className="sticky right-14 z-10 w-28 bg-gray-50 dark:bg-gray-900/40 px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700"
              >
                Total
              </th>
              <th
                scope="col"
                className="sticky right-0 z-10 w-14 bg-gray-50 dark:bg-gray-900/40 px-2 py-2 border-b border-gray-200 dark:border-gray-700"
              >
                <span className="sr-only">Row actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const blank = row.id === null && isBlank(row.draft)
              // Pinned cells need an opaque background of their own, or the
              // scrolled columns show through them.
              const rowBg =
                row.status === 'error'
                  ? 'bg-red-50 dark:bg-red-950/40'
                  : blank
                    ? 'bg-gray-50 dark:bg-gray-900/60'
                    : 'bg-white dark:bg-gray-800'
              return (
                <tr
                  key={row.key}
                  onBlur={(event) => {
                    // Only commit once focus has actually left the whole row.
                    if (event.currentTarget.contains(event.relatedTarget as Node)) return
                    void commitRow(row.key, invoiceId)
                  }}
                  className={`border-b border-gray-100 dark:border-gray-800 ${rowBg} ${
                    row.status === 'error' || blank
                      ? ''
                      : 'hover:bg-gray-50 dark:hover:bg-gray-900/30'
                  }`}
                >
                  {columns.map((column, columnIndex) => (
                    <td key={column.key} className={`${column.width} px-1 py-0.5 align-middle`}>
                      <Cell
                        column={column}
                        row={row}
                        className={cellClasses}
                        address={`${rowIndex}-${columnIndex}`}
                        onEdit={(value) => editCell(row.key, column.key as ColumnKey, value)}
                        onKeyDown={(event) => handleKeyDown(event, rowIndex, columnIndex)}
                        onPaste={(event) => handlePaste(event, row, columnIndex)}
                      />
                    </td>
                  ))}

                  <td
                    className={`sticky right-14 z-10 w-28 ${rowBg} px-2 py-1.5 text-right tabular-nums font-medium text-gray-900 dark:text-white`}
                  >
                    {blank ? '' : formatCurrency(draftTotal(row.draft))}
                  </td>

                  <td className={`sticky right-0 z-10 w-14 ${rowBg} px-2 py-1.5`}>
                    <div className="flex items-center justify-end gap-1.5">
                      <RowStatusIcon row={row} />
                      {!blank && (
                        <button
                          type="button"
                          onClick={() => void deleteRow(row.key)}
                          title="Delete row"
                          className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="sr-only">Delete row</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {rows.some((row) => row.error) && (
        <ul className="px-4 py-2 space-y-1 text-xs text-red-600 dark:text-red-400">
          {rows
            .filter((row) => row.error)
            .map((row) => (
              <li key={row.key}>
                {row.draft.description.trim() || 'Untitled row'}: {row.error}
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

function RowStatusIcon({ row }: { row: GridRow }) {
  if (row.status === 'saving') {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" aria-label="Saving" />
  }
  if (row.status === 'error') {
    return <AlertCircle className="h-3.5 w-3.5 text-red-500" aria-label="Not saved" />
  }
  if (row.status === 'dirty' && !isBlank(row.draft)) {
    return <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="Unsaved changes" />
  }
  if (row.id !== null) {
    return <Check className="h-3.5 w-3.5 text-green-500/70" aria-label="Saved" />
  }
  return null
}

interface CellProps {
  column: GridColumn
  row: GridRow
  className: string
  address: string
  onEdit: (value: string | boolean) => void
  onKeyDown: (event: React.KeyboardEvent) => void
  onPaste: (event: React.ClipboardEvent) => void
}

function Cell({ column, row, className, address, onEdit, onKeyDown, onPaste }: CellProps) {
  const value = row.draft[column.key]
  const shared = {
    'data-cell': address,
    onKeyDown,
    onPaste,
    disabled: row.status === 'saving',
  }

  if (column.kind === 'check') {
    return (
      <div className="flex justify-center">
        <input
          {...shared}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onEdit(event.target.checked)}
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
          aria-label={column.label}
        />
      </div>
    )
  }

  if (column.kind === 'select') {
    return (
      <select
        {...shared}
        value={String(value)}
        onChange={(event) => onEdit(event.target.value)}
        className={className}
        aria-label={column.label}
      >
        {ITEM_TYPES.map((type) => (
          <option key={type} value={type}>
            {type.charAt(0) + type.slice(1).toLowerCase()}
          </option>
        ))}
      </select>
    )
  }

  return (
    <input
      {...shared}
      type={column.kind === 'date' ? 'date' : column.kind === 'number' ? 'number' : 'text'}
      step={column.kind === 'number' ? '0.01' : undefined}
      value={String(value)}
      onChange={(event) => onEdit(event.target.value)}
      // Spinner arrows steal width a narrow numeric column cannot spare.
      className={`${className} ${
        column.kind === 'number'
          ? 'text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
          : ''
      }`}
      aria-label={column.label}
      placeholder={column.kind === 'number' ? '0' : ''}
    />
  )
}
