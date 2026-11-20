import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const seed = JSON.parse(readFileSync(new URL('../db/seed.json', import.meta.url), 'utf8'));
const output = new URL('../db/csv/', import.meta.url);
mkdirSync(output, { recursive: true });

const cell = value => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const csv = rows => '\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
const discountRate = id => 20 + ((Math.imul(Number(id) | 0, 2654435761) >>> 0) % 11);
const salePrice = (original, id) => {
  const step = original < 1000 ? 10 : 100;
  const min = Math.ceil(original * .7 / step) * step;
  const max = Math.floor(original * .8 / step) * step;
  const rounded = Math.round(original * (100 - discountRate(id)) / 100 / step) * step;
  return Math.max(step, Math.min(max, Math.max(min, rounded)));
};

const shops = [
  ['id', 'name', 'category', 'area', 'address', 'lat', 'lng', 'image'],
  ...seed.shops.map(shop => [shop.id, shop.name, shop.category || '', shop.area, shop.address, shop.lat, shop.lng, `assets/${shop.image}.jpg`]),
];
const menus = [
  ['id', 'shop_id', 'name', 'description', 'original_price_krw', 'discount_rate_percent', 'discounted_price_krw', 'initial_stock', 'image'],
  ...seed.menus.map(([id, shopId, name, originalPrice, stock, image, description]) => [id, shopId, name, description, originalPrice, discountRate(id), salePrice(originalPrice, id), stock, `assets/${image}.jpg`]),
];
writeFileSync(new URL('shops.csv', output), csv(shops), 'utf8');
writeFileSync(new URL('menus.csv', output), csv(menus), 'utf8');
console.log(`Exported ${shops.length - 1} shops and ${menus.length - 1} menus.`);
