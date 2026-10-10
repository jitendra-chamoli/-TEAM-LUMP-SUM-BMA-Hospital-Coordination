const db = require('../config/db');
const { logActivity } = require('../services/activity');
const { SCHEMES, TARIFF_ITEMS, HOSPITAL_TYPES } = require('../config/payers');

const HOSPITAL_FIELDS = 'id, name, address, city, latitude, longitude, phone, type, is_trauma_centre, created_at';

const schemeCodes = new Set(SCHEMES.map(s => s.code));
const tariffCodes = new Set(TARIFF_ITEMS.map(t => t.code));

const loadExtras = async (hospitalId) => {
    const [schemes] = await db.query('SELECT scheme FROM hospital_schemes WHERE hospital_id = ?', [hospitalId]);
    const [tariffs] = await db.query(
        'SELECT item, min_price, max_price, updated_at FROM hospital_tariffs WHERE hospital_id = ?', [hospitalId]);
    return { schemes: schemes.map(r => r.scheme), tariffs };
};

exports.getHospital = async (req, res) => {
    try {
        const [[hospital]] = await db.query(`SELECT ${HOSPITAL_FIELDS} FROM hospitals WHERE id = ?`, [req.user.hospital_id]);
        res.json({ ...hospital, ...(await loadExtras(req.user.hospital_id)),
            options: { schemes: SCHEMES, tariff_items: TARIFF_ITEMS, types: HOSPITAL_TYPES } });
    } catch (err) {
        console.error("Fetch Hospital Error:", err.message);
        res.status(500).json({ error: "Failed to load hospital details" });
    }
};

// Admin only: name, phone, city and address. Location changes go through registration's map picker.
exports.updateHospital = async (req, res) => {
    const hospitalId = req.user.hospital_id;
    const allowed = ['name', 'phone', 'city', 'address', 'type', 'is_trauma_centre'];

    try {
        const [[before]] = await db.query(`SELECT ${HOSPITAL_FIELDS} FROM hospitals WHERE id = ?`, [hospitalId]);
        const changed = allowed.filter(f => req.body[f] !== undefined && req.body[f] !== before[f]);
        if (changed.length === 0) return res.json({ ...before, ...(await loadExtras(hospitalId)) });

        await db.query(
            `UPDATE hospitals SET ${changed.map(f => `${f} = ?`).join(', ')} WHERE id = ?`,
            [...changed.map(f => req.body[f]), hospitalId]
        );

        const [[hospital]] = await db.query(`SELECT ${HOSPITAL_FIELDS} FROM hospitals WHERE id = ?`, [hospitalId]);
        await logActivity({
            hospitalId, user: req.user, action: 'hospital.updated', entityType: 'account', entityId: hospitalId,
            summary: `Updated hospital details (${changed.join(', ')})`
        });
        res.json({ ...hospital, ...(await loadExtras(hospitalId)) });
    } catch (err) {
        console.error("Update Hospital Error:", err.message);
        res.status(500).json({ error: "Failed to save hospital details" });
    }
};

// Which payment schemes this hospital is empanelled for. Sent as the complete list.
exports.setSchemes = async (req, res) => {
    const hospitalId = req.user.hospital_id;
    const wanted = [...new Set(req.body.schemes)].filter(c => schemeCodes.has(c));
    try {
        await db.query('DELETE FROM hospital_schemes WHERE hospital_id = ?', [hospitalId]);
        for (const scheme of wanted) {
            await db.query('INSERT INTO hospital_schemes (hospital_id, scheme) VALUES (?, ?)', [hospitalId, scheme]);
        }
        await logActivity({
            hospitalId, user: req.user, action: 'hospital.schemes_updated', entityType: 'account', entityId: hospitalId,
            summary: `Updated accepted schemes (${wanted.length ? wanted.join(', ') : 'none'})`
        });
        res.json(await loadExtras(hospitalId));
    } catch (err) {
        console.error('Set Schemes Error:', err.message);
        res.status(500).json({ error: 'Failed to save the schemes' });
    }
};

// Published arrival costs. An item with no min_price is removed.
exports.setTariffs = async (req, res) => {
    const hospitalId = req.user.hospital_id;
    try {
        for (const row of req.body.tariffs) {
            if (!tariffCodes.has(row.item)) continue;
            if (row.min_price === null || row.min_price === undefined) {
                await db.query('DELETE FROM hospital_tariffs WHERE hospital_id = ? AND item = ?', [hospitalId, row.item]);
                continue;
            }
            await db.query(
                `INSERT INTO hospital_tariffs (hospital_id, item, min_price, max_price) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE min_price = VALUES(min_price), max_price = VALUES(max_price)`,
                [hospitalId, row.item, row.min_price, row.max_price ?? null]
            );
        }
        await logActivity({
            hospitalId, user: req.user, action: 'hospital.tariffs_updated', entityType: 'account', entityId: hospitalId,
            summary: 'Updated published arrival costs'
        });
        res.json(await loadExtras(hospitalId));
    } catch (err) {
        console.error('Set Tariffs Error:', err.message);
        res.status(500).json({ error: 'Failed to save the rates' });
    }
};
