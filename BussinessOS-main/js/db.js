// PRD §11 tables, single-business subset for Phase 0 (no business_id column
// — this device IS one business, multi-tenancy arrives in Phase 1). IDs are
// client-generated UUIDs from the start, matching the pattern Phase 1
// (Supabase) uses, so the eventual sync migration never has to re-key
// existing data.
//
// Seeding (starter service catalog, default expense categories) is
// deliberately NOT done here — it belongs with the onboarding/New Bill
// tasks that actually consume it, not the schema task itself.

const db = new Dexie('BusinessOS');

db.version(1).stores({
  customers: 'id, phone, name',
  vehicles: 'id, customer_id, vehicle_number',
  service_catalog: 'id, is_active, category',
  jobs: 'id, customer_id, vehicle_id, status, created_at',
  job_line_items: 'id, job_id, item_type',
  job_photos: 'id, job_id, stage',
  inventory_items: 'id, name, is_active',
  inventory_transactions: 'id, inventory_item_id, type, created_at',
  invoices: 'id, job_id, customer_id, invoice_number, device_local_id, status, created_at',
  invoice_line_items: 'id, invoice_id',
  payments: 'id, invoice_id, method, paid_at',
  expenses: 'id, category_id, expense_date',
  expense_categories: 'id, name, is_custom',
});

window.db = db;
