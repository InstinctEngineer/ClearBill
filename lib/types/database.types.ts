export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      invoices: {
        Row: {
          id: number
          project_name: string
          client: string
          date: string
          tax_rate: number
          paid: boolean
          paid_date: string | null
          waived: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          project_name: string
          client: string
          date: string
          tax_rate: number
          paid?: boolean
          paid_date?: string | null
          waived?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          project_name?: string
          client?: string
          date?: string
          tax_rate?: number
          paid?: boolean
          paid_date?: string | null
          waived?: boolean
          updated_at?: string
        }
      }
      line_items: {
        Row: {
          id: number
          invoice_id: number
          description: string
          quantity: number
          unit_rate: number
          item_type: 'LABOR' | 'HARDWARE' | 'OTHER'
          date: string
          discount_percentage: number
          discount_reason: string | null
          applies_to_debt: boolean
          client_pays: boolean
          created_at: string
        }
        Insert: {
          id?: number
          invoice_id: number
          description: string
          quantity: number
          unit_rate: number
          item_type: 'LABOR' | 'HARDWARE' | 'OTHER'
          date: string
          discount_percentage?: number
          discount_reason?: string | null
          applies_to_debt?: boolean
          client_pays?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          invoice_id?: number
          description?: string
          quantity?: number
          unit_rate?: number
          item_type?: 'LABOR' | 'HARDWARE' | 'OTHER'
          date?: string
          discount_percentage?: number
          discount_reason?: string | null
          applies_to_debt?: boolean
          client_pays?: boolean
        }
      }
      receipts: {
        Row: {
          id: number
          invoice_id: number
          filename: string
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          id?: number
          invoice_id: number
          filename: string
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          id?: number
          invoice_id?: number
          filename?: string
          storage_path?: string
        }
      }
      settings: {
        Row: {
          id: number
          key: string
          value: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          key: string
          value: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          key?: string
          value?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      item_type: 'LABOR' | 'HARDWARE' | 'OTHER'
    }
  }
}

// Convenience types
export type Invoice = Database['public']['Tables']['invoices']['Row']
export type LineItem = Database['public']['Tables']['line_items']['Row']
export type Receipt = Database['public']['Tables']['receipts']['Row']
export type Setting = Database['public']['Tables']['settings']['Row']

export type InvoiceInsert = Database['public']['Tables']['invoices']['Insert']
export type LineItemInsert = Database['public']['Tables']['line_items']['Insert']
export type ReceiptInsert = Database['public']['Tables']['receipts']['Insert']
export type SettingInsert = Database['public']['Tables']['settings']['Insert']

export type InvoiceUpdate = Database['public']['Tables']['invoices']['Update']
export type LineItemUpdate = Database['public']['Tables']['line_items']['Update']
export type ReceiptUpdate = Database['public']['Tables']['receipts']['Update']
export type SettingUpdate = Database['public']['Tables']['settings']['Update']

// Extended types with relations and computed properties
export interface InvoiceWithDetails extends Invoice {
  line_items: LineItem[]
  receipts: Receipt[]
  subtotal: number
  tax_set_aside: number
  total: number
  due_date: string
  days_overdue: number
  overdue_status: string
}
