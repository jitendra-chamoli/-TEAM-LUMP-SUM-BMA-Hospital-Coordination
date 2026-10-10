import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import {
  LogOut, Power, MapPin, Navigation, Phone, Hospital, Stethoscope, CheckCircle2, Satellite, SatelliteDish, AlertTriangle, Ambulance, Clock, X
} from 'lucide-react';
import { api, getErrorMessage } from '../../src/api';
import { showToast } from '../../src/toast';
import { useSocketEvent } from '../../src/useSocketEvent';
import { INCIDENT_STATUS, severityMeta, formatEta, formatCountdown } from '../../src/dispatch';
import { timeAgo } from '../../src/format';
import { Button, Badge, Skeleton, cn } from '../../src/ui';
import ToastContainer from '../ToastContainer';

const TrackingMap = lazy(() => import('../dispatch/TrackingMap'));

const secondsUntil = (iso) => Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));

const SEND_EVERY_MS = 5000;   // at most one location update every 5 s
const TYPE_LABELS = { basic: 'Basic', advanced: 'Advanced', icu: 'ICU' };

const mapsLink = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

// Short beeps + vibration when a job is offered.
const alertNewJob = () => {
  try { navigator.vibrate?.([400, 150, 400, 150, 400]); } catch { /* not supported */ }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.3, 0.6].forEach((t) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.frequency.value = 988;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t); osc.stop(ctx.currentTime + t + 0.25);
    });
  } catch { /* audio not available */ }
};

/**
 * Shares the phone's position while on shift: watches GPS, sends the latest fix every
 * few seconds, and keeps the screen awake (browsers pause GPS when the screen locks).
 */
function useLocationSharing(active) {
  const [gps, setGps] = useState({ state: 'waiting' }); // waiting | ok | denied | unavailable
  const latest = useRef(null);
  const lastSent = useRef(0);
  const supported = typeof navigator !== 'undefined' && Boolean(navigator.geolocation);

  useEffect(() => {
    if (!active || !supported) return;
    const send = async (pos) => {
      lastSent.current = Date.now();
      try {
        await api.post('/api/driver/location', { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGps({ state: 'ok', accuracy: pos.coords.accuracy, sentAt: new Date() });
      } catch {
        setGps(g => ({ ...g, error: true }));
      }
    };
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        latest.current = pos;
        if (Date.now() - lastSent.current >= SEND_EVERY_MS) send(pos);
      },
      (err) => setGps({ state: err.code === 1 ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    // Phones may stop reporting while stationary; resend the last fix so we don't look stale.
    const keepAlive = setInterval(() => latest.current && Date.now() - lastSent.current >= 30000 && send(latest.current), 10000);

    // Keep the screen on during the shift.
    let lock = null;
    const acquire = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch { /* not allowed */ } };
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    acquire();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(keepAlive);
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release?.().catch(() => {});
      setGps({ state: 'waiting' });
    };
  }, [active, supported]);

  if (!active) return { state: 'idle' };
  if (!supported) return { state: 'unavailable' };
  return gps;
}

const GpsStatus = ({ gps }) => {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 5000); return () => clearInterval(t); }, []);

  if (gps.state === 'denied') {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-800">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <p>Location is blocked. Allow location for this site in your browser settings, then reload. Without it you won't get jobs.</p>
      </div>
    );
  }
  if (gps.state === 'unavailable') {
    return <p className="text-sm text-amber-700 flex items-center gap-2"><SatelliteDish size={15} /> Can't get a GPS fix. Move to an open area.</p>;
  }
  if (gps.state === 'waiting') {
    return <p className="text-sm text-slate-500 flex items-center gap-2"><Satellite size={15} className="animate-pulse" /> Finding your location…</p>;
  }
  if (gps.state === 'ok') {
    return (
      <p className="text-sm text-emerald-700 flex items-center gap-2">
        <Satellite size={15} /> Sharing location · ±{Math.round(gps.accuracy)} m · {timeAgo(gps.sentAt)}
        {gps.error && <span className="text-amber-700"> · last send failed</span>}
      </p>
    );
  }
  return null;
};

/**
 * A job offered to this driver. Other nearby drivers have it too; the first to
 * accept gets it, so it has to be readable at a glance.
 */
const OfferCard = ({ offer, myPosition, onAccept, onDecline, busy }) => {
  const [left, setLeft] = useState(() => secondsUntil(offer.expires_at));
  useEffect(() => {
    const t = setInterval(() => setLeft(secondsUntil(offer.expires_at)), 500);
    return () => clearInterval(t);
  }, [offer.expires_at]);
  const sev = severityMeta(offer.severity);
  const fraction = Math.min(1, left / (offer.timeout_seconds || 20));

  return (
    <section className="rounded-2xl border-2 border-red-300 bg-white overflow-hidden shadow-lg">
      <div className="h-1.5 bg-slate-100">
        <div className={cn('h-full transition-[width] duration-500 ease-linear', fraction > 0.33 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${fraction * 100}%` }} />
      </div>
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-red-600">New emergency</p>
            <p className="text-3xl font-bold text-slate-900 tabular mt-0.5">{offer.distance_km.toFixed(1)} km <span className="text-base font-medium text-slate-500">away</span></p>
          </div>
          <span className={cn('inline-flex items-center gap-1 text-lg font-bold tabular', left <= 5 ? 'text-red-600' : 'text-slate-700')}>
            <Clock size={16} /> {formatCountdown(left)}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="violet">{offer.complaint_label}</Badge>
          {sev && <Badge tone={sev.tone} dot>{sev.label}</Badge>}
          {offer.needs_icu && <Badge tone="red">Needs ICU</Badge>}
        </div>
        <p className="text-sm text-slate-700 flex items-start gap-1.5">
          <MapPin size={15} className="mt-0.5 shrink-0 text-red-500" />
          {offer.pickup_address || `${Number(offer.patient_lat).toFixed(5)}, ${Number(offer.patient_lng).toFixed(5)}`}
        </p>
        <Suspense fallback={<Skeleton className="h-44 rounded-xl" />}>
          <TrackingMap
            patient={[Number(offer.patient_lat), Number(offer.patient_lng)]}
            hospital={offer.hospital_lat != null ? [Number(offer.hospital_lat), Number(offer.hospital_lng)] : null}
            ambulance={myPosition}
            hospitalName={offer.hospital_name}
            ambulanceName="You"
            className="h-44"
          />
        </Suspense>
        {offer.offered_count > 1 && (
          <p className="text-xs text-slate-500">{offer.offered_count} nearby ambulances have this job. The first to accept takes it.</p>
        )}
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button size="lg" className="h-14 text-lg bg-emerald-600 hover:bg-emerald-700" disabled={busy || left === 0} onClick={() => onAccept(offer)}>
            <CheckCircle2 size={20} /> Accept
          </Button>
          <Button size="lg" variant="secondary" className="h-14" disabled={busy} onClick={() => onDecline(offer)} aria-label="Decline">
            <X size={18} /> Decline
          </Button>
        </div>
      </div>
    </section>
  );
};

const JobCard = ({ job, eta, onStep, busy, route, myPosition }) => {
  const sev = severityMeta(job.severity);
  const status = INCIDENT_STATUS[job.status];
  const toHospital = Boolean(job.picked_up_at) && Boolean(job.accepted_at);
  const destination = toHospital ? [job.hospital_lat, job.hospital_lng] : [job.patient_lat, job.patient_lng];

  return (
    <section className="rounded-2xl border-2 border-red-200 bg-white overflow-hidden">
      <div className="bg-red-50 px-4 py-3 flex items-center justify-between gap-2">
        <p className="font-semibold text-red-900">Job #{job.id}</p>
        <Badge tone={status.tone} dot>{status.label}</Badge>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="violet">{job.complaint_label}</Badge>
          {sev && <Badge tone={sev.tone} dot>{sev.label}</Badge>}
          {job.needs_icu && <Badge tone="red">Needs ICU</Badge>}
        </div>

        <div>
          <p className="text-xs text-slate-500">{toHospital ? 'Take the patient to' : 'Pick up'}</p>
          {toHospital ? (
            <p className="text-lg font-semibold text-slate-900">{job.hospital_name}</p>
          ) : (
            <>
              <p className="text-lg font-semibold text-slate-900">{job.patient_name || 'Patient'}{job.patient_age ? `, ${job.patient_age} y` : ''}</p>
              <p className="text-sm text-slate-600 flex items-start gap-1.5 mt-0.5"><MapPin size={14} className="mt-0.5 shrink-0" />{job.pickup_address || `${job.patient_lat.toFixed(5)}, ${job.patient_lng.toFixed(5)}`}</p>
            </>
          )}
          {job.notes && !toHospital && <p className="text-sm text-slate-600 mt-1">{job.notes}</p>}
          {eta !== undefined && eta !== null && <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5"><Clock size={14} /> About {formatEta(eta)} away</p>}
        </div>

        {/* Where you are, the patient, and the hospital, with the road to each. */}
        <Suspense fallback={<Skeleton className="h-60 rounded-xl" />}>
          <TrackingMap
            patient={[Number(job.patient_lat), Number(job.patient_lng)]}
            hospital={job.hospital_lat != null ? [Number(job.hospital_lat), Number(job.hospital_lng)] : null}
            ambulance={myPosition}
            hospitalName={job.hospital_name}
            ambulanceName="You"
            route={route?.geometry || null}
            ahead={route?.ahead?.geometry || null}
            className="h-60"
          />
        </Suspense>

        <a href={mapsLink(destination[0], destination[1])} target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 h-12 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700">
          <Navigation size={18} /> Navigate {toHospital ? 'to hospital' : 'to patient'}
        </a>

        <div className="grid grid-cols-1 gap-2">
          {job.caller_phone && !toHospital && (
            <a href={`tel:${job.caller_phone.replace(/\s/g, '')}`} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:bg-slate-50">
              <Phone size={16} className="text-slate-500" />
              <span className="text-sm"><span className="text-slate-500">Caller</span> <span className="font-medium text-slate-900 tabular">{job.caller_phone}</span></span>
            </a>
          )}
          {job.accepted_at ? (
            <div className="rounded-xl border border-line px-3 py-2.5 flex flex-col gap-1.5">
              <p className="text-sm flex items-center gap-2"><Hospital size={16} className="text-brand-600" /><span className="font-medium text-slate-900">{job.hospital_name}</span></p>
              {job.receiving_doctor_name && (
                <p className="text-sm flex items-center gap-2 text-slate-700"><Stethoscope size={16} className="text-violet-600" />{job.receiving_doctor_name}
                  {job.receiving_doctor_phone && <a className="text-brand-700 tabular ml-auto" href={`tel:${job.receiving_doctor_phone.replace(/\s/g, '')}`}>{job.receiving_doctor_phone}</a>}
                </p>
              )}
              {job.hospital_phone && <a className="text-sm text-brand-700 tabular" href={`tel:${job.hospital_phone.replace(/\s/g, '')}`}>Hospital desk {job.hospital_phone}</a>}
            </div>
          ) : (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              {job.status === 'unplaced' ? 'No hospital has accepted yet. The dispatcher is finding one.' : `Waiting for ${job.hospital_name} to accept. Drive to the patient meanwhile.`}
            </p>
          )}
        </div>

        {!job.picked_up_at && (
          <Button size="lg" variant="dark" className="h-12 text-base" disabled={busy} onClick={() => onStep('picked-up')}>
            <CheckCircle2 size={18} /> Patient picked up
          </Button>
        )}
        {job.status === 'picked_up' && (
          <Button size="lg" variant="dark" className="h-12 text-base" disabled={busy} onClick={() => onStep('arrived')}>
            <CheckCircle2 size={18} /> Arrived at hospital
          </Button>
        )}
        {job.status === 'arrived' && <p className="text-sm text-center text-slate-600">Hand the patient over. The hospital will confirm and you'll be free for the next job.</p>}
        <p className="text-xs text-slate-400 text-center">Pick-up and arrival are also recorded automatically when your location reaches the patient or hospital.</p>
      </div>
    </section>
  );
};

/** The whole app for users with the driver role. */
const DriverApp = ({ user, onLogout }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [eta, setEta] = useState(null);
  const [route, setRoute] = useState(null);
  const [livePos, setLivePos] = useState(null);
  const seenOffers = useRef(new Set());

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/driver/me');
      setData(res.data);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load your shift.'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // A new offer alerts once, whether it arrived live or was waiting after a reload.
  const liveOffers = data?.offers;
  useEffect(() => {
    const fresh = (liveOffers || []).filter(o => !seenOffers.current.has(o.offer_id));
    fresh.forEach(o => seenOffers.current.add(o.offer_id));
    if (fresh.length) alertNewJob();
  }, [liveOffers]);
  const offers = liveOffers || [];

  useSocketEvent('ambulance_offer', (offer) => {
    setData(d => (d && !d.job && !d.offers?.some(o => o.offer_id === offer.offer_id) ? { ...d, offers: [...(d.offers || []), offer] } : d));
  });
  useSocketEvent('ambulance_offer_closed', ({ offer_id, incident_id, outcome }) => {
    setData(d => (d ? { ...d, offers: (d.offers || []).filter(o => o.offer_id !== offer_id) } : d));
    if (outcome === 'taken') showToast(`Another ambulance took job #${incident_id}.`, 'info');
    if (outcome === 'cancelled') showToast(`Job #${incident_id} was cancelled.`, 'info');
  });

  // The road for the current job: on start, whenever the job changes, and live.
  const jobId = data?.job?.id ?? null;
  const [routeTick, setRouteTick] = useState(0);
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    api.get(`/api/driver/jobs/${jobId}/route`)
      .then(res => { if (!cancelled) setRoute(res.data); })
      .catch(() => { /* the map works without it */ });
    return () => { cancelled = true; };
  }, [jobId, routeTick]);

  useSocketEvent('incident_updated', () => { load(); setRouteTick(t => t + 1); });
  useSocketEvent('fleet_updated', () => load());
  useSocketEvent('ambulance_route', (d) => { if (d.incident_id === jobId) setRoute(d); });
  useSocketEvent('ambulance_location_update', (d) => {
    if (d.incident_id !== jobId) return;
    setEta(d.eta_seconds);
    setLivePos([d.lat, d.lng]);
  });

  const gps = useLocationSharing(Boolean(data?.on_shift));

  const toggleShift = async () => {
    setBusy(true);
    try {
      const res = await api.post('/api/driver/shift', { on_shift: !data.on_shift });
      setData(res.data);
      showToast(res.data.on_shift ? 'Shift started. Keep this page open.' : 'Shift ended.', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not change your shift.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const respond = async (offer, action) => {
    setBusy(true);
    try {
      const res = await api.post(`/api/driver/offers/${offer.offer_id}/${action}`);
      setData(res.data);
      setEta(null); setLivePos(null); setRoute(null);
      if (action === 'accept') showToast('Job accepted. Head to the patient.', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, action === 'accept' ? 'Could not accept the job.' : 'Could not decline.'), 'error');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const step = async (path) => {
    setBusy(true);
    try {
      await api.post(`/api/driver/jobs/${data.job.id}/${path}`);
      await load();
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not update the job.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const ambulance = data?.ambulance;
  const myPosition = livePos || (ambulance?.latitude != null ? [Number(ambulance.latitude), Number(ambulance.longitude)] : null);
  const shiftLabel = !data?.on_shift ? 'Off shift' : data.job ? 'On a job' : 'Available';

  return (
    <div className="min-h-full bg-canvas">
      <ToastContainer />
      <header className="sticky top-0 z-40 bg-white border-b border-line">
        <div className="max-w-md mx-auto h-14 px-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-red-600 text-white flex items-center justify-center"><Ambulance size={16} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 truncate">{ambulance ? ambulance.vehicle_number : 'No ambulance'}</p>
            <p className="text-xs text-slate-500 truncate">{user.name}{ambulance ? ` · ${TYPE_LABELS[ambulance.type]}` : ''}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Sign out"><LogOut size={17} /></Button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 flex flex-col gap-4">
        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        {!data ? <><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></> : !ambulance || !ambulance.is_active ? (
          <div className="rounded-2xl bg-white border border-line p-6 text-center">
            <Ambulance size={28} className="mx-auto text-slate-300 mb-2" />
            <p className="font-medium text-slate-900">You're not assigned to an ambulance</p>
            <p className="text-sm text-slate-500 mt-1">Ask your hospital admin to assign you under Staff & roster → Ambulances.</p>
          </div>
        ) : (
          <>
            <section className="rounded-2xl bg-white border border-line p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">Status</p>
                  <p className="text-lg font-semibold text-slate-900">{shiftLabel}</p>
                </div>
                <span className={cn('h-3 w-3 rounded-full', !data.on_shift ? 'bg-slate-300' : data.job ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500')} />
              </div>
              {data.on_shift && <GpsStatus gps={gps} />}
              <Button size="lg" variant={data.on_shift ? 'secondary' : 'primary'} className="h-12 text-base" disabled={busy || (data.on_shift && Boolean(data.job))} onClick={toggleShift}>
                <Power size={18} /> {data.on_shift ? 'End shift' : 'Start shift'}
              </Button>
              {data.on_shift && data.job && <p className="text-xs text-slate-500 text-center">You can end your shift once this job is handed over.</p>}
              {!data.on_shift && <p className="text-xs text-slate-500 text-center">Starting a shift shares your location so dispatch can send you the nearest jobs.</p>}
            </section>

            {data.on_shift && !data.job && offers.map(o => (
              <OfferCard key={o.offer_id} offer={o} myPosition={myPosition} busy={busy}
                onAccept={(offer) => respond(offer, 'accept')} onDecline={(offer) => respond(offer, 'decline')} />
            ))}

            {data.on_shift && (data.job ? (
              <JobCard job={data.job} eta={eta} busy={busy} onStep={step} route={route} myPosition={myPosition} />
            ) : offers.length > 0 ? null : (
              <section className="rounded-2xl bg-white border border-dashed border-line p-6 text-center">
                <p className="font-medium text-slate-900">No job right now</p>
                <p className="text-sm text-slate-500 mt-1">Keep this page open with the screen on. When a job is offered you'll hear a sound and have a few seconds to accept it.</p>
              </section>
            ))}
          </>
        )}
      </main>
    </div>
  );
};

export default DriverApp;
