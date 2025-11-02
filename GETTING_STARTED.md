# Getting Started with ClearBill Invoice Tracker

## 🎉 Congratulations!

Your Invoice Tracker has been successfully rebuilt using Next.js and Supabase! All your data has been migrated and the application is ready to use.

## ✅ What's Complete

### Core Features
- ✅ **Authentication** - Secure login system with Supabase Auth
- ✅ **Invoice Management** - Create, edit, delete invoices
- ✅ **Line Items** - Add labor, hardware, and other costs
- ✅ **Receipt Uploads** - Store and organize receipt files
- ✅ **Payment Tracking** - Mark invoices as paid/unpaid
- ✅ **Financial Summary** - Year/month breakdown reports
- ✅ **PDF Export** - Generate professional PDF invoices
- ✅ **Excel Export** - Export invoices to Excel format
- ✅ **Excel Import** - Bulk import invoices from Excel
- ✅ **Dark Mode** - Full dark mode support
- ✅ **Mobile Responsive** - Works on all devices

## 🚀 Quick Start

### 1. Start the Development Server

```bash
cd invoice-tracker-web
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Log In

Use the email and password you created in your Supabase project:
- Go to your Supabase Dashboard → Authentication → Users
- Use that email/password to log in

### 3. Explore Your Data

All your migrated data should now be visible:
- **Dashboard** - See all your invoices
- **Invoice Detail** - Click any invoice to view details, add line items, upload receipts
- **Summary** - View financial reports by year/month

## 📱 Features Guide

### Dashboard (Home Page)
- **View all invoices** with filtering (all/paid/unpaid)
- **Sort** by date or due date
- **Quick actions**: Mark paid, view, delete
- **Statistics**: Total invoices, unpaid count, overdue count

### Invoice Detail Page
- **View invoice details** - Client, dates, status, tax rate
- **Edit project title** - Click the edit icon next to the title
- **Add line items** - Click "Add Line Item" button
  - Choose type: LABOR, HARDWARE, or OTHER
  - Enter description, quantity, rate, date
- **Upload receipts** - Click "Upload" button in receipts section
  - Supports: PDF, PNG, JPG, GIF, WebP
  - Max size: 16 MB
- **Export invoice**:
  - **PDF** - Download professional PDF
  - **Excel** - Download Excel spreadsheet
- **Mark as paid** - Toggle payment status

### Summary Page
- **All-time totals** - Total income, expenses, tax
- **Payment status** - See paid vs unpaid amounts
- **Yearly breakdown** - Click to expand/collapse years
- **Monthly details** - View income, expenses, tax by month
- **Net profit** - Calculated automatically

### Creating a New Invoice
1. Click "New Invoice" button on dashboard
2. Fill in: Project name, Client, Date, Tax rate
3. Click "Create Invoice"
4. Add line items on the detail page
5. Upload receipts as needed

### Importing Invoices from Excel
1. Prepare Excel file with columns:
   - project_name
   - client
   - invoice_date
   - tax_rate
   - description
   - quantity
   - unit_rate
   - item_type (LABOR, HARDWARE, or OTHER)
   - lineitem_date
2. Create import page (see Advanced Features below)
3. Upload Excel file

## 🎨 UI Tips

### Dark Mode
- The app automatically detects your system preference
- Toggle in your operating system settings

### Mobile Navigation
- Tap the menu icon (≡) to open sidebar on mobile
- Swipe to close or tap overlay

### Keyboard Shortcuts
- **Tab** - Navigate between form fields
- **Enter** - Submit forms
- **Esc** - Close modals

## 🔧 Advanced Features

### Excel Import Page
Create a new page for bulk imports:

```typescript
// app/import/page.tsx
'use client'

