-- =========================================================
-- Full consolidated query: purchase_bills + purchase_bill_items + purchase_stock
-- =========================================================

-- --------------------------------------------------------
-- Table structure for table `purchase_bills`
-- --------------------------------------------------------

CREATE TABLE `purchase_bills` (
  `id` int(10) UNSIGNED NOT NULL,
  `company_name` varchar(255) NOT NULL,
  `invoice_no` varchar(100) NOT NULL,
  `bill_date` date NOT NULL,
  `total_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `notes` text DEFAULT NULL,
  `branch_id` int(10) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table `purchase_bills`

INSERT INTO `purchase_bills` (`id`, `company_name`, `invoice_no`, `bill_date`, `total_amount`, `notes`, `branch_id`, `created_at`) VALUES
(1, 'sachin and co', 'INV-99', '2026-06-16', 165000.00, 'today we buy cement steel pipes', 3, '2026-06-16 09:08:32');

-- --------------------------------------------------------
-- Table structure for table `purchase_bill_items`
-- --------------------------------------------------------

CREATE TABLE `purchase_bill_items` (
  `id` int(10) UNSIGNED NOT NULL,
  `purchase_bill_id` int(10) UNSIGNED NOT NULL,
  `product_id` varchar(100) NOT NULL,
  `product_name` varchar(255) NOT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `rate` decimal(12,2) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `branch_id` int(10) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table `purchase_bill_items`

INSERT INTO `purchase_bill_items` (`id`, `purchase_bill_id`, `product_id`, `product_name`, `quantity`, `rate`, `amount`, `branch_id`, `created_at`) VALUES
(1, 1, '123', 'cement', 200.00, 100.00, 20000.00, 3, '2026-06-16 09:08:32'),
(2, 1, '456', 'steel', 500.00, 250.00, 125000.00, 3, '2026-06-16 09:08:32'),
(3, 1, '789', 'pipe', 400.00, 50.00, 20000.00, 3, '2026-06-16 09:08:32');

-- --------------------------------------------------------
-- Table structure for table `purchase_stock`
-- --------------------------------------------------------

CREATE TABLE `purchase_stock` (
  `id` int(10) UNSIGNED NOT NULL,
  `product_id` varchar(100) NOT NULL,
  `product_name` varchar(255) NOT NULL,
  `total_purchased` decimal(12,2) NOT NULL DEFAULT 0.00,
  `current_stock` decimal(12,2) NOT NULL DEFAULT 0.00,
  `rate` decimal(12,2) NOT NULL DEFAULT 0.00,
  `branch_id` int(10) UNSIGNED NOT NULL,
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Dumping data for table `purchase_stock`

INSERT INTO `purchase_stock` (`id`, `product_id`, `product_name`, `total_purchased`, `current_stock`, `rate`, `branch_id`, `last_updated`) VALUES
(1, '123', 'cement', 200.00, 50.00, 100.00, 3, '2026-06-16 09:53:12'),
(2, '456', 'steel', 500.00, 500.00, 250.00, 3, '2026-06-16 09:08:32'),
(3, '789', 'pipe', 400.00, 355.00, 50.00, 3, '2026-06-16 10:34:29');

-- --------------------------------------------------------
-- Indexes / Primary Keys
-- --------------------------------------------------------

ALTER TABLE `purchase_bills`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_pb_branch` (`branch_id`),
  ADD KEY `idx_pb_company` (`company_name`),
  ADD KEY `idx_pb_invoice` (`invoice_no`),
  ADD KEY `idx_pb_date` (`bill_date`);

ALTER TABLE `purchase_bill_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_pbi_bill` (`purchase_bill_id`),
  ADD KEY `idx_pbi_product` (`product_id`),
  ADD KEY `idx_pbi_branch` (`branch_id`);

ALTER TABLE `purchase_stock`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `product_branch` (`product_id`,`branch_id`),
  ADD KEY `idx_ps_branch` (`branch_id`);

-- --------------------------------------------------------
-- AUTO_INCREMENT
-- --------------------------------------------------------

ALTER TABLE `purchase_bills`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

ALTER TABLE `purchase_bill_items`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

ALTER TABLE `purchase_stock`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

-- --------------------------------------------------------
-- Foreign Key Constraints
-- --------------------------------------------------------

ALTER TABLE `purchase_bills`
  ADD CONSTRAINT `fk_purchase_bills_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE;

ALTER TABLE `purchase_bill_items`
  ADD CONSTRAINT `fk_pbi_bill` FOREIGN KEY (`purchase_bill_id`) REFERENCES `purchase_bills` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_pbi_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE;

ALTER TABLE `purchase_stock`
  ADD CONSTRAINT `fk_product_stock_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE;
