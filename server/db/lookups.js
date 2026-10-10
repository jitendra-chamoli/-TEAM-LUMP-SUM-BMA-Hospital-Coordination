// Name -> id helpers for the lookup tables. The API keeps accepting and
// returning department / resource names; only the tables store ids.

const db = require('../config/db');

// Departments are a fixed list (seeded in 002_seed_lookups.sql); unknown names return null.
exports.getDepartmentId = async (name, conn = db) => {
    const [[row]] = await conn.query('SELECT id FROM departments WHERE name = ?', [name]);
    return row ? row.id : null;
};

// Resource types can grow from the UI, so a new name is created on first use.
exports.getResourceTypeId = async (name, conn = db) => {
    await conn.query('INSERT IGNORE INTO resource_types (name) VALUES (?)', [name]);
    const [[row]] = await conn.query('SELECT id FROM resource_types WHERE name = ?', [name]);
    return row.id;
};
