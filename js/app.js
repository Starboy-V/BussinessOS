// Phase 0 task 6 (Job Card, PRD §6.5): the linear part of the job lifecycle.
// 'cancelled' is deliberately NOT in this array — it's a side-exit reachable
// from any non-terminal status, not a rung on the ladder, so it's handled
// separately rather than as a 5th step in the stepper.
const JOB_STATUS_ORDER = ['pending', 'in_progress', 'completed', 'delivered'];
const JOB_STATUS_LABELS = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

// Phase 0 task 9 (PRD §6.7): logo/address/footer/signature/terms/brand-color
// customization is spec'd as coming from a business-profile Settings screen,
// which doesn't exist yet in Phase 0 (no Settings task has been built —
// Backup is the only Settings item on the checklist, and even that's still
// open). Rather than block the PDF on a screen that isn't scoped yet, these
// are hardcoded placeholders. Flagged in BUILD_PROGRESS.md Blockers — swap
// this block for real Settings-backed values whenever that screen exists,
// don't silently leave it hardcoded past Phase 0.
const INVOICE_BUSINESS_PROFILE = {
  name: 'BusinessOS Garage',
  address: 'Address not set — configure in Settings',
  footer: 'Thank you for your business.',
  terms: 'Payment due on receipt unless otherwise agreed.',
  brandColorHex: '#C2410C', // matches manifest.json theme-color for now
};

