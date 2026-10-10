// The public (citizen) app: start a session, book an ambulance, track it.
//
// The guiding rule here is that nothing blocks dispatch. No sign-in, no code, and
// no required answers beyond a location: an ambulance sent with partial information
// beats an ambulance not sent.

const db = require('../config/db');
const dispatch = require('../services/dispatch');
const publicAuth = require('../services/publicAuth');
const { COMPLAINTS } = require('../config/complaints');
const { PAYER_OPTIONS, SCHEMES, TARIFF_ITEMS } = require('../config/payers');
const { logActivity } = require('../services/activity');

const MAX_PER_DAY = Number(process.env.PUBLIC_REQUESTS_PER_DAY) || 5;
const MAX_PER_IP_PER_DAY = Number(process.env.PUBLIC_REQUESTS_PER_IP_PER_DAY) || 15;
const EMERGENCY_NUMBER = process.env.EMERGENCY_NUMBER || '108';

const clientIp = (req) => (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').trim().slice(0, 45);

const handle = (fallback) => (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        if (err instanceof dispatch.DispatchError || err instanceof publicAuth.PublicAuthError) {
            return res.status(err.status).json({ error: err.message });
        }
        console.error(`${fallback}:`, err);
        res.status(500).json({ error: fallback });
    }
};

// Everything the app needs to render its screens, plus the emergency number.
exports.getConfig = (req, res) => {
    res.json({
        complaints: COMPLAINTS.map(c => ({ code: c.code, label: c.label })),
        payer_options: PAYER_OPTIONS,
        schemes: SCHEMES,
        tariff_items: TARIFF_ITEMS,
        emergency_number: EMERGENCY_NUMBER,
        emergency_label: 'Government ambulance helpline'
    });
};

// ---------------- Session ---------------- //

exports.startSession = handle('Could not start a session')(async (req, res) => {
    res.json(await publicAuth.startSession(req.body.device_id, clientIp(req)));
});

exports.getMe = handle('Could not load your details')(async (req, res) => {
    res.json({
        user: publicAuth.toProfile(req.publicUser),
        active_request: await dispatch.activePublicIncident(req.publicUser.id)
    });
});

exports.updateProfile = handle('Could not save your details')(async (req, res) => {
    res.json({ user: await publicAuth.updateProfile(req.publicUser.id, req.body) });
});

// ---------------- Booking ---------------- //

exports.createRequest = handle('Could not book an ambulance')(async (req, res) => {
    const user = req.publicUser;
    const ip = clientIp(req);

    // One live request at a time. Not an abuse control so much as a correctness one:
    // a second booking would reserve a second ambulance for the same patient.
    const active = await dispatch.activePublicIncident(user.id);
    if (active) return res.status(409).json({ error: 'You already have an ambulance on the way.', active_request: active });

    // The OTP used to be the abuse control. These take its place, and unlike the OTP
    // they cost an honest caller nothing.
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [[{ today }]] = await db.query(
        'SELECT COUNT(*) AS today FROM incidents WHERE public_user_id = ? AND dispatched_at > ?', [user.id, since]);
    if (today >= MAX_PER_DAY) {
        return res.status(429).json({ error: `You have booked ${today} ambulances today. Please call ${EMERGENCY_NUMBER}.` });
    }
    if (ip) {
        const [[{ fromIp }]] = await db.query(`
            SELECT COUNT(*) AS fromIp FROM incidents i
            JOIN public_users p ON p.id = i.public_user_id
            WHERE p.last_ip = ? AND i.dispatched_at > ?`, [ip, since]);
        if (fromIp >= MAX_PER_IP_PER_DAY) {
            return res.status(429).json({ error: `Too many bookings from this connection today. Please call ${EMERGENCY_NUMBER}.` });
        }
    }

    const phone = publicAuth.normalisePhone(req.body.caller_phone);
    const incident = await dispatch.createPublicIncident(user, { ...req.body, caller_phone: phone });

    await publicAuth.rememberPhone(user.id, phone);
    await db.query('UPDATE public_users SET request_count = request_count + 1, last_ip = ? WHERE id = ?', [ip || null, user.id]);

    // A number nobody has verified is worth flagging to whoever is watching.
    res.status(201).json({ ...incident, caller_phone_missing: !phone });
});

