import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { storageService } from '../services/storageService';
import { sortByExpiry, computeProductsWithStatus } from '../utils/statusUtils';

const ProductContext = createContext(null);

export function ProductProvider({ children }) {
  const [rawProducts, setRawProducts] = useState([]);
  const [settings, setSettings] = useState({ warningDays: 7 });

  useEffect(() => {
    setRawProducts(sortByExpiry(storageService.getAll()));
    try {
      const s = localStorage.getItem('expiry_settings');
      if (s) setSettings(JSON.parse(s));
    } catch {}
  }, []);

  // Products with pre-computed _status – only recomputed when data changes
  const products = useMemo(
    () => computeProductsWithStatus(rawProducts, settings.warningDays),
    [rawProducts, settings.warningDays]
  );

  // O(1) lookup
  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const getProduct = useCallback((id) => productMap.get(id), [productMap]);

  const saveSettings = useCallback((patch) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      localStorage.setItem('expiry_settings', JSON.stringify(next));
      return next;
    });
  }, []);

  const addProduct = useCallback((data) => {
    const product = { id: uuidv4(), createdAt: new Date().toISOString(), quantity: 1, ...data };
    setRawProducts(prev => {
      const next = sortByExpiry([...prev, product]);
      storageService.save(next);
      return next;
    });
    return product;
  }, []);

  const updateProduct = useCallback((id, updates) => {
    setRawProducts(prev => {
      const next = sortByExpiry(prev.map(p => p.id === id ? { ...p, ...updates } : p));
      storageService.save(next);
      return next;
    });
  }, []);

  const removeProduct = useCallback((id) => {
    setRawProducts(prev => {
      const next = prev.filter(p => p.id !== id);
      storageService.save(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    storageService.clear();
    setRawProducts([]);
  }, []);

  const value = useMemo(() => ({
    products, settings, saveSettings,
    addProduct, updateProduct, removeProduct, getProduct, clearAll,
  }), [products, settings, saveSettings, addProduct, updateProduct, removeProduct, getProduct, clearAll]);

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}

export function useProducts() {
  const ctx = useContext(ProductContext);
  if (!ctx) throw new Error('useProducts must be inside ProductProvider');
  return ctx;
}
