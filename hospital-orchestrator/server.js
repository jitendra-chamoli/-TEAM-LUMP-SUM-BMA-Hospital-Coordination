const express = require('express');
const axios = require('axios');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const db = require('./config/db');

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000' }));
app.use(express.json()); // Essential for parsing POST bodies

// Local Python AI service (hospital scoring + ambulance assignment)
const AI_IP = process.env.AI_IP || "http://127.0.0.1:8000";

// Departments whose on-duty doctors can always receive an emergency patient
const EMERGENCY_DEPARTMENTS = ['Emergency', 'Trauma'];

// Search outward from the patient until hospitals with free beds are found.
const SEARCH_RADII_KM = [25, 50, 100, 200];
const MAX_CANDIDATES = 30;
const OPTIONS_RETURNED = 3;

// Ambulances that can be sent: hospital ambulances with a driver on shift and a recent GPS
// fix, plus the demo fleet unless USE_DEMO_AMBULANCES=false. Mirrors server/services/fleet.js.
const GPS_STALE_MINUTES = Number(process.env.GPS_STALE_MINUTES) || 10;
const USE_DEMO_AMBULANCES = process.env.USE_DEMO_AMBULANCES !== 'false';
const dispatchableAmbulances = () => ({
    sql: `status = 'available' AND is_active AND latitude IS NOT NULL
          AND (${USE_DEMO_AMBULANCES ? "location_source = 'demo' OR " : ''}(location_source = 'gps' AND current_driver_id IS NOT NULL AND location_updated_at >= ?))`,
    params: [new Date(Date.now() - GPS_STALE_MINUTES * 60 * 1000)]
});

// mysql2 renders an empty array as `IN ()`, which is invalid SQL.
const inList = (values) => (values && values.length ? values : ['']);

// Only signed-in hospital admins/staff can dispatch.
const requireDispatcher = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Sign in to dispatch an ambulance." });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({ error: "Your session has expired. Sign in again." });
    }
    // 'service' is the main server ranking hospitals for a public (citizen) request.
    if (!['admin', 'staff', 'service'].includes(req.user.role)) {
        return res.status(403).json({ error: "Only hospital admins and staff can dispatch ambulances." });
    }
    next();
};

// Hospitals within `radiusKm` of the patient with live capacity and on-duty doctors.
const findHospitals = (lat, lng, radiusKm, specialistDepartments) => db.query(`
    SELECT
        h.id, h.name AS hospital_name, h.address, h.city, h.phone, h.latitude, h.longitude, h.type, h.is_trauma_centre,
        (SELECT GROUP_CONCAT(s.scheme) FROM hospital_schemes s WHERE s.hospital_id = h.id) AS schemes,
        ST_Distance_Sphere(POINT(h.longitude, h.latitude), POINT(?, ?)) / 1000 AS straight_km,
        COALESCE(SUM(CASE WHEN rt.name = 'Beds' THEN r.current_count END), 0) AS beds_available,
        COALESCE(SUM(CASE WHEN rt.name = 'ICU' THEN r.current_count END), 0)  AS icu_available,
        (SELECT COUNT(*) FROM doctors doc JOIN departments dep ON dep.id = doc.department_id
         WHERE doc.hospital_id = h.id AND doc.status IN ('on_duty', 'on_call') AND dep.name IN (?)) AS emergency_doctors,
        (SELECT COUNT(*) FROM doctors doc JOIN departments dep ON dep.id = doc.department_id
         WHERE doc.hospital_id = h.id AND doc.status IN ('on_duty', 'on_call') AND dep.name IN (?)) AS specialist_doctors
    FROM hospitals h
    LEFT JOIN hospital_resources r ON r.hospital_id = h.id
    LEFT JOIN resource_types rt    ON rt.id = r.resource_type_id
    GROUP BY h.id
    HAVING straight_km <= ?
    ORDER BY straight_km
    LIMIT ?`, [lng, lat, EMERGENCY_DEPARTMENTS, inList(specialistDepartments), radiusKm, MAX_CANDIDATES]);

// Best doctor to receive the patient at a hospital: specialist first, then Emergency/Trauma.
const receivingDoctor = async (hospitalId, specialistDepartments) => {
    const [[doc]] = await db.query(`
        SELECT doc.id, doc.name, doc.phone, doc.status, dep.name AS department
        FROM doctors doc JOIN departments dep ON dep.id = doc.department_id
        WHERE doc.hospital_id = ? AND doc.status IN ('on_duty', 'on_call') AND (dep.name IN (?) OR dep.name IN (?))
        ORDER BY dep.name IN (?) DESC, doc.status = 'on_duty' DESC, dep.name = 'Emergency' DESC
        LIMIT 1`, [hospitalId, inList(specialistDepartments), EMERGENCY_DEPARTMENTS, inList(specialistDepartments)]);
    return doc || null;
};

// Published arrival costs for a set of hospitals, keyed by hospital id.
const tariffsFor = async (hospitalIds) => {
    if (!hospitalIds.length) return {};
    const [rows] = await db.query(
        'SELECT hospital_id, item, min_price, max_price FROM hospital_tariffs WHERE hospital_id IN (?)', [hospitalIds]);
    return rows.reduce((acc, r) => {
        (acc[r.hospital_id] = acc[r.hospital_id] || []).push({ item: r.item, min_price: r.min_price, max_price: r.max_price });
        return acc;
    }, {});
};

