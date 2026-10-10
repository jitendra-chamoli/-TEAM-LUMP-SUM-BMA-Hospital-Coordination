const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { logActivity } = require('../services/activity');

exports.register = async (req, res) => {
    const { name, email, password, hospital_name, address, city, latitude, longitude } = req.body;

    const conn = await db.getConnection();
    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        // Hospital and its first admin are created together, or not at all.
        await conn.beginTransaction();

        const [hospital] = await conn.query(
            'INSERT INTO hospitals (name, address, city, latitude, longitude) VALUES (?, ?, ?, ?, ?)',
            [hospital_name, address, city, latitude, longitude]
        );

        await conn.query(
            'INSERT INTO users (hospital_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
            [hospital.insertId, name, email, hashedPassword, 'admin']
        );

        await conn.commit();

        res.status(201).json({
            message: "Hospital registered successfully with verified GPS location",
            role: 'admin'
        });
    } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: "This email is already registered." });
        }
        console.error("Registration Error:", err.message);
        res.status(500).json({ error: "Failed to initialize hospital node." });
    } finally {
        conn.release();
    }
};

const sessionUser = (user) => ({
    id: user.id,
    name: user.name,
    role: user.role,
    hospital_id: user.hospital_id,
    hospital: user.hospital_name,
    address: user.hospital_address,
    department: user.department,
    doctor_id: user.doctor_id,
    ambulance_id: user.ambulance_id,
    must_change_password: Boolean(user.must_change_password)
});

exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const [[user]] = await db.query(`
            SELECT u.id, u.name, u.password_hash, u.role, u.hospital_id, u.doctor_id, u.ambulance_id,
                   u.is_active, u.must_change_password,
                   COALESCE(doc_dept.name, d.name) AS department,
                   h.name AS hospital_name, h.address AS hospital_address
            FROM users u
            JOIN hospitals h ON h.id = u.hospital_id
            LEFT JOIN departments d ON d.id = u.department_id
            LEFT JOIN doctors doc ON doc.id = u.doctor_id
            LEFT JOIN departments doc_dept ON doc_dept.id = doc.department_id
            WHERE u.email = ?`, [email]);

        if (!user) return res.status(404).json({ message: "Account not found." });

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(401).json({ message: "Invalid credentials." });

        if (!user.is_active) {
            return res.status(403).json({ message: "This account has been deactivated. Contact your hospital admin." });
        }

        // Only identity goes in the token; role/department are re-read on every request.
        const token = jwt.sign(
            { id: user.id, role: user.role, hospital_id: user.hospital_id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ token, user: sessionUser(user) });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: "Server sync failed during login." });
    }
};

exports.changePassword = async (req, res) => {
    const { current_password, new_password } = req.body;

    try {
        const [[row]] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
        const isMatch = await bcrypt.compare(current_password, row.password_hash);
        if (!isMatch) return res.status(400).json({ message: "Your current password is incorrect." });

        if (current_password === new_password) {
            return res.status(400).json({ message: "Choose a password different from your current one." });
        }

        const hashed = await bcrypt.hash(new_password, 10);
        await db.query(
            'UPDATE users SET password_hash = ?, must_change_password = FALSE WHERE id = ?',
            [hashed, req.user.id]
        );

        await logActivity({
            hospitalId: req.user.hospital_id, user: req.user,
            action: 'account.password_changed', entityType: 'account', entityId: req.user.id,
            summary: `${req.user.name} changed their password`
        });

        res.json({ message: "Password updated." });
    } catch (err) {
        console.error("Change Password Error:", err.message);
        res.status(500).json({ error: "Could not update password." });
    }
};
