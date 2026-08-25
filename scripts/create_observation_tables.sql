-- =================================================================
-- NNE SafetyHUB - Observations Module Database Tables SQL Script
-- =================================================================

-- 1. Create Observations Table
CREATE TABLE IF NOT EXISTS `observations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `observation_number` VARCHAR(100) NOT NULL UNIQUE,
  `observation_type` ENUM('POSITIVE', 'NEEDS_ATTENTION') NOT NULL DEFAULT 'NEEDS_ATTENTION',
  `nature_of_finding` ENUM('GOOD_PRACTICE', 'UNSAFE_ACT', 'UNSAFE_CONDITION') NOT NULL DEFAULT 'UNSAFE_CONDITION',
  `subject` VARCHAR(255) NOT NULL,
  `safety_category` VARCHAR(150) NOT NULL,
  `risk_level` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  `description` TEXT NOT NULL,
  `project_name` VARCHAR(255) NULL,
  `project_id` INT NULL,
  `building_id` INT NULL,
  `building_name` VARCHAR(255) NULL,
  `floor_level` VARCHAR(150) NULL,
  `specific_location` TEXT NULL,
  `assigned_contractor_id` INT NULL,
  `assigned_contractor_name` VARCHAR(255) NULL,
  `photos` JSON NULL,
  `status` ENUM('OPEN', 'ASSIGNED', 'ACCEPTED', 'REJECTED', 'RESOLVED', 'CLOSED', 'ESCALATED') NOT NULL DEFAULT 'OPEN',
  `created_by_user_id` INT NULL,
  `created_by_user_name` VARCHAR(255) NULL,
  `created_by_contractor_id` INT NULL,
  `created_by_role` VARCHAR(100) NOT NULL DEFAULT 'DEPARTMENT',
  `resolution_notes` TEXT NULL,
  `resolution_photos` JSON NULL,
  `closed_by` VARCHAR(255) NULL,
  `closed_time` DATETIME NULL,
  `closure_comments` TEXT NULL,
  `closure_signature` TEXT NULL,
  `escalated_incident_id` INT NULL,
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Create Observation Action Logs (Audit Trail Timeline) Table
CREATE TABLE IF NOT EXISTS `observation_action_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `observation_id` INT NOT NULL,
  `action_type` ENUM('CREATED', 'ASSIGNED', 'CONTRACTOR_ACCEPTED', 'CONTRACTOR_REJECTED', 'REASSIGNED', 'RESOLVED', 'CLOSED', 'ESCALATED') NOT NULL,
  `performed_by_user_id` INT NULL,
  `performed_by_user_name` VARCHAR(255) NOT NULL,
  `performed_by_user_role` VARCHAR(100) NOT NULL,
  `previous_contractor` VARCHAR(255) NULL,
  `new_contractor` VARCHAR(255) NULL,
  `remarks` TEXT NULL,
  `photos` JSON NULL,
  `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_obs_log` FOREIGN KEY (`observation_id`) REFERENCES `observations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
