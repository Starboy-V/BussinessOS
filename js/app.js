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
    moreView: 'search', // 'search' | 'profile'
    customerSearchQuery: '',
    customerSearchResults: [], // ranked: [{ customer, matchedVehicle, rank }]
    profileCustomer: null,
    profileVehicles: [],
    profileJobs: [],
    profileInvoices: [], // [{ invoice, payments }]

    async init() {
      console.log('BusinessOS shell initialized. DB ready:', !!window.db);
      await this.loadDashboard();
    },
    go(screen) {
      this.screen = screen;
      if (screen === 'home') this.loadDashboard();
      if (screen === 'bill') this.openBillScreen();
      if (screen === 'jobs') this.openJobsScreen();
      if (screen === 'more') this.openMoreScreen();
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
    async saveBill() {
      if (!this.billSelectedCustomer || this.billLineItems.length === 0 || this.billSaving) return;
      this.billSaving = true;

      const now = new Date().toISOString();
      const invoiceId = crypto.randomUUID();
      const deviceLocalId = 'LOCAL-' + Date.now();

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

      this.billSavedSummary = {
        total: this.billTotal,
        customerName: this.billSelectedCustomer.name,
        deviceLocalId,
      };
      this.resetBillDraft();
      this.billSaving = false;
      await this.loadDashboard();
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
  };
}
