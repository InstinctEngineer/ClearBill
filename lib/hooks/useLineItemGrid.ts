'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import type { LineItem } from '@/lib/types/database.types'
import {
  buildRows,
  draftToPayload,
  isBlank,
  nextKey,
  validateDraft,
  withEntryRow,
  type ColumnKey,
  type EntryRowSeed,
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
  seed: EntryRowSeed,
  onChanged: () => void | Promise<void>
) {
  const [rows, setRows] = useState<GridRow[]>(() => buildRows(lineItems, seed))

  // Read inside callbacks so a settings change does not re-create every one.
  const seedRef = useRef(seed)
  seedRef.current = seed
  const [banner, setBanner] = useState<string | null>(null)

  // Reads of the row list inside async handlers must see the latest state, not
  // the snapshot the handler closed over; a stale read would re-POST a row that
  // is already saving and duplicate it on the invoice.
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  // Rows with a request in flight, so a second blur cannot start a second save.
  const inFlight = useRef(new Set<string>())

  /** Rebuild from the server's copy, discarding local drafts. */
  const reset = useCallback((items: LineItem[]) => {
    const built = buildRows(items, seedRef.current)
    rowsRef.current = built
    setRows(built)
  }, [])

  const patchRow = useCallback((key: string, patch: Partial<GridRow>) => {
    setRows((current) => {
      const next = current.map((row) => (row.key === key ? { ...row, ...patch } : row))
      rowsRef.current = next
      return next
    })
  }, [])

  /**
   * Edit one cell and mark the row dirty.
   *
   * No replacement entry row is added here. The entry row sits at the top, so
   * adding one the moment you start typing would push the row you are typing
   * in down a line. commitRow adds it once the row is saved instead.
   */
  const editCell = useCallback((key: string, column: ColumnKey, value: string | boolean) => {
    setRows((current) => {
      const next = current.map((row) => {
        if (row.key !== key) return row
        const draft = { ...row.draft, [column]: value } as RowDraft

        // Clearing an unsaved row back to empty makes it the entry row again,
        // so it should not keep nagging about the validation it just failed.
        const emptied = row.id === null && isBlank(draft)
        return {
          ...row,
          draft,
          status: (emptied ? 'clean' : 'dirty') as RowStatus,
          error: undefined,
        }
      })
      rowsRef.current = next
      return next
    })
  }, [])

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
        // The row just filled in may have been the entry row; put a fresh one
        // back at the top now that the user has finished with this one.
        setRows((current) => {
          const next = withEntryRow(current, seedRef.current)
          rowsRef.current = next
          return next
        })
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
        const next = withEntryRow(
          current.filter((candidate) => candidate.key !== key),
          seedRef.current
        )
        rowsRef.current = next
        return next
      })
    },
    []
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
        const grown = withEntryRow(next, seedRef.current)
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
    [patchRow, onChanged]
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