/**
 * POST /api/recommend
 * body: { patient_lat, patient_lng, severity, needs_icu, complaint, specialist_departments: [] }
 * Returns the top hospitals (ranked, with the facts behind each score) and the
 * nearest free ambulance. Nothing is reserved here — the client creates the
 * incident on the main server once the dispatcher has chosen.
 */
app.post('/api/recommend', requireDispatcher, async (req, res) => {
    const lat = parseFloat(req.body.patient_lat);
    const lng = parseFloat(req.body.patient_lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: "Pick the patient's location first." });
    }
    const severity = ['critical', 'serious', 'stable'].includes(req.body.severity) ? req.body.severity : 'serious';
    const needsIcu = Boolean(req.body.needs_icu);
    const specialists = Array.isArray(req.body.specialist_departments) ? req.body.specialist_departments.slice(0, 5) : [];
    // Payer preferences: only ever sent for non-critical cases, and they nudge the
    // ranking rather than filtering anything out.
    const preferSchemes = Array.isArray(req.body.prefer_schemes) ? req.body.prefer_schemes.slice(0, 5) : [];
    const preferTypes = Array.isArray(req.body.prefer_types) ? req.body.prefer_types.slice(0, 3) : [];

    try {
        // 1. Widen the search until some hospital nearby has a free bed.
        let hospitals = [];
        let radiusKm = SEARCH_RADII_KM[0];
        for (radiusKm of SEARCH_RADII_KM) {
            [hospitals] = await findHospitals(lat, lng, radiusKm, specialists);
            if (hospitals.some(h => Number(h.beds_available) > 0)) break;
        }
        if (hospitals.length === 0) {
            return res.status(404).json({ error: `No registered hospitals within ${radiusKm} km of the patient.` });
        }

        // 2. Nearest free ambulances (rough planar order; the AI service does the exact distance)
        const fleet = dispatchableAmbulances();
        const [ambulances] = await db.query(`
            SELECT id, driver_name, contact, latitude, longitude, vehicle_number, type, location_source FROM ambulances
            WHERE ${fleet.sql}
            ORDER BY POW(latitude - ?, 2) + POW((longitude - ?) * COS(RADIANS(?)), 2)
            LIMIT 20`, [...fleet.params, lat, lng, lat]);

        // 3. Ask the AI service to rank them.
        const aiResponse = await axios.post(`${AI_IP}/predict`, {
            lat, lng, severity, needs_icu: needsIcu, top_n: OPTIONS_RETURNED,
            prefer_schemes: preferSchemes,
            prefer_types: preferTypes,
            hospitals: hospitals.map(h => ({
                id: h.id,
                hospital_name: h.hospital_name,
                address: h.address,
                city: h.city,
                phone: h.phone,
                latitude: parseFloat(h.latitude),
                longitude: parseFloat(h.longitude),
                beds_available: Number(h.beds_available),
                icu_available: Number(h.icu_available),
                has_icu: Number(h.icu_available) > 0,
                emergency_doctors: Number(h.emergency_doctors),
                specialist_doctors: Number(h.specialist_doctors),
                type: h.type,
                is_trauma_centre: Boolean(h.is_trauma_centre),
                schemes: h.schemes ? h.schemes.split(',') : []
            })),
            ambulances: ambulances.map(a => ({
                id: a.id, name: a.driver_name, contact: a.contact,
                lat: parseFloat(a.latitude), lng: parseFloat(a.longitude),
                vehicle_number: a.vehicle_number, type: a.type, live: a.location_source === 'gps'
            }))
        }, { timeout: 10000 });

        const { options, ambulance } = aiResponse.data;

        // 4. Who would receive the patient at each option, and what arriving costs
        const tariffs = await tariffsFor(options.map(o => o.id));
        for (const option of options) {
            option.receiving_doctor = await receivingDoctor(option.id, specialists);
            option.tariffs = tariffs[option.id] || [];
        }

        res.json({ radius_km: radiusKm, searched: hospitals.length, options, ambulance });
    } catch (err) {
        // Say which step failed, so a database problem isn't reported as "AI server down".
        if (err.sqlMessage) {
            console.error("Database error:", err.code, err.sqlMessage);
            return res.status(500).json({ error: "Could not read hospitals from the database. Make sure the main server has started and applied its migrations, then restart the dispatch service." });
        }
        if (err.isAxiosError && !err.response) {
            console.error("AI service unreachable:", err.code, AI_IP);
            return res.status(503).json({ error: `The AI service at ${AI_IP} isn't responding. Start it with: cd ai-service && python app.py` });
        }
        if (err.isAxiosError && err.response) {
            console.error("AI service error:", err.response.status, err.response.data);
            return res.status(502).json({ error: err.response.data?.error || "The AI service couldn't rank hospitals." });
        }
        console.error("Recommendation error:", err);
        res.status(500).json({ error: "Could not find hospitals. Check the dispatch service logs." });
    }
});

app.get('/', (req, res) => res.send('Dispatch recommendation service is running'));

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => {
    console.log("-----------------------------------------");
    console.log(`🚀 Orchestrator Live on http://localhost:${PORT}`);
    console.log(`🧠 Linked to local AI: ${AI_IP}`);
    console.log("-----------------------------------------");
});
