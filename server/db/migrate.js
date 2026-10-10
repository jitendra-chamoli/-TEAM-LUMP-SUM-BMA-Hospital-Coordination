// Creates the database (if allowed) and applies every not-yet-applied file in
// db/migrations/ in filename order. Applied files are recorded in
// schema_migrations, so this is safe to run on every server start.
//
// A migration is either a .sql file or a .js file exporting `async up(conn)`.
// Add a schema change by creating the next numbered file (e.g. 005_add_x.sql);
// never edit a migration that has already been applied somewhere.

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { connectionOptions } = require('../config/db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureDatabase(dbName) {
    // Hosted providers (Aiven, TiDB, ...) usually pre-create the database and
    // don't grant CREATE DATABASE, so a failure here is not fatal.
    const conn = await mysql.createConnection({ ...connectionOptions, database: undefined });
    try {
        await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    } catch (err) {
        console.warn(`⚠️  Could not create database "${dbName}" (${err.code}); assuming it already exists.`);
    } finally {
        await conn.end();
    }
}

async function runMigrations() {
    const dbName = connectionOptions.database;
    if (!dbName) throw new Error('DB_NAME is not set');

    await ensureDatabase(dbName);

    const conn = await mysql.createConnection({ ...connectionOptions, multipleStatements: true });
    try {
        await conn.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name        VARCHAR(255) PRIMARY KEY,
                applied_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);

        const [rows] = await conn.query('SELECT name FROM schema_migrations');
        const applied = new Set(rows.map(r => r.name));

        const pending = fs.readdirSync(MIGRATIONS_DIR)
            .filter(f => /\.(sql|js)$/.test(f) && !applied.has(f))
            .sort();

        for (const file of pending) {
            const fullPath = path.join(MIGRATIONS_DIR, file);
            if (file.endsWith('.js')) {
                await require(fullPath).up(conn);
            } else {
                await conn.query(fs.readFileSync(fullPath, 'utf8'));
            }
            await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
            console.log(`🗄️  Applied migration ${file}`);
        }

        if (pending.length === 0) console.log('🗄️  Database schema is up to date');
    } finally {
        await conn.end();
    }
}

module.exports = { runMigrations };

// Allow `npm run db:migrate` to run this standalone.
if (require.main === module) {
    runMigrations()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('❌ Migration failed:', err.message);
            process.exit(1);
        });
}
