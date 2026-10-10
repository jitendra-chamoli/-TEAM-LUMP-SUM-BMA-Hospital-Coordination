// Admin: the hospital's own ambulances and the drivers assigned to them.
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { generateTemporaryPassword } = require('../services/passwords');
const { logActivity } = require('../services/activity');
const { emitToHospitals, disconnectUser } = require('../realtime');

const TYPE_LABELS = { basic: 'Basic', advanced: 'Advanced', icu: 'ICU' };

const AMBULANCE_SELECT = `
    SELECT a.id, a.vehicle_number, a.type, a.status, a.is_active, a.location_source,
           a.location_updated_at, a.location_accuracy_m, a.latitude, a.longitude,
           u.id AS current_driver_id, u.name AS current_driver_name, u.phone AS current_driver_phone,
           (SELECT COUNT(*) FROM users d WHERE d.ambulance_id = a.id AND d.role = 'driver' AND d.is_active) AS assigned_drivers,
           (SELECT i.id FROM incidents i WHERE i.ambulance_id = a.id
              AND i.status IN ('requested', 'accepted', 'picked_up', 'arrived', 'unplaced') ORDER BY i.id DESC LIMIT 1) AS active_incident_id
    FROM ambulances a
    LEFT JOIN users u ON u.id = a.current_driver_id`;

const DRIVER_SELECT = `
    SELECT u.id, u.name, u.email, u.phone, u.is_active, u.must_change_password, u.created_at,
           u.ambulance_id, a.vehicle_number, (a.current_driver_id = u.id) AS on_shift
    FROM users u
    LEFT JOIN ambulances a ON a.id = u.ambulance_id`;

const getAmbulance = async (id, hospitalId) => {
    const [[row]] = await db.query(`${AMBULANCE_SELECT} WHERE a.id = ? AND a.hospital_id = ?`, [id, hospitalId]);
    return row || null;
};
const getDriver = async (id, hospitalId) => {
    const [[row]] = await db.query(`${DRIVER_SELECT} WHERE u.id = ? AND u.hospital_id = ? AND u.role = 'driver'`, [id, hospitalId]);
    return row || null;
};

const changed = (hospitalId) => emitToHospitals(hospitalId, 'fleet_updated', {});

const fail = (res, err, fallback) => {
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: /vehicle/i.test(err.sqlMessage) ? 'Another ambulance already has this vehicle number.' : 'An account with this email already exists.' });
    }
    console.error(`${fallback}:`, err.message);
    res.status(500).json({ error: fallback });
};

exports.getFleet = async (req, res) => {
    try {
        const [ambulances] = await db.query(`${AMBULANCE_SELECT} WHERE a.hospital_id = ? ORDER BY a.is_active DESC, a.vehicle_number`, [req.user.hospital_id]);
        const [drivers] = await db.query(`${DRIVER_SELECT} WHERE u.hospital_id = ? AND u.role = 'driver' ORDER BY u.is_active DESC, u.name`, [req.user.hospital_id]);
        res.json({ ambulances, drivers });
    } catch (err) {
        fail(res, err, 'Failed to load the fleet');
    }
};

// ---------------- Ambulances ---------------- //

exports.addAmbulance = async (req, res) => {
    const { vehicle_number, type } = req.body;
    const hospitalId = req.user.hospital_id;
    try {
        // Off shift until a driver starts a shift; located by the driver's phone.
        const [result] = await db.query(
            "INSERT INTO ambulances (hospital_id, vehicle_number, type, status, location_source) VALUES (?, ?, ?, 'offline', 'gps')",
            [hospitalId, vehicle_number, type]
        );
        changed(hospitalId);
        await logActivity({ hospitalId, user: req.user, action: 'fleet.ambulance_added', entityType: 'fleet', entityId: result.insertId,
            summary: `Added ambulance ${vehicle_number} (${TYPE_LABELS[type]})` });
        res.status(201).json(await getAmbulance(result.insertId, hospitalId));
    } catch (err) {
        fail(res, err, 'Failed to add the ambulance');
    }
};

