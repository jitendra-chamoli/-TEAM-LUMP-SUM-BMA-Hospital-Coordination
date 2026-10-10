const db = require('../config/db');

const ENTITY_TYPES = ['incident', 'fleet', 'resource', 'doctor', 'staff', 'shift', 'account'];

// GET /api/activity?type=doctor&user=<id|system>&before=<id> — newest first, 50 per page
exports.getActivity = async (req, res) => {
    const { type, before, user } = req.query;

    try {
        let query = `
            SELECT a.id, a.action, a.entity_type, a.entity_id, a.summary, a.created_at,
                   COALESCE(u.name, 'System') AS user_name, u.role AS user_role
            FROM activity_log a
            LEFT JOIN users u ON u.id = a.user_id
            WHERE a.hospital_id = ?`;
        const params = [req.user.hospital_id];

        if (ENTITY_TYPES.includes(type)) {
            query += ' AND a.entity_type = ?';
            params.push(type);
        }
        if (user === 'system') {
            query += ' AND a.user_id IS NULL';
        } else if (Number(user) > 0) {
            query += ' AND a.user_id = ?';
            params.push(Number(user));
        }
        if (Number(before) > 0) {
            query += ' AND a.id < ?';
            params.push(Number(before));
        }

        const [rows] = await db.query(`${query} ORDER BY a.id DESC LIMIT 50`, params);
        res.json(rows);
    } catch (err) {
        console.error("Activity Fetch Error:", err.message);
        res.status(500).json({ error: "Failed to fetch activity" });
    }
};

// GET /api/activity/users — people who appear in this hospital's activity (for the filter)
exports.getActivityUsers = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT DISTINCT u.id, u.name, u.role
            FROM activity_log a
            JOIN users u ON u.id = a.user_id
            WHERE a.hospital_id = ?
            ORDER BY u.name`, [req.user.hospital_id]);
        res.json(rows);
    } catch (err) {
        console.error("Activity Users Error:", err.message);
        res.status(500).json({ error: "Failed to fetch users" });
    }
};
