/**
 * Tests for storageService – verifies manufactureDate is correctly
 * serialized/deserialized from localStorage (Requirement 3.8).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { storageService } from './storageService';

// jsdom provides a localStorage implementation
beforeEach(() => {
  localStorage.clear();
});

describe('storageService – manufactureDate persistence', () => {
  it('preserves manufactureDate when adding a product', () => {
    const product = {
      id: 'test-1',
      name: 'Sữa tươi',
      expiryDate: '2025-12-31',
      manufactureDate: '2025-01-01',
      quantity: 1,
    };

    storageService.add(product);
    const stored = storageService.getAll();

    expect(stored).toHaveLength(1);
    expect(stored[0].manufactureDate).toBe('2025-01-01');
  });

  it('preserves manufactureDate when updating a product', () => {
    const product = {
      id: 'test-2',
      name: 'Nước mắm',
      expiryDate: '2026-06-30',
      manufactureDate: null,
      quantity: 2,
    };

    storageService.add(product);
    storageService.update('test-2', { manufactureDate: '2024-06-30' });

    const stored = storageService.getAll();
    expect(stored[0].manufactureDate).toBe('2024-06-30');
  });

  it('returns null/undefined manufactureDate when not set', () => {
    const product = {
      id: 'test-3',
      name: 'Bánh mì',
      expiryDate: '2025-03-01',
      quantity: 1,
    };

    storageService.add(product);
    const stored = storageService.getAll();

    // manufactureDate was never set, so it should be absent or undefined
    expect(stored[0].manufactureDate).toBeUndefined();
  });

  it('round-trips all product fields through JSON serialization', () => {
    const product = {
      id: 'test-4',
      name: 'Dầu ăn',
      expiryDate: '2027-01-15',
      manufactureDate: '2025-01-15',
      quantity: 3,
      brand: 'Neptune',
    };

    storageService.add(product);
    const stored = storageService.getAll();

    expect(stored[0]).toEqual(product);
  });
});
