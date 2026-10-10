const mysql = require('mysql2');
require('dotenv').config();

// The schema is owned and migrated by ../server (server/db/migrations) — start the server first.
// SSL settings mirror server/config/db.js.
const ssl = process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: true, ...(process.env.DB_SSL_CA && { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n') }) }
    : undefined;

// Create the pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
    queueLimit: 0
});

// Convert the pool to use Promises (allows for async/await)
const db = pool.promise();

module.exports = db;
