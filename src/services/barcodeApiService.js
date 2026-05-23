/**
 * Barcode Lookup Service - Multi-API cascade
 * Free APIs: Open Food Facts (global), UPC Item DB (US/global),
 *            Open GTIN (EU/VN), EAN-Search (global)
 * No API keys required.
 */

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

const safeJson = async (url, signal) => {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

async function tryOpenFoodFactsV2(barcode, signal) {
  const data = await safeJson(
    `https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=product_name,product_name_vi,product_name_en,brands,image_front_url,categories_tags`,
    signal
  );
  if (data.status !== 1 || !data.product) return null;
  const p = data.product;
  const name = p.product_name_vi || p.product_name || p.product_name_en || '';
  if (!name.trim()) return null;
  return {
    found: true,
    name: name.trim(),
    brand: (p.brands || '').split(',')[0].trim(),
    imageUrl: p.image_front_url || '',
    category: p.categories_tags?.[0]?.replace(/^[a-z-]+:/, '') || '',
    source: 'Open Food Facts',
  };
}

async function tryOpenFoodFactsV0(barcode, signal) {
  const data = await safeJson(
    `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
    signal
  );
  if (data.status !== 1 || !data.product) return null;
  const p = data.product;
  const name = p.product_name_vi || p.product_name || p.product_name_en || '';
  if (!name.trim()) return null;
  return {
    found: true,
    name: name.trim(),
    brand: (p.brands || '').split(',')[0].trim(),
    imageUrl: p.image_url || p.image_front_url || '',
    category: '',
    source: 'Open Food Facts',
  };
}

async function tryUPCItemDB(barcode, signal) {
  const data = await safeJson(
    `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`,
    signal
  );
  if (data.code !== 'OK' || !data.items?.length) return null;
  const item = data.items[0];
  if (!item.title?.trim()) return null;
  return {
    found: true,
    name: item.title.trim(),
    brand: (item.brand || '').trim(),
    imageUrl: item.images?.[0] || '',
    category: item.category || '',
    source: 'UPC Item DB',
  };
}

async function tryGoUPC(barcode, signal) {
  // GoUPC free tier — good VN coverage
  const data = await safeJson(
    `https://go-upc.com/api/v1/code/${barcode}`,
    signal
  );
  if (!data.product?.name?.trim()) return null;
  return {
    found: true,
    name: data.product.name.trim(),
    brand: (data.product.brand || '').trim(),
    imageUrl: data.product.imageUrl || '',
    category: data.product.category || '',
    source: 'GoUPC',
  };
}

// Simple cache to avoid redundant API calls
const cache = new Map();

export async function lookupBarcode(barcode) {
  if (!barcode) return { found: false };
  const key = barcode.trim();
  if (cache.has(key)) return cache.get(key);

  const controller = new AbortController();
  const { signal } = controller;
  const killTimer = setTimeout(() => controller.abort(), 9000);

  let result = null;

  // Round 1: Race OFF + OFFv0 in parallel (fastest, best VN coverage)
  try {
    result = await withTimeout(
      Promise.any([
        tryOpenFoodFactsV2(key, signal).catch(() => Promise.reject()),
        tryOpenFoodFactsV0(key, signal).catch(() => Promise.reject()),
      ]),
      5000
    );
  } catch {
    result = null;
  }

  // Round 2: UPC Item DB (good for US / international products)
  if (!result?.found) {
    try {
      result = await withTimeout(tryUPCItemDB(key, signal), 4000);
    } catch {
      result = null;
    }
  }

  // Round 3: GoUPC fallback
  if (!result?.found) {
    try {
      result = await withTimeout(tryGoUPC(key, signal), 4000);
    } catch {
      result = null;
    }
  }

  clearTimeout(killTimer);

  const final = result?.found
    ? result
    : { found: false, name: '', brand: '', imageUrl: '', category: '', source: '' };

  cache.set(key, final);
  return final;
}

// GS1 country prefix heuristic for UX hint while loading
export function guessCountry(barcode) {
  if (!barcode || barcode.length < 3) return null;
  const p3 = barcode.slice(0, 3);
  const p2 = barcode.slice(0, 2);
  if (p3 === '893') return '🇻🇳 Việt Nam';
  if (p3 === '890') return '🇮🇩 Indonesia';
  if (p3 >= '885' && p3 <= '886') return '🇹🇭 Thái Lan';
  if (p3 >= '690' && p3 <= '695') return '🇨🇳 Trung Quốc';
  if (p3 >= '880' && p3 <= '880') return '🇰🇷 Hàn Quốc';
  if (p3 >= '450' && p3 <= '459') return '🇯🇵 Nhật Bản';
  if (p3 >= '490' && p3 <= '499') return '🇯🇵 Nhật Bản';
  if (p2 === '30' || p2 === '31' || p2 === '32' || p2 === '33') return '🇫🇷 Pháp';
  if (p3 >= '400' && p3 <= '440') return '🇩🇪 Đức';
  if (barcode[0] === '0') return '🇺🇸 Mỹ / Canada';
  return null;
}
