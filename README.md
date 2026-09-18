# ClearBill - Invoice Tracker (Web Version)

Modern web-based invoice tracking and management system built with Next.js, Supabase, and deployed on Vercel.

## 🚀 Project Status

This is a complete rebuild of the original Flask/SQLite invoice tracker application, migrated to a modern web stack.

### ✅ Completed Features

- **Authentication System**
  - Single-user login with Supabase Auth
  - Secure password-based authentication
  - Session management with middleware

- **Database & Backend**
  - PostgreSQL database schema in Supabase
  - Complete API routes for all operations
  - Row Level Security (RLS) policies
  - Supabase Storage for receipt files

- **Invoice Management**
  - Create, view, edit, and delete invoices
  - Track payment status (paid/unpaid)
  - Automatic due date calculation (30 days)
  - Overdue status indicators
  - Tax calculation and tracking

- **Dashboard**
  - Invoice list with filtering (all/paid/unpaid)
  - Sorting by date or due date
  - Summary statistics (total, unpaid, overdue)
  - Quick actions (view, mark paid, delete)

- **Line Items API**
  - Add line items to invoices
  - Support for LABOR, HARDWARE, and OTHER types
  - Automatic subtotal calculation

- **Receipt Management API**
  - Upload receipt files to Supabase Storage
  - Organized by invoice/year/month
  - Secure file storage with signed URLs

- **Line Item Entry**
  - Spreadsheet-style grid: type straight into cells, no modal
  - Keyboard navigation (Tab, Enter, arrow keys)
  - Paste a block of rows from Excel or Google Sheets
  - Per-row autosave with inline validation

- **Settings**
  - Debt repayment tracking is an opt-in feature with an editable total
  - Turning it off hides it from invoices, exports and the summary without
    deleting any history

- **UI/UX**
  - Responsive design (mobile, tablet, desktop)
  - Dark mode support
  - Clean, modern interface with Tailwind CSS
  - Accessible navigation

- **Exports & Delivery**
  - PDF and Excel export, with in-app preview
  - Bulk invoice import from Excel
  - Send invoices by email via Microsoft Graph

### 📅 Date Handling

Invoice and line item dates are Postgres `DATE` values: calendar days with no
timezone. They are read and written exclusively through `lib/utils/dates.ts`,
which parses them at local midnight. Passing one to `new Date()` directly
parses it as UTC midnight and renders the previous day anywhere west of UTC,
which is what made reports read a day early.

## 📦 Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Authentication**: Supabase Auth
- **Deployment**: Vercel
- **Icons**: Lucide React

## 🛠️ Setup Instructions

### Prerequisites

- Node.js 18+ installed
- A Supabase account and project
- Your Supabase credentials (URL, Anon Key, Service Role Key)

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Configure Environment Variables

1. Open `.env.local` in the project root
2. Add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 3: Set Up Supabase

Follow the detailed instructions in [SUPABASE_SETUP.md](./SUPABASE_SETUP.md):

1. Run the SQL migration to create database tables
2. Create the `receipts` storage bucket
3. Set up Row Level Security policies
4. Create your user account

### Step 4: Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with your Supabase user credentials.

## 📂 Project Structure

