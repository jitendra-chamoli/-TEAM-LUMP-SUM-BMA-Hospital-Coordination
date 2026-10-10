import React, { useState, useEffect } from 'react';
import { Siren, Search, ChevronRight, Ambulance, Plus, AlertTriangle } from 'lucide-react';
import { RadioGroup as RRadio } from 'radix-ui';
import { api, getErrorMessage } from '../src/api';
import { showToast } from '../src/toast';
import {
  SEVERITIES, COMPLAINT_ICONS, INCIDENT_STATUS, isActive, useDispatchConfig, recommendHospitals
} from '../src/dispatch';
import { PageHeader, Card, CardHeader, Button, Field, Input, Switch, RadioCards, Segmented, Badge, EmptyState, Skeleton, cn } from '../src/ui';
import LocationPicker from './LocationPicker';
import OptionsList from './dispatch/OptionsList';
import IncidentView from './dispatch/IncidentView';

const ACTIVE_KEY = 'bma.activeDispatch';
const readActive = () => { try { return Number(localStorage.getItem(ACTIVE_KEY)) || null; } catch { return null; } };
const saveActive = (id) => { try { id ? localStorage.setItem(ACTIVE_KEY, String(id)) : localStorage.removeItem(ACTIVE_KEY); } catch { /* storage unavailable */ } };

// Typed coordinates are applied only once both are valid numbers.
const ManualCoordinates = ({ onApply }) => {
  const [coords, setCoords] = useState({ lat: '', lng: '' });
  const update = (key) => (e) => {
    const next = { ...coords, [key]: e.target.value };
    setCoords(next);
    const lat = parseFloat(next.lat), lng = parseFloat(next.lng);
    if (next.lat !== '' && next.lng !== '' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) onApply(lat, lng);
  };
  return (
    <div className="grid grid-cols-2 gap-3 mt-3 max-w-sm">
      <Field label="Latitude" htmlFor="dispatch-lat"><Input id="dispatch-lat" inputMode="decimal" placeholder="30.3165" value={coords.lat} onChange={update('lat')} /></Field>
      <Field label="Longitude" htmlFor="dispatch-lng"><Input id="dispatch-lng" inputMode="decimal" placeholder="78.0322" value={coords.lng} onChange={update('lng')} /></Field>
    </div>
  );
};

// Tiles for the chief complaint (single choice).
const ComplaintPicker = ({ complaints, value, onChange }) => (
  <RRadio.Root value={value} onValueChange={onChange} aria-label="What's wrong" className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
    {complaints.map(c => {
      const Icon = COMPLAINT_ICONS[c.code];
      return (
        <RRadio.Item key={c.code} value={c.code}
          className={cn(
            'flex flex-col items-start gap-1.5 rounded-lg border border-line bg-white p-2.5 text-left transition-colors hover:border-slate-300',
            'data-[state=checked]:border-brand-500 data-[state=checked]:bg-brand-50/50 data-[state=checked]:ring-2 data-[state=checked]:ring-brand-500/15',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40'
          )}>
          {Icon && <Icon size={16} className="text-slate-500" />}
          <span className="text-xs font-medium text-slate-800 leading-tight">{c.label}</span>
        </RRadio.Item>
      );
    })}
  </RRadio.Root>
);

const emptyPatient = { name: '', age: '', sex: '', phone: '', notes: '' };

