const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    multipleStatements: true
  });

  console.log('Connected to MySQL DB:', process.env.DB_NAME);
  const sql = fs.readFileSync(path.join(__dirname, 'create_safety_inspection_tables.sql'), 'utf8');
  await connection.query(sql);
  console.log('Successfully executed create_safety_inspection_tables.sql');

  const [tables] = await connection.query("SHOW TABLES LIKE 'safety_inspection%'");
  console.log('Tables verified:', tables);
  await connection.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
