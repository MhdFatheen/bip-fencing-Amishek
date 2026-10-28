-- =====================================================================
--  BIP Fencing — UPGRADE for your EXISTING database (keeps all data)
--  Adds every table / column made in this update. Safe to run again.
--  Needs MariaDB (XAMPP) — uses ADD COLUMN IF NOT EXISTS.
-- =====================================================================
USE bipfencing;

-- Branch names (ids used by the app: 1 Kadambankulam, 2 Nanguneri, 3 Panagudi)
UPDATE branches SET name = 'Kadambankulam'  WHERE id = 1;
UPDATE branches SET name = 'Nanguneri' WHERE id = 2;
UPDATE branches SET name = 'Panagudi'  WHERE id = 3;

-- Employees: rates set on the Employee page
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS salary_amount        DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_per_bags       DECIMAL(10,2) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS petrol_allowance     DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tea_allowance        DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kambi_kattu_rate     DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS others_rate          DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS work_rate            DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loading_rate         DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unloading_rate       DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS location_change_rate DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Branch amounts
ALTER TABLE branch_amounts
  ADD COLUMN IF NOT EXISTS note        TEXT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS received_by VARCHAR(100) DEFAULT NULL;

-- Salary tables
CREATE TABLE IF NOT EXISTS ot_work_types (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS salary_days (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id INT UNSIGNED NOT NULL,
  date DATE NOT NULL,
  attendance_status VARCHAR(30) DEFAULT NULL,
  bags_count INT UNSIGNED NOT NULL DEFAULT 3,
  base_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  ot_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  branch_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_employee_date (employee_id, date),
  KEY idx_branch_id (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE salary_days
  ADD COLUMN IF NOT EXISTS pack_count       INT UNSIGNED  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pack_rate        DECIMAL(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loading          TINYINT(1)    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unloading        TINYINT(1)    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loading_qty      DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unloading_qty    DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS location_qty     DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loading_rate     DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unloading_rate   DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loading_amount   DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unloading_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS location_change  DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kambi_qty        DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kambi_amount     DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS others_qty       DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS others_amount    DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS work_yes         TINYINT(1)    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS work_amount      DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_amount     DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS petrol           DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tea              DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance          DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salary_amount    DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS salary_ot_entries (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  salary_day_id INT UNSIGNED NOT NULL,
  ot_work_type_id INT UNSIGNED DEFAULT NULL,
  work_name VARCHAR(100) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_salary_day (salary_day_id),
  CONSTRAINT fk_ot_salary_day FOREIGN KEY (salary_day_id) REFERENCES salary_days (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS salary_payments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id INT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_date DATE NOT NULL,
  note VARCHAR(255) DEFAULT NULL,
  branch_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Food / OT (Nanguneri)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS food_rate DECIMAL(10,2) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS ot_rate DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE salary_days ADD COLUMN IF NOT EXISTS food_amount DECIMAL(10,2) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS ot_day_amount DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Panagudi: salary is for how many packs
ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_packs DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE salary_days MODIFY pack_rate DECIMAL(12,4) NOT NULL DEFAULT 0;

-- Customers: deleted customer bills are detached
ALTER TABLE invoices       ADD COLUMN IF NOT EXISTS client_detached TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS client_detached TINYINT(1) NOT NULL DEFAULT 0;

-- Price per pack: full decimals, no rounding
ALTER TABLE employees   MODIFY price_per_bags DOUBLE NULL DEFAULT NULL;
ALTER TABLE salary_days MODIFY pack_rate      DOUBLE NOT NULL DEFAULT 0;

-- ============================ END ====================================
