/**
 * Barcode lookup service – multi-source fallback chain
 *
 * Sources (tried in order):
 * 1. Open Food Facts (world)      – best for packaged food globally, free
 * 2. Open Food Facts (VN)         – Vietnamese product database, free
 * 3. Open Beauty Facts            – cosmetics / personal care, free
 * 4. Open Products Facts          – non-food household products, free
 * 5. UPC Item DB                  – general retail (trial, 100 req/day), free
 * 6. Barcode Lookup (go-upc.com)  – broad coverage, free tier, no key needed
 */

const OFF_WORLD   = 'https://world.openfoodfacts.org/api/v0/product';
const OFF_VN      = 'https://vn.openfoodfacts.org/api/v0/product';
const OBF         = 'https://world.openbeautyfacts.org/api/v0/product';
const OPF         = 'https://world.openproductsfacts.org/api/v0/product';
const UPC_DB      = 'https://api.upcitemdb.com/prod/trial/lookup';
const GO_UPC      = 'https://go-upc.com/api/v1/code';

/** Parse a date string from Open Food Facts (formats: YYYY-MM-DD, DD/MM/YYYY, YYYYMMDD) */
function parseOFFDate(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  // YYYYMMDD
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  return '';
}

/** Normalise an Open*Facts product response into our shape */
function fromOFF(p) {
  return {
    found: true,
    name:            p.product_name_vi || p.product_name || p.product_name_en || p.abbreviated_product_name || '',
    brand:           p.brands || '',
    imageUrl:        p.image_front_url || p.image_url || '',
    category:        p.categories_tags?.[0]?.replace(/^[a-z]{2}:/, '') || '',
    manufactureDate: parseOFFDate(p.manufacturing_date || p.created_t ? '' : ''),
    expiryDate:      parseOFFDate(p.expiration_date || p['expiry-date'] || ''),
  };
}

/** Try any Open*Facts endpoint (food / beauty / products) */
async function tryOFF(base, barcode) {
  const res = await fetch(`${base}/${barcode}.json`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status === 1 && data.product) return fromOFF(data.product);
  return null;
}

/** UPC Item DB – free trial (100 lookups/day) */
async function tryUpcItemDb(barcode) {
  const res = await fetch(`${UPC_DB}?upc=${barcode}`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.code === 'OK' && data.items?.length > 0) {
    const item = data.items[0];
    return {
      found: true,
      name:     item.title || '',
      brand:    item.brand || '',
      imageUrl: item.images?.[0] || '',
      category: item.category || '',
    };
  }
  return null;
}

/** go-upc.com – free, no API key, broad barcode coverage */
async function tryGoUpc(barcode) {
  const res = await fetch(`${GO_UPC}/${barcode}`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.product) {
    const p = data.product;
    return {
      found: true,
      name:     p.name || '',
      brand:    p.brand || '',
      imageUrl: p.imageUrl || '',
      category: p.category || '',
    };
  }
  return null;
}

/**
 * Look up a barcode across multiple free APIs.
 * Returns the first successful result, or a not-found object.
 */
export async function lookupBarcode(barcode) {
  const sources = [
    () => tryOFF(OFF_WORLD, barcode),   // 1. Open Food Facts (global)
    () => tryOFF(OFF_VN,    barcode),   // 2. Open Food Facts (Vietnam)
    () => tryOFF(OBF,       barcode),   // 3. Open Beauty Facts
    () => tryOFF(OPF,       barcode),   // 4. Open Products Facts
    () => tryUpcItemDb(barcode),        // 5. UPC Item DB
    () => tryGoUpc(barcode),            // 6. go-upc.com
  ];

  for (const source of sources) {
    try {
      const result = await source();
      if (result) return result;
    } catch {
      // network error or timeout – try next source
    }
  }

  return { found: false, name: '', brand: '', imageUrl: '', category: '' };
}
