const dispatch = require('../services/dispatch');
const { COMPLAINTS, DIVERT_REASONS } = require('../config/complaints');

// Adds `direction` from the viewer's point of view.
// A hospital that was only asked (not the destination, not the requester) is being
// offered the patient, so it reads as incoming too.
const forViewer = (incident, hospitalId) => incident && ({
    ...incident,
    direction: incident.hospital_id === hospitalId || incident.requested_by_hospital_id !== hospitalId ? 'incoming' : 'outgoing'
});

// Maps DispatchError to its HTTP status; anything else is a 500.
const handle = (fallback) => (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        if (err instanceof dispatch.DispatchError) return res.status(err.status).json({ error: err.message });
        console.error(`${fallback}:`, err);
        res.status(500).json({ error: fallback });
    }
};

exports.getConfig = (req, res) => {
    res.json({ complaints: COMPLAINTS, divert_reasons: DIVERT_REASONS, request_timeout_seconds: dispatch.REQUEST_TIMEOUT_SECONDS });
};

exports.createIncident = handle('Failed to create the dispatch')(async (req, res) => {
    const incident = await dispatch.createIncident(req.user, req.body);
    res.status(201).json(forViewer(incident, req.user.hospital_id));
});

exports.getIncidents = handle('Failed to fetch incidents')(async (req, res) => {
    const rows = await dispatch.listForHospital(req.user.hospital_id);
    res.json(rows.map(r => forViewer(r, req.user.hospital_id)));
});

exports.getIncident = handle('Failed to fetch the incident')(async (req, res) => {
    const id = Number(req.params.id);
    const incident = await dispatch.getDetail(id);
    if (!incident || !(await dispatch.canRead(id, incident, req.user.hospital_id))) return res.status(404).json({ error: 'Incident not found' });
    res.json(forViewer(incident, req.user.hospital_id));
});

exports.getRoute = handle('Failed to fetch the route')(async (req, res) => {
    const id = Number(req.params.id);
    const incident = await dispatch.getSummary(id);
    if (!incident || !(await dispatch.canRead(id, incident, req.user.hospital_id))) return res.status(404).json({ error: 'Incident not found' });
    res.json(await dispatch.routeView(id));
});

exports.getPendingRequests = handle('Failed to fetch requests')(async (req, res) => {
    res.json(await dispatch.pendingRequestsForHospital(req.user.hospital_id));
});

exports.accept = handle('Failed to accept the patient')(async (req, res) => {
    const { incident, warnings } = await dispatch.accept(req.user, Number(req.params.id));
    res.json({ incident: forViewer(incident, req.user.hospital_id), warnings });
});

exports.divert = handle('Failed to divert the request')(async (req, res) => {
    await dispatch.divert(req.user, Number(req.params.id), req.body.reason, req.body.note);
    res.json({ success: true });
});

exports.cancel = handle('Failed to cancel the incident')(async (req, res) => {
    const incident = await dispatch.cancel(req.user, Number(req.params.id), req.body.reason);
    res.json(forViewer(incident, req.user.hospital_id));
});

exports.handOver = handle('Failed to record the hand-over')(async (req, res) => {
    const incident = await dispatch.handOver(req.user, Number(req.params.id));
    res.json(forViewer(incident, req.user.hospital_id));
});

exports.close = handle('Failed to close the incident')(async (req, res) => {
    const incident = await dispatch.close(req.user, Number(req.params.id));
    res.json(forViewer(incident, req.user.hospital_id));
});

exports.addCandidates = handle('Failed to send the request')(async (req, res) => {
    const incident = await dispatch.addCandidates(req.user, Number(req.params.id), req.body.hospital_ids);
    res.json(forViewer(incident, req.user.hospital_id));
});
