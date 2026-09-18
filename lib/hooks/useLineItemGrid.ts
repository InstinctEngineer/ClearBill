'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import type { LineItem } from '@/lib/types/database.types'
import {
  buildRows,
  draftToPayload,
  isBlank,
  nextKey,
  validateDraft,
  withTrailingBlank,
  type ColumnKey,
  type GridRow,
  type RowDraft,
  type RowStatus,
} from '@/lib/lineItemGrid'

/**
 * Grid state: the row list plus the operations the table component performs
 * on it. Persistence is injected so the component stays presentational.
 */
export function useLineItemGrid(
  lineItems: LineItem[],
  defaultDate: string | undefined,
  onChanged: () => void | Promise<void>
) {
  const [rows, setRows] = useState<GridRow[]>(() => buildRows(lineItems, defaultDate))
  const [banner, setBanner] = useState<string | null>(null)

  // Reads of the row list inside async handlers must see the latest state, not
  // the snapshot the handler closed over; a stale read would re-POST a row that
  // is already saving and duplicate it on the invoice.
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  // Rows with a request in flight, so a second blur cannot start a second save.
  const inFlight = useRef(new Set<string>())

  /** Rebuild from the server's copy, discarding local drafts. */
  const reset = useCallback(
    (items: LineItem[]) => {
      const built = buildRows(items, defaultDate)
      rowsRef.current = built
      setRows(built)
    },
    [defaultDate]
  )

  const patchRow = useCallback((key: string, patch: Partial<GridRow>) => {
    setRows((current) => {
      const next = current.map((row) => (row.key === key ? { ...row, ...patch } : row))
      rowsRef.current = next
      return next
    })
  }, [])

  /** Edit one cell, marking the row dirty and growing the blank tail row. */
  const editCell = useCallback(
    (key: string, column: ColumnKey, value: string | boolean) => {
      setRows((current) => {
        const next = current.map((row) =>
          row.key === key
            ? {
                ...row,
                draft: { ...row.draft, [column]: value } as RowDraft,
                status: 'dirty' as RowStatus,
                error: undefined,
              }
            : row
        )
        const grown = withTrailingBlank(next, defaultDate)
        rowsRef.current = grown
        return grown
      })
    },
    [defaultDate]
  )

  /** Persist one row if it is dirty and complete. Called when focus leaves it. */
  const commitRow = useCallback(
    async (key: string, invoiceId: number) => {
      if (inFlight.current.has(key)) return

      const row = rowsRef.current.find((candidate) => candidate.key === key)
      if (!row || row.status !== 'dirty') return
      if (row.id === null && isBlank(row.draft)) return

      const invalid = validateDraft(row.draft)
      if (invalid) {
        patchRow(key, { status: 'error', error: invalid })
        return
      }

      inFlight.current.add(key)
      patchRow(key, { status: 'saving', error: undefined })
      try {
        const res = await fetch(
          row.id === null
            ? `/api/invoices/${invoiceId}/line-items`
            : `/api/line-items/${row.id}`,
          {
            method: row.id === null ? 'POST' : 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draftToPayload(row.draft)),
          }
        )
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Save failed')
        }
        const saved: LineItem = await res.json()
        patchRow(key, { id: saved.id, status: 'clean', error: undefined })
        await onChanged()
      } catch (err) {
        patchRow(key, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Save failed',
        })
      } finally {
        inFlight.current.delete(key)
      }
    },
    [patchRow, onChanged]
  )

  const removeRow = useCallback(
    (key: string) => {
      setRows((current) => {
        const next = withTrailingBlank(
          current.filter((candidate) => candidate.key !== key),
          defaultDate
        )
        rowsRef.current = next
        return next
      })
    },
    [defaultDate]
  )

  const deleteRow = useCallback(
    async (key: string) => {
      if (inFlight.current.has(key)) return

      const row = rowsRef.current.find((candidate) => candidate.key === key)
      if (!row) return

      if (row.id === null) {
        removeRow(key)
        return
      }

      inFlight.current.add(key)
      patchRow(key, { status: 'saving' })
      try {
        const res = await fetch(`/api/line-items/${row.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Delete failed')
        removeRow(key)
        await onChanged()
      } catch (err) {
        patchRow(key, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Delete failed',
        })
      } finally {
        inFlight.current.delete(key)
      }
    },
    [removeRow, patchRow, onChanged]
  )

  /**
   * Land a pasted block at `key`: the first row overwrites that cell's row and
   * the rest are appended. The appended rows go to the server in one request
   * and adopt the ids it returns, so they are never saved a second time when
   * the user later clicks through them.
   */
  const pasteRows = useCallback(
    async (key: string, drafts: RowDraft[], invoiceId: number) => {
      if (drafts.length === 0) return
      setBanner(null)

      const index = rowsRef.current.findIndex((candidate) => candidate.key === key)
      if (index === -1) return

      const [first, ...rest] = drafts
      const appended: GridRow[] = rest
        .filter((draft) => !isBlank(draft))
        .map((draft) => ({ key: nextKey(), id: null, draft, status: 'dirty' as RowStatus }))

      setRows((current) => {
        const next = [...current]
        next[index] = { ...next[index], draft: first, status: 'dirty', error: undefined }
        next.splice(index + 1, 0, ...appended)
        const grown = withTrailingBlank(next, defaultDate)
        rowsRef.current = grown
        return grown
      })

      if (appended.length === 0) return

      const invalid = appended.filter((row) => validateDraft(row.draft))
      if (invalid.length > 0) {
        invalid.forEach((row) =>
          patchRow(row.key, { status: 'error', error: validateDraft(row.draft) ?? undefined })
        )
        setBanner(
          `Pasted ${appended.length} rows. ${invalid.length} need fixing before they can save.`
        )
        return
      }

      appended.forEach((row) => {
        inFlight.current.add(row.key)
        patchRow(row.key, { status: 'saving' })
      })

      try {
        const res = await fetch(`/api/invoices/${invoiceId}/line-items/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: appended.map((row) => draftToPayload(row.draft)) }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Bulk save failed')
        }

        // The endpoint inserts and returns rows in the order it was given them.
        const { items: saved } = (await res.json()) as { items: LineItem[] }
        appended.forEach((row, offset) => {
          const match = saved[offset]
          patchRow(row.key, match ? { id: match.id, status: 'clean' } : { status: 'dirty' })
        })

        setBanner(`Added ${appended.length} rows from the clipboard.`)
        await onChanged()
      } catch (err) {
        appended.forEach((row) =>
          patchRow(row.key, {
            status: 'error',
            error: err instanceof Error ? err.message : 'Bulk save failed',
          })
        )
        setBanner(err instanceof Error ? err.message : 'Bulk save failed')
      } finally {
        appended.forEach((row) => inFlight.current.delete(row.key))
      }
    },
    [patchRow, onChanged, defaultDate]
  )

  const unsavedCount = useMemo(
    () => rows.filter((row) => row.status === 'dirty' && !isBlank(row.draft)).length,
    [rows]
  )

  return {
    rows,
    banner,
    setBanner,
    unsavedCount,
    reset,
    editCell,
    commitRow,
    deleteRow,
    pasteRows,
  }
}
