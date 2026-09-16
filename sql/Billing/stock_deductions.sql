-- =========================================================
-- All SQL related to the `stock_deductions` table
-- Extracted from: bipfencing-working-sql (2).sql
-- =========================================================

-- --------------------------------------------------------
-- Table structure for table `stock_deductions`
-- --------------------------------------------------------

CREATE TABLE `stock_deductions` (
  `id` int(10) UNSIGNED NOT NULL,
  `product_id` varchar(100) NOT NULL,
  `product_name` varchar(255) DEFAULT NULL,
  `branch_id` int(10) UNSIGNED NOT NULL,
  `deducted_qty` decimal(12,2) NOT NULL,
  `note` text DEFAULT NULL,
  `deducted_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Dumping data for table `stock_deductions`
-- --------------------------------------------------------

INSERT INTO `stock_deductions` (`id`, `product_id`, `product_name`, `branch_id`, `deducted_qty`, `note`, `deducted_at`, `created_at`) VALUES
(1, '123', 'cement', 3, 150.00, '', '2026-06-16 15:06:00', '2026-06-16 09:53:12'),
(2, '789', 'pipe', 3, 45.00, '', '2026-06-16 15:06:00', '2026-06-16 10:34:29');

-- --------------------------------------------------------
-- Indexes for table `stock_deductions`
-- --------------------------------------------------------

ALTER TABLE `stock_deductions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_sd_branch` (`branch_id`),
  ADD KEY `idx_sd_product` (`product_id`),
  ADD KEY `idx_sd_date` (`deducted_at`);

-- --------------------------------------------------------
-- AUTO_INCREMENT for table `stock_deductions`
-- --------------------------------------------------------

ALTER TABLE `stock_deductions`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

-- --------------------------------------------------------
-- Constraints for table `stock_deductions`
-- --------------------------------------------------------

ALTER TABLE `stock_deductions`
  ADD CONSTRAINT `fk_stock_deductions_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE;


  
