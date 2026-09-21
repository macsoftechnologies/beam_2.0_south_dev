const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function fix() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    multipleStatements: true
  });

  console.log('Connected to MySQL DB:', process.env.DB_NAME);

  // Alter safety_inspections status enum
  console.log('Altering safety_inspections status enum...');
  await connection.query("ALTER TABLE `safety_inspections` MODIFY COLUMN `status` ENUM('DRAFT', 'IN_PROGRESS', 'CLOSED', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'IN_PROGRESS';");
  console.log('safety_inspections status column updated successfully.');

  // Alter newuserlogs body to LONGTEXT
  console.log('Altering newuserlogs body column to LONGTEXT...');
  await connection.query("ALTER TABLE `newuserlogs` MODIFY COLUMN `body` LONGTEXT NULL;");
  console.log('newuserlogs body column updated successfully.');

  await connection.end();
  console.log('All DB changes applied successfully!');
}

fix().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
