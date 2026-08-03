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

    async init() {
      console.log('BusinessOS shell initialized. DB ready:', !!window.db);
      await this.loadDashboard();
    },
    go(screen) {
      this.screen = screen;
      if (screen === 'home') this.loadDashboard();
      if (screen === 'bill') this.openBillScreen();
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
  };
}
