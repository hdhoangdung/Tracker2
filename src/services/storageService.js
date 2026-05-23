const KEY = 'expiry_tracker_products';

export const storageService = {
  getAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { return []; }
  },
  save(products) {
    try { localStorage.setItem(KEY, JSON.stringify(products)); }
    catch (e) { console.error('Storage error:', e); }
  },
  add(product) {
    const list = this.getAll();
    list.push(product);
    this.save(list);
    return list;
  },
  update(id, updates) {
    const list = this.getAll().map(p => p.id === id ? { ...p, ...updates } : p);
    this.save(list);
    return list;
  },
  remove(id) {
    const list = this.getAll().filter(p => p.id !== id);
    this.save(list);
    return list;
  },
  clear() { localStorage.removeItem(KEY); },
};
