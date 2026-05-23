import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { storageService } from '../services/storageService';
import { sortByExpiry } from '../utils/statusUtils';

const ProductContext = createContext(null);

export function ProductProvider({ children }) {
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState({
    warningDays: 7,
    currency: 'VND',
  });

  useEffect(() => {
    const stored = storageService.getAll();
    setProducts(sortByExpiry(stored));
    const storedSettings = localStorage.getItem('expiry_settings');
    if (storedSettings) setSettings(JSON.parse(storedSettings));
  }, []);

  const saveSettings = useCallback((newSettings) => {
    const merged = { ...settings, ...newSettings };
    setSettings(merged);
    localStorage.setItem('expiry_settings', JSON.stringify(merged));
  }, [settings]);

  const addProduct = useCallback((productData) => {
    const product = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      quantity: 1,
      ...productData,
    };
    const updated = storageService.add(product);
    setProducts(sortByExpiry(updated));
    return product;
  }, []);

  const updateProduct = useCallback((id, updates) => {
    const updated = storageService.update(id, updates);
    setProducts(sortByExpiry(updated));
  }, []);

  const removeProduct = useCallback((id) => {
    const updated = storageService.remove(id);
    setProducts(sortByExpiry(updated));
  }, []);

  const getProduct = useCallback((id) => {
    return products.find(p => p.id === id);
  }, [products]);

  const clearAll = useCallback(() => {
    storageService.clear();
    setProducts([]);
  }, []);

  return (
    <ProductContext.Provider value={{
      products,
      settings,
      saveSettings,
      addProduct,
      updateProduct,
      removeProduct,
      getProduct,
      clearAll,
    }}>
      {children}
    </ProductContext.Provider>
  );
}

export function useProducts() {
  const ctx = useContext(ProductContext);
  if (!ctx) throw new Error('useProducts must be used inside ProductProvider');
  return ctx;
}
