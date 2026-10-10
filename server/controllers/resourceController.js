const db = require('../config/db');
const { getDepartmentId, getResourceTypeId } = require('../db/lookups');
const { logActivity } = require('../services/activity');
const { emitToHospitals } = require('../realtime');

// Returns the same shape the client has always used: id, resource_name, department, current_count.
const RESOURCE_SELECT = `
    SELECT r.id, rt.name AS resource_name, d.name AS department,
           r.current_count, r.capacity, r.hospital_id
    FROM hospital_resources r
    JOIN resource_types rt ON rt.id = r.resource_type_id
    JOIN departments d     ON d.id = r.department_id`;

exports.getResources = async (req, res) => {
    try {
        let query = `${RESOURCE_SELECT} WHERE r.hospital_id = ?`;
        const params = [req.user.hospital_id];

        if (req.user.role !== 'admin') {
            query += ' AND d.name = ?';
            params.push(req.user.department);
        }

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error("Resource Fetch Error:", err);
        res.status(500).json({ error: "Failed to fetch resources" });
    }
};

exports.updateResource = async (req, res) => {
    const { id, capacity } = req.body;
    const hospitalId = req.user.hospital_id;

    try {
        const [[before]] = await db.query(`${RESOURCE_SELECT} WHERE r.id = ? AND r.hospital_id = ?`, [id, hospitalId]);
        if (!before) return res.status(404).json({ error: "Resource not found" });

        // Staff can only change their own department's counts
        if (req.user.role === 'staff' && before.department !== req.user.department) {
            return res.status(403).json({ message: `Only ${before.department} staff can update this resource.` });
        }

        const newValue = req.body.newValue ?? before.current_count;
        const newCapacity = capacity !== undefined ? capacity : before.capacity;

        await db.query('UPDATE hospital_resources SET current_count = ?, capacity = ? WHERE id = ?', [newValue, newCapacity, id]);

        emitToHospitals(hospitalId, 'resource_updated', { id, newValue, capacity: newCapacity });

        if (newValue === 0 && before.current_count !== 0) {
            emitToHospitals(hospitalId, 'critical_resource_alert', {
                hospital_id: hospitalId,
                resource_name: before.resource_name,
                department: before.department
            });
        }

        if (before.current_count !== newValue) {
            await logActivity({
                hospitalId, user: req.user, action: 'resource.updated', entityType: 'resource', entityId: id,
                summary: `${before.department} ${before.resource_name}: ${before.current_count} → ${newValue}`
            });
        }
        if (newCapacity !== before.capacity) {
            await logActivity({
                hospitalId, user: req.user, action: 'resource.capacity_changed', entityType: 'resource', entityId: id,
                summary: `${before.department} ${before.resource_name} capacity: ${before.capacity ?? 'not set'} → ${newCapacity ?? 'not set'}`
            });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Resource Update Error:", err);
        res.status(500).json({ error: "DB Error" });
    }
};

exports.initResource = async (req, res) => {
    const { name, value, department, capacity } = req.body;
    const hospitalId = req.user.hospital_id;

    if (req.user.role === 'staff' && department !== req.user.department) {
        return res.status(403).json({ message: `Only ${department} staff can set up this resource.` });
    }

    try {
        const departmentId = await getDepartmentId(department);
        if (!departmentId) return res.status(400).json({ error: `Unknown department "${department}".` });
        const resourceTypeId = await getResourceTypeId(name);

        // The unique key (hospital, department, type) makes this a single atomic upsert,
        // so two simultaneous requests can't create duplicate rows.
        await db.query(
            `INSERT INTO hospital_resources (hospital_id, department_id, resource_type_id, current_count, capacity)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE current_count = VALUES(current_count), capacity = COALESCE(VALUES(capacity), capacity)`,
            [hospitalId, departmentId, resourceTypeId, value, capacity ?? null]
        );

        const [[row]] = await db.query(
            'SELECT id FROM hospital_resources WHERE hospital_id = ? AND department_id = ? AND resource_type_id = ?',
            [hospitalId, departmentId, resourceTypeId]
        );

        emitToHospitals(hospitalId, 'resource_created', { id: row.id });
        if (value === 0) {
            emitToHospitals(hospitalId, 'critical_resource_alert', { hospital_id: hospitalId, resource_name: name, department });
        }

        await logActivity({
            hospitalId, user: req.user, action: 'resource.updated', entityType: 'resource', entityId: row.id,
            summary: `${department} ${name}: set to ${value}`
        });

        res.status(201).json({ success: true, message: "Resource saved", id: row.id });
    } catch (err) {
        console.error("Init Resource Error:", err);
        res.status(500).json({ error: "Internal Server Error during initialization" });
    }
};
