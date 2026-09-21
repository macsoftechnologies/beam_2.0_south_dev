-- =================================================================
-- NNE SafetyHUB - Safety Inspections Module Database Tables SQL
-- =================================================================

-- 1. Create safety_inspections table
CREATE TABLE IF NOT EXISTS `safety_inspections` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `inspection_number` VARCHAR(100) NOT NULL UNIQUE,
  `project_name` VARCHAR(255) NULL,
  `project_id` INT NULL,
  `project_no` VARCHAR(100) NULL,
  `building_id` INT NULL,
  `building_name` VARCHAR(255) NULL,
  `floor_level` VARCHAR(150) NULL,
  `specific_location` TEXT NULL,
  `selected_rooms` JSON NULL,
  `selected_zones` JSON NULL,
  `inspection_date` DATE NULL,
  `performed_by` JSON NULL,
  `participants` JSON NULL,
  `status` ENUM('DRAFT', 'IN_PROGRESS', 'CLOSED', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'IN_PROGRESS',
  `is_completed` TINYINT(1) NOT NULL DEFAULT 0,
  `score` INT NULL DEFAULT 100,
  `summary_counts` JSON NULL,
  `created_by_user_id` INT NULL,
  `created_by_user_name` VARCHAR(255) NULL,
  `created_by_role` VARCHAR(100) NULL,
  `modified_by_user_name` VARCHAR(255) NULL,
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Create safety_inspection_items table
CREATE TABLE IF NOT EXISTS `safety_inspection_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `inspection_id` INT NOT NULL,
  `item_index` INT NOT NULL,
  `category_name` VARCHAR(255) NOT NULL,
  `status` ENUM('na', 'green', 'yellow', 'red') NOT NULL DEFAULT 'na',
  `comment` TEXT NULL,
  `comment_author` VARCHAR(255) NULL,
  `comment_date` DATETIME NULL,
  `photos` JSON NULL,
  `issues` JSON NULL,
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_si_item_inspection` FOREIGN KEY (`inspection_id`) REFERENCES `safety_inspections` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
