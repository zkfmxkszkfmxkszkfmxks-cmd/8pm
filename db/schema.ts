import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role", { enum: ["customer", "owner"] }).notNull().default("customer"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const customerProfiles = sqliteTable("customer_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id),
  notes: text("notes").notNull().default(""),
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
  minPrice: integer("min_price").notNull().default(0),
  image: text("image").notNull(),
  surplusReason: text("surplus_reason"),
  listingDate: text("listing_date").notNull(),
  closingLabel: text("closing_label").notNull().default("18:00"),
  closingAt: integer("closing_at").notNull(),
  status: text("status", { enum: ["active", "sold_out", "hidden"] }).notNull().default("active"),
  sample: integer("sample", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("products_shop_date_idx").on(table.shopId, table.listingDate),
  index("products_listing_idx").on(table.listingDate, table.status),
  check("products_nonnegative_min_price", sql`${table.minPrice} >= 0`),
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
  requestedAt: integer("requested_at"),
  responseDeadlineAt: integer("response_deadline_at"),
  confirmedAt: integer("confirmed_at"),
  status: text("status", { enum: ["waiting", "confirmed", "sold_out", "timeout", "completed", "no_show"] }).notNull().default("waiting"),
  recommendationId: text("recommendation_id"),
  replacementOfOrderId: text("replacement_of_order_id"),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("orders_customer_created_idx").on(table.customerUserId, table.createdAt), uniqueIndex("orders_replacement_source_unique").on(table.replacementOfOrderId)]);

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
  status: text("status", { enum: ["waiting", "accepted", "ready", "completed", "sold_out", "timeout", "no_show", "cancelled"] }).notNull().default("waiting"),
  etaAt: integer("eta_at").notNull(),
  pickupDeadlineAt: integer("pickup_deadline_at"),
  pickupCode: text("pickup_code").notNull(),
  ownerHiddenAt: integer("owner_hidden_at"),
  completedAt: integer("completed_at"),
  respondedAt: integer("responded_at"),
  responseStatus: text("response_status", { enum: ["waiting", "accepted", "sold_out", "timeout", "cancelled"] }).notNull().default("waiting"),
  receiptStatus: text("receipt_status", { enum: ["pending", "completed", "no_show"] }).notNull().default("pending"),
  receivedAt: integer("received_at"),
  createdAt: integer("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.orderId, table.shopId] }), index("order_pickups_shop_status_idx").on(table.shopId, table.status)]);

export const recommendations = sqliteTable("recommendations", {
  id: text("id").primaryKey(),
  customerUserId: text("customer_user_id").notNull().references(() => users.id),
  productIds: text("product_ids").notNull(),
  itemsJson: text("items_json").notNull().default("[]"),
  voucherCode: text("voucher_code"),
  reason: text("reason").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

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