import { useState } from 'react'
import Navigation from '@/components/Navigation'

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    setImporting(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/invoices/import/excel', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      setResult(data)
    } catch (error) {
      console.error(error)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex h-full">
      <Navigation />
      <div className="flex-1 md:pl-64 p-8">
        <h1 className="text-3xl font-bold mb-8">Import Invoices</h1>
        <form onSubmit={handleImport} className="max-w-lg">
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="mb-4"
          />
          <button
            type="submit"
            disabled={!file || importing}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg"
          >
            {importing ? 'Importing...' : 'Import'}
          </button>
        </form>
        {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
      </div>
    </div>
  )
}
```

Then add a link in Navigation.tsx:
```typescript
{ href: '/import', label: 'Import', icon: Upload }
```

## 🚀 Deploying to Vercel

### Step 1: Push to GitHub

```bash
cd invoice-tracker-web
git init
git add .
git commit -m "Initial commit - Invoice Tracker"
gh repo create invoice-tracker-web --private --source=. --push
```

### Step 2: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your GitHub repository
4. Configure:
   - **Framework Preset**: Next.js
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
5. Add Environment Variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
   ```
6. Click "Deploy"

### Step 3: Update Supabase

After deployment, update your Supabase project:
1. Go to Supabase Dashboard → Authentication → URL Configuration
2. Add your Vercel URL to **Site URL**: `https://your-app.vercel.app`
3. Add to **Redirect URLs**: `https://your-app.vercel.app/auth/callback`

Done! Your app is now live! 🎉

## 📊 Understanding Your Data

### Tax Calculations
- **Tax Rate**: Percentage of income to set aside (e.g., 30%)
- **Tax Set Aside**: Calculated as `subtotal * (tax_rate / 100)`
- **Total**: Currently equals subtotal (tax shown separately for clarity)

### Item Types
- **LABOR**: Services, hours worked, consulting
- **HARDWARE**: Physical goods, equipment purchases
- **OTHER**: Miscellaneous costs

### Due Dates & Overdue Status
- **Due Date**: Automatically set to 30 days after invoice date
- **Current**: Within due date
- **Overdue**: 1-30 days overdue
- **Critical**: 31-60 days overdue
- **Severely Overdue**: 60+ days overdue

## 🆘 Troubleshooting

### Can't Log In
- Verify email/password in Supabase Dashboard → Authentication → Users
- Check that you confirmed your email
- Try password reset

### Export Buttons Not Working
- Ensure you're on the invoice detail page
- Check browser console for errors
- Verify API routes are accessible

### Receipts Not Uploading
- Check file size (max 16 MB)
- Verify file type (PDF, PNG, JPG, GIF, WebP)
- Check Supabase Storage quotas

### Data Not Showing
- Verify you're logged in
- Check Supabase Dashboard → Table Editor to confirm data exists
- Check browser console for API errors

### Dark Mode Not Working
- Check your OS/browser dark mode settings
- Try hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

## 🔄 Updates & Maintenance

### Updating Dependencies
```bash
npm update
```

### Backing Up Data
1. Go to Supabase Dashboard → Database → Backups
2. Download manual backup
3. Or export data via Table Editor

### Adding New Features
The codebase is well-organized:
- **`app/`** - Pages and API routes
- **`components/`** - Reusable React components
- **`lib/`** - Utilities and types
- Follow existing patterns for consistency

## 📝 Next Steps

1. ✅ Test all features with your real data
2. ✅ Customize branding/colors if desired
3. ✅ Set up automated backups in Supabase
4. ✅ Deploy to Vercel
5. ✅ Enjoy your new invoice tracker!

## 🎯 Optional Enhancements

### Email Notifications
- Integrate with SendGrid or Resend
- Send invoice PDFs to clients
- Overdue payment reminders

### Recurring Invoices
- Add schedule field to invoices
- Cron job to auto-create invoices

### Client Portal
- Separate login for clients
- View their invoices only
- Download PDFs/Excel files

### Analytics Dashboard
- Charts and graphs
- Revenue trends
- Client breakdown

### Multi-Currency
- Add currency field
- Convert and display in different currencies

---

**Need Help?** Check the main README.md or create an issue on GitHub!

**Enjoying the app?** Star the repository and share with others!
