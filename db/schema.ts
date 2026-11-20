import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role", { enum: ["customer", "owner"] }).notNull().default("customer"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const shops = sqliteTable("shops", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").references(() => users.id),
  name: text("name").notNull(),
  category: text("category"),
  area: text("area").notNull(),
  address: text("address").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  image: text("image").notNull(),
  acceptsVoucher: integer("accepts_voucher", { mode: "boolean" }).notNull().default(false),
  sample: integer("sample", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("shops_owner_idx").on(table.ownerUserId)]);

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  shopId: text("shop_id").notNull().references(() => shops.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  originalPrice: integer("original_price").notNull(),
  price: integer("price").notNull(),
  stock: integer("stock").notNull(),
  initialStock: integer("initial_stock").notNull(),
  image: text("image").notNull(),
  surplusReason: text("surplus_reason"),
  listingDate: text("listing_date").notNull(),
  closingLabel: text("closing_label").notNull().default("18:00"),
  closingAt: integer("closing_at").notNull(),
  status: text("status", { enum: ["active", "hidden"] }).notNull().default("active"),
  sample: integer("sample", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("products_shop_date_idx").on(table.shopId, table.listingDate),
  index("products_listing_idx").on(table.listingDate, table.status),
  check("products_nonnegative_stock", sql`${table.stock} >= 0`),
  check("products_positive_price", sql`${table.price} > 0 AND ${table.originalPrice} > 0`),
]);

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  customerUserId: text("customer_user_id").notNull().references(() => users.id),
  subtotal: integer("subtotal").notNull(),
  setDiscount: integer("set_discount").notNull().default(0),
  total: integer("total").notNull(),
  paymentMethod: text("payment_method").notNull().default("card"),
  useVoucher: integer("use_voucher", { mode: "boolean" }).notNull().default(false),
  originLat: real("origin_lat").notNull(),
  originLng: real("origin_lng").notNull(),
  customerHiddenAt: integer("customer_hidden_at"),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("orders_customer_created_idx").on(table.customerUserId, table.createdAt)]);

export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: text("order_id").notNull().references(() => orders.id),
  productId: text("product_id").notNull().references(() => products.id),
  shopId: text("shop_id").notNull().references(() => shops.id),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  setDiscount: integer("set_discount").notNull().default(0),
}, (table) => [index("order_items_order_idx").on(table.orderId), check("order_items_positive_quantity", sql`${table.quantity} > 0`)]);

export const orderPickups = sqliteTable("order_pickups", {
  orderId: text("order_id").notNull().references(() => orders.id),
  shopId: text("shop_id").notNull().references(() => shops.id),
  sequence: integer("sequence").notNull(),
  status: text("status", { enum: ["waiting", "accepted", "ready", "completed", "cancelled"] }).notNull().default("waiting"),
  etaAt: integer("eta_at").notNull(),
  pickupCode: text("pickup_code").notNull(),
  ownerHiddenAt: integer("owner_hidden_at"),
  completedAt: integer("completed_at"),
  createdAt: integer("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.orderId, table.shopId] }), index("order_pickups_shop_status_idx").on(table.shopId, table.status)]);

export const inventoryMovements = sqliteTable("inventory_movements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: text("product_id").notNull().references(() => products.id),
  orderId: text("order_id").references(() => orders.id),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("inventory_movements_product_idx").on(table.productId, table.createdAt)]);

export const likes = sqliteTable("likes", {
  userId: text("user_id").notNull().references(() => users.id),
  productId: text("product_id").notNull().references(() => products.id),
  createdAt: integer("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.productId] })]);

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id),
  shopId: text("shop_id").notNull().references(() => shops.id),
  customerUserId: text("customer_user_id").notNull().references(() => users.id),
  rating: integer("rating").notNull(),
  body: text("body").notNull().default(""),
  createdAt: integer("created_at").notNull(),
}, (table) => [uniqueIndex("reviews_order_shop_unique").on(table.orderId, table.shopId), check("reviews_rating_range", sql`${table.rating} BETWEEN 1 AND 5`)]);

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  orderId: text("order_id").references(() => orders.id),
  readAt: integer("read_at"),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("notifications_user_created_idx").on(table.userId, table.createdAt)]);
