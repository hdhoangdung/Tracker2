/**
 * Barcode lookup service
 * Uses Open Food Facts API (free, no key required)
 * Falls back to UPC Item DB if not found
 */

const OPEN_FOOD_FACTS = 'https://world.openfoodfacts.org/api/v0/product';
const UPC_DB = 'https://api.upcitemdb.com/prod/trial/lookup';

export async function lookupBarcode(barcode) {
  // Try Open Food Facts first
  try {
    const res = await fetch(`${OPEN_FOOD_FACTS}/${barcode}.json`);
    const data = await res.json();
    if (data.status === 1 && data.product) {
      const p = data.product;
      return {
        found: true,
        name: p.product_name || p.product_name_vi || p.product_name_en || '',
        brand: p.brands || '',
        imageUrl: p.image_url || p.image_front_url || '',
        category: p.categories_tags?.[0]?.replace('en:', '') || '',
      };
    }
  } catch {
    // ignore, try next
  }

  // Try UPC Item DB
  try {
    const res = await fetch(`${UPC_DB}?upc=${barcode}`);
    const data = await res.json();
    if (data.code === 'OK' && data.items?.length > 0) {
      const item = data.items[0];
      return {
        found: true,
        name: item.title || '',
        brand: item.brand || '',
        imageUrl: item.images?.[0] || '',
        category: item.category || '',
      };
    }
  } catch {
    // ignore
  }

  return { found: false, name: '', brand: '', imageUrl: '', category: '' };
}
