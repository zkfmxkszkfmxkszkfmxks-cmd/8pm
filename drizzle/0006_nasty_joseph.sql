ALTER TABLE `orders` ADD `replacement_of_order_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_replacement_source_unique` ON `orders` (`replacement_of_order_id`);