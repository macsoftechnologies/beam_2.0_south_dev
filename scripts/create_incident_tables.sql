-- =============================================================================
-- NNE SafetyHUB - Incident Management SQL Migration Script
-- Creates all 5 required tables for Incident Management in MySQL database
-- =============================================================================

-- 1. Main Incidents Table
CREATE TABLE IF NOT EXISTS `incidents` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `case_number` VARCHAR(100) NOT NULL UNIQUE,
  `project_name` VARCHAR(255) NULL,
  `project_id` INT NULL,
  `incident_date` DATE NULL,
  `incident_time` VARCHAR(50) NULL,
  `incident_timestamp` DATETIME NULL,
  `building_id` INT NULL,
  `floor_level` VARCHAR(150) NULL,
  `specific_location` TEXT NULL,
  `contractors_involved` TEXT NULL,
  `stage` ENUM('HEADS_UP', 'INITIAL_REPORT', 'INVESTIGATION', 'CLOSED') NOT NULL DEFAULT 'HEADS_UP',
  `categories` JSON NULL,
  `actual_severity` INT NULL,
  `potential_severity` INT NULL,
  `is_hipo` TINYINT(1) NOT NULL DEFAULT 0,
  `investigation_level` ENUM('L1', 'L2', 'L3') NOT NULL DEFAULT 'L1',
  `gatekeeper_informed` TINYINT(1) NOT NULL DEFAULT 0,
  `gatekeeper_name` VARCHAR(255) NULL,
  `sla_headsup_due` DATETIME NULL,
  `sla_initial_due` DATETIME NULL,
  `sla_investigation_due` DATETIME NULL,
  `status` INT NOT NULL DEFAULT 1,
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Stage 1: Heads-Up Notification Table
CREATE TABLE IF NOT EXISTS `incident_headsup` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `incident_id` INT NOT NULL,
  `description_what_happened` TEXT NULL,
  `description_consequence` TEXT NULL,
  `is_environmental` TINYINT(1) NOT NULL DEFAULT 0,
  `spill_type` JSON NULL,
  `spill_substance` VARCHAR(255) NULL,
  `spill_cause` TEXT NULL,
  `spill_quantity` VARCHAR(100) NULL,
  `spill_system_entered` JSON NULL,
  `immediate_actions` JSON NULL,
  `submitted_by` VARCHAR(255) NULL,
  `signature` TEXT NULL,
  `submitted_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_headsup_incident` FOREIGN KEY (`incident_id`) REFERENCES `incidents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Stage 2: Initial Incident Report Table
CREATE TABLE IF NOT EXISTS `incident_initial_reports` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `incident_id` INT NOT NULL,
  `photos` JSON NULL,
  `has_injury_illness` TINYINT(1) NOT NULL DEFAULT 0,
  `nature_of_injury` TEXT NULL,
  `treatment_prescribed` TEXT NULL,
  `anticipated_absence` VARCHAR(255) NULL,
  `treatment_provided` JSON NULL,
  `accident_categories` JSON NULL,
  `injury_types` JSON NULL,
  `body_parts_injured` JSON NULL,
  `submitted_by` VARCHAR(255) NULL,
  `signature` TEXT NULL,
  `submitted_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_initial_incident` FOREIGN KEY (`incident_id`) REFERENCES `incidents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Stage 3: Incident Investigation Table (Fishbone & 5 Whys)
CREATE TABLE IF NOT EXISTS `incident_investigations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `incident_id` INT NOT NULL,
  `investigation_details` TEXT NULL,
  `fishbone_data` JSON NULL,
  `problem_statement` TEXT NULL,
  `five_whys_data` JSON NULL,
  `root_causes` JSON NULL,
  `contributing_factors` JSON NULL,
  `mandatory_attachments` JSON NULL,
  `signatures` JSON NULL,
  `completed_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_investigation_incident` FOREIGN KEY (`incident_id`) REFERENCES `incidents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Action Items Table (CAPA)
CREATE TABLE IF NOT EXISTS `incident_action_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `incident_id` INT NOT NULL,
  `action_type` ENUM('IMMEDIATE', 'CORRECTIVE') NOT NULL DEFAULT 'IMMEDIATE',
  `action` TEXT NOT NULL,
  `responsible` VARCHAR(255) NOT NULL,
  `target_date` DATE NULL,
  `time_implemented` VARCHAR(100) NULL,
  `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
  `updated_by` VARCHAR(255) NULL,
  `status_history` JSON NULL,
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_action_item_incident` FOREIGN KEY (`incident_id`) REFERENCES `incidents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
