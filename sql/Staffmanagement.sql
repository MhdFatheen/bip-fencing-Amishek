

-------------------------------------------------------- Employee Management ------------------------------------------------------------

 DROP TABLE IF EXISTS `employees`;
CREATE TABLE `employees` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `employee_name` varchar(255) NOT NULL,
  `emp_id` varchar(100) NOT NULL,
  `department` varchar(255) NOT NULL,
  `destination` varchar(255) DEFAULT NULL,      -- new optional field
  `gender` enum('Male','Female','Other') DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone_number` varchar(50) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `salary_type` enum('monthly','weekly','daily') NOT NULL,
  `date_of_joining` date NOT NULL,
  `branch_id` int(10) unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `emp_id` (`emp_id`),
  KEY `branch_id` (`branch_id`),
  FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE employees
ADD CONSTRAINT unique_empid UNIQUE(emp_id),
ADD CONSTRAINT unique_phone UNIQUE(phone_number);
ALTER TABLE employees MODIFY COLUMN phone_number VARCHAR(15) NOT NULL;

-- New
-- Migration for employees table
-- Drops emp_id, department, destination, email
-- Renames phone_number -> whatsapp_number
-- Adds petrol, tea, extra_binding_work, price_per_pack
--
-- BACK UP YOUR TABLE BEFORE RUNNING THIS.

ALTER TABLE employees
  DROP COLUMN emp_id,
  DROP COLUMN department,
  DROP COLUMN destination,
  DROP COLUMN email,
  CHANGE phone_number whatsapp_number VARCHAR(15) NOT NULL,
  ADD COLUMN petrol ENUM('yes','no','other') NULL AFTER whatsapp_number,
  ADD COLUMN tea ENUM('yes','no','other') NULL AFTER petrol,
  ADD COLUMN extra_binding_work ENUM('yes','no','other') NULL AFTER tea,
  ADD COLUMN price_per_pack ENUM('300','400','500') NULL AFTER extra_binding_work;

  -- 1. Daily rate on employees
ALTER TABLE employees
  ADD COLUMN daily_rate DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER salary_type;

  SELECT employee_name, COUNT(*) AS cnt
FROM employees
GROUP BY employee_name
HAVING cnt > 1;

ALTER TABLE employees
  DROP COLUMN daily_rate,
  DROP COLUMN petrol,
  DROP COLUMN tea,
  DROP COLUMN extra_binding_work,
  DROP COLUMN price_per_pack;

ALTER TABLE employees
  ADD UNIQUE KEY uniq_employee_name (employee_name);

  ALTER TABLE employees
  ADD COLUMN price_per_bags DECIMAL(10,2) NULL DEFAULT NULL AFTER salary_type;
-------------------------------------------------------- Admin Features ------------------------------------------------------------------------------

DROP TABLE IF EXISTS `branch_amounts`;
CREATE TABLE `branch_amounts` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `branch_id` int(10) unsigned NOT NULL,
  `branch_name` varchar(255) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `payment_date` date NOT NULL,
  `note` text DEFAULT NULL,
  `received_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `branch_id` (`branch_id`),
  CONSTRAINT `fk_branch_amounts_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


--------------------------------------------------------- Salary Management ------------------------------------------------------------------------------

DROP TABLE IF EXISTS `salaries`;
CREATE TABLE IF NOT EXISTS `salaries` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `employeeName` varchar(255) NOT NULL,
  `employeeId` varchar(100) NOT NULL,
  `salary` decimal(12,2) NOT NULL,
  `paid` decimal(12,2) DEFAULT 0.00,
  `balance` decimal(12,2) GENERATED ALWAYS AS (salary - paid) STORED,
  `type` enum('Days','Weeks','Monthly') NOT NULL DEFAULT 'Days',
  `salary_date` date NOT NULL,
  `branch_id` int(10) unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `branch_id` (`branch_id`),
  FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


----------------------------------------------------------- Attendance Management ------------------------------------------------------------------------------

-- New
-- Drops the old attendance table and recreates it cleanly.
-- employee_id is now a true INT foreign key to employees.id, so it is
-- impossible for a record to be linked to a non-existent employee, and
-- the old text-style IDs (e.g. "EMP008") can never reappear.
--
-- THIS DELETES ALL EXISTING ATTENDANCE HISTORY. Export/back up first if
-- you want to keep it.

DROP TABLE IF EXISTS attendance;

CREATE TABLE attendance (
  id            INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id   INT(10) UNSIGNED NOT NULL,
  employee_name VARCHAR(255) NOT NULL,
  date          DATE NOT NULL,
  status        ENUM('Present','Absent','Half Day','Late','On Leave','Holiday','Work From Site')
                  NOT NULL DEFAULT 'Present',
  leave_type    VARCHAR(50) DEFAULT NULL,
  check_in      TIME DEFAULT NULL,
  check_out     TIME DEFAULT NULL,
  work_hours    DECIMAL(5,2) DEFAULT NULL,
  branch_id     INT(10) UNSIGNED NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_employee_date (employee_id, date),
  KEY idx_branch_id (branch_id),
  CONSTRAINT fk_attendance_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-------------------------------------------------------overtime Management ------------------------------------------------------------------------------

DROP TABLE IF EXISTS `ot_details`;

CREATE TABLE `ot_details` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `emp_name` varchar(100) NOT NULL,
  `emp_id` varchar(50) NOT NULL,
  `salary_type` varchar(50) DEFAULT NULL,
  `start_time` varchar(10) NOT NULL,
  `end_time` varchar(10) NOT NULL,
  `total_ot_hours` decimal(5,2) NOT NULL,
  `ot_salary` decimal(10,2) NOT NULL DEFAULT 0.00,
  `ot_date` date NOT NULL,
  `branch_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_employee_date` (`emp_id`, `ot_date`),
  KEY `branch_id` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-------------------------------------------------------- New OT Table -----------------------------------------------------------------------------

-- 2. OT work type catalog
CREATE TABLE ot_work_types (
  id         INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(100) NOT NULL,
  amount     DECIMAL(10,2) NOT NULL,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


------------------------------------------------------- Salary Advance Management -----------------------------------------------------------------------------

-- 3. Daily earning snapshot per employee (base wage + OT total)
CREATE TABLE salary_days (
  id                INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id       INT(10) UNSIGNED NOT NULL,
  date              DATE NOT NULL,
  attendance_status VARCHAR(30) DEFAULT NULL,
  base_amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  ot_amount         DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_amount      DECIMAL(10,2) NOT NULL DEFAULT 0,
  branch_id         INT(10) UNSIGNED NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_employee_date (employee_id, date),
  KEY idx_branch_id (branch_id),
  CONSTRAINT fk_salary_days_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE salary_days
  ADD COLUMN bags_count INT UNSIGNED NOT NULL DEFAULT 3 AFTER attendance_status;

-- 4. Individual OT line items for a given salary_days row
CREATE TABLE salary_ot_entries (
  id              INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  salary_day_id   INT(10) UNSIGNED NOT NULL,
  ot_work_type_id INT(10) UNSIGNED DEFAULT NULL,
  work_name       VARCHAR(100) NOT NULL,
  amount          DECIMAL(10,2) NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_salary_day (salary_day_id),
  CONSTRAINT fk_ot_salary_day FOREIGN KEY (salary_day_id) REFERENCES salary_days(id) ON DELETE CASCADE,
  CONSTRAINT fk_ot_work_type FOREIGN KEY (ot_work_type_id) REFERENCES ot_work_types(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE salary_ot_entries
  ADD COLUMN quantity INT UNSIGNED NOT NULL DEFAULT 1 AFTER amount;

-- 5. Payments made to an employee (running ledger; pending balance =
--    SUM(salary_days.total_amount) - SUM(salary_payments.amount))
CREATE TABLE salary_payments (
  id           INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id  INT(10) UNSIGNED NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  payment_date DATE NOT NULL,
  note         VARCHAR(255) DEFAULT NULL,
  branch_id    INT(10) UNSIGNED NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_employee (employee_id),
  CONSTRAINT fk_payment_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;