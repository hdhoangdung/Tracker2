const STORAGE_KEY = 'expiry_tracker_products';

export const storageService = {
  getAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  save(products) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    } catch (e) {
      console.error('Storage save error:', e);
    }
  },

  add(product) {
    const products = this.getAll();
    products.push(product);
    this.save(products);
    return products;
  },

  update(id, updates) {
    const products = this.getAll().map(p =>
      p.id === id ? { ...p, ...updates } : p
    );
    this.save(products);
    return products;
  },

  remove(id) {
    const products = this.getAll().filter(p => p.id !== id);
    this.save(products);
    return products;
  },

  clear() {
    localStorage.removeItem(STORAGE_KEY);
  },
};
