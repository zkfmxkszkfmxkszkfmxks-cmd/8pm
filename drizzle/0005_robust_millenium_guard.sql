ALTER TABLE `order_pickups` ADD `response_status` text DEFAULT 'waiting' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_pickups` ADD `receipt_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `requested_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `status` text DEFAULT 'waiting' NOT NULL;--> statement-breakpoint
ALTER TABLE `recommendations` ADD `items_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `recommendations` ADD `voucher_code` text;