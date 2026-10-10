// The driver's phone app: shift on/off, live location, and the current job.
const db = require('../config/db');
const dispatch = require('../services/dispatch');
const { logActivity } = require('../services/activity');
const { emitToHospitals } = require('../realtime');
const { GPS_STALE_MINUTES } = require('../services/fleet');

const myAmbulance = async (user) => {
    if (!user.ambulance_id) return null;
    const [[a]] = await db.query(`
        SELECT a.id, a.vehicle_number, a.type, a.status, a.is_active, a.current_driver_id,
               a.latitude, a.longitude, a.location_updated_at, a.location_accuracy_m,
               cd.name AS current_driver_name
        FROM ambulances a LEFT JOIN users cd ON cd.id = a.current_driver_id
        WHERE a.id = ? AND a.hospital_id = ?`, [user.ambulance_id, user.hospital_id]);
    return a || null;
};

const handle = (fallback) => (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        if (err instanceof dispatch.DispatchError) return res.status(err.status).json({ error: err.message });
        console.error(`${fallback}:`, err);
        res.status(500).json({ error: fallback });
    }
};

const state = async (user) => {
    const ambulance = await myAmbulance(user);
    const onShift = Boolean(ambulance && ambulance.current_driver_id === user.id);
    const job = onShift ? await dispatch.activeJobForAmbulance(ambulance.id) : null;
    // Offers still counting down, so a reload doesn't lose one.
    const offers = onShift && !job ? await dispatch.pendingOffers({ driverId: user.id }) : [];
    return { driver: { id: user.id, name: user.name, phone: user.phone, hospital: user.hospital_name }, ambulance, on_shift: onShift, job, offers, gps_stale_minutes: GPS_STALE_MINUTES };
};

exports.getMe = handle('Could not load your shift')(async (req, res) => {
    res.json(await state(req.user));
});

exports.setShift = handle('Could not change your shift')(async (req, res) => {
    const { on_shift } = req.body;
    const user = req.user;
    const ambulance = await myAmbulance(user);
    if (!ambulance || !ambulance.is_active) return res.status(409).json({ error: 'You are not assigned to an active ambulance. Ask your hospital admin.' });

    if (on_shift) {
        if (ambulance.current_driver_id && ambulance.current_driver_id !== user.id) {
            return res.status(409).json({ error: `${ambulance.current_driver_name} is already on shift in ${ambulance.vehicle_number}.` });
        }
        // The driver's name and phone are shown to dispatchers and hospitals.
        await db.query(`
            UPDATE ambulances SET current_driver_id = ?, driver_name = ?, contact = ?, location_source = 'gps',
                   status = IF(status = 'offline', 'available', status)
            WHERE id = ?`, [user.id, user.name, user.phone || '', ambulance.id]);
    } else {
        if (ambulance.current_driver_id !== user.id) return res.json(await state(user));
        if (ambulance.status === 'dispatched') return res.status(409).json({ error: 'You are on a job. Finish it (or ask the hospital to hand over) before ending your shift.' });
        await db.query("UPDATE ambulances SET current_driver_id = NULL, status = 'offline' WHERE id = ?", [ambulance.id]);
    }

    emitToHospitals(user.hospital_id, 'fleet_updated', {});
    await logActivity({ hospitalId: user.hospital_id, user, action: on_shift ? 'fleet.shift_started' : 'fleet.shift_ended', entityType: 'fleet', entityId: ambulance.id,
        summary: `${user.name} ${on_shift ? 'started' : 'ended'} a shift in ${ambulance.vehicle_number}` });
    res.json(await state(user));
});

exports.updateLocation = handle('Could not save your location')(async (req, res) => {
    const { lat, lng, accuracy } = req.body;
    const user = req.user;
    const ambulance = await myAmbulance(user);
    if (!ambulance || ambulance.current_driver_id !== user.id) return res.status(409).json({ error: 'Start your shift to share your location.' });

    const now = new Date();
    await db.query(`
        UPDATE ambulances SET latitude = ?, longitude = ?, location_accuracy_m = ?, location_updated_at = ?, location_source = 'gps'
        WHERE id = ?`, [lat, lng, accuracy != null ? Math.min(65535, Math.round(accuracy)) : null, now, ambulance.id]);

    emitToHospitals(user.hospital_id, 'fleet_location', { ambulance_id: ambulance.id, lat, lng, accuracy, at: now.toISOString() });
    await dispatch.reportPosition(ambulance.id, lat, lng);
    res.json({ ok: true, at: now });
});

exports.acceptOffer = handle('Could not accept the job')(async (req, res) => {
    await dispatch.acceptOffer(Number(req.params.id), { driverId: req.user.id });
    res.json(await state(req.user));
});

exports.declineOffer = handle('Could not decline the job')(async (req, res) => {
    await dispatch.declineOffer(Number(req.params.id), req.user.id);
    res.json(await state(req.user));
});

// The road for the driver's current job, if it is theirs.
exports.jobRoute = handle('Could not load the route')(async (req, res) => {
    const id = Number(req.params.id);
    const summary = await dispatch.getSummary(id);
    if (!summary || !req.user.ambulance_id || summary.ambulance_id !== req.user.ambulance_id) return res.status(404).json({ error: 'Job not found' });
    res.json(await dispatch.routeView(id));
});

exports.markStep = (step) => handle('Could not update the job')(async (req, res) => {
    const summary = await dispatch.driverMarkStep(req.user, Number(req.params.id), step);
    res.json(summary);
});
