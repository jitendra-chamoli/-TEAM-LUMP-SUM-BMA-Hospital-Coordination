// One-time copy from the pre-redesign tables (admins, staff_directory and the
// legacy_* tables renamed by 000) into the new schema. Old tables are left in
// place so nothing is lost; drop them by hand once you've checked the data.
// On a fresh database this does nothing.

const tableExists = async (conn, table) => {
    const [[row]] = await conn.query(
        'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
        [table]
    );
    return row.n > 0;
};

const columnsOf = async (conn, table) => {
    const [rows] = await conn.query(
        'SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?',
        [table]
    );
    return new Set(rows.map(r => r.name.toLowerCase()));
};

// Old free-text department names that differ from the seeded list.
const DEPARTMENT_ALIASES = { opthalmologist: 'Ophthalmology' };
const normalizeDept = (name) => {
    const trimmed = (name || '').trim();
    return DEPARTMENT_ALIASES[trimmed.toLowerCase()] || trimmed;
};

// Old rows only have a full Nominatim address ("Area, City, District, State, 560001, India").
// Take the part before the state, ignoring the country and postcode. Editable later.
const guessCity = (address) => {
    const parts = (address || '').split(',').map(p => p.trim())
        .filter(p => p && !/^\d[\d\s-]*$/.test(p) && p.toLowerCase() !== 'india');
    if (parts.length >= 2) return parts[parts.length - 2].slice(0, 80);
    return (parts[0] || 'Unknown').slice(0, 80);
};

async function departmentIds(conn, names) {
    const ids = new Map();
    for (const raw of names) {
        const name = normalizeDept(raw);
        if (!name) continue;
        await conn.query('INSERT IGNORE INTO departments (name) VALUES (?)', [name]);
        const [[row]] = await conn.query('SELECT id FROM departments WHERE name = ?', [name]);
        ids.set((raw || '').trim().toLowerCase(), row.id);
    }
    return ids;
}

exports.up = async (conn) => {
    if (!(await tableExists(conn, 'admins'))) return;

    const [[{ n: alreadyImported }]] = await conn.query('SELECT COUNT(*) AS n FROM hospitals');
    if (alreadyImported > 0) return;

    // All-or-nothing: if anything fails, the next server start retries from a clean slate.
    await conn.beginTransaction();
    try {
        await importAll(conn);
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    }
};

async function importAll(conn) {
    console.log('🗄️  Importing data from the old schema...');

    // Hospitals keep the old admins.id, so every old hospital_id still points at the same hospital.
    const [admins] = await conn.query('SELECT * FROM admins');
    for (const a of admins) {
        await conn.query(
            'INSERT INTO hospitals (id, name, address, city, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)',
            [a.id, a.hospital_name || a.name, a.address || '', guessCity(a.address), a.latitude || 0, a.longitude || 0]
        );
        await conn.query(
            'INSERT IGNORE INTO users (hospital_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
            [a.id, a.name, a.email, a.password, 'admin']
        );
    }

    const hospitalIds = new Set(admins.map(a => a.id));
    const legacyDoctors = await tableExists(conn, 'legacy_doctors');
    const legacyResources = await tableExists(conn, 'legacy_hospital_resources');
    const legacyIncidents = await tableExists(conn, 'legacy_incidents');
    const hasStaff = await tableExists(conn, 'staff_directory');

    // Collect every department name in use so each one gets an id.
    const deptNames = new Set();
    for (const t of ['staff_directory', 'legacy_doctors', 'legacy_hospital_resources']) {
        if (!(await tableExists(conn, t))) continue;
        const [rows] = await conn.query(`SELECT DISTINCT department FROM \`${t}\` WHERE department IS NOT NULL`);
        rows.forEach(r => deptNames.add(r.department));
    }
    const deptId = await departmentIds(conn, deptNames);
    const lookupDept = (name) => deptId.get((name || '').trim().toLowerCase()) || null;

    let skippedStaff = 0;
    if (hasStaff) {
        const [staff] = await conn.query('SELECT * FROM staff_directory');
        for (const s of staff) {
            if (!hospitalIds.has(s.hospital_id)) { skippedStaff++; continue; }
            const [r] = await conn.query(
                'INSERT IGNORE INTO users (hospital_id, department_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
                [s.hospital_id, lookupDept(s.department), s.name, s.email, s.password, 'staff']
            );
            if (r.affectedRows === 0) skippedStaff++;
        }
    }

    if (legacyDoctors) {
        const [doctors] = await conn.query('SELECT * FROM legacy_doctors');
        for (const d of doctors) {
            const dept = lookupDept(d.department);
            if (!hospitalIds.has(d.hospital_id) || !dept) continue;
            await conn.query(
                'INSERT INTO doctors (id, hospital_id, department_id, name, is_available) VALUES (?, ?, ?, ?, ?)',
                [d.id, d.hospital_id, dept, d.doctor_name || d.name, d.is_available ?? true]
            );
        }
    }

    if (legacyResources) {
        const [resources] = await conn.query('SELECT * FROM legacy_hospital_resources ORDER BY id');
        for (const r of resources) {
            const dept = lookupDept(r.department);
            if (!hospitalIds.has(r.hospital_id) || !dept || !r.resource_name) continue;
            await conn.query('INSERT IGNORE INTO resource_types (name) VALUES (?)', [r.resource_name.trim()]);
            const [[type]] = await conn.query('SELECT id FROM resource_types WHERE name = ?', [r.resource_name.trim()]);
            // Duplicate (hospital, department, resource) rows from the old table collapse into one.
            await conn.query(
                `INSERT INTO hospital_resources (id, hospital_id, department_id, resource_type_id, current_count, capacity)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE current_count = VALUES(current_count)`,
                [r.id, r.hospital_id, dept, type.id, Math.max(0, r.current_count || 0), r.total_capacity ?? null]
            );
        }
    }

    if (legacyIncidents) {
        const cols = await columnsOf(conn, 'legacy_incidents');
        const [incidents] = await conn.query('SELECT * FROM legacy_incidents');
        const validStatus = new Set(['dispatched', 'en_route', 'arrived', 'closed', 'cancelled']);
        for (const i of incidents) {
            if (!hospitalIds.has(i.hospital_id)) continue;
            const status = validStatus.has(i.status) ? i.status : 'dispatched';
            await conn.query(
                `INSERT INTO incidents (id, hospital_id, city, patient_lat, patient_lng, distance_km, status, dispatched_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [i.id, i.hospital_id, cols.has('city') ? i.city : null, i.patient_lat, i.patient_lng,
                 cols.has('distance_km') ? i.distance_km : null, status,
                 cols.has('created_at') && i.created_at ? i.created_at : new Date()]
            );
        }
    }

    const [cities] = await conn.query('SELECT id, name, city FROM hospitals ORDER BY id');
    console.log(`🗄️  Imported ${admins.length} hospital(s).${skippedStaff ? ` Skipped ${skippedStaff} staff row(s) (duplicate email or unknown hospital).` : ''}`);
    console.log('🗄️  City guessed from each address — fix any wrong ones with UPDATE hospitals SET city = ... :');
    cities.forEach(h => console.log(`     #${h.id} ${h.name} -> ${h.city}`));
}
