ALTER TABLE `orders` ADD `payment_method` text DEFAULT 'card' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `use_voucher` integer DEFAULT false NOT NULL;