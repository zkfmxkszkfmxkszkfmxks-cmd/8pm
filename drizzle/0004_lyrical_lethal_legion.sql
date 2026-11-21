CREATE TABLE `recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_user_id` text NOT NULL,
	`product_ids` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`customer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `__likes_backup` AS SELECT * FROM `likes`;--> statement-breakpoint
CREATE TABLE `__order_items_backup` AS SELECT * FROM `order_items`;--> statement-breakpoint
DROP TABLE `likes`;--> statement-breakpoint
DROP TABLE `order_items`;--> statement-breakpoint
DROP TABLE `inventory_movements`;--> statement-breakpoint
CREATE TABLE `__new_products` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`original_price` integer NOT NULL,
	`price` integer NOT NULL,
	`min_price` integer DEFAULT 0 NOT NULL,
	`image` text NOT NULL,
	`surplus_reason` text,
	`listing_date` text NOT NULL,
	`closing_label` text DEFAULT '18:00' NOT NULL,
	`closing_at` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`sample` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "products_nonnegative_min_price" CHECK("__new_products"."min_price" >= 0),
	CONSTRAINT "products_positive_price" CHECK("__new_products"."price" > 0 AND "__new_products"."original_price" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_products`("id", "shop_id", "name", "description", "original_price", "price", "min_price", "image", "surplus_reason", "listing_date", "closing_label", "closing_at", "status", "sample", "created_at", "updated_at") SELECT "id", "shop_id", "name", "description", "original_price", "price", 0, "image", "surplus_reason", "listing_date", "closing_label", "closing_at", "status", "sample", "created_at", "updated_at" FROM `products`;--> statement-breakpoint
DROP TABLE `products`;--> statement-breakpoint
ALTER TABLE `__new_products` RENAME TO `products`;--> statement-breakpoint
CREATE TABLE `likes` (
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `product_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `likes` SELECT * FROM `__likes_backup`;--> statement-breakpoint
DROP TABLE `__likes_backup`;--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`shop_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`set_discount` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_items_positive_quantity" CHECK("order_items"."quantity" > 0)
);--> statement-breakpoint
INSERT INTO `order_items` SELECT * FROM `__order_items_backup`;--> statement-breakpoint
DROP TABLE `__order_items_backup`;--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `products_shop_date_idx` ON `products` (`shop_id`,`listing_date`);--> statement-breakpoint
CREATE INDEX `products_listing_idx` ON `products` (`listing_date`,`status`);--> statement-breakpoint
ALTER TABLE `order_pickups` ADD `pickup_deadline_at` integer;--> statement-breakpoint
ALTER TABLE `order_pickups` ADD `responded_at` integer;--> statement-breakpoint
ALTER TABLE `order_pickups` ADD `received_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `response_deadline_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `recommendation_id` text;