const DispatchForm = ({ onCreated, onOpen }) => {
  const config = useDispatchConfig();
  const [patient, setPatient] = useState(emptyPatient);
  const [complaint, setComplaint] = useState('');
  const [severity, setSeverity] = useState('serious');
  const [needsIcu, setNeedsIcu] = useState(false);
  const [location, setLocation] = useState(null);
  const [results, setResults] = useState(null); // { options, ambulance, radius_km, chosen, key }
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [activeList, setActiveList] = useState([]);

  useEffect(() => {
    api.get('/api/incidents')
      .then(res => setActiveList(res.data.filter(i => i.direction === 'outgoing' && isActive(i.status))))
      .catch(() => {});
  }, []);

  // Results go stale when anything that affects ranking changes.
  const searchKey = JSON.stringify([location?.lat, location?.lng, complaint, severity, needsIcu]);
  const stale = results && results.key !== searchKey;
  const complaintMeta = config?.complaints.find(c => c.code === complaint);

  const search = async (e) => {
    e?.preventDefault();
    setError('');
    if (!complaint) return setError("Choose what's wrong with the patient.");
    if (!location) return setError("Set the patient's location on the map.");
    setSearching(true);
    try {
      const data = await recommendHospitals({ location, complaint, severity, needsIcu, config });
      setResults({ ...data, chosen: data.options[0]?.id, key: searchKey });
    } catch (err) {
      setResults(null);
      setError(getErrorMessage(err, 'Could not find hospitals. Check that the dispatch and AI services are running.'));
    } finally {
      setSearching(false);
    }
  };

  const send = async () => {
    setSending(true);
    try {
      const ordered = [results.chosen, ...results.options.map(o => o.id).filter(id => id !== results.chosen)];
      const res = await api.post('/api/incidents', {
        patient_lat: location.lat, patient_lng: location.lng,
        pickup_address: location.address, city: location.city,
        complaint, severity, needs_icu: needsIcu,
        patient_name: patient.name || undefined,
        patient_age: patient.age === '' ? undefined : Number(patient.age),
        patient_sex: patient.sex || undefined,
        caller_phone: patient.phone || undefined,
        notes: patient.notes || undefined,
        hospital_ids: ordered,
        ambulance_id: results.ambulance?.id
      });
      onCreated(res.data.id);
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not send the request.'), 'error');
    } finally {
      setSending(false);
    }
  };

  const setP = (key) => (e) => setPatient({ ...patient, [key]: e.target.value });
  const chosen = results?.options.find(o => o.id === results.chosen);

  return (
    <div>
      <PageHeader title="Emergency dispatch" description="Find the best hospital for a patient and send the nearest free ambulance." />

      {activeList.length > 0 && (
        <Card className="mb-5 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-sm font-medium text-slate-900">Your active dispatches</p>
          {activeList.slice(0, 4).map(i => (
            <button key={i.id} onClick={() => onOpen(i.id)} className="inline-flex items-center gap-2 text-sm text-brand-700 hover:underline">
              #{i.id} · {i.hospital_name} <Badge tone={INCIDENT_STATUS[i.status].tone} className="h-5">{INCIDENT_STATUS[i.status].label}</Badge>
            </button>
          ))}
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
        <form onSubmit={search} className="xl:col-span-3 flex flex-col gap-5">
          <Card>
            <CardHeader title="What's wrong?" description="Used to prefer a hospital with the right specialist on duty." />
            <div className="px-5 pb-5 flex flex-col gap-4">
              {config ? <ComplaintPicker complaints={config.complaints} value={complaint} onChange={setComplaint} /> : <Skeleton className="h-28" />}
              <div>
                <p className="text-xs font-medium text-slate-700 mb-1.5">Severity</p>
                <RadioCards value={severity} onChange={setSeverity} options={SEVERITIES} className="grid-cols-1 sm:grid-cols-3" aria-label="Severity" />
              </div>
              <Switch id="needs-icu" checked={needsIcu} onCheckedChange={setNeedsIcu} label="Patient needs an ICU bed" />
            </div>
          </Card>

          <Card>
            <CardHeader title="Patient location" description="Hospitals are searched outward from this point." />
            <div className="px-5 pb-5">
              <LocationPicker value={location} onChange={setLocation} placeholder="Search the pickup address…" mapClassName="h-56" />
              <details className="group text-sm">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 select-none">
                  <ChevronRight size={14} className="transition-transform group-open:rotate-90" /> Enter coordinates manually
                </summary>
                <ManualCoordinates onApply={(lat, lng) => setLocation({ lat, lng, address: 'Entered coordinates', city: location?.city || '' })} />
              </details>
            </div>
          </Card>

          <Card>
            <CardHeader title="Patient & caller" description="Optional, but helps the receiving team prepare." />
            <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-6 gap-4">
              <Field label="Patient name" htmlFor="p-name" className="sm:col-span-3"><Input id="p-name" value={patient.name} onChange={setP('name')} placeholder="If known" /></Field>
              <Field label="Age" htmlFor="p-age" className="sm:col-span-1"><Input id="p-age" inputMode="numeric" value={patient.age} onChange={(e) => setPatient({ ...patient, age: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></Field>
              <div className="sm:col-span-2">
                <p className="text-xs font-medium text-slate-700 mb-1.5">Sex</p>
                <Segmented size="md" value={patient.sex || 'unknown'} onChange={(v) => setPatient({ ...patient, sex: v === 'unknown' ? '' : v })} aria-label="Sex"
                  options={[{ value: 'female', label: 'F' }, { value: 'male', label: 'M' }, { value: 'other', label: 'Other' }, { value: 'unknown', label: '?' }]} />
              </div>
              <Field label="Caller phone" htmlFor="p-phone" className="sm:col-span-2"><Input id="p-phone" type="tel" value={patient.phone} onChange={setP('phone')} placeholder="+91 …" /></Field>
              <Field label="Notes for the hospital" htmlFor="p-notes" className="sm:col-span-4"><Input id="p-notes" value={patient.notes} onChange={setP('notes')} maxLength={500} placeholder="e.g. conscious, bleeding from left leg" /></Field>
            </div>
          </Card>
        </form>

        {/* ---- Hospitals ---- */}
        <div className="xl:col-span-2 flex flex-col gap-4 xl:sticky xl:top-20">
          <Card>
            <CardHeader
              title="Hospitals"
              description={results ? `Best ${results.options.length} within ${results.radius_km} km` : 'Ranked by distance, beds, ICU and doctors on duty.'}
              actions={results && <Button variant="ghost" size="sm" onClick={search} disabled={searching}><Search size={14} /> Search again</Button>}
            />
            <div className="px-5 pb-5 flex flex-col gap-3">
              {error && (
                <p className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2" role="alert">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
                </p>
              )}
              {searching ? <><Skeleton className="h-24" /><Skeleton className="h-24" /></> : !results ? (
                <EmptyState icon={Siren} className="py-8" title="No search yet"
                  description="Choose what's wrong and the patient's location, then find hospitals."
                  action={<Button onClick={search}><Search size={15} /> Find hospitals</Button>} />
              ) : results.options.length === 0 ? (
                <EmptyState title="No hospitals with free beds nearby" description="Update capacity on the dashboard, or try again in a moment." />
              ) : (
                <>
                  {stale && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                      Details changed since this search. <button className="font-medium underline" onClick={search}>Search again</button> before sending.
                    </p>
                  )}
                  <OptionsList options={results.options} value={results.chosen} onChange={(id) => setResults({ ...results, chosen: id })} specialistLabel={complaintMeta?.departments?.[0]} />
                  <div className="flex items-start gap-3 rounded-lg bg-slate-50 border border-line px-3 py-2.5 text-sm">
                    <Ambulance size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                    {results.ambulance
                      ? <p className="text-slate-700">
                          <span className="font-medium">{results.ambulance.vehicle_number || results.ambulance.name}</span>
                          {results.ambulance.vehicle_number && <> ({results.ambulance.name})</>} is the nearest free ambulance, {results.ambulance.distance_km} km away
                          {results.ambulance.live ? ' by live GPS' : ' (demo fleet)'}. When you send, the nearest drivers are asked to accept; the first to accept goes.
                        </p>
                      : <p className="text-slate-700">No driver is on shift nearby right now. The hospitals can still be asked.</p>}
                  </div>
                  <Button variant="danger" size="lg" className="w-full" disabled={sending || stale || !chosen} onClick={send}>
                    <Siren size={16} /> {sending ? 'Sending…' : `Send to ${chosen?.name}`}
                  </Button>
                  <p className="text-xs text-slate-500 text-center">
                    All {Math.min(results.options.length, 5)} are asked at the same time and have {config?.request_timeout_seconds || 45}s;
                    the first to accept takes the patient, and {chosen?.name} wins a tie.
                  </p>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

const EmergencyDispatch = () => {
  const [activeId, setActiveId] = useState(readActive);

  const open = (id) => { saveActive(id); setActiveId(id); };
  const close = () => { saveActive(null); setActiveId(null); };

  if (!activeId) return <DispatchForm onCreated={open} onOpen={open} />;

  return (
    <div>
      <PageHeader
        title={`Dispatch #${activeId}`}
        description="Live status of this dispatch. You can leave this page; it keeps running."
        actions={<Button variant="secondary" onClick={close}><Plus size={15} /> New dispatch</Button>}
      />
      <IncidentView incidentId={activeId} layout="page" />
    </div>
  );
};

export default EmergencyDispatch;
