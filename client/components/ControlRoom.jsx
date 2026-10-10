import React, { useState, useEffect, useCallback } from 'react';
import { Siren, UserX, ShieldAlert, Radio, MapPin } from 'lucide-react';
import { api, getErrorMessage } from '../src/api';
import { showToast } from '../src/toast';
import { useSocketEvent } from '../src/useSocketEvent';
import { INCIDENT_STATUS, severityMeta } from '../src/dispatch';
import { timeAgo } from '../src/format';
import { PageHeader, Card, Badge, Select, EmptyState, SkeletonRows, Button } from '../src/ui';
import IncidentSheet from './dispatch/IncidentSheet';

// Live view of ambulances booked by the public nearby. These have no hospital
// dispatcher behind them, so somebody should be watching.
const ControlRoom = () => {
  const [incidents, setIncidents] = useState(null);
  const [radius, setRadius] = useState(50);
  const [openId, setOpenId] = useState(null);

  // Fetching inside the effect lets a slow response for an old radius be discarded
  // when the radius changes. `reload` just bumps the counter the effect depends on.
  const [reloads, setReloads] = useState(0);
  const reload = useCallback(() => setReloads(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/api/incidents/public/nearby', { params: { radius_km: radius } });
        if (!cancelled) setIncidents(res.data);
      } catch (err) {
        if (cancelled) return;
        showToast(getErrorMessage(err, 'Could not load public requests.'), 'error');
        setIncidents([]);
      }
    })();
    return () => { cancelled = true; };
  }, [radius, reloads]);

  useSocketEvent('incident_updated', reload);
  useSocketEvent('incident_request', reload);

  return (
    <div>
      <PageHeader
        title="Control room"
        description="Ambulances booked directly by the public near your hospital. Nobody at a hospital created these, so keep an eye on them."
        actions={
          <div className="w-40">
            <Select size="sm" value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label="Search radius">
              <option value={25}>Within 25 km</option>
              <option value={50}>Within 50 km</option>
              <option value={100}>Within 100 km</option>
            </Select>
          </div>
        }
      />

      <Card className="overflow-hidden">
        {incidents === null ? <SkeletonRows rows={3} /> : incidents.length === 0 ? (
          <EmptyState icon={Radio} title="No public requests right now"
            description="Ambulances booked from the public app will appear here while they're active." />
        ) : (
          <ul className="divide-y divide-line">
            {incidents.map(i => {
              const sev = severityMeta(i.severity);
              const status = INCIDENT_STATUS[i.status] || { label: i.status, tone: 'neutral' };
              return (
                <li key={i.id}>
                  <button onClick={() => setOpenId(i.id)} className="w-full text-left px-5 py-3.5 hover:bg-slate-50/60 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="h-9 w-9 rounded-lg bg-red-50 text-red-600 grid place-items-center shrink-0"><Siren size={16} /></div>
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        #{i.id} · {i.complaint_label}
                        {!i.patient_identified && <span className="text-slate-500 font-normal"> · unidentified patient</span>}
                      </p>
                      <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                        <MapPin size={11} /> {i.pickup_address || `${i.patient_lat?.toFixed(4)}, ${i.patient_lng?.toFixed(4)}`}
                        {' · '}{timeAgo(i.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {sev && <Badge tone={sev.tone} dot>{sev.label}</Badge>}
                      {i.requester_relationship === 'bystander' && <Badge tone="violet" icon={UserX}>Bystander</Badge>}
                      {i.is_mlc && <Badge tone="amber" icon={ShieldAlert}>Police case</Badge>}
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="text-xs text-slate-500 mt-3">
        A request you can't verify, or an obvious prank, can be stopped: open it and use Cancel once your hospital has accepted it.
        Repeat offenders can be blocked by their phone number in the database.
      </p>

      <IncidentSheet incidentId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
};

export default ControlRoom;
