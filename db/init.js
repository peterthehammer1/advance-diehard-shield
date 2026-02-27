const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);

    const { rows } = await client.query('SELECT COUNT(*) FROM phone_lists');
    if (parseInt(rows[0].count) === 0) {
      const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
      await client.query(seed);
      console.log('Database seeded with demo data');
    }

    console.log('Database initialized');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
