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

    async init() {
      console.log('BusinessOS shell initialized. DB ready:', !!window.db);
      await this.loadDashboard();
    },
    go(screen) {
      this.screen = screen;
      if (screen === 'home') this.loadDashboard();
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

      this.todayRevenue = payments
        .filter((p) => this.isWithin(p.paid_at, start, end))
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
  };
}
