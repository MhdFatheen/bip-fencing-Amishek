-- =========================================================
-- Full consolidated query: quotations + quotation_items
-- =========================================================

-- --------------------------------------------------------
-- Table structure for table `quotations`
-- --------------------------------------------------------

CREATE TABLE `quotations` (
  `id` int(10) UNSIGNED NOT NULL,
  `quote_no` varchar(50) NOT NULL,
  `quote_date` date NOT NULL,
  `valid_until` date DEFAULT NULL,
  `po_no` varchar(50) DEFAULT NULL,
  `dispatched_through` varchar(255) DEFAULT NULL,
  `vehicle_no` varchar(50) DEFAULT NULL,
  `other_ref` text DEFAULT NULL,
  `client_name` varchar(255) NOT NULL,
  `client_phone` varchar(50) DEFAULT NULL,
  `client_email` varchar(100) DEFAULT NULL,
  `client_gst` varchar(50) DEFAULT NULL,
  `client_address` text DEFAULT NULL,
  `client_state` varchar(100) DEFAULT NULL,
  `client_state_code` varchar(10) DEFAULT NULL,
  `ship_name` varchar(255) DEFAULT NULL,
  `ship_address` text DEFAULT NULL,
  `ship_gst` varchar(50) DEFAULT NULL,
  `ship_state` varchar(100) DEFAULT NULL,
  `ship_state_code` varchar(10) DEFAULT NULL,
  `discount_percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  `tax_percent` decimal(5,2) NOT NULL DEFAULT 18.00,
  `notes` text DEFAULT NULL,
  `declaration` text DEFAULT NULL,
  `branch_id` int(10) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- No data currently dumped for `quotations` (table was empty in source file)

-- --------------------------------------------------------
-- Table structure for table `quotation_items`
-- --------------------------------------------------------

CREATE TABLE `quotation_items` (
  `id` int(10) UNSIGNED NOT NULL,
  `quotation_id` int(10) UNSIGNED NOT NULL,
  `description` text NOT NULL,
  `hsn` varchar(20) DEFAULT NULL,
  `due_on` date DEFAULT NULL,
  `unit` varchar(20) DEFAULT 'Nos',
  `quantity` decimal(12,2) NOT NULL,
  `rate` decimal(12,2) NOT NULL,
  `amount` decimal(12,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- No data currently dumped for `quotation_items` (table was empty in source file)

-- --------------------------------------------------------
-- Indexes / Primary Keys
-- --------------------------------------------------------

ALTER TABLE `quotations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_quote_branch` (`quote_no`,`branch_id`),
  ADD KEY `idx_q_branch` (`branch_id`);

ALTER TABLE `quotation_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_qi_quotation` (`quotation_id`);

-- --------------------------------------------------------
-- AUTO_INCREMENT
-- --------------------------------------------------------

ALTER TABLE `quotations`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `quotation_items`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

-- --------------------------------------------------------
-- Foreign Key Constraints
-- --------------------------------------------------------

ALTER TABLE `quotations`
  ADD CONSTRAINT `fk_quotations_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE;

ALTER TABLE `quotation_items`
  ADD CONSTRAINT `fk_quotation_items_quotation` FOREIGN KEY (`quotation_id`) REFERENCES `quotations` (`id`) ON DELETE CASCADE;
