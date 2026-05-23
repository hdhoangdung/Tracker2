/**
 * Tests for ProductContext – verifies manufactureDate flows through
 * addProduct and updateProduct without being filtered out (Requirement 3.8).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ProductProvider, useProducts } from './ProductContext';

beforeEach(() => {
  localStorage.clear();
});

const wrapper = ({ children }) => <ProductProvider>{children}</ProductProvider>;

describe('addProduct – manufactureDate passthrough', () => {
  it('includes manufactureDate in the saved product', async () => {
    const { result } = renderHook(() => useProducts(), { wrapper });

    let savedProduct;
    await act(async () => {
      savedProduct = result.current.addProduct({
        name: 'Sữa tươi',
        expiryDate: '2025-12-31',
        manufactureDate: '2025-01-01',
      });
    });

    expect(savedProduct.manufactureDate).toBe('2025-01-01');
    expect(result.current.products[0].manufactureDate).toBe('2025-01-01');
  });

  it('works correctly when manufactureDate is not provided', async () => {
    const { result } = renderHook(() => useProducts(), { wrapper });

    let savedProduct;
    await act(async () => {
      savedProduct = result.current.addProduct({
        name: 'Bánh mì',
        expiryDate: '2025-03-01',
      });
    });

    // No manufactureDate provided – should not be present or be undefined
    expect(savedProduct.manufactureDate).toBeUndefined();
  });

  it('auto-assigns id and createdAt but keeps manufactureDate from input', async () => {
    const { result } = renderHook(() => useProducts(), { wrapper });

    let savedProduct;
    await act(async () => {
      savedProduct = result.current.addProduct({
        name: 'Nước mắm',
        expiryDate: '2026-06-30',
        manufactureDate: '2024-06-30',
      });
    });

    expect(savedProduct.id).toBeDefined();
    expect(savedProduct.createdAt).toBeDefined();
    expect(savedProduct.manufactureDate).toBe('2024-06-30');
  });
});

describe('updateProduct – manufactureDate passthrough', () => {
  it('updates manufactureDate on an existing product', async () => {
    const { result } = renderHook(() => useProducts(), { wrapper });

    let savedProduct;
    await act(async () => {
      savedProduct = result.current.addProduct({
        name: 'Dầu ăn',
        expiryDate: '2027-01-15',
        manufactureDate: null,
      });
    });

    await act(async () => {
      result.current.updateProduct(savedProduct.id, {
        manufactureDate: '2025-01-15',
      });
    });

    const updated = result.current.products.find(p => p.id === savedProduct.id);
    expect(updated.manufactureDate).toBe('2025-01-15');
  });

  it('preserves existing manufactureDate when updating other fields', async () => {
    const { result } = renderHook(() => useProducts(), { wrapper });

    let savedProduct;
    await act(async () => {
      savedProduct = result.current.addProduct({
        name: 'Mì gói',
        expiryDate: '2025-09-01',
        manufactureDate: '2025-03-01',
      });
    });

    await act(async () => {
      result.current.updateProduct(savedProduct.id, { quantity: 5 });
    });

    const updated = result.current.products.find(p => p.id === savedProduct.id);
    expect(updated.manufactureDate).toBe('2025-03-01');
    expect(updated.quantity).toBe(5);
  });
});
