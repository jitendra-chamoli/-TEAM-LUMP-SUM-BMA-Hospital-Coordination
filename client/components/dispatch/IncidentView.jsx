import React, { useState, useEffect, useCallback } from 'react';
import { Hospital, Ambulance, Stethoscope, Phone, Clock, AlertTriangle, CheckCircle2, User, MapPin, RefreshCw, BedDouble } from 'lucide-react';
import { api, getErrorMessage } from '../../src/api';
import { showToast } from '../../src/toast';
import { useSocketEvent } from '../../src/useSocketEvent';
import {
  INCIDENT_STATUS, severityMeta, isActive, getMyHospitalId, useDispatchConfig, recommendHospitals, formatCountdown, formatEta
} from '../../src/dispatch';
import { Card, Badge, Button, Skeleton, cn } from '../../src/ui';
import Timeline from './Timeline';
import TrackingMap from './TrackingMap';
import CancelDialog from './CancelDialog';
import OptionsList from './OptionsList';

// Says how much to trust the ETA.
const ETA_SOURCE = { mapbox: 'live traffic', osrm: 'by road, no traffic data', estimate: 'rough estimate' };

const ATTEMPT_LABELS = {
  queued: { label: 'Not asked', tone: 'neutral' },
  pending: { label: 'Deciding', tone: 'amber' },
  accepted: { label: 'Accepted', tone: 'green' },
  diverted: { label: 'Diverted', tone: 'red' },
  expired: { label: 'No answer', tone: 'red' },
  cancelled: { label: 'Not needed', tone: 'neutral' }
};

const Row = ({ icon: Icon, iconClass, title, children }) => (
  <div className="flex gap-3">
    <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', iconClass)}><Icon size={15} /></div>
    <div className="min-w-0 flex-1">
      <p className="text-xs text-slate-500">{title}</p>
      {children}
    </div>
  </div>
);

const useCountdown = (expiresAt) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, (new Date(expiresAt) - now) / 1000) : null;
};

/**
 * Live view of one incident: status, patient, hospital, ambulance, timeline and the
 * actions this viewer is allowed to take. layout="page" uses two columns.
 */
