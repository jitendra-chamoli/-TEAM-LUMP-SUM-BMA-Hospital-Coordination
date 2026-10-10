const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { getDepartmentId } = require('../db/lookups');
const { generateTemporaryPassword } = require('../services/passwords');
const { logActivity } = require('../services/activity');
const { emitToHospitals, disconnectUser } = require('../realtime');

const STAFF_SELECT = `
    SELECT u.id, u.name, u.email, u.role, u.is_active, u.must_change_password, u.created_at,
           d.name AS department
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id`;

const getStaffRow = async (id, hospitalId) => {
    const [[row]] = await db.query(
        `${STAFF_SELECT} WHERE u.id = ? AND u.hospital_id = ? AND u.role = 'staff'`,
        [id, hospitalId]
    );
    return row || null;
};

exports.getStaff = async (req, res) => {
    try {
        const [rows] = await db.query(
            `${STAFF_SELECT} WHERE u.hospital_id = ? AND u.role = 'staff' ORDER BY u.is_active DESC, u.name`,
            [req.user.hospital_id]
        );
        res.json(rows);
    } catch (err) {
        console.error("Fetch Staff Error:", err.message);
        res.status(500).json({ error: "Failed to fetch staff" });
    }
};

// The server picks a temporary password and returns it once; the staff member
// must replace it at first login.
exports.addStaff = async (req, res) => {
    const { name, email, dept } = req.body;
    const hospitalId = req.user.hospital_id;

    try {
        const departmentId = await getDepartmentId(dept);
        if (!departmentId) return res.status(400).json({ error: `Unknown department "${dept}".` });

        const temporaryPassword = generateTemporaryPassword();
        const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

        const [result] = await db.query(
            `INSERT INTO users (hospital_id, department_id, name, email, password_hash, must_change_password, role)
             VALUES (?, ?, ?, ?, ?, TRUE, 'staff')`,
            [hospitalId, departmentId, name, email, hashedPassword]
        );

        const staff = await getStaffRow(result.insertId, hospitalId);
        emitToHospitals(hospitalId, 'staff_changed', staff);
        await logActivity({
            hospitalId, user: req.user, action: 'staff.added', entityType: 'staff', entityId: staff.id,
            summary: `Added staff account for ${name} (${dept})`
        });

        res.status(201).json({ message: "Staff account created", data: staff, temporary_password: temporaryPassword });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: "An account with this email already exists." });
        }
        console.error("Add Staff Error:", err.message);
        res.status(500).json({ error: "Failed to create staff account" });
    }
};

exports.updateStaff = async (req, res) => {
    const id = Number(req.params.id);
    const hospitalId = req.user.hospital_id;
    const { name, dept, is_active } = req.body;

    try {
        const before = await getStaffRow(id, hospitalId);
        if (!before) return res.status(404).json({ error: "Staff member not found" });

        const sets = [];
        const params = [];
        const changes = [];

        if (name !== undefined && name !== before.name) {
            sets.push('name = ?'); params.push(name);
            changes.push(`renamed to ${name}`);
        }
        if (dept !== undefined && dept !== before.department) {
            const departmentId = await getDepartmentId(dept);
            if (!departmentId) return res.status(400).json({ error: `Unknown department "${dept}".` });
            sets.push('department_id = ?'); params.push(departmentId);
            changes.push(`moved from ${before.department} to ${dept}`);
        }
        if (is_active !== undefined && is_active !== Boolean(before.is_active)) {
            sets.push('is_active = ?'); params.push(is_active);
            changes.push(is_active ? 'reactivated' : 'deactivated');
        }

        if (sets.length === 0) return res.json({ message: "No changes", data: before });

        await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);

        // A deactivated user loses their live connection right away (API calls already fail).
        if (is_active === false) disconnectUser(id);

        const staff = await getStaffRow(id, hospitalId);
        emitToHospitals(hospitalId, 'staff_changed', staff);
        await logActivity({
            hospitalId, user: req.user,
            action: is_active === false ? 'staff.deactivated' : is_active === true ? 'staff.reactivated' : 'staff.updated',
            entityType: 'staff', entityId: id,
            summary: `${before.name}: ${changes.join(', ')}`
        });

        res.json({ message: "Staff member updated", data: staff });
    } catch (err) {
        console.error("Update Staff Error:", err.message);
        res.status(500).json({ error: "Failed to update staff member" });
    }
};

exports.resetStaffPassword = async (req, res) => {
    const id = Number(req.params.id);
    const hospitalId = req.user.hospital_id;

    try {
        const staff = await getStaffRow(id, hospitalId);
        if (!staff) return res.status(404).json({ error: "Staff member not found" });

        const temporaryPassword = generateTemporaryPassword();
        const hashed = await bcrypt.hash(temporaryPassword, 10);
        await db.query('UPDATE users SET password_hash = ?, must_change_password = TRUE WHERE id = ?', [hashed, id]);

        // Existing sessions must sign in again with the new password.
        disconnectUser(id);

        const updated = await getStaffRow(id, hospitalId);
        emitToHospitals(hospitalId, 'staff_changed', updated);
        await logActivity({
            hospitalId, user: req.user, action: 'staff.password_reset', entityType: 'staff', entityId: id,
            summary: `Reset password for ${staff.name}`
        });

        res.json({ message: "Password reset", data: updated, temporary_password: temporaryPassword });
    } catch (err) {
        console.error("Reset Password Error:", err.message);
        res.status(500).json({ error: "Failed to reset password" });
    }
};
