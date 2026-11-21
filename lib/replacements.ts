import { ApiError, currentPrice, distanceKm, now, today } from "./marketplace";
import { availableProduct, createReservation, reservationPlan, walkMinutes } from "./reservations";

type Row = Record<string, any>;
const point = (row: Row) => ({ lat: Number(row.lat), lng: Number(row.lng) });
const kind = (name: string) => /커피|라테|콜드브루|주스|음료/.test(name) ? "drink"
  : /스콘|크루아상|휘낭시에|소금빵|디저트|케이크/.test(name) ? "dessert" : "meal";

export async function replacementOptions(db: D1Database, userId: string, orderId: string, timestamp = now()) {
  const order = await db.prepare("SELECT * FROM orders WHERE id=? AND customer_user_id=?").bind(orderId, userId).first<Row>();
  if (!order) throw new ApiError(404, "order_not_found");
  if (order.status !== "sold_out") throw new ApiError(409, "order_not_sold_out");
  const existing = await db.prepare("SELECT id FROM orders WHERE replacement_of_order_id=? LIMIT 1").bind(orderId).first<Row>();
  if (existing) return { orderId, replacementOrderId: Number(existing.id), soldOut: null, kept: null, options: [] };
  const [itemsResult, pickupsResult] = await Promise.all([
    db.prepare("SELECT * FROM order_items WHERE order_id=? ORDER BY id").bind(orderId).all<Row>(),
    db.prepare("SELECT p.*,s.lat,s.lng,s.name AS shop_name FROM order_pickups p JOIN shops s ON s.id=p.shop_id WHERE p.order_id=? ORDER BY p.sequence").bind(orderId).all<Row>(),
  ]);
  const soldStop = pickupsResult.results.find(p => p.status === "sold_out");
  const soldItem = itemsResult.results.find(item => item.shop_id === soldStop?.shop_id);
  if (!soldStop || !soldItem) throw new ApiError(409, "sold_out_item_missing");
  const soldProduct = await db.prepare("SELECT image FROM products WHERE id=?").bind(soldItem.product_id).first<Row>();
  const keptItem = itemsResult.results.find(item => item.id !== soldItem.id) || null;
  const keptProduct = keptItem ? await db.prepare("SELECT * FROM products WHERE id=?").bind(keptItem.product_id).first<Row>() : null;
  const keptShop = keptProduct ? await db.prepare("SELECT * FROM shops WHERE id=?").bind(keptProduct.shop_id).first<Row>() : null;
  const keptAvailable = !keptItem || Boolean(keptProduct && keptShop && availableProduct(keptProduct, timestamp));
  const origin = { lat: Number(order.origin_lat), lng: Number(order.origin_lng) };
  const soldShop = point(soldStop);
  const rows = await db.prepare("SELECT p.*,s.name AS shop_name,s.category,s.area,s.lat,s.lng,s.accepts_voucher FROM products p JOIN shops s ON s.id=p.shop_id WHERE p.status='active' AND p.listing_date=? AND p.shop_id<>? ORDER BY p.created_at DESC LIMIT 200")
    .bind(today(), soldStop.shop_id).all<Row>();
  const options = keptAvailable ? rows.results.filter(product => {
    if (!availableProduct(product, timestamp) || product.id === soldItem.product_id || product.shop_id === keptProduct?.shop_id) return false;
    if (walkMinutes(soldShop, point(product)) > 10 || distanceKm(origin, point(product)) > 3) return false;
    if (order.use_voucher && (!product.accepts_voucher || product.area !== "성수동" || (keptItem && (!keptShop?.accepts_voucher || keptShop.area !== "성수동")))) return false;
    try {
      const products = keptProduct ? [keptProduct, product] : [product];
      const replacementShop = { id: product.shop_id, lat: product.lat, lng: product.lng };
      const shops = keptShop ? [keptShop, replacementShop] : [replacementShop];
      reservationPlan(products, shops, origin, timestamp);
      return true;
    } catch { return false; }
  }).map(product => {
    const price = currentPrice(Number(product.original_price), Number(product.min_price || 0), Number(product.closing_at), timestamp).price;
    const keptPrice = keptProduct ? currentPrice(Number(keptProduct.original_price), Number(keptProduct.min_price || 0), Number(keptProduct.closing_at), timestamp).price : 0;
    const originalTotal = Number(product.original_price) + (keptProduct ? Number(keptProduct.original_price) : 0);
    const score = (kind(product.name) === kind(soldItem.name) ? 100 : 0)
      + (product.name.includes(soldItem.name) || soldItem.name.includes(product.name) ? 30 : 0)
      - walkMinutes(soldShop, point(product)) * 4;
    return { id: Number(product.id), name: product.name, shopId: product.shop_id, shopName: product.shop_name, image: product.image,
      price, originalPrice: Number(product.original_price), closingAt: Number(product.closing_at), total: price + keptPrice, originalTotal, score };
  }).sort((a, b) => b.score - a.score).slice(0, 8) : [];
  return { orderId, replacementOrderId: null, soldOut: { id: Number(soldItem.product_id), name: soldItem.name, image: soldProduct?.image || "", shopName: soldStop.shop_name },
    kept: keptItem ? { id: Number(keptItem.product_id), name: keptItem.name, shopName: keptShop?.name || "", available: keptAvailable } : null,
    options };
}

export async function applyReplacement(db: D1Database, userId: string, orderId: string, productId: string, timestamp = now()) {
  const selection = await replacementOptions(db, userId, orderId, timestamp);
  if (selection.replacementOrderId) throw new ApiError(409, "replacement_already_requested");
  const option = selection.options.find(item => String(item.id) === productId);
  if (!option) throw new ApiError(409, "replacement_unavailable");
  const original = await db.prepare("SELECT * FROM orders WHERE id=? AND customer_user_id=?").bind(orderId, userId).first<Row>();
  if (!original) throw new ApiError(404, "order_not_found");
  const productIds = selection.kept ? [selection.kept.id, option.id] : [option.id];
  let recommendationId: string | null = null;
  const voucherCode = original.use_voucher ? "seongdong" : null;
  if (productIds.length === 2) {
    recommendationId = crypto.randomUUID();
    const reason = `${selection.soldOut?.name || "품절 메뉴"} 대신 가까운 가게의 ${option.name} 메뉴를 추천해요.`;
    await db.prepare("INSERT INTO recommendations (id,customer_user_id,product_ids,items_json,voucher_code,reason,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(recommendationId, userId, JSON.stringify(productIds.map(String)), JSON.stringify(productIds.map(id => ({ productId: String(id), quantity: 1 }))), voucherCode, reason, timestamp, timestamp + 10 * 60_000).run();
  }
  return createReservation(db, userId, { productIds, recommendationId, useVoucher: Boolean(original.use_voucher), voucherCode,
    origin: { lat: Number(original.origin_lat), lng: Number(original.origin_lng) } }, timestamp, orderId);
}
