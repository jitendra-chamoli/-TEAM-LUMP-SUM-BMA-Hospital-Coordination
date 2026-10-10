import React, { useState, useEffect, useCallback } from 'react';
import { Ambulance, CheckCircle2 } from 'lucide-react';
import { api, getErrorMessage } from '../../src/api';
import { showToast } from '../../src/toast';
import { useSocketEvent } from '../../src/useSocketEvent';
import { INCIDENT_STATUS, severityMeta, getMyHospitalId, formatEta } from '../../src/dispatch';
import { Card, CardHeader, Badge, Button } from '../../src/ui';

const INCOMING = ['accepted', 'picked_up', 'arrived'];

// Patients this hospital has accepted and not yet handed over, with live ETA.
const IncomingPatients = ({ onOpen }) => {
  const [incidents, setIncidents] = useState([]);
  const [eta, setEta] = useState({});
  const [busyId, setBusyId] = useState(null);
  const myHospital = getMyHospitalId();

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/incidents');
      setIncidents(res.data.filter(i => i.hospital_id === myHospital && INCOMING.includes(i.status)));
    } catch { /* the dashboard shows other errors */ }
  }, [myHospital]);

  useEffect(() => { load(); }, [load]);

  useSocketEvent('incident_updated', (s) => {
    if (s.hospital_id !== myHospital) return;
    setIncidents(prev => {
      const rest = prev.filter(i => i.id !== s.id);
      return INCOMING.includes(s.status) ? [...rest, s].sort((a, b) => a.id - b.id) : rest;
    });
  });
  useSocketEvent('ambulance_location_update', (d) => {
    if (d.leg === 'to_hospital') setEta(prev => ({ ...prev, [d.incident_id]: d.eta_seconds }));
  });

  if (incidents.length === 0) return null;

  const handOver = async (id) => {
    setBusyId(id);
    try {
      await api.post(`/api/incidents/${id}/handover`);
      showToast('Hand-over recorded.', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not record the hand-over.'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="border-brand-100">
      <CardHeader title="Incoming patients" description="Accepted by your hospital and on their way." />
      <ul className="border-t border-line divide-y divide-line">
        {incidents.map(i => {
          const sev = severityMeta(i.severity);
          const status = INCIDENT_STATUS[i.status];
          return (
            <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
              <button onClick={() => onOpen?.(i.id)} className="flex items-center gap-3 min-w-0 flex-1 basis-60 text-left">
                <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><Ambulance size={15} /></div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    #{i.id} · {i.patient_name || 'Unnamed patient'}{i.patient_age ? `, ${i.patient_age} y` : ''}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{i.complaint_label} · from {i.requested_by_hospital_name}{i.receiving_doctor_name ? ` · for ${i.receiving_doctor_name}` : ''}</p>
                </div>
              </button>
              <div className="flex items-center gap-2">
                {sev && <Badge tone={sev.tone} dot>{sev.label}</Badge>}
                {i.needs_icu && <Badge tone="red">ICU</Badge>}
                <Badge tone={status.tone}>{i.status === 'picked_up' && eta[i.id] !== undefined ? `Arriving ${formatEta(eta[i.id])}` : status.label}</Badge>
              </div>
              <Button size="sm" variant={i.status === 'arrived' ? 'primary' : 'secondary'} onClick={() => handOver(i.id)} disabled={busyId === i.id}>
                <CheckCircle2 size={14} /> Handed over
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

export default IncomingPatients;