// pdf-lib's StandardFonts (WinAnsi encoding) cannot encode the ₹ glyph used
// by the on-screen formatCurrency() — drawText() throws on unencodable
// characters. "Rs." is used in the PDF only; the app UI is unaffected.
function formatCurrencyPlain(amount) {
  return 'Rs. ' + Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function hexToRgb01(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return { r, g, b };
}

// Phase 0 task 10/11 (PRD §6.13): must match js/db.js's db.version(1).stores()
// keys exactly, or a backup silently misses a table. Kept as one explicit
// list, checked against js/db.js by hand, rather than trying to introspect
// Dexie's schema at runtime — introspection would be more "automatic" but
// also more likely to silently include/exclude a table on a future schema
// change without anyone noticing.
const DB_TABLE_NAMES = [
  'customers',
  'vehicles',
  'service_catalog',
  'jobs',
  'job_line_items',
  'job_photos',
  'inventory_items',
  'inventory_transactions',
  'invoices',
  'invoice_line_items',
  'payments',
  'expenses',
  'expense_categories',
];

function app() {
  return {
    screen: 'home',
    screenTitles: {
      home: 'BusinessOS',
      jobs: 'Jobs',
      bill: 'New Bill',
      inventory: 'Inventory',
      more: 'More',
    },
    get screenTitle() {
      return this.screenTitles[this.screen] || 'BusinessOS';
    },

    // ---- Home Dashboard state (Phase 0 task 4, PRD §9 / §6.10 subset) ----
    // Scope note: full §6.10 lists 12 metrics (cash/UPI split, top mechanic,
    // etc.) — this task deliberately builds only the subset named in
    // BUILD_PROGRESS.md's Next Task line. The rest are future tasks, not
    // omissions.
    dashboardLoading: true,
    todayRevenue: 0,
    todayExpenses: 0,
    todayProfit: 0,
    jobsPendingCount: 0,
    lowStockItems: [],

    // ---- New Bill state (Phase 0 task 5, PRD §9 wireframe / §6.3 / §6.7) ----
    billCustomerQuery: '',
    billCustomerResults: [],
    billSelectedCustomer: null,
    billSelectedVehicle: null,
    billNewCustomerMode: false,
    billNewCustomerName: '',
    billNewCustomerPhone: '',
    billVehicleResults: [],
    billNewVehicleMode: false,
    billNewVehicleNumber: '',
    billNewVehicleBrand: '',
    billNewVehicleModel: '',
    billServiceCatalog: [],
    billInventoryItems: [],
    billLineItems: [],
    billCustomMode: false,
    billCustomDescription: '',
    billCustomPrice: '',
    billCustomSaveToCatalog: false,
    billDiscount: 0,
    billTax: 0,
    billPaymentMethod: 'cash',
    billSaving: false,
    billSavedSummary: null,

    get billSubtotal() {
      return this.billLineItems.reduce(
        (sum, li) => sum + Number(li.quantity) * Number(li.unit_price),
        0
      );
    },
    get billTotal() {
      const t = this.billSubtotal - Number(this.billDiscount || 0) + Number(this.billTax || 0);
      return t < 0 ? 0 : t;
    },

    // ---- Jobs / Job Card state (Phase 0 task 6, PRD §9 wireframe / §6.5) ----
    // jobsView switches between the three sub-screens that live under the
    // "Jobs" nav tab — a list didn't exist before this task since there was
    // nowhere to reach a Job Card from. Building it is necessary plumbing
    // for this task, not scope creep (same precedent as New Bill needing
    // customer/vehicle search-or-create built alongside it).
    jobsView: 'list', // 'list' | 'newJob' | 'detail'
    jobsListLoading: true,
    jobsList: [], // enriched: [{ job, customerName, vehicleNumber }]
    jobsAscendingIds: [], // creation order, oldest first — see selectedJobDisplayNumber
    mechanicSuggestions: [], // distinct mechanic names seen so far, for the datalist

    // New Job form (mirrors New Bill's customer/vehicle pattern under a
    // `job` prefix rather than `bill`, since they're independent flows that
    // end in different records)
    jobCustomerQuery: '',
    jobCustomerResults: [],
    jobSelectedCustomer: null,
    jobSelectedVehicle: null,
    jobNewCustomerMode: false,
    jobNewCustomerName: '',
    jobNewCustomerPhone: '',
    jobVehicleResults: [],
    jobNewVehicleMode: false,
    jobNewVehicleNumber: '',
    jobNewVehicleBrand: '',
    jobNewVehicleModel: '',
    jobComplaint: '',
    jobSaving: false,

    // Job Card detail
    selectedJob: null,
    selectedJobCustomer: null,
    selectedJobVehicle: null,
    selectedJobIntakePhotos: [],
    selectedJobCompletionPhotos: [],
    jobMechanicInput: '', // shared by New Job form and detail's mechanic field
    jobNewNoteText: '',
    jobAddNoteMode: false,

    get jobNextStatus() {
      if (!this.selectedJob) return null;
      const idx = JOB_STATUS_ORDER.indexOf(this.selectedJob.status);
      if (idx === -1 || idx === JOB_STATUS_ORDER.length - 1) return null;
      return JOB_STATUS_ORDER[idx + 1];
    },
    // Phase 0 has no job_number counter (unlike invoice_number's row-locked
    // counter in §6.7 — jobs were never given an equivalent in §11's schema).
    // This is a local-only display index recomputed from creation order each
    // time the list loads, NOT a stable persisted identifier. Fine for a
    // solo-garage Phase 0 UI; would need a real counter if jobs are ever
    // synced/merged across devices.
    get selectedJobDisplayNumber() {
      if (!this.selectedJob) return '';
      const idx = this.jobsAscendingIds.indexOf(this.selectedJob.id);
      return String(idx + 1).padStart(4, '0');
    },
    get jobNotesList() {
      if (!this.selectedJob || !this.selectedJob.notes) return [];
      return this.selectedJob.notes.split('\n').filter(Boolean).reverse();
    },

    // ---- Customer/Vehicle Profile state (Phase 0 task 7, PRD §6.4 / §9) ----
    // Reached via the "More" tab — §8 already answers the "where does this
    // live" question flagged in BUILD_PROGRESS.md's Next Task ("customers,
    // reports, settings folded here to avoid tab overload"), so this wasn't
    // actually an open decision once §8 was re-read, just an unread one.
    moreView: 'search', // 'search' | 'profile' | 'settings'
    customerSearchQuery: '',
    customerSearchResults: [], // ranked: [{ customer, matchedVehicle, rank }]
    profileCustomer: null,
    profileVehicles: [],
    profileJobs: [],
    profileInvoices: [], // [{ invoice, payments }]

    // ---- Settings / Backup state (Phase 0 tasks 10 & 11, PRD §6.13) ----
    backupBusy: false,
    backupMessage: '', // transient status line, cleared on next action
    restoreBusy: false,
    restoreMessage: '',

    // First-run restore prompt: shown only when local storage looks
    // genuinely empty AND no "already set up" flag exists yet — an
    // existing install upgrading to this version must NOT see this, so
    // checkFirstRun() only shows it when both conditions hold, not just
    // "flag missing" (an existing install predates this flag entirely).
    showFirstRunPrompt: false,
    firstRunBusy: false,
    firstRunMessage: '',

    // ---- Inventory state (Phase 0 task 8, PRD §6.6) ----
    // Scope note: only "Local Stock" + purchase recording are built here.
    // "Ordered Parts" (in-transit tracking, expected delivery, received
    // toggle) is deliberately NOT built this task — see BUILD_PROGRESS.md
    // Blockers for the real §5-vs-§6.6/§9 scope conflict behind that call.
    inventoryLoading: true,
    inventoryItems: [],
    inventoryAddMode: false,
    inventoryNewName: '',
    inventoryNewCategory: '',
    inventoryNewBuyingPrice: '',
    inventoryNewSellingPrice: '',
    inventoryNewMinStock: '',
    inventoryPurchaseItemId: null, // which row's inline purchase form is open
    inventoryPurchaseQty: '',
    inventoryPurchaseUnitCost: '',
    inventoryPurchasePaidTo: '',
    inventorySaving: false,

    async init() {
      console.log('BusinessOS shell initialized. DB ready:', !!window.db);
      await this.checkFirstRun();
      await this.loadDashboard();
    },

    // PRD §6.13 edge case: "owner uninstalls and reinstalls... reinstall
    // flow must offer Restore from backup file as a first-run option, not
    // just start fresh." Detecting "first run" purely from an empty DB
    // would wrongly fire for a brand-new install too (which is fine — same
    // prompt applies) but WOULD wrongly refire for an existing install that
    // happens to have zero customers yet (e.g. day 1, before this feature
    // existed). The `businessos_onboarded` localStorage flag disambiguates:
    // only show the prompt when the DB is empty AND the flag was never set,
    // then set the flag either way so it never shows twice.
    async checkFirstRun() {
      if (localStorage.getItem('businessos_onboarded')) return;
      const counts = await Promise.all(
        DB_TABLE_NAMES.map((t) => window.db[t].count())
      );
      const isEmpty = counts.every((c) => c === 0);
      if (isEmpty) {
        this.showFirstRunPrompt = true;
      } else {
        // Existing install predating this flag — don't interrupt it.
        localStorage.setItem('businessos_onboarded', '1');
      }
    },
    dismissFirstRunStartFresh() {
      localStorage.setItem('businessos_onboarded', '1');
      this.showFirstRunPrompt = false;
    },
    async onFirstRunRestoreSelected(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      this.firstRunBusy = true;
      this.firstRunMessage = '';
      try {
        await this.restoreFromBackupFile(file, { skipConfirm: true });
        localStorage.setItem('businessos_onboarded', '1');
        this.showFirstRunPrompt = false;
        await this.loadDashboard();
      } catch (err) {
        this.firstRunMessage = 'Restore failed — check this is a BusinessOS backup file. (' + (err && err.message ? err.message : 'unknown error') + ')';
      }
      this.firstRunBusy = false;
      event.target.value = '';
    },
    go(screen) {
      this.screen = screen;
      if (screen === 'home') this.loadDashboard();
      if (screen === 'bill') this.openBillScreen();
      if (screen === 'jobs') this.openJobsScreen();
      if (screen === 'more') this.openMoreScreen();
      if (screen === 'inventory') this.openInventoryScreen();
    },

    async loadDashboard() {
      this.dashboardLoading = true;
      const { start, end } = this.todayBounds();

      const [payments, expenses, jobs, inventoryItems] = await Promise.all([
        window.db.payments.toArray(),
        window.db.expenses.toArray(),
        window.db.jobs.toArray(),
        window.db.inventory_items.toArray(),
      ]);

      // Revenue = cash actually collected, per §6.8 ("distinct from what's
      // invoiced"). A 'credit' payment record means "owed, to be collected
      // later" — it must NOT count as revenue, even though it lives in the
      // same `payments` table. (Bug fix vs. the original task 4 commit,
      // found while building New Bill's payment step in task 5 — that
      // version summed all methods including credit.)
      this.todayRevenue = payments
        .filter((p) => p.method !== 'credit' && this.isWithin(p.paid_at, start, end))
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      this.todayExpenses = expenses
        .filter((e) => this.isWithin(e.expense_date, start, end))
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);

      this.todayProfit = this.todayRevenue - this.todayExpenses;

      // "Pending" here means not-yet-handed-back-to-customer (pending +
      // in_progress), which is what a garage owner means by "jobs pending"
      // day to day — not the literal 'pending' enum value alone.
      this.jobsPendingCount = jobs.filter(
        (j) => j.status === 'pending' || j.status === 'in_progress'
      ).length;

      this.lowStockItems = inventoryItems.filter(
        (i) => i.is_active !== false && Number(i.current_stock) <= Number(i.min_stock)
      );

      this.dashboardLoading = false;
    },

    todayBounds() {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { start, end };
    },
    // Timestamp convention (new, applies app-wide from here on): all
    // date/time fields are stored as ISO 8601 strings, not Date objects —
    // safest for IndexedDB structured-clone quirks and matches what the
    // JSON backup/restore feature (§6.13) needs anyway. Future tasks
    // writing to jobs/expenses/payments/invoices should follow this.
    isWithin(isoValue, start, end) {
      if (!isoValue) return false;
      const d = new Date(isoValue);
      return d >= start && d < end;
    },
    formatCurrency(amount) {
      return '₹' + Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    },

    // ---- New Bill methods ----

    async openBillScreen() {
      await this.ensureServiceCatalogSeeded();
      this.billServiceCatalog = await this.loadActiveServiceCatalog();
      this.billInventoryItems = await this.loadActiveInventoryItems();
    },

    // Seeds the exact starter catalog PRD §4.1 specifies for the
    // `business_type_templates` 'garage' row — reused directly here since
    // Phase 0 has no business_type_templates table to source it from.
    // Idempotent: only runs while the table is empty.
    async ensureServiceCatalogSeeded() {
      const count = await window.db.service_catalog.count();
      if (count > 0) return;
      const starter = [
        { name: 'Car Wash', price: 150 },
        { name: 'Oil Change', price: 400 },
        { name: 'Brake Service', price: 600 },
      ];
      const now = new Date().toISOString();
      for (const s of starter) {
        await window.db.service_catalog.add({
          id: crypto.randomUUID(),
          name: s.name,
          category: null,
          price: s.price,
          is_active: true,
          created_at: now,
        });
      }
    },
    async loadActiveServiceCatalog() {
      return (await window.db.service_catalog.toArray()).filter((s) => s.is_active !== false);
    },
    async loadActiveInventoryItems() {
      return (await window.db.inventory_items.toArray()).filter((i) => i.is_active !== false);
    },

    // Search matches customers by name/phone AND vehicles by plate, since
    // the PRD wireframe shows one combined "search customer/plate" box
    // (§9). A vehicle match surfaces its owning customer. This search is
    // a lookup convenience only — invoices don't carry a vehicle_id (only
    // jobs do, per §11), and Job Card isn't built yet, so no vehicle link
    // is persisted on the bill itself yet.
    async searchBillCustomer() {
      const q = this.billCustomerQuery.trim().toLowerCase();
      if (!q) {
        this.billCustomerResults = [];
        return;
      }
      const [customers, vehicles] = await Promise.all([
        window.db.customers.toArray(),
        window.db.vehicles.toArray(),
      ]);
      const viaVehicle = vehicles
        .filter((v) => (v.vehicle_number || '').toLowerCase().includes(q))
        .map((v) => {
          const customer = customers.find((c) => c.id === v.customer_id);
          return customer ? { customer, matchedVehicle: v } : null;
        })
        .filter(Boolean);
      const viaName = customers
        .filter((c) => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q))
        .map((c) => ({ customer: c, matchedVehicle: null }));

      const seen = new Set();
      this.billCustomerResults = [...viaVehicle, ...viaName].filter((r) => {
        if (seen.has(r.customer.id)) return false;
        seen.add(r.customer.id);
        return true;
      });
    },
    selectBillCustomer(result) {
      this.billSelectedCustomer = result.customer;
      this.billSelectedVehicle = result.matchedVehicle || null;
      this.billCustomerResults = [];
      this.billCustomerQuery = '';
      this.loadBillVehicles();
    },
    changeBillCustomer() {
      this.billSelectedCustomer = null;
      this.billSelectedVehicle = null;
      this.billVehicleResults = [];
    },
    async saveNewBillCustomer() {
      const name = this.billNewCustomerName.trim();
      if (!name) return;
      const customer = {
        id: crypto.randomUUID(),
        name,
        phone: this.billNewCustomerPhone.trim() || null,
        created_at: new Date().toISOString(),
      };
      await window.db.customers.add(customer);
      this.billSelectedCustomer = customer;
      this.billSelectedVehicle = null;
      this.billNewCustomerMode = false;
      this.billNewCustomerName = '';
      this.billNewCustomerPhone = '';
      this.loadBillVehicles();
    },

    async loadBillVehicles() {
      if (!this.billSelectedCustomer) {
        this.billVehicleResults = [];
        return;
      }
      this.billVehicleResults = await window.db.vehicles
        .where('customer_id')
        .equals(this.billSelectedCustomer.id)
        .toArray();
    },
    async saveNewBillVehicle() {
      const number = this.billNewVehicleNumber.trim();
      if (!number || !this.billSelectedCustomer) return;
      const vehicle = {
        id: crypto.randomUUID(),
        customer_id: this.billSelectedCustomer.id,
        vehicle_number: number.toUpperCase(),
        brand: this.billNewVehicleBrand.trim() || null,
        model: this.billNewVehicleModel.trim() || null,
        created_at: new Date().toISOString(),
      };
      await window.db.vehicles.add(vehicle);
      this.billSelectedVehicle = vehicle;
      this.billNewVehicleMode = false;
      this.billNewVehicleNumber = '';
      this.billNewVehicleBrand = '';
      this.billNewVehicleModel = '';
      this.loadBillVehicles();
    },

    addServiceToBill(service) {
      this.billLineItems.push({
        id: crypto.randomUUID(),
        item_type: 'service',
        reference_id: service.id,
        description: service.name,
        quantity: 1,
        unit_price: service.price,
      });
    },
    // Note: adding a part here does NOT decrement inventory_items.current_stock
    // yet — that atomic stock↔billing link is explicitly the Inventory
    // screens task (§6.6), still unchecked in BUILD_PROGRESS.md.
    addPartToBill(part) {
      this.billLineItems.push({
        id: crypto.randomUUID(),
        item_type: 'part',
        reference_id: part.id,
        description: part.name,
        quantity: 1,
        unit_price: part.selling_price || 0,
      });
    },
    async addCustomLineItem() {
      const description = this.billCustomDescription.trim();
      const price = Number(this.billCustomPrice) || 0;
      if (!description) return;

      this.billLineItems.push({
        id: crypto.randomUUID(),
        item_type: 'custom',
        reference_id: null,
        description,
        quantity: 1,
        unit_price: price,
      });

      // §6.3: "+ Custom Service" asks "Save to catalog?" — a checkbox here
      // instead of a blocking confirm(), so a busy counter flow never stalls.
      if (this.billCustomSaveToCatalog) {
        await window.db.service_catalog.add({
          id: crypto.randomUUID(),
          name: description,
          category: null,
          price,
          is_active: true,
          created_at: new Date().toISOString(),
        });
        this.billServiceCatalog = await this.loadActiveServiceCatalog();
      }

      this.billCustomDescription = '';
      this.billCustomPrice = '';
      this.billCustomSaveToCatalog = false;
      this.billCustomMode = false;
    },
    incrementLineItem(id) {
      const li = this.billLineItems.find((x) => x.id === id);
      if (li) li.quantity += 1;
    },
    decrementLineItem(id) {
      const li = this.billLineItems.find((x) => x.id === id);
      if (!li) return;
      if (li.quantity <= 1) {
        this.removeBillLineItem(id);
      } else {
        li.quantity -= 1;
      }
    },
    removeBillLineItem(id) {
      this.billLineItems = this.billLineItems.filter((li) => li.id !== id);
    },

    // Records the bill AND a payment in one step (see BUILD_PROGRESS.md
    // Blockers — Phase 0's checklist has no separate Payments screen, so
    // New Bill absorbs that step for now). 'credit' still writes a
    // payments row (§6.8: it's a valid method meaning "owed"), but the
    // invoice status stays 'pending' rather than 'paid', and the Dashboard
    // excludes credit from Revenue accordingly.
    //
    // Wrapped in one Dexie transaction (added in task 8) per §7's "every
    // financial write... must be atomic" NFR — this was a gap left over
    // from task 5 (sequential unguarded writes), closed here because task
    // 8 needed the invoice write and the part-stock decrement to be
    // atomic with each other anyway, so the whole method got the same
    // treatment rather than leaving payments/line-items unguarded next to
    // a guarded stock write.
    async saveBill() {
      if (!this.billSelectedCustomer || this.billLineItems.length === 0 || this.billSaving) return;
      this.billSaving = true;

      const now = new Date().toISOString();
      const invoiceId = crypto.randomUUID();
      const deviceLocalId = 'LOCAL-' + Date.now();
      const partLineItems = this.billLineItems.filter(
        (li) => li.item_type === 'part' && li.reference_id
      );

      await window.db.transaction(
        'rw',
        window.db.invoices,
        window.db.invoice_line_items,
        window.db.payments,
        window.db.inventory_items,
        window.db.inventory_transactions,
        async () => {
          await window.db.invoices.add({
            id: invoiceId,
            job_id: null,
            customer_id: this.billSelectedCustomer.id,
            invoice_number: null, // assigned at sync time in Phase 1 (§6.7) — no sync exists in Phase 0
            device_local_id: deviceLocalId,
            subtotal: this.billSubtotal,
            discount: Number(this.billDiscount || 0),
            tax: Number(this.billTax || 0),
            total: this.billTotal,
            status: this.billPaymentMethod === 'credit' ? 'pending' : 'paid',
            pdf_url: null,
            created_at: now,
          });

          for (const li of this.billLineItems) {
            await window.db.invoice_line_items.add({
              id: crypto.randomUUID(),
              invoice_id: invoiceId,
              description: li.description,
              quantity: li.quantity,
              unit_price: li.unit_price,
              line_total: li.quantity * li.unit_price,
            });
          }

          await window.db.payments.add({
            id: crypto.randomUUID(),
            invoice_id: invoiceId,
            amount: this.billTotal,
            method: this.billPaymentMethod,
            paid_at: now,
          });

          // §6.6: billing a part auto-decrements stock. Selling more than
          // is on hand is explicitly ALLOWED, not blocked (§6.6 edge
          // case) — the Local Stock screen flags the resulting negative
          // number in red instead of silently normalizing it.
          //
          // reference_type is 'manual' here, not something like 'invoice',
          // because §11's inventory_transactions check constraint only
          // allows 'job' | 'expense' | 'manual' — none of which is really
          // "sold via an invoice line item." Flagged in BUILD_PROGRESS.md
          // Blockers as a real schema gap rather than silently picking one
          // of the three and pretending it fits.
          for (const li of partLineItems) {
            const item = await window.db.inventory_items.get(li.reference_id);
            if (!item) continue;
            const newStock = Number(item.current_stock || 0) - Number(li.quantity);
            await window.db.inventory_items.update(item.id, { current_stock: newStock });
            await window.db.inventory_transactions.add({
              id: crypto.randomUUID(),
              inventory_item_id: item.id,
              type: 'sale',
              quantity: -Number(li.quantity),
              reference_type: 'manual',
              reference_id: invoiceId,
              created_at: now,
            });
          }
        }
      );

      // Snapshotted here (not read back from Dexie) because Phase 0's PDF
      // generation (task 9) needs line items + discount/tax + contact info
      // together, and this is the one point in the flow that already has
      // all of it in memory without a second query.
      this.billSavedSummary = {
        invoiceId,
        deviceLocalId,
        createdAt: now,
        customerName: this.billSelectedCustomer.name,
        customerPhone: this.billSelectedCustomer.phone || null,
        lineItems: this.billLineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          line_total: li.quantity * li.unit_price,
        })),
        subtotal: this.billSubtotal,
        discount: Number(this.billDiscount || 0),
        tax: Number(this.billTax || 0),
        total: this.billTotal,
        paymentMethod: this.billPaymentMethod,
      };
      this.resetBillDraft();
      this.billSaving = false;
      await this.loadDashboard();
      if (partLineItems.length > 0) await this.loadInventoryItems();
    },
    resetBillDraft() {
      this.billSelectedCustomer = null;
      this.billSelectedVehicle = null;
      this.billVehicleResults = [];
      this.billLineItems = [];
      this.billDiscount = 0;
      this.billTax = 0;
      this.billPaymentMethod = 'cash';
      this.billCustomerQuery = '';
      this.billCustomerResults = [];
      this.billNewCustomerMode = false;
      this.billNewVehicleMode = false;
    },
    startNewBill() {
      this.billSavedSummary = null;
    },

    // ---- Invoice PDF generation + sharing (Phase 0 task 9, PRD §6.7) ----
    //
    // Uses pdf-lib entirely client-side, no server round-trip, per the
    // "Decisions Already Locked In" entry for PDF generation.
    //
    // Reference number rule: Phase 0 never assigns a real `invoice_number`
    // (that's a row-locked counter assigned at sync time, §6.7, and no sync
    // exists yet) — so the PDF header shows `device_local_id` labeled
    // "pending sync" instead, matching the same rule the UI already follows
    // for the "Invoice pending sync" label (task 7). Do NOT put a fabricated
    // sequential number on this PDF even though it looks nicer — a garage
    // owner handing this to a customer needs the number to be permanent
    // from the moment it's shown, and this one isn't yet.
    async buildInvoicePdfBytes(summary) {
      const { PDFDocument, StandardFonts, rgb } = PDFLib;
      const doc = await PDFDocument.create();
      const page = doc.addPage([595, 842]); // A4 portrait, points
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const bold = await doc.embedFont(StandardFonts.HelveticaBold);

      const brand = hexToRgb01(INVOICE_BUSINESS_PROFILE.brandColorHex);
      const margin = 40;
      let y = 800;

      const line = (text, opts = {}) => {
        page.drawText(text, {
          x: opts.x ?? margin,
          y,
          size: opts.size ?? 11,
          font: opts.bold ? bold : font,
          color: opts.color ?? rgb(0.13, 0.13, 0.13),
        });
        y -= opts.gap ?? 18;
      };

      line(INVOICE_BUSINESS_PROFILE.name, { size: 18, bold: true, color: rgb(brand.r, brand.g, brand.b), gap: 22 });
      line(INVOICE_BUSINESS_PROFILE.address, { size: 9, color: rgb(0.4, 0.4, 0.4), gap: 26 });

      line('INVOICE', { size: 14, bold: true, gap: 20 });
      line(`Ref: ${summary.deviceLocalId} (pending sync — not a final invoice number)`, { size: 9, color: rgb(0.5, 0.2, 0.05), gap: 16 });
      line(`Date: ${new Date(summary.createdAt).toLocaleString('en-IN')}`, { size: 10, gap: 22 });

      line(`Bill to: ${summary.customerName}`, { bold: true, gap: 16 });
      if (summary.customerPhone) line(summary.customerPhone, { size: 10, color: rgb(0.4, 0.4, 0.4), gap: 22 });
      else y -= 6;

      // Line items table
      line('Description', { bold: true, size: 10 });
      page.drawText('Qty', { x: 330, y: y + 18, size: 10, font: bold });
      page.drawText('Rate', { x: 400, y: y + 18, size: 10, font: bold });
      page.drawText('Amount', { x: 480, y: y + 18, size: 10, font: bold });
      y -= 6;
      page.drawLine({ start: { x: margin, y }, end: { x: 555, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
      y -= 14;

      for (const li of summary.lineItems) {
        page.drawText(String(li.description).slice(0, 40), { x: margin, y, size: 10, font });
        page.drawText(String(li.quantity), { x: 330, y, size: 10, font });
        page.drawText(formatCurrencyPlain(li.unit_price), { x: 400, y, size: 10, font });
        page.drawText(formatCurrencyPlain(li.line_total), { x: 480, y, size: 10, font });
        y -= 16;
      }

      y -= 10;
      page.drawLine({ start: { x: 330, y }, end: { x: 555, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
      y -= 16;

      const totalsRow = (label, value, opts = {}) => {
        page.drawText(label, { x: 400, y, size: opts.size ?? 10, font: opts.bold ? bold : font });
        page.drawText(formatCurrencyPlain(value), { x: 480, y, size: opts.size ?? 10, font: opts.bold ? bold : font });
        y -= 16;
      };
      totalsRow('Subtotal', summary.subtotal);
      if (summary.discount) totalsRow('Discount', -summary.discount);
      if (summary.tax) totalsRow('Tax', summary.tax);
      totalsRow('Total', summary.total, { bold: true, size: 12 });
      totalsRow('Paid via', summary.paymentMethod === 'credit' ? 'Credit (owed)' : summary.paymentMethod, {});

      y -= 20;
      line(INVOICE_BUSINESS_PROFILE.terms, { size: 9, color: rgb(0.4, 0.4, 0.4), gap: 14 });
      line(INVOICE_BUSINESS_PROFILE.footer, { size: 9, color: rgb(0.4, 0.4, 0.4) });

      return doc.save();
    },

    // Generic Share Sheet — Web Share API with a real File, per the
    // "Android Share Sheet, not a custom share UI" decision. The user picks
    // WhatsApp/Telegram/Email/Drive/Nearby Share themselves from the sheet;
    // if they pick WhatsApp here, the PDF attaches automatically (unlike
    // the wa.me link below, which can only pre-fill text, not attach a file
    // — that's a real platform limitation, not a build gap).
    //
    // Extracted as shareOrDownloadFile() (task 10) so the Backup export
    // below reuses the exact same share-or-fallback logic instead of a
    // second copy, per this task's own Next Task note.
    async shareOrDownloadFile(file, shareTitle, shareText) {
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: shareTitle, text: shareText });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return; // user cancelled the sheet, not an error
          // fall through to download fallback below
        }
      }

      // Fallback for browsers/devices without file-capable Web Share
      // (e.g. testing on desktop Chrome) — download instead of failing
      // silently, so the file is still usable.
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    },

    async shareInvoicePdf() {
      if (!this.billSavedSummary) return;
      const bytes = await this.buildInvoicePdfBytes(this.billSavedSummary);
      const filename = `invoice-${this.billSavedSummary.deviceLocalId}.pdf`;
      const file = new File([bytes], filename, { type: 'application/pdf' });
      await this.shareOrDownloadFile(file, 'Invoice', `Invoice for ${this.billSavedSummary.customerName}`);
    },

    // Zero-cost wa.me deep link (PRD §6.7's "zero-cost middle ground"),
    // separate from the Share Sheet above — this can only pre-fill a text
    // message, it cannot attach the PDF (no such capability in the wa.me
    // URL scheme), so it's offered as a one-tap *messaging* shortcut
    // alongside the Share Sheet, not a replacement for it.
    //
    // Country-code handling: the PRD doesn't specify this, so as a
    // documented assumption (flagged in BUILD_PROGRESS.md Blockers) a bare
    // 10-digit number is treated as an Indian mobile number and prefixed
    // with 91. Numbers already carrying a country code (11+ digits) are
    // left as-is.
    whatsappShareUrl() {
      const phone = this.billSavedSummary && this.billSavedSummary.customerPhone;
      if (!phone) return null;
      const digits = String(phone).replace(/\D/g, '');
      if (!digits) return null;
      const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
      const text = encodeURIComponent(
        `Hi ${this.billSavedSummary.customerName}, your invoice total is ${formatCurrencyPlain(this.billSavedSummary.total)}. Thank you!`
      );
      return `https://wa.me/${withCountryCode}?text=${text}`;
    },

    // ---- Settings / Backup (Phase 0 tasks 10 & 11, PRD §6.13) ----
    // Combined into one session's work since export and restore share the
    // same file format and most of the same code path — splitting them
    // across two sessions would mean restore's format has to guess at
    // export's, rather than being written against it directly.

    openSettingsScreen() {
      this.moreView = 'settings';
      this.backupMessage = '';
      this.restoreMessage = '';
    },

    // Zero-connectivity by construction — everything here is a Dexie read
    // and a client-side file write, no network call anywhere, per §6.13's
    // "must work with zero connectivity" rule.
    async exportBackup() {
      this.backupBusy = true;
      this.backupMessage = '';
      try {
        const payload = { format: 'businessos-backup', version: 1, exported_at: new Date().toISOString(), tables: {} };
        for (const t of DB_TABLE_NAMES) {
          payload.tables[t] = await window.db[t].toArray();
        }
        const filename = `businessos-backup-${new Date().toISOString().slice(0, 10)}.json`;
        const file = new File([JSON.stringify(payload)], filename, { type: 'application/json' });
        await this.shareOrDownloadFile(file, 'BusinessOS Backup', 'BusinessOS data backup');
        this.backupMessage = 'Backup ready — saved or shared just now.';
      } catch (err) {
        this.backupMessage = 'Export failed: ' + (err && err.message ? err.message : 'unknown error');
      }
      this.backupBusy = false;
    },

    // Shared by both Settings → Restore and the first-run prompt. Requires
    // explicit confirmation before wiping existing data — this is the one
    // place in the app that can destroy everything in one action, so it
    // does NOT get the "undo toast, no confirm dialog" treatment §8 prefers
    // for low-risk actions; this is deliberately high-risk-dialog territory.
    async restoreFromBackupFile(file, opts = {}) {
      const text = await file.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('not valid JSON');
      }
      if (!payload || payload.format !== 'businessos-backup' || !payload.tables) {
        throw new Error('not a recognized BusinessOS backup file');
      }
      if (!opts.skipConfirm) {
        const ok = window.confirm(
          'Restoring will REPLACE all current data on this device with the backup. This cannot be undone. Continue?'
        );
        if (!ok) return;
      }
      await window.db.transaction('rw', DB_TABLE_NAMES.map((t) => window.db[t]), async () => {
        for (const t of DB_TABLE_NAMES) {
          await window.db[t].clear();
          const rows = payload.tables[t];
          if (Array.isArray(rows) && rows.length > 0) {
            await window.db[t].bulkPut(rows);
          }
        }
      });
    },

    triggerRestoreFilePicker() {
      this.$refs.restoreFileInput.click();
    },
    async onSettingsRestoreSelected(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      this.restoreBusy = true;
      this.restoreMessage = '';
      try {
        await this.restoreFromBackupFile(file);
        this.restoreMessage = 'Restore complete.';
        await this.loadDashboard();
      } catch (err) {
        this.restoreMessage = 'Restore failed: ' + (err && err.message ? err.message : 'unknown error');
      }
      this.restoreBusy = false;
      event.target.value = '';
    },

    // ---- Jobs / Job Card methods (Phase 0 task 6) ----

    openJobsScreen() {
      this.jobsView = 'list';
      this.loadJobsList();
    },

    async loadJobsList() {
      this.jobsListLoading = true;
      const [jobs, customers, vehicles] = await Promise.all([
        window.db.jobs.toArray(),
        window.db.customers.toArray(),
        window.db.vehicles.toArray(),
      ]);
      const customerMap = new Map(customers.map((c) => [c.id, c]));
      const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));

      const ascending = [...jobs].sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      );
      this.jobsAscendingIds = ascending.map((j) => j.id);

      this.jobsList = jobs
        .slice()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map((j) => ({
          job: j,
          customerName: (customerMap.get(j.customer_id) || {}).name || '—',
          vehicleNumber: j.vehicle_id
            ? (vehicleMap.get(j.vehicle_id) || {}).vehicle_number || ''
            : '',
        }));

      const mechSet = new Set();
      jobs.forEach((j) => {
        const m = j.custom_fields && j.custom_fields.mechanic_name;
        if (m) mechSet.add(m);
      });
      this.mechanicSuggestions = [...mechSet];

      this.jobsListLoading = false;
    },

    jobStatusLabel(status) {
      return JOB_STATUS_LABELS[status] || status;
    },
    // Drives the stepper's per-step styling: a step is 'done' if the job has
    // already passed it, 'current' if it's the job's live status, 'upcoming'
    // otherwise — or 'cancelled' for every step at once when the job itself
    // is cancelled, since cancellation isn't a position on the ladder.
    jobStatusStepState(status, step) {
      if (status === 'cancelled') return 'cancelled';
      const curIdx = JOB_STATUS_ORDER.indexOf(status);
      const stepIdx = JOB_STATUS_ORDER.indexOf(step);
      if (stepIdx < curIdx) return 'done';
      if (stepIdx === curIdx) return 'current';
      return 'upcoming';
    },

    startNewJob() {
      this.resetNewJobForm();
      this.jobsView = 'newJob';
    },
    resetNewJobForm() {
      this.jobSelectedCustomer = null;
      this.jobSelectedVehicle = null;
      this.jobVehicleResults = [];
      this.jobComplaint = '';
      this.jobMechanicInput = '';
      this.jobCustomerQuery = '';
      this.jobCustomerResults = [];
      this.jobNewCustomerMode = false;
      this.jobNewVehicleMode = false;
    },

    // Customer/vehicle search-or-create, duplicated from New Bill's version
    // under a `job` prefix rather than shared — see BUILD_PROGRESS.md Files
    // Created notes: worth extracting into one helper once a third screen
    // needs the same pattern, not worth the abstraction for two.
    async searchJobCustomer() {
      const q = this.jobCustomerQuery.trim().toLowerCase();
      if (!q) {
        this.jobCustomerResults = [];
        return;
      }
      const [customers, vehicles] = await Promise.all([
        window.db.customers.toArray(),
        window.db.vehicles.toArray(),
      ]);
      const viaVehicle = vehicles
        .filter((v) => (v.vehicle_number || '').toLowerCase().includes(q))
        .map((v) => {
          const customer = customers.find((c) => c.id === v.customer_id);
          return customer ? { customer, matchedVehicle: v } : null;
        })
        .filter(Boolean);
      const viaName = customers
        .filter((c) => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q))
        .map((c) => ({ customer: c, matchedVehicle: null }));

      const seen = new Set();
      this.jobCustomerResults = [...viaVehicle, ...viaName].filter((r) => {
        if (seen.has(r.customer.id)) return false;
        seen.add(r.customer.id);
        return true;
      });
    },
    selectJobCustomer(result) {
      this.jobSelectedCustomer = result.customer;
      this.jobSelectedVehicle = result.matchedVehicle || null;
      this.jobCustomerResults = [];
      this.jobCustomerQuery = '';
      this.loadJobVehicles();
    },
    changeJobCustomer() {
      this.jobSelectedCustomer = null;
      this.jobSelectedVehicle = null;
      this.jobVehicleResults = [];
    },
    async saveNewJobCustomer() {
      const name = this.jobNewCustomerName.trim();
      if (!name) return;
      const customer = {
        id: crypto.randomUUID(),
        name,
        phone: this.jobNewCustomerPhone.trim() || null,
        created_at: new Date().toISOString(),
      };
      await window.db.customers.add(customer);
      this.jobSelectedCustomer = customer;
      this.jobSelectedVehicle = null;
      this.jobNewCustomerMode = false;
      this.jobNewCustomerName = '';
      this.jobNewCustomerPhone = '';
      this.loadJobVehicles();
    },
    async loadJobVehicles() {
      if (!this.jobSelectedCustomer) {
        this.jobVehicleResults = [];
        return;
      }
      this.jobVehicleResults = await window.db.vehicles
        .where('customer_id')
        .equals(this.jobSelectedCustomer.id)
        .toArray();
    },
    async saveNewJobVehicle() {
      const number = this.jobNewVehicleNumber.trim();
      if (!number || !this.jobSelectedCustomer) return;
      const vehicle = {
        id: crypto.randomUUID(),
        customer_id: this.jobSelectedCustomer.id,
        vehicle_number: number.toUpperCase(),
        brand: this.jobNewVehicleBrand.trim() || null,
        model: this.jobNewVehicleModel.trim() || null,
        created_at: new Date().toISOString(),
      };
      await window.db.vehicles.add(vehicle);
      this.jobSelectedVehicle = vehicle;
      this.jobNewVehicleMode = false;
      this.jobNewVehicleNumber = '';
      this.jobNewVehicleBrand = '';
      this.jobNewVehicleModel = '';
      this.loadJobVehicles();
    },

    // vehicle_id nullable per §11/§4.1 — a job can be created with only a
    // customer, same as the PRD's multi-vertical rationale intends.
    async saveNewJob() {
      if (!this.jobSelectedCustomer || this.jobSaving) return;
      this.jobSaving = true;

      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      await window.db.jobs.add({
        id,
        vehicle_id: this.jobSelectedVehicle ? this.jobSelectedVehicle.id : null,
        customer_id: this.jobSelectedCustomer.id,
        // No profiles/workers table exists in Phase 0 (§6.11 is a Phase 1+
        // concept), so there's no id to put here yet — see BUILD_PROGRESS.md
        // Blockers re: mechanic_name being freeform text instead.
        assigned_worker_id: null,
        complaint: this.jobComplaint.trim() || null,
        status: 'pending',
        expected_delivery_at: null,
        notes: '',
        custom_fields: {
          mechanic_name: this.jobMechanicInput.trim() || null,
          status_history: [{ status: 'pending', at: now }],
        },
        created_at: now,
        updated_at: now,
      });

      this.jobSaving = false;
      this.resetNewJobForm();
      await this.loadJobsList();
      await this.openJobDetail(id);
    },

    async openJobDetail(jobId) {
      const job = await window.db.jobs.get(jobId);
      if (!job) return;
      this.selectedJob = job;
      this.selectedJobCustomer = job.customer_id
        ? await window.db.customers.get(job.customer_id)
        : null;
      this.selectedJobVehicle = job.vehicle_id
        ? await window.db.vehicles.get(job.vehicle_id)
        : null;
      this.jobMechanicInput = (job.custom_fields && job.custom_fields.mechanic_name) || '';
      this.jobNewNoteText = '';
      this.jobAddNoteMode = false;
      await this.refreshJobPhotos();
      this.jobsView = 'detail';
    },
    backToJobsList() {
      this.selectedJob = null;
      this.jobsView = 'list';
      this.loadJobsList();
    },

    async advanceJobStatus() {
      if (!this.selectedJob || !this.jobNextStatus) return;
      await this.setJobStatus(this.jobNextStatus);
    },
    // Cancellation is a side-exit from any non-terminal status (§6.5's
    // status list includes it as "plus Cancelled", not as a 5th rung), so
    // it's a separate action from the forward stepper, guarded by a confirm
    // per §8's rule that higher-risk status changes keep the confirm dialog
    // rather than the low-risk "undo toast" pattern used elsewhere.
    async cancelJob() {
      if (!this.selectedJob) return;
      if (!window.confirm('Cancel this job? This cannot be undone from here.')) return;
      await this.setJobStatus('cancelled');
    },
    // §6.5: "status changes are timestamped and attributed (who, when)".
    // Phase 0 has no auth (per Decisions Locked In), so there's no "who" to
    // attribute yet — this records "when" via custom_fields.status_history
    // (reusing the jsonb column §4.1 built in for exactly this kind of
    // lightweight extension) rather than standing up a whole new table for
    // one array of timestamps.
    async setJobStatus(newStatus) {
      const now = new Date().toISOString();
      const history = (this.selectedJob.custom_fields && this.selectedJob.custom_fields.status_history) || [];
      const updatedFields = {
        status: newStatus,
        updated_at: now,
        custom_fields: {
          ...this.selectedJob.custom_fields,
          status_history: [...history, { status: newStatus, at: now }],
        },
      };
      await window.db.jobs.update(this.selectedJob.id, updatedFields);
      this.selectedJob = { ...this.selectedJob, ...updatedFields };
    },

    // Stored as a raw base64 data URI, uncompressed — client-side
    // compression (≤1600px longest edge, JPEG ~70%, <300KB target) is its
    // own later checklist item, deliberately not built here. Camera
    // permission denied / picker cancelled just means no file arrives —
    // nothing here blocks job creation or the rest of the Job Card on it,
    // per §6.5's edge case.
    onPhotoSelected(event, stage) {
      const file = event.target.files && event.target.files[0];
      event.target.value = ''; // allow re-selecting the same file again later
      if (!file || !this.selectedJob) return;
      const reader = new FileReader();
      reader.onload = async () => {
        await window.db.job_photos.add({
          id: crypto.randomUUID(),
          job_id: this.selectedJob.id,
          url: reader.result,
          stage,
          uploaded_by: null,
          created_at: new Date().toISOString(),
        });
        await this.refreshJobPhotos();
      };
      reader.readAsDataURL(file);
    },
    async refreshJobPhotos() {
      if (!this.selectedJob) return;
      const photos = await window.db.job_photos
        .where('job_id')
        .equals(this.selectedJob.id)
        .toArray();
      this.selectedJobIntakePhotos = photos.filter((p) => p.stage === 'intake');
      this.selectedJobCompletionPhotos = photos.filter((p) => p.stage === 'completion');
    },

    // Known shortcut, flagged in BUILD_PROGRESS.md Blockers: this overwrites
    // mechanic_name rather than keeping history, so §6.5's "reassigned mid-
    // repair keeps both mechanics' involvement" edge case isn't handled yet.
    async updateJobMechanic() {
      if (!this.selectedJob) return;
      const name = this.jobMechanicInput.trim() || null;
      const updatedFields = {
        updated_at: new Date().toISOString(),
        custom_fields: { ...this.selectedJob.custom_fields, mechanic_name: name },
      };
      await window.db.jobs.update(this.selectedJob.id, updatedFields);
      this.selectedJob = { ...this.selectedJob, ...updatedFields };
      if (name && !this.mechanicSuggestions.includes(name)) {
        this.mechanicSuggestions.push(name);
      }
    },

    async addJobNote() {
      const text = this.jobNewNoteText.trim();
      if (!text || !this.selectedJob) return;
      const stamp = new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
      const line = `[${stamp}] ${text}`;
      const updatedNotes = this.selectedJob.notes ? this.selectedJob.notes + '\n' + line : line;
      await window.db.jobs.update(this.selectedJob.id, {
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      });
      this.selectedJob = { ...this.selectedJob, notes: updatedNotes };
      this.jobNewNoteText = '';
      this.jobAddNoteMode = false;
    },

    // ---- Customer/Vehicle Profile methods (Phase 0 task 7, PRD §6.4) ----

    openMoreScreen() {
      // Mirrors openJobsScreen()'s convention: re-entering a tab resets to
      // that tab's root view rather than remembering wherever you left it.
      this.moreView = 'search';
      this.customerSearchResults = [];
      this.profileCustomer = null;
    },

    // Ranked per §9's Notable States column: exact plate match > exact
    // phone match > name fuzzy match. A 4th tier (partial plate/phone) is
    // added below those three so a partially-typed number still returns
    // something useful — it just never outranks an exact hit, preserving
    // the spec's ordering. This is a read-only lookup, not a
    // search-or-create flow like Bill/Job's customer search, so it's a
    // separate function rather than a 3rd copy of theirs (see the comment
    // on searchJobCustomer) — the ranking behavior is genuinely different,
    // not just the same thing typed out again.
    async searchCustomerProfile() {
      const q = this.customerSearchQuery.trim().toLowerCase();
      if (!q) {
        this.customerSearchResults = [];
        return;
      }
      const [customers, vehicles] = await Promise.all([
        window.db.customers.toArray(),
        window.db.vehicles.toArray(),
      ]);
      const byId = new Map();
      const consider = (customer, matchedVehicle, rank) => {
        const existing = byId.get(customer.id);
        if (!existing || rank < existing.rank) {
          byId.set(customer.id, {
            customer,
            matchedVehicle: matchedVehicle || (existing && existing.matchedVehicle) || null,
            rank,
          });
        }
      };
      for (const v of vehicles) {
        const num = (v.vehicle_number || '').toLowerCase();
        if (!num) continue;
        const customer = customers.find((c) => c.id === v.customer_id);
        if (!customer) continue;
        if (num === q) consider(customer, v, 0);
        else if (num.includes(q)) consider(customer, v, 3);
      }
      for (const c of customers) {
        const phone = c.phone || '';
        const name = (c.name || '').toLowerCase();
        if (phone && phone === q) consider(c, null, 1);
        else if (phone && phone.includes(q)) consider(c, null, 3);
        if (name.includes(q)) consider(c, null, 2);
      }
      this.customerSearchResults = [...byId.values()].sort(
        (a, b) => a.rank - b.rank || a.customer.name.localeCompare(b.customer.name)
      );
    },

    // Loads "vehicles, invoices, jobs, payments in one scroll" per §6.4.
    // NOTE (see BUILD_PROGRESS.md Blockers): §6.4 also specifies vehicle
    // ownership transfer with an audit trail — not implemented in Phase 0,
    // so profileVehicles is simply "every vehicle whose customer_id is this
    // customer right now," with no transfer history to show even if one
    // had happened.
    async openCustomerProfile(customerId) {
      const customer = await window.db.customers.get(customerId);
      if (!customer) return;
      this.profileCustomer = customer;

      this.profileVehicles = await window.db.vehicles
        .where('customer_id')
        .equals(customerId)
        .toArray();

      this.profileJobs = (
        await window.db.jobs.where('customer_id').equals(customerId).toArray()
      ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      const [invoices, allPayments] = await Promise.all([
        window.db.invoices.where('customer_id').equals(customerId).toArray(),
        window.db.payments.toArray(),
      ]);
      this.profileInvoices = invoices
        .slice()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map((invoice) => ({
          invoice,
          payments: allPayments.filter((p) => p.invoice_id === invoice.id),
        }));

      this.moreView = 'profile';
    },

    // Deliberately does NOT clear customerSearchResults — coming back from
    // a profile should still show the same search results, so picking a
    // different customer from an ambiguous search doesn't mean retyping.
    backToCustomerSearch() {
      this.moreView = 'search';
      this.profileCustomer = null;
    },

    profileVehicleNumber(vehicleId) {
      if (!vehicleId) return '';
      const v = this.profileVehicles.find((x) => x.id === vehicleId);
      return v ? v.vehicle_number : '';
    },

    // Jumps into the Jobs tab's own detail view rather than building a
    // second Job Card renderer here — Job Card stays canonical in one
    // place, same instinct as New Bill not re-rendering it either.
    openJobFromProfile(jobId) {
      this.screen = 'jobs';
      this.openJobDetail(jobId);
    },

    invoiceStatusLabel(status) {
      if (status === 'paid') return 'Paid';
      if (status === 'pending') return 'Pending';
      return status || '—';
    },

    // ---- Inventory methods (Phase 0 task 8, PRD §6.6) ----

    async openInventoryScreen() {
      await this.ensureExpenseCategoriesSeeded();
      await this.loadInventoryItems();
    },

    async loadInventoryItems() {
      this.inventoryLoading = true;
      this.inventoryItems = (await window.db.inventory_items.toArray())
        .filter((i) => i.is_active !== false)
        .sort((a, b) => a.name.localeCompare(b.name));
      this.inventoryLoading = false;
    },

    // §6.9's five named defaults (Rent/Salary/Fuel/Electricity/Tea-Misc)
    // don't include anything for "money spent buying parts" — none of them
    // fit, and §6.9 explicitly allows unlimited custom categories, so
    // adding a 6th default here (rather than leaving the auto-created
    // purchase expense with no category) is within spec, not a scope call
    // that needs flagging. Idempotent, same pattern as
    // ensureServiceCatalogSeeded().
    async ensureExpenseCategoriesSeeded() {
      const count = await window.db.expense_categories.count();
      if (count > 0) return;
      const defaults = ['Rent', 'Salary', 'Fuel', 'Electricity', 'Tea/Misc', 'Inventory Purchase'];
      for (const name of defaults) {
        await window.db.expense_categories.add({
          id: crypto.randomUUID(),
          name,
          is_custom: false,
        });
      }
    },

    startAddInventoryItem() {
      this.inventoryAddMode = true;
      this.inventoryNewName = '';
      this.inventoryNewCategory = '';
      this.inventoryNewBuyingPrice = '';
      this.inventoryNewSellingPrice = '';
      this.inventoryNewMinStock = '';
    },
    async saveNewInventoryItem() {
      const name = this.inventoryNewName.trim();
      if (!name || this.inventorySaving) return;
      this.inventorySaving = true;
      await window.db.inventory_items.add({
        id: crypto.randomUUID(),
        name,
        category: this.inventoryNewCategory.trim() || null,
        buying_price: Number(this.inventoryNewBuyingPrice) || 0,
        selling_price: Number(this.inventoryNewSellingPrice) || 0,
        min_stock: Number(this.inventoryNewMinStock) || 0,
        current_stock: 0,
        is_active: true,
        created_at: new Date().toISOString(),
      });
      this.inventorySaving = false;
      this.inventoryAddMode = false;
      await this.loadInventoryItems();
    },

    // Tapping a row opens/closes its own inline purchase form (tap again
    // to collapse) rather than navigating to a separate screen — same
    // one-thumb, minimal-navigation instinct as the rest of the app.
    toggleInventoryPurchase(itemId) {
      this.inventoryPurchaseItemId = this.inventoryPurchaseItemId === itemId ? null : itemId;
      this.inventoryPurchaseQty = '';
      this.inventoryPurchaseUnitCost = '';
      this.inventoryPurchasePaidTo = '';
    },

    // The atomic "enter once, updates everywhere" moment §6.6 calls the
    // single most valuable one in the product: recording a purchase
    // increments stock AND writes the linked expense in one Dexie
    // transaction, so an interruption mid-write can never leave stock
    // updated with no matching expense, or vice versa (§7).
    async recordPurchase() {
      const item = this.inventoryItems.find((i) => i.id === this.inventoryPurchaseItemId);
      const qty = Number(this.inventoryPurchaseQty);
      if (!item || !qty || qty <= 0 || this.inventorySaving) return;
      this.inventorySaving = true;

      const unitCost = Number(this.inventoryPurchaseUnitCost) || 0;
      const paidTo = this.inventoryPurchasePaidTo.trim() || null;
      const now = new Date().toISOString();
      const expenseId = crypto.randomUUID();
      const expenseCategory = (await window.db.expense_categories.toArray()).find(
        (c) => c.name === 'Inventory Purchase'
      );

      await window.db.transaction(
        'rw',
        window.db.inventory_items,
        window.db.inventory_transactions,
        window.db.expenses,
        async () => {
          const newStock = Number(item.current_stock || 0) + qty;
          await window.db.inventory_items.update(item.id, { current_stock: newStock });

          await window.db.inventory_transactions.add({
            id: crypto.randomUUID(),
            inventory_item_id: item.id,
            type: 'purchase',
            quantity: qty,
            reference_type: 'expense',
            reference_id: expenseId,
            created_at: now,
          });

          await window.db.expenses.add({
            id: expenseId,
            category_id: expenseCategory ? expenseCategory.id : null,
            amount: qty * unitCost,
            description: `Purchased ${qty} × ${item.name}`,
            paid_to: paidTo,
            expense_date: now,
            receipt_url: null,
            created_at: now,
          });
        }
      );

      this.inventorySaving = false;
      this.toggleInventoryPurchase(item.id); // collapses the form (same id → toggles closed)
      await this.loadInventoryItems();
      await this.loadDashboard();
    },
  };
}
