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
    init() {
      // Placeholder hook — later tasks will pull real data from window.db
      // (js/db.js) here once the schema exists.
      console.log('BusinessOS shell initialized. DB ready:', !!window.db);
    },
    go(screen) {
      this.screen = screen;
    },
  };
}
