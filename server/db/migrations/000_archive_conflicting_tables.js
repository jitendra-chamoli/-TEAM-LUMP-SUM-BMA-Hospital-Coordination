// Databases created before the redesign already have tables named doctors,
// hospital_resources and incidents with the old columns. CREATE TABLE IF NOT
// EXISTS would silently keep those, so rename any old-shaped table to
// legacy_<name> first. 004_import_legacy_data.js copies their rows across.
// On a fresh database this does nothing.

// A column that only exists in the new version of each table.
const NEW_SHAPE_MARKER = {
    hospitals: 'city',
    departments: 'name',
    users: 'password_hash',
    doctors: 'department_id',
    resource_types: 'name',
    hospital_resources: 'resource_type_id',
    ambulances: 'driver_name',
    incidents: 'dispatched_at'
};

exports.up = async (conn) => {
    for (const [table, marker] of Object.entries(NEW_SHAPE_MARKER)) {
        const [[exists]] = await conn.query(
            'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
            [table]
        );
        if (!exists.n) continue;

        const [[hasMarker]] = await conn.query(
            'SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
            [table, marker]
        );
        if (hasMarker.n) continue;

        await conn.query(`RENAME TABLE \`${table}\` TO \`legacy_${table}\``);
        console.log(`🗄️  Renamed old table ${table} -> legacy_${table}`);
    }
};
