// Drives the demo ambulances so the platform can be shown without real vehicles.
//
// This is just another client of the API, with no access to the database. Each tick
// it asks the server which ambulances have somewhere to be, moves each one a step
// along its road route, and reports the new position the way a vehicle tracker
// would. The server detects arrival, updates ETAs and moves the job along exactly as
// it does for a driver's phone. Stop this script and the demo ambulances stop moving.
//
//   TELEMETRY_TOKEN=... node simulate.js
//
// Only ambulances from the demo fleet are moved. Ones with a driver on shift are
// tracked by the driver's phone and left alone.

const SERVER_URL = (process.env.SERVER_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const TOKEN = process.env.TELEMETRY_TOKEN;
// Used only when the server gives no route speed (normally it does: the road route's
// own average, so a simulated trip takes as long as the ETA says, divided by SPEEDUP).
const SPEED_KMH = Number(process.env.SIM_SPEED_KMH) || 50;
// > 1 makes demos finish faster than real time.
const SPEEDUP = Number(process.env.SIM_SPEEDUP) || 4;
const TICK_MS = Number(process.env.SIM_TICK_MS) || 1000;
// How long a pretend driver takes to accept a job offer, like a real one reading it.
const ACCEPT_MIN_MS = Number(process.env.SIM_ACCEPT_MIN_MS ?? 3000);
const ACCEPT_MAX_MS = Number(process.env.SIM_ACCEPT_MAX_MS ?? 8000);

if (!TOKEN) {
    console.error('Set TELEMETRY_TOKEN to the same value the server uses.');
    process.exit(1);
}

const kmPerTick = (speedKmh) => ((speedKmh || SPEED_KMH) * SPEEDUP / 3600) * (TICK_MS / 1000);

const haversineKm = (a, b) => {
    const R = 6371, rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

async function api(method, path, body) {
    const res = await fetch(`${SERVER_URL}/api/telemetry${path}`, {
        method,
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 404) throw new Error('Telemetry is switched off on the server (set TELEMETRY_TOKEN there too).');
    if (res.status === 401) throw new Error('The server rejected the telemetry token.');
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
    return res.json();
}

const km = (a, b) => haversineKm({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] });

// Where the ambulance is along the road: the segment it's on, and the point on it.
// A route through a one-way loop can pass the same spot twice; `fromIndex` (where
// it got to last tick) keeps it moving forward instead of snapping back a lap.
function nearestOnRoute(route, pos, fromIndex = 0) {
    const kx = 111.32 * Math.cos((pos[0] * Math.PI) / 180), ky = 110.57;
    const found = [];
    for (let i = 0; i < route.length - 1; i++) {
        const ax = (route[i][1] - pos[1]) * kx, ay = (route[i][0] - pos[0]) * ky;
        const dx = (route[i + 1][1] - route[i][1]) * kx, dy = (route[i + 1][0] - route[i][0]) * ky;
        const len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
        found.push({ d: Math.hypot(ax + t * dx, ay + t * dy), i,
            point: [route[i][0] + t * (route[i + 1][0] - route[i][0]), route[i][1] + t * (route[i + 1][1] - route[i][1])] });
    }
    const nearest = found.reduce((a, b) => (b.d < a.d ? b : a));
    return found.find(c => c.i >= fromIndex && c.d <= nearest.d + 0.02) || nearest;
}

// How far along its current route each trip got: "incident:leg" -> segment index.
const progress = new Map();

// Drive one tick's worth of distance along the road.
function step(job) {
    const route = job.route?.length > 1 ? job.route : [[job.from.lat, job.from.lng], [job.to.lat, job.to.lng]];
    const key = `${job.incident_id}:${job.leg}:${route.length}`;
    const { i, point } = nearestOnRoute(route, [job.from.lat, job.from.lng], progress.get(key) || 0);
    progress.set(key, i);
    let budget = kmPerTick(job.speed_kmh);
    let pos = point;
    for (let k = i + 1; k < route.length; k++) {
        const leg = km(pos, route[k]);
        if (leg >= budget) {
            const f = budget / leg;
            pos = [pos[0] + (route[k][0] - pos[0]) * f, pos[1] + (route[k][1] - pos[1]) * f];
            return { ambulance_id: job.ambulance_id, lat: pos[0], lng: pos[1] };
        }
        budget -= leg;
        pos = route[k];
    }
    return { ambulance_id: job.ambulance_id, lat: pos[0], lng: pos[1] }; // end of the road: arrived
}

// Demo ambulances have no driver, so the simulator answers their job offers too:
// each one is accepted after a few seconds, the way a driver would. When several
// demo ambulances are offered the same job, the server decides who gets it.
const answering = new Set();
async function answerOffers() {
    const offers = await api('GET', '/offers');
    for (const o of offers) {
        if (answering.has(o.offer_id)) continue;
        answering.add(o.offer_id);
        const delay = ACCEPT_MIN_MS + Math.random() * Math.max(0, ACCEPT_MAX_MS - ACCEPT_MIN_MS);
        setTimeout(async () => {
            try {
                await api('POST', `/offers/${o.offer_id}/accept`);
                console.log(`Ambulance ${o.ambulance_id} accepted job #${o.incident_id} (${o.distance_km} km away)`);
            } catch { /* taken by a nearer ambulance, expired or cancelled: fine */ }
            setTimeout(() => answering.delete(o.offer_id), 60000);
        }, delay);
    }
}

let lastError = null;
let lastCount = -1;

async function tick() {
    try {
        await answerOffers();
        const jobs = (await api('GET', '/jobs')).filter(j => j.source === 'demo');
        // Forget trips that have finished.
        const live = new Set(jobs.map(j => `${j.incident_id}:${j.leg}:`));
        for (const key of progress.keys()) if (![...live].some(p => key.startsWith(p))) progress.delete(key);
        if (jobs.length) await api('POST', '/positions', { positions: jobs.map(step) });

        if (lastError) { console.log('Connected again.'); lastError = null; }
        if (jobs.length !== lastCount) {
            console.log(jobs.length ? `Moving ${jobs.length} ambulance(s)` : 'No ambulances on the move');
            lastCount = jobs.length;
        }
    } catch (err) {
        // Say it once, not every second, while the server is down.
        const msg = err.cause?.code === 'ECONNREFUSED' ? `Can't reach ${SERVER_URL}, retrying...` : err.message;
        if (msg !== lastError) console.error(msg);
        lastError = msg;
    } finally {
        setTimeout(tick, TICK_MS);
    }
}

console.log(`Simulating demo ambulances along road routes, x${SPEEDUP} real time, against ${SERVER_URL}`);
tick();