const IncidentView = ({ incidentId, layout = 'page', onChanged }) => {
  const [incident, setIncident] = useState(null);
  const [error, setError] = useState('');
  const [ambulance, setAmbulance] = useState(null); // { pos, eta, leg, source }
  const [route, setRoute] = useState(null);         // the road the ambulance is on
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(null); // { loading, options, chosen }
  const config = useDispatchConfig();
  const myHospital = getMyHospitalId();

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/incidents/${incidentId}`);
      setIncident(res.data);
      setAmbulance(a => a || (res.data.ambulance_lat !== null ? { pos: [res.data.ambulance_lat, res.data.ambulance_lng] } : null));
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load this dispatch.'));
    }
  }, [incidentId]);

  useEffect(() => { load(); }, [load]);

  // The road route arrives with the page, then only when it changes.
  const [routeTick, setRouteTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api.get(`/api/incidents/${incidentId}/route`)
      .then(res => { if (!cancelled) setRoute(res.data); })
      .catch(() => { /* the map still works without it */ });
    return () => { cancelled = true; };
  }, [incidentId, routeTick]);
  useSocketEvent('ambulance_route', (data) => { if (data.incident_id === incidentId) setRoute(data); });

  useSocketEvent('incident_updated', (summary) => {
    if (summary.id !== incidentId) return;
    load();
    setRouteTick(t => t + 1); // a new leg or destination means a new road
    onChanged?.(summary);
  });
  useSocketEvent('ambulance_location_update', (data) => {
    if (data.incident_id === incidentId) setAmbulance({ pos: [data.lat, data.lng], eta: data.eta_seconds, leg: data.leg, source: data.eta_source });
  });

  // Every hospital on the list was asked at the same moment.
  const asked = incident?.attempts?.length || 0;
  const secondsLeft = useCountdown(incident?.status === 'requested' ? incident?.pending_request?.expires_at : null);

  if (error) return <Card className="p-6 text-sm text-red-600">{error}</Card>;
  if (!incident) return <div className="space-y-3"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;

  const isRequester = incident.requested_by_hospital_id === myHospital;
  const isReceiver = incident.hospital_id === myHospital && Boolean(incident.accepted_at);
  const active = isActive(incident.status);
  const canCancel = active && (isRequester || isReceiver);
  const canHandOver = isReceiver && ['accepted', 'picked_up', 'arrived'].includes(incident.status);
  const canClose = incident.status === 'handed_over';
  const status = INCIDENT_STATUS[incident.status];
  const sev = severityMeta(incident.severity);
  const complaint = config?.complaints.find(c => c.code === incident.complaint);

  const act = async (path, message) => {
    setBusy(true);
    try {
      await api.post(`/api/incidents/${incident.id}/${path}`);
      showToast(message, 'success');
      await load();
    } catch (err) {
      showToast(getErrorMessage(err, 'That action failed.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  // Unplaced: search again, skipping hospitals that were already asked.
  const searchAgain = async () => {
    setRetry({ loading: true });
    try {
      const asked = new Set((incident.attempts || []).map(a => a.hospital_id));
      const data = await recommendHospitals({
        location: { lat: incident.patient_lat, lng: incident.patient_lng },
        complaint: incident.complaint, severity: incident.severity, needsIcu: incident.needs_icu, config
      });
      const options = data.options.filter(o => !asked.has(o.id));
      setRetry({ options, chosen: options[0]?.id });
    } catch (err) {
      setRetry(null);
      showToast(getErrorMessage(err, 'Could not search for hospitals.'), 'error');
    }
  };

  const sendRetry = async () => {
    setBusy(true);
    try {
      const ordered = [retry.chosen, ...retry.options.map(o => o.id).filter(id => id !== retry.chosen)];
      await api.post(`/api/incidents/${incident.id}/candidates`, { hospital_ids: ordered });
      setRetry(null);
      await load();
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not send the request.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const banner = (() => {
    switch (incident.status) {
      case 'requested':
        return (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <Clock size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-900">
              <p className="font-medium">
                Waiting on {asked > 1 ? `${asked} hospitals` : incident.hospital_name}
                {secondsLeft !== null && <> · <span className="tabular">{formatCountdown(secondsLeft)}</span> left</>}
              </p>
              <p className="text-amber-800">
                {asked > 1
                  ? `All ${asked} were asked at the same time; the first to accept takes the patient. `
                  : ''}
                The ambulance is already on its way to the patient.
              </p>
            </div>
          </div>
        );
      case 'unplaced':
        return (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
              <div className="text-sm text-red-900">
                <p className="font-medium">No hospital accepted this patient</p>
                <p className="text-red-800">Every hospital on the list diverted or didn't answer in time. Hospitals that missed it can still accept; meanwhile, search again to ask others, or cancel.</p>
              </div>
            </div>
            {isRequester && !retry && <Button size="sm" className="self-start" onClick={searchAgain}><RefreshCw size={14} /> Search again</Button>}
          </div>
        );
      case 'handed_over':
        return (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <CheckCircle2 size={16} className="text-emerald-600" /> Patient handed over to {incident.hospital_name}{incident.receiving_doctor_name ? ` (${incident.receiving_doctor_name})` : ''}.
          </div>
        );
      default:
        return null;
    }
  })();

  const legLabel = ambulance?.leg === 'to_hospital' || incident.status === 'picked_up'
    ? 'Taking patient to hospital'
    : incident.picked_up_at && incident.status === 'requested' ? 'With patient, waiting for a hospital' : 'Heading to patient';

  const patientCard = (
    <Card className="p-4 flex flex-col gap-4">
      <Row icon={User} iconClass="bg-slate-100 text-slate-600" title="Patient">
        <p className="text-sm font-semibold text-slate-900">
          {incident.patient_name || 'Unnamed patient'}
          {(incident.patient_age || incident.patient_sex) && <span className="font-normal text-slate-500"> · {[incident.patient_age && `${incident.patient_age} y`, incident.patient_sex].filter(Boolean).join(', ')}</span>}
        </p>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <Badge tone="violet">{complaint?.label || incident.complaint_label}</Badge>
          {sev && <Badge tone={sev.tone} dot>{sev.label}</Badge>}
          {incident.needs_icu && <Badge tone="red">Needs ICU</Badge>}
        </div>
        {incident.notes && <p className="text-xs text-slate-600 mt-1.5">{incident.notes}</p>}
        {incident.caller_phone && <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 tabular select-all"><Phone size={11} /> Caller {incident.caller_phone}</p>}
      </Row>
      {incident.pickup_address && (
        <Row icon={MapPin} iconClass="bg-red-50 text-red-600" title="Pickup">
          <p className="text-sm text-slate-700 line-clamp-2">{incident.pickup_address}</p>
        </Row>
      )}
    </Card>
  );

  const journeyCard = (
    <Card className="p-4 flex flex-col gap-4">
      <Row icon={Hospital} iconClass="bg-brand-50 text-brand-600" title={incident.accepted_at ? 'Receiving hospital' : 'Asked hospital'}>
        <p className="text-sm font-semibold text-slate-900">{incident.hospital_name}</p>
        <p className="text-xs text-slate-500">{incident.distance_km} km from patient{incident.hospital_phone ? ` · ${incident.hospital_phone}` : ''}</p>
      </Row>
      <Row icon={Stethoscope} iconClass="bg-violet-50 text-violet-600" title="Receiving doctor">
        {incident.receiving_doctor_name ? (
          <>
            <p className="text-sm font-semibold text-slate-900">{incident.receiving_doctor_name}</p>
            {incident.receiving_doctor_phone && <p className="text-xs text-slate-500 tabular select-all">{incident.receiving_doctor_phone}</p>}
          </>
        ) : <p className="text-sm text-slate-500">{incident.accepted_at ? 'No doctor was on duty when accepted' : 'Assigned when the hospital accepts'}</p>}
      </Row>
      <Row icon={Ambulance} iconClass="bg-emerald-50 text-emerald-600" title="Ambulance">
        {incident.ambulance_name ? (
          <>
            <p className="text-sm font-semibold text-slate-900">
              {incident.ambulance_vehicle ? `${incident.ambulance_vehicle} · ` : ''}{incident.ambulance_name}
            </p>
            <p className="text-xs text-slate-500 tabular select-all">
              {incident.ambulance_contact}{incident.ambulance_source === 'gps' ? ' · live GPS' : incident.ambulance_source === 'demo' ? ' · demo fleet' : ''}
            </p>
            {active && incident.status !== 'arrived' && (
              <p className="text-xs text-slate-600 mt-1">{legLabel}{ambulance?.eta ? ` · ${formatEta(ambulance.eta)}` : ''}
                {ambulance?.eta && ETA_SOURCE[ambulance.source] && <span className="text-slate-400"> · {ETA_SOURCE[ambulance.source]}</span>}</p>
            )}
          </>
        ) : incident.ambulance_search === 'searching' ? (
          <p className="text-sm text-slate-700 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" /> Asking the nearest drivers to accept…
          </p>
        ) : <p className="text-sm text-red-700">{incident.ambulance_search === 'failed' ? 'No driver accepted. Arrange transport or call 108.' : 'No ambulance was free'}</p>}
      </Row>
      {incident.bed_holds?.length > 0 && (
        <Row icon={BedDouble} iconClass="bg-sky-50 text-sky-600" title="Beds held">
          <p className="text-sm text-slate-700">
            {incident.bed_holds.map(h => `${h.department} ${h.resource_name}`).join(', ')}
            <span className="text-xs text-slate-500"> · {incident.bed_holds[0].status === 'held' ? 'reserved' : incident.bed_holds[0].status === 'used' ? 'in use' : 'released'}</span>
          </p>
        </Row>
      )}
    </Card>
  );

  const attempts = incident.attempts?.length > 0 && (
    <Card className="p-4">
      <p className="text-xs font-medium text-slate-500 mb-2">
        Hospitals asked{asked > 1 && <span className="font-normal"> · all at once, best match first</span>}
      </p>
      <ul className="flex flex-col gap-2">
        {incident.attempts.map(a => {
          const meta = ATTEMPT_LABELS[a.status];
          return (
            <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="text-slate-900">{a.rank_order}. {a.hospital_name}</p>
                {a.reason && <p className="text-xs text-slate-500">{a.reason}{a.responded_by_name ? ` · ${a.responded_by_name}` : ''}</p>}
              </div>
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </li>
          );
        })}
      </ul>
    </Card>
  );

  const actions = (canCancel || canHandOver || canClose) && (
    <div className="flex flex-wrap gap-2 justify-end">
      {canCancel && <Button variant="secondary" onClick={() => setCancelOpen(true)} disabled={busy}>Cancel dispatch</Button>}
      {canHandOver && <Button onClick={() => act('handover', 'Hand-over recorded.')} disabled={busy}><CheckCircle2 size={15} /> Patient handed over</Button>}
      {canClose && <Button variant="secondary" onClick={() => act('close', 'Incident closed.')} disabled={busy}>Close incident</Button>}
    </div>
  );

  const retryPanel = retry && (
    <Card className="p-4 flex flex-col gap-3">
      <p className="text-sm font-semibold text-slate-900">Other hospitals</p>
      {retry.loading ? <Skeleton className="h-24" /> : retry.options.length === 0 ? (
        <p className="text-sm text-slate-500">No other hospitals with free beds nearby. Cancel, or update capacity and try again.</p>
      ) : (
        <>
          <OptionsList options={retry.options} value={retry.chosen} onChange={(id) => setRetry({ ...retry, chosen: id })} specialistLabel={complaint?.departments?.[0]} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRetry(null)}>Back</Button>
            <Button onClick={sendRetry} disabled={busy}>Ask {retry.options.find(o => o.id === retry.chosen)?.name}</Button>
          </div>
        </>
      )}
    </Card>
  );

  const map = (
    <TrackingMap
      patient={[incident.patient_lat, incident.patient_lng]}
      hospital={incident.hospital_lat !== null ? [incident.hospital_lat, incident.hospital_lng] : null}
      ambulance={active ? ambulance?.pos : null}
      hospitalName={incident.hospital_name}
      ambulanceName={incident.ambulance_name}
      route={active && route?.geometry ? route.geometry : null}
      ahead={active && route?.ahead?.geometry ? route.ahead.geometry : null}
      className={layout === 'page' ? 'h-72' : 'h-56'}
    />
  );

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={status.tone} dot>{status.label}</Badge>
      <span className="text-xs text-slate-500">
        {incident.direction === 'incoming' ? `From ${incident.requested_by_hospital_name}` : `Requested by ${incident.requested_by_name || 'your team'}`}
      </span>
    </div>
  );

  return (
    <>
      {layout === 'page' ? (
        <div className="flex flex-col gap-4">
          {header}
          {banner}
          {retryPanel}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
            <div className="lg:col-span-3 flex flex-col gap-4">
              {map}
              {journeyCard}
            </div>
            <div className="lg:col-span-2 flex flex-col gap-4">
              {patientCard}
              <Card className="p-4"><Timeline incident={incident} /></Card>
              {attempts}
            </div>
          </div>
          {actions}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {header}
          {banner}
          {retryPanel}
          {patientCard}
          {journeyCard}
          <Card className="p-4"><Timeline incident={incident} compact /></Card>
          {attempts}
          {active && map}
          {actions}
        </div>
      )}
      <CancelDialog incident={incident} open={cancelOpen} onOpenChange={setCancelOpen} onCancelled={load} />
    </>
  );
};

export default IncidentView;
