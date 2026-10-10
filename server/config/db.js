const mysql = require('mysql2');
require('dotenv').config();

// SSL is required by most hosted MySQL providers (Aiven, TiDB Cloud).
// DB_SSL=true turns it on; DB_SSL_CA optionally holds the provider's CA certificate (PEM text).
const ssl = process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: true, ...(process.env.DB_SSL_CA && { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n') }) }
    : undefined;

const connectionOptions = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl
};

// Create the pool
const pool = mysql.createPool({
    ...connectionOptions,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
    queueLimit: 0
});

// Convert the pool to use Promises (allows for async/await)
const db = pool.promise();

module.exports = db;
module.exports.connectionOptions = connectionOptions;
