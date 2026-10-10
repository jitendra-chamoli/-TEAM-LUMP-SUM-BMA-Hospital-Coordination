const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { getDepartmentId } = require('../db/lookups');
const { generateTemporaryPassword } = require('../services/passwords');
const { logActivity } = require('../services/activity');
const { emitToHospitals, disconnectUser } = require('../realtime');

const STATUS_LABELS = { on_duty: 'On Duty', on_call: 'On Call', in_surgery: 'In Surgery', off_duty: 'Off Duty' };

// One row per doctor with department, login and the current-or-next shift.
// `is_available` (on duty or on call) is what dispatch counts.
const DOCTOR_SELECT = `
    SELECT doc.id, doc.hospital_id, doc.name AS doctor_name, d.name AS department,
           doc.status, doc.status IN ('on_duty', 'on_call') AS is_available,
           doc.specialization, doc.phone, doc.status_updated_at,
           lu.id AS login_user_id, lu.email AS login_email, lu.is_active AS login_active,
           (SELECT s.starts_at FROM doctor_shifts s WHERE s.doctor_id = doc.id AND s.ends_at > ? ORDER BY s.starts_at LIMIT 1) AS next_shift_start,
           (SELECT s.ends_at   FROM doctor_shifts s WHERE s.doctor_id = doc.id AND s.ends_at > ? ORDER BY s.starts_at LIMIT 1) AS next_shift_end
    FROM doctors doc
    JOIN departments d    ON d.id = doc.department_id
    LEFT JOIN users lu    ON lu.doctor_id = doc.id`;

const getDoctorRow = async (id, hospitalId) => {
    const now = new Date();
    const [[row]] = await db.query(`${DOCTOR_SELECT} WHERE doc.id = ? AND doc.hospital_id = ?`, [now, now, id, hospitalId]);
    return row || null;
};

// Admins manage everyone; staff manage their own department; doctors only themselves.
const canSetStatus = (user, doctor) =>
    user.role === 'admin' ||
    (user.role === 'staff' && user.department === doctor.department) ||
    (user.role === 'doctor' && user.doctor_id === doctor.id);

const canManageShifts = (user, doctor) =>
    user.role === 'admin' || (user.role === 'staff' && user.department === doctor.department);

const broadcastDoctor = async (id, hospitalId) => {
    const doctor = await getDoctorRow(id, hospitalId);
    if (doctor) emitToHospitals(hospitalId, 'doctor_changed', doctor);
    return doctor;
};

exports.broadcastDoctor = broadcastDoctor;
exports.STATUS_LABELS = STATUS_LABELS;

// Get Doctors based on Hospital and Department
exports.getDoctors = async (req, res) => {
    try {
        const now = new Date();
        let query = `${DOCTOR_SELECT} WHERE doc.hospital_id = ?`;
        const params = [now, now, req.user.hospital_id];

        // Staff and doctors only see their own department
        if (req.user.role !== 'admin') {
            query += ' AND d.name = ?';
            params.push(req.user.department);
        }

        const [rows] = await db.query(`${query} ORDER BY d.name, doc.name`, params);
        res.json(rows);
    } catch (err) {
        console.error("Fetch Doctors Error:", err);
        res.status(500).json({ error: "Failed to fetch doctors" });
    }
};

exports.setStatus = async (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body;

    try {
        const doctor = await getDoctorRow(id, req.user.hospital_id);
        if (!doctor) return res.status(404).json({ error: "Doctor not found" });
        if (!canSetStatus(req.user, doctor)) {
            return res.status(403).json({ message: "You can't change this doctor's status." });
        }
        if (doctor.status === status) return res.json({ success: true, data: doctor });

        await db.query('UPDATE doctors SET status = ?, status_updated_at = ? WHERE id = ?', [status, new Date(), id]);

        const updated = await broadcastDoctor(id, req.user.hospital_id);
        await logActivity({
            hospitalId: req.user.hospital_id, user: req.user,
            action: 'doctor.status_changed', entityType: 'doctor', entityId: id,
            summary: `${doctor.doctor_name}: ${STATUS_LABELS[doctor.status]} → ${STATUS_LABELS[status]}`
        });

        res.json({ success: true, data: updated });
    } catch (err) {
        console.error("Doctor Status Error:", err);
        res.status(500).json({ error: "Database update failed" });
    }
};