```
invoice-tracker-web/
├── app/                          # Next.js app directory
│   ├── api/                      # API routes
│   │   ├── invoices/             # Invoice CRUD endpoints
│   │   │   └── [id]/            # Individual invoice operations
│   │   │       ├── line-items/  # Line item operations
│   │   │       └── receipts/    # Receipt operations
│   │   ├── receipts/[id]/       # Individual receipt operations
│   │   ├── summary/             # Financial reporting
│   │   └── auth/                # Authentication
│   ├── invoices/                # Invoice pages
│   │   ├── new/                 # Create invoice form
│   │   └── [id]/                # Invoice detail (to be completed)
│   ├── summary/                 # Summary page (to be completed)
│   ├── login/                   # Login page
│   ├── auth/callback/           # Auth callback handler
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Dashboard (invoice list)
│   └── globals.css              # Global styles
├── components/                  # React components
│   ├── LineItemGrid.tsx         # Spreadsheet-style line item editor
│   └── Navigation.tsx           # Sidebar navigation
├── lib/                         # Utilities and types
│   ├── supabase/                # Supabase clients
│   │   ├── client.ts            # Browser client
│   │   └── server.ts            # Server client
│   ├── types/                   # TypeScript types
│   │   └── database.types.ts    # Database schema types
│   ├── lineItems.ts             # Shared line item validation
│   ├── settings.ts              # Feature settings (debt tracking)
│   └── utils/                   # Helper functions
│       ├── calculations.ts      # Invoice calculations
│       ├── dates.ts             # Calendar-day helpers (no UTC drift)
│       └── cn.ts                # Tailwind utilities
├── supabase/                    # Supabase configuration
│   └── migrations/              # SQL schema files
│       └── 001_initial_schema.sql
├── .env.local                   # Environment variables (you need to configure this)
├── .env.local.example           # Example environment file
├── middleware.ts                # Auth middleware
├── package.json                 # Dependencies
├── tailwind.config.ts           # Tailwind configuration
├── tsconfig.json                # TypeScript configuration
├── SUPABASE_SETUP.md            # Detailed Supabase setup guide
└── README.md                    # This file
```

## 🔐 Security

- All API routes require authentication via Supabase Auth
- Row Level Security (RLS) enabled on all database tables
- Receipt files stored securely with time-limited signed URLs
- CSRF protection on all forms
- Environment variables for sensitive data
- Middleware-based session refresh

## 🚀 Deployment to Vercel

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and import your repository
3. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL` (set to your Vercel deployment URL)
4. Deploy!

Vercel will automatically deploy on every push to your main branch.

## 📊 Database Schema

### Tables

- **invoices** - Invoice header information (project, client, date, tax rate, payment status)
- **line_items** - Individual line items (description, quantity, rate, type: LABOR/HARDWARE/OTHER)
- **receipts** - Receipt file metadata (filename, storage path, upload date)
- **settings** - Application settings (key-value pairs for dark mode, etc.)

### Views

- **invoice_summaries** - Computed view with totals and overdue calculations

See [supabase/migrations/001_initial_schema.sql](./supabase/migrations/001_initial_schema.sql) for the complete schema.

## 🆘 Troubleshooting

### "Unauthorized" errors
- Check that you're logged in
- Verify `.env.local` has correct Supabase credentials
- Ensure RLS policies were created via the SQL migration

### Receipt upload fails
- Verify `receipts` storage bucket exists in Supabase
- Check that storage policies are configured
- File size limit is 16 MB by default

### Can't log in
- Ensure you created a user in Supabase Dashboard → Authentication → Users
- Check email confirmation status
- Try resetting your password

## 📝 API Endpoints

### Invoices
- `GET /api/invoices` - List all invoices (with filtering and sorting)
- `POST /api/invoices` - Create new invoice
- `GET /api/invoices/[id]` - Get single invoice with line items and receipts
- `PATCH /api/invoices/[id]` - Update invoice
- `DELETE /api/invoices/[id]` - Delete invoice (cascades to line items and receipts)

### Line Items
- `GET /api/invoices/[id]/line-items` - Get all line items for an invoice
- `POST /api/invoices/[id]/line-items` - Add line item to invoice

### Receipts
- `GET /api/invoices/[id]/receipts` - Get all receipts for an invoice (with signed URLs)
- `POST /api/invoices/[id]/receipts` - Upload receipt file
- `GET /api/receipts/[id]` - Get single receipt with signed URL
- `DELETE /api/receipts/[id]` - Delete receipt file and metadata

### Summary
- `GET /api/summary` - Get financial summary by year/month with receipt tree

### Authentication
- `POST /api/auth/logout` - Log out current user

## 🎯 Next Steps

1. **Complete Invoice Detail Page** - Build the UI to view/edit invoices with line items
2. **Build Summary Page** - Create the financial reporting UI
3. **Add PDF Export** - Implement PDF generation using jsPDF
4. **Add Excel Export/Import** - Implement Excel operations using ExcelJS
5. **Testing** - Thoroughly test all features
6. **Deploy** - Push to Vercel

## 📄 License

Private personal use only.

---

**Original Application**: Flask + SQLite Desktop App (FullDistribution/)
**New Application**: Next.js + Supabase Web App (invoice-tracker-web/)
**Migration Date**: November 2025