exports.updateAmbulance = async (req, res) => {
    const id = Number(req.params.id);
    const hospitalId = req.user.hospital_id;
    const { vehicle_number, type, is_active } = req.body;
    try {
        const before = await getAmbulance(id, hospitalId);
        if (!before) return res.status(404).json({ error: 'Ambulance not found' });

        const sets = [], params = [], notes = [];
        if (vehicle_number !== undefined && vehicle_number !== before.vehicle_number) { sets.push('vehicle_number = ?'); params.push(vehicle_number); notes.push(`renumbered to ${vehicle_number}`); }
        if (type !== undefined && type !== before.type) { sets.push('type = ?'); params.push(type); notes.push(`type ${TYPE_LABELS[type]}`); }
        if (is_active !== undefined && is_active !== Boolean(before.is_active)) {
            if (!is_active && before.active_incident_id) return res.status(409).json({ error: 'This ambulance is on a job. Retire it after the job ends.' });
            sets.push('is_active = ?'); params.push(is_active);
            if (!is_active) sets.push("status = 'offline'", 'current_driver_id = NULL');
            notes.push(is_active ? 'returned to service' : 'retired');
        }
        if (!sets.length) return res.json(before);

        await db.query(`UPDATE ambulances SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
        changed(hospitalId);
        await logActivity({ hospitalId, user: req.user, action: 'fleet.ambulance_updated', entityType: 'fleet', entityId: id,
            summary: `Ambulance ${before.vehicle_number}: ${notes.join(', ')}` });
        res.json(await getAmbulance(id, hospitalId));
    } catch (err) {
        fail(res, err, 'Failed to update the ambulance');
    }
};

// ---------------- Drivers ---------------- //

const checkAmbulance = async (ambulanceId, hospitalId) => {
    if (ambulanceId === null || ambulanceId === undefined) return true;
    const a = await getAmbulance(ambulanceId, hospitalId);
    return Boolean(a && a.is_active);
};

exports.addDriver = async (req, res) => {
    const { name, email, phone, ambulance_id } = req.body;
    const hospitalId = req.user.hospital_id;
    try {
        if (!(await checkAmbulance(ambulance_id, hospitalId))) return res.status(400).json({ error: 'Choose one of your active ambulances.' });

        const temporaryPassword = generateTemporaryPassword();
        const hashed = await bcrypt.hash(temporaryPassword, 10);
        const [result] = await db.query(
            `INSERT INTO users (hospital_id, ambulance_id, name, email, phone, password_hash, must_change_password, role)
             VALUES (?, ?, ?, ?, ?, ?, TRUE, 'driver')`,
            [hospitalId, ambulance_id ?? null, name, email, phone, hashed]
        );
        changed(hospitalId);
        await logActivity({ hospitalId, user: req.user, action: 'fleet.driver_added', entityType: 'fleet', entityId: result.insertId,
            summary: `Added driver ${name}` });
        res.status(201).json({ data: await getDriver(result.insertId, hospitalId), temporary_password: temporaryPassword });
    } catch (err) {
        fail(res, err, 'Failed to add the driver');
    }
};

exports.updateDriver = async (req, res) => {
    const id = Number(req.params.id);
    const hospitalId = req.user.hospital_id;
    const { name, phone, ambulance_id, is_active } = req.body;
    try {
        const before = await getDriver(id, hospitalId);
        if (!before) return res.status(404).json({ error: 'Driver not found' });

        const sets = [], params = [], notes = [];
        if (name !== undefined && name !== before.name) { sets.push('name = ?'); params.push(name); notes.push(`renamed to ${name}`); }
        if (phone !== undefined && phone !== before.phone) { sets.push('phone = ?'); params.push(phone); notes.push('phone updated'); }
        if (ambulance_id !== undefined && ambulance_id !== before.ambulance_id) {
            if (before.on_shift) return res.status(409).json({ error: `${before.name} is on shift. Ask them to end the shift before changing ambulance.` });
            if (!(await checkAmbulance(ambulance_id, hospitalId))) return res.status(400).json({ error: 'Choose one of your active ambulances.' });
            sets.push('ambulance_id = ?'); params.push(ambulance_id);
            notes.push(ambulance_id ? 'assigned to another ambulance' : 'unassigned from ambulance');
        }
        if (is_active !== undefined && is_active !== Boolean(before.is_active)) {
            if (!is_active && before.on_shift) {
                const [[amb]] = await db.query('SELECT status FROM ambulances WHERE id = ?', [before.ambulance_id]);
                if (amb?.status === 'dispatched') return res.status(409).json({ error: `${before.name} is on a job. Deactivate them after it ends.` });
                await db.query("UPDATE ambulances SET current_driver_id = NULL, status = 'offline' WHERE id = ?", [before.ambulance_id]);
            }
            sets.push('is_active = ?'); params.push(is_active);
            notes.push(is_active ? 'reactivated' : 'deactivated');
        }
        if (!sets.length) return res.json(before);

        await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
        if (is_active === false) disconnectUser(id);
        changed(hospitalId);
        await logActivity({ hospitalId, user: req.user, action: 'fleet.driver_updated', entityType: 'fleet', entityId: id,
            summary: `Driver ${before.name}: ${notes.join(', ')}` });
        res.json(await getDriver(id, hospitalId));
    } catch (err) {
        fail(res, err, 'Failed to update the driver');
    }
};

exports.resetDriverPassword = async (req, res) => {
    const id = Number(req.params.id);
    const hospitalId = req.user.hospital_id;
    try {
        const driver = await getDriver(id, hospitalId);
        if (!driver) return res.status(404).json({ error: 'Driver not found' });
        const temporaryPassword = generateTemporaryPassword();
        await db.query('UPDATE users SET password_hash = ?, must_change_password = TRUE WHERE id = ?', [await bcrypt.hash(temporaryPassword, 10), id]);
        disconnectUser(id);
        changed(hospitalId);
        await logActivity({ hospitalId, user: req.user, action: 'fleet.driver_password_reset', entityType: 'fleet', entityId: id,
            summary: `Reset password for driver ${driver.name}` });
        res.json({ data: await getDriver(id, hospitalId), temporary_password: temporaryPassword });
    } catch (err) {
        fail(res, err, 'Failed to reset the password');
    }
};