// Admin only: Add a new doctor
exports.addDoctor = async (req, res) => {
    const { name, dept, specialization, phone } = req.body;
    const hospitalId = req.user.hospital_id;

    try {
        const departmentId = await getDepartmentId(dept);
        if (!departmentId) return res.status(400).json({ error: `Unknown department "${dept}".` });

        const [result] = await db.query(
            'INSERT INTO doctors (hospital_id, department_id, name, specialization, phone) VALUES (?, ?, ?, ?, ?)',
            [hospitalId, departmentId, name, specialization ?? null, phone ?? null]
        );

        const doctor = await broadcastDoctor(result.insertId, hospitalId);
        await logActivity({
            hospitalId, user: req.user, action: 'doctor.added', entityType: 'doctor', entityId: doctor.id,
            summary: `Added Dr. ${name} to ${dept}`
        });

        res.status(201).json({ message: "Doctor added successfully", data: doctor });
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ error: "Failed to add doctor" });
    }
};

exports.updateDoctor = async (req, res) => {
    const id = Number(req.params.id);
    const hospitalId = req.user.hospital_id;
    const { name, dept, specialization, phone } = req.body;

    try {
        const before = await getDoctorRow(id, hospitalId);
        if (!before) return res.status(404).json({ error: "Doctor not found" });

        const sets = [];
        const params = [];
        const changes = [];

        if (name !== undefined && name !== before.doctor_name) {
            sets.push('name = ?'); params.push(name); changes.push(`renamed to ${name}`);
        }
        if (dept !== undefined && dept !== before.department) {
            const departmentId = await getDepartmentId(dept);
            if (!departmentId) return res.status(400).json({ error: `Unknown department "${dept}".` });
            sets.push('department_id = ?'); params.push(departmentId);
            changes.push(`moved from ${before.department} to ${dept}`);
        }
        if (specialization !== undefined && specialization !== before.specialization) {
            sets.push('specialization = ?'); params.push(specialization); changes.push('specialization updated');
        }
        if (phone !== undefined && phone !== before.phone) {
            sets.push('phone = ?'); params.push(phone); changes.push('phone updated');
        }

        if (sets.length === 0) return res.json({ message: "No changes", data: before });

        await db.query(`UPDATE doctors SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);

        const doctor = await broadcastDoctor(id, hospitalId);
        await logActivity({
            hospitalId, user: req.user, action: 'doctor.updated', entityType: 'doctor', entityId: id,
            summary: `${before.doctor_name}: ${changes.join(', ')}`
        });

        res.json({ message: "Doctor updated", data: doctor });
    } catch (err) {
        console.error("Update Doctor Error:", err);
        res.status(500).json({ error: "Failed to update doctor" });
    }
};

// Removes the doctor along with their shifts and login (if any). Past incidents keep their history.
exports.deleteDoctor = async (req, res) => {
    const id = Number(req.params.id);
    const hospitalId = req.user.hospital_id;

    try {
        const doctor = await getDoctorRow(id, hospitalId);
        if (!doctor) return res.status(404).json({ error: "Doctor not found" });

        if (doctor.login_user_id) disconnectUser(doctor.login_user_id);
        await db.query('DELETE FROM doctors WHERE id = ?', [id]);

        emitToHospitals(hospitalId, 'doctor_removed', { id });
        await logActivity({
            hospitalId, user: req.user, action: 'doctor.removed', entityType: 'doctor', entityId: id,
            summary: `Removed Dr. ${doctor.doctor_name} (${doctor.department})`
        });

        res.json({ message: "Doctor removed" });
    } catch (err) {
        console.error("Delete Doctor Error:", err);
        res.status(500).json({ error: "Failed to remove doctor" });
    }
};

// Gives a doctor their own sign-in so they can update their status themselves.
exports.createLogin = async (req, res) => {
    const id = Number(req.params.id);
    const hospitalId = req.user.hospital_id;
    const { email } = req.body;

    try {
        const doctor = await getDoctorRow(id, hospitalId);
        if (!doctor) return res.status(404).json({ error: "Doctor not found" });

        const temporaryPassword = generateTemporaryPassword();
        const hashed = await bcrypt.hash(temporaryPassword, 10);

        if (doctor.login_user_id) {
            // Already has a login: reset its password (and reactivate it) instead.
            disconnectUser(doctor.login_user_id);
            await db.query(
                'UPDATE users SET password_hash = ?, must_change_password = TRUE, is_active = TRUE WHERE id = ?',
                [hashed, doctor.login_user_id]
            );
        } else {
            await db.query(
                `INSERT INTO users (hospital_id, doctor_id, name, email, password_hash, must_change_password, role)
                 VALUES (?, ?, ?, ?, ?, TRUE, 'doctor')`,
                [hospitalId, id, doctor.doctor_name, email, hashed]
            );
        }

        const updated = await broadcastDoctor(id, hospitalId);
        await logActivity({
            hospitalId, user: req.user, action: doctor.login_user_id ? 'doctor.login_reset' : 'doctor.login_created',
            entityType: 'doctor', entityId: id,
            summary: doctor.login_user_id
                ? `Reset sign-in password for Dr. ${doctor.doctor_name}`
                : `Created sign-in for Dr. ${doctor.doctor_name} (${email})`
        });

        res.status(201).json({ message: "Doctor login ready", data: updated, temporary_password: temporaryPassword });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: "An account with this email already exists." });
        }
        console.error("Create Doctor Login Error:", err);
        res.status(500).json({ error: "Failed to create doctor login" });
    }
};

// ---------------- SHIFTS ---------------- //

exports.getShifts = async (req, res) => {
    const id = Number(req.params.id);

    try {
        const doctor = await getDoctorRow(id, req.user.hospital_id);
        if (!doctor) return res.status(404).json({ error: "Doctor not found" });
        if (req.user.role !== 'admin' && req.user.department !== doctor.department) {
            return res.status(403).json({ message: "You can't view this doctor's shifts." });
        }

        const [rows] = await db.query(
            `SELECT id, starts_at, ends_at FROM doctor_shifts
             WHERE doctor_id = ? AND ends_at > ? ORDER BY starts_at LIMIT 50`,
            [id, new Date()]
        );
        res.json(rows);
    } catch (err) {
        console.error("Fetch Shifts Error:", err);
        res.status(500).json({ error: "Failed to fetch shifts" });
    }
};

exports.addShift = async (req, res) => {
    const id = Number(req.params.id);
    const hospitalId = req.user.hospital_id;
    const { starts_at, ends_at } = req.body;

    try {
        const doctor = await getDoctorRow(id, hospitalId);
        if (!doctor) return res.status(404).json({ error: "Doctor not found" });
        if (!canManageShifts(req.user, doctor)) {
            return res.status(403).json({ message: "You can't schedule this doctor." });
        }
        if (ends_at <= new Date()) return res.status(400).json({ error: "This shift has already ended." });

        const [[overlap]] = await db.query(
            'SELECT id FROM doctor_shifts WHERE doctor_id = ? AND starts_at < ? AND ends_at > ? LIMIT 1',
            [id, ends_at, starts_at]
        );
        if (overlap) return res.status(400).json({ error: "This overlaps another shift for the same doctor." });

        const [result] = await db.query(
            'INSERT INTO doctor_shifts (doctor_id, starts_at, ends_at, created_by) VALUES (?, ?, ?, ?)',
            [id, starts_at, ends_at, req.user.id]
        );

        // A shift that has already started takes effect now rather than waiting for the scheduler.
        const now = new Date();
        if (starts_at <= now && doctor.status === 'off_duty') {
            await db.query("UPDATE doctors SET status = 'on_duty', status_updated_at = ? WHERE id = ?", [now, id]);
        }

        await broadcastDoctor(id, hospitalId);
        await logActivity({
            hospitalId, user: req.user, action: 'shift.added', entityType: 'shift', entityId: result.insertId,
            summary: `Scheduled Dr. ${doctor.doctor_name}: ${formatRange(starts_at, ends_at)}`
        });

        res.status(201).json({ id: result.insertId, starts_at, ends_at });
    } catch (err) {
        console.error("Add Shift Error:", err);
        res.status(500).json({ error: "Failed to add shift" });
    }
};

exports.deleteShift = async (req, res) => {
    const shiftId = Number(req.params.shiftId);
    const hospitalId = req.user.hospital_id;

    try {
        const [[shift]] = await db.query(
            `SELECT s.id, s.doctor_id, s.starts_at, s.ends_at FROM doctor_shifts s
             JOIN doctors doc ON doc.id = s.doctor_id
             WHERE s.id = ? AND doc.hospital_id = ?`,
            [shiftId, hospitalId]
        );
        if (!shift) return res.status(404).json({ error: "Shift not found" });

        const doctor = await getDoctorRow(shift.doctor_id, hospitalId);
        if (!canManageShifts(req.user, doctor)) {
            return res.status(403).json({ message: "You can't change this doctor's schedule." });
        }

        await db.query('DELETE FROM doctor_shifts WHERE id = ?', [shiftId]);

        await broadcastDoctor(shift.doctor_id, hospitalId);
        await logActivity({
            hospitalId, user: req.user, action: 'shift.removed', entityType: 'shift', entityId: shiftId,
            summary: `Removed shift for Dr. ${doctor.doctor_name}: ${formatRange(shift.starts_at, shift.ends_at)}`
        });

        res.json({ message: "Shift removed" });
    } catch (err) {
        console.error("Delete Shift Error:", err);
        res.status(500).json({ error: "Failed to remove shift" });
    }
};

// Activity summaries are plain text, so times are written in the hospital's time zone
// (the server itself may run in UTC on a host like Render).
function formatRange(start, end) {
    const timeZone = process.env.APP_TIMEZONE || 'Asia/Kolkata';
    const fmt = (d) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone });
    return `${fmt(start)} – ${fmt(end)}`;
}