// Details the caller adds while the ambulance is already driving.
exports.updateRequest = handle('Could not update this request')(async (req, res) => {
    const body = { ...req.body };
    // Normalise here too: the crew dials whatever is stored on the incident.
    if (body.caller_phone !== undefined) body.caller_phone = publicAuth.normalisePhone(body.caller_phone);

    const updated = await dispatch.updatePublicIncident(req.publicUser, Number(req.params.id), body);
    if (body.caller_phone) await publicAuth.rememberPhone(req.publicUser.id, body.caller_phone);
    res.json(updated);
});

exports.getRequest = handle('Could not load this request')(async (req, res) => {
    res.json(await dispatch.publicIncidentFor(req.publicUser.id, Number(req.params.id)));
});

// The road the ambulance is taking. publicIncidentFor throws 404 unless it's yours.
exports.getRoute = handle('Could not load the route')(async (req, res) => {
    const id = Number(req.params.id);
    const view = await dispatch.publicIncidentFor(req.publicUser.id, id);
    const route = await dispatch.routeView(id);
    // Same rule as the rest of the citizen view: no hospital until one has accepted.
    // The road to it would give away which hospital is being asked.
    if (route && !view.accepted_at) {
        delete route.ahead;
        if (!route.geometry) return res.json(null);
    }
    res.json(route);
});

exports.cancelRequest = handle('Could not cancel this request')(async (req, res) => {
    res.json(await dispatch.cancelPublicIncident(req.publicUser, Number(req.params.id), req.body.reason));
});

exports.history = handle('Could not load your requests')(async (req, res) => {
    const [rows] = await db.query(`
        SELECT i.id, i.status, i.complaint, i.severity, i.dispatched_at, i.pickup_address,
               IF(i.accepted_at IS NULL, NULL, h.name) AS hospital_name
        FROM incidents i JOIN hospitals h ON h.id = i.hospital_id
        WHERE i.public_user_id = ? ORDER BY i.id DESC LIMIT 20`, [req.publicUser.id]);
    res.json(rows);
});

// ---------------- Hospital side: control room ---------------- //

exports.nearbyPublicRequests = handle('Could not load public requests')(async (req, res) => {
    res.json(await dispatch.publicRequestsNear(req.user.hospital_id, Number(req.query.radius_km) || 50));
});

exports.markPoliceInformed = handle('Could not record this')(async (req, res) => {
    const id = Number(req.params.id);
    const summary = await dispatch.getSummary(id);
    if (!summary || summary.hospital_id !== req.user.hospital_id) return res.status(404).json({ error: 'Incident not found' });

    await db.query('UPDATE incidents SET police_informed_at = COALESCE(police_informed_at, ?) WHERE id = ?', [new Date(), id]);
    await logActivity({
        hospitalId: req.user.hospital_id, user: req.user, action: 'incident.police_informed',
        entityType: 'incident', entityId: id, summary: `Police informed about incident #${id}`
    });
    res.json(await dispatch.getDetail(id));
});

exports.identifyPatient = handle('Could not save the patient details')(async (req, res) => {
    const id = Number(req.params.id);
    const summary = await dispatch.getSummary(id);
    if (!summary || summary.hospital_id !== req.user.hospital_id) return res.status(404).json({ error: 'Incident not found' });

    const { patient_name, patient_age, patient_sex } = req.body;
    await db.query(
        'UPDATE incidents SET patient_name = ?, patient_age = ?, patient_sex = ?, patient_identified = TRUE WHERE id = ?',
        [patient_name, patient_age ?? null, patient_sex || null, id]
    );
    await logActivity({
        hospitalId: req.user.hospital_id, user: req.user, action: 'incident.patient_identified',
        entityType: 'incident', entityId: id, summary: `Identified patient on incident #${id} as ${patient_name}`
    });
    res.json(await dispatch.getDetail(id));
});
