# Changelog - Line Item Discounts & Export Updates

## Changes Made

### 1. Database Schema
**File:** `supabase/migrations/003_add_line_item_discounts.sql`
- Added `discount_percentage` column (DECIMAL 0-100)
- Added `discount_reason` column (TEXT, nullable)
- Added check constraint to ensure discount is between 0 and 100%

**Action Required:** Run this SQL in Supabase SQL Editor

### 2. TypeScript Types
**File:** `lib/types/database.types.ts`
- Updated `LineItem` types to include discount fields
- Added to Row, Insert, and Update types

### 3. Calculations
**File:** `lib/utils/calculations.ts`
- Added `calculateDiscountedRate()` function
- Added `calculateLineItemTotal()` function
- Updated `calculateSubtotal()` to use discounted rates
- Updated `calculateExpenses()` to use discounted rates
- Updated `calculateIncome()` to use discounted rates

### 4. PDF Export
**File:** `app/api/invoices/[id]/export/pdf/route.ts`
**Removed:**
- Due Date line
- Invoice # line
- Tax Set Aside line from totals

**Added:**
- Column headers: Description, Qty, Reg. Rate, Disc%, Disc. Rate, Total
- Shows discount percentage and discounted rate for each line item
- Shows discount reason below line item if present
- Totals now show only: Subtotal and Total

### 5. Excel Export
**File:** `app/api/invoices/[id]/export/excel/route.ts`
**Removed:**
- Invoice # row
- Due Date row
- Tax Set Aside from main totals

**Added:**
- Column headers: Description, Type, Date, Qty, Regular Rate, Discount %, Discounted Rate, Total, Discount Reason
- All discount information in separate columns
- Totals now show only: Subtotal and Total
- Tax Information sheet remains for record keeping

### 6. API Endpoints

**New File:** `app/api/line-items/[id]/route.ts`
- `PATCH /api/line-items/[id]` - Update a line item
- `DELETE /api/line-items/[id]` - Delete a line item

**Updated File:** `app/api/invoices/[id]/line-items/route.ts`
- Added discount_percentage and discount_reason to POST endpoint

## Next Steps

### Before Testing:
1. **Run SQL migration in Supabase:**
   ```sql
   ALTER TABLE line_items
   ADD COLUMN discount_percentage DECIMAL(5,2) DEFAULT 0,
   ADD COLUMN discount_reason TEXT;

   ALTER TABLE line_items
   ADD CONSTRAINT check_discount_percentage
   CHECK (discount_percentage >= 0 AND discount_percentage <= 100);
   ```

2. **Update invoice detail page UI** (not yet completed):
   - Add discount fields to "Add Line Item" form
   - Add edit button for each line item
   - Add edit modal/inline editing
   - Display discount information in line items table

### To Test:
1. Create a new line item with discount
2. Edit an existing line item
3. Export to PDF and verify format
4. Export to Excel and verify format
5. Verify calculations include discounts

## Status
- ✅ Database schema
- ✅ TypeScript types
- ✅ Calculations updated
- ✅ PDF export updated
- ✅ Excel export updated
- ✅ API endpoints created
- ⏳ UI for adding discounts (needs implementation)
- ⏳ UI for editing line items (needs implementation)
- ⏳ Testing

## UI Implementation Needed

The invoice detail page needs to be updated to:
1. Add discount fields to the line item form (2 new fields)
2. Add edit functionality to the line items table
3. Display discount information in the table

Would you like me to implement the UI changes next?
