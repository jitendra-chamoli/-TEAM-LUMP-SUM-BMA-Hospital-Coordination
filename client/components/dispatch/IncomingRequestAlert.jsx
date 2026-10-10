import React, { useState, useEffect, useRef } from 'react';
import { Dialog as RDialog } from 'radix-ui';
import { Siren, Clock, MapPin, Route, Volume2, VolumeX, AlarmClockOff, X, UserX, ShieldAlert } from 'lucide-react';
import { api, getErrorMessage } from '../../src/api';
import { showToast } from '../../src/toast';
import { useSocketEvent } from '../../src/useSocketEvent';
import { severityMeta, useDispatchConfig, formatCountdown } from '../../src/dispatch';
import { Badge, Button, RadioCards, Input, cn } from '../../src/ui';

// Two short tones every 2.5 s while a request is open. Browsers only allow sound
// after the user has interacted with the page, which is true once they're signed in.
function useAlertTone(enabled) {
  const ctxRef = useRef(null);
  useEffect(() => {
    if (!enabled) return;
    const beep = () => {
      try {
        const ctx = ctxRef.current || (ctxRef.current = new (window.AudioContext || window.webkitAudioContext)());
        [0, 0.22].forEach((offset) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + offset + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.18);
          osc.connect(gain).connect(ctx.destination);
          osc.start(ctx.currentTime + offset);
          osc.stop(ctx.currentTime + offset + 0.2);
        });
      } catch { /* audio not available */ }
    };
    beep();
    const t = setInterval(beep, 2500);
    return () => clearInterval(t);
  }, [enabled]);
}

const readMuted = () => { try { return localStorage.getItem('bma.alertMuted') === '1'; } catch { return false; } };

// A request that timed out here but that no hospital has accepted yet. It can
// still be accepted from this card until someone else takes the patient.
const MissedRequests = ({ missed, busy, onAccept, onDismiss }) => {
  if (!missed.length) return null;
  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] w-[min(36rem,calc(100%-2rem))] flex flex-col gap-2" role="status">
      {missed.map(req => {
        const sev = severityMeta(req.severity);
        return (
          <div key={req.request_id} className="bg-white border border-amber-300 border-l-4 border-l-amber-500 rounded-lg shadow-lg px-4 py-3 flex flex-wrap items-center gap-3 animate-in fade-in-0 slide-in-from-top-2">
            <AlarmClockOff size={16} className="text-amber-600 shrink-0" />
            <div className="flex-1 min-w-[12rem]">
              <p className="text-sm font-semibold text-slate-900">Missed request #{req.incident_id} still needs a hospital</p>
              <p className="text-xs text-slate-600">
                {req.complaint_label}{sev ? ` · ${sev.label}` : ''}{req.needs_icu ? ' · needs ICU' : ''} · {req.distance_km} km away · from {req.requested_by_hospital_name}
              </p>
            </div>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => onAccept(req)}>Accept now</Button>
            <Button variant="ghost" size="icon-sm" onClick={() => onDismiss(req)} aria-label="Hide this request"><X size={14} /></Button>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Full-screen request from another hospital: accept or divert before the timer runs out.
 * Requests stack; the oldest is shown first. Closing is only possible by answering
 * (or when someone else at the hospital answers / the request times out).
 * A request that times out moves to the "missed" cards and can still be accepted
 * until another hospital takes the patient.
 */
const IncomingRequestAlert = () => {
  const [requests, setRequests] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [diverting, setDiverting] = useState(false);
  const [reason, setReason] = useState('no_beds');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(readMuted);
  const [dismissed, setDismissed] = useState([]);
  const config = useDispatchConfig();

  const refresh = () => api.get('/api/incidents/requests/pending').then(res => setRequests(res.data)).catch(() => {});

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!requests.length) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [requests.length]);

  useSocketEvent('incident_request', (req) => {
    setRequests(prev => (prev.some(r => r.request_id === req.request_id) ? prev : [...prev, { ...req, state: 'pending' }]));
  });
  useSocketEvent('incident_request_closed', ({ request_id, outcome, by }) => {
    const live = requests.find(r => r.request_id === request_id && r.state === 'pending');
    if (live && live === requests.find(r => r.state === 'pending') && !busy) {
      if (outcome === 'expired') showToast('Time ran out. You can still accept it from the banner until another hospital takes the patient.', 'info');
      else if (outcome === 'cancelled') showToast('The requesting hospital cancelled the dispatch.', 'info');
      else if (outcome === 'taken') showToast('Another hospital accepted this patient.', 'info');
      else if (by) showToast(`${by} ${outcome === 'accepted' ? 'accepted' : 'diverted'} the request.`, 'info');
    }
    if (outcome === 'expired') {
      // Becomes a missed request (still acceptable) — reload to get its current details.
      setRequests(prev => prev.map(r => (r.request_id === request_id ? { ...r, state: 'missed' } : r)));
      refresh();
    } else {
      setRequests(prev => prev.filter(r => r.request_id !== request_id));
    }
    setDiverting(false);
  });

  const pending = requests.filter(r => r.state !== 'missed');
  const missed = requests.filter(r => r.state === 'missed' && !dismissed.includes(r.request_id));
  const current = pending[0];
  useAlertTone(Boolean(current) && !muted);

  const toggleMute = () => setMuted(m => {
    try { localStorage.setItem('bma.alertMuted', m ? '0' : '1'); } catch { /* storage unavailable */ }
    return !m;
  });

  const acceptRequest = async (req) => {
    setBusy(true);
    try {
      const res = await api.post(`/api/incidents/${req.incident_id}/accept`);
      showToast(`Accepted. ${res.data.incident.receiving_doctor_name ? `${res.data.incident.receiving_doctor_name} will receive the patient.` : 'No doctor is on duty to assign.'}`, 'success');
      res.data.warnings?.forEach(w => showToast(w, 'info'));
      setRequests(prev => prev.filter(r => r.incident_id !== req.incident_id));
    } catch (err) {
      showToast(getErrorMessage(err, 'That response could not be sent.'), 'error');
      if (err.response?.status === 409) setRequests(prev => prev.filter(r => r.request_id !== req.request_id));
    } finally {
      setBusy(false);
    }
  };

  const missedCards = (
    <MissedRequests missed={missed} busy={busy} onAccept={acceptRequest}
      onDismiss={(req) => setDismissed(d => [...d, req.request_id])} />
  );

  if (!current) return missedCards;

  const secondsLeft = Math.max(0, (new Date(current.expires_at) - now) / 1000);
  const fraction = Math.min(1, secondsLeft / (current.timeout_seconds || 45));
  const sev = severityMeta(current.severity);

  const respond = async (action) => {
    if (action === 'accept') {
      await acceptRequest(current);
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/incidents/${current.incident_id}/divert`, { reason, note: note.trim() || undefined });
      showToast('Diverted. The other hospitals asked can still take this patient.', 'info');
      setRequests(prev => prev.filter(r => r.request_id !== current.request_id));
      setDiverting(false);
      setNote('');
    } catch (err) {
      showToast(getErrorMessage(err, 'That response could not be sent.'), 'error');
      if (err.response?.status === 409) setRequests(prev => prev.filter(r => r.request_id !== current.request_id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    {missedCards}
    <RDialog.Root open>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm animate-in fade-in-0" />
        <RDialog.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95"
        >
          {/* Countdown bar */}
          <div className="h-1 bg-slate-100">
            <div className={cn('h-full transition-[width] duration-1000 ease-linear', fraction > 0.33 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${fraction * 100}%` }} />
          </div>

          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center animate-pulse"><Siren size={20} /></div>
                <div>
                  <RDialog.Title className="text-base font-semibold text-slate-900">Incoming patient request</RDialog.Title>
                  <RDialog.Description className="text-sm text-slate-500">
                    {current.source === 'public'
                      ? 'Booked from the public app'
                      : `From ${current.requested_by_hospital_name}${current.requested_by_name ? ` · ${current.requested_by_name}` : ''}`}
                  </RDialog.Description>
                  {/* Nobody is holding this request for you: the other hospitals are
                      looking at it right now, and the first to accept takes the patient. */}
                  {current.asked_count > 1 && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {current.asked_count} hospitals asked at once ·{' '}
                      {current.rank_order === 1
                        ? <span className="font-medium text-emerald-700">you are the best match</span>
                        : <>first to accept takes the patient</>}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className={cn('inline-flex items-center gap-1 text-sm font-semibold tabular', secondsLeft < 20 ? 'text-red-600' : 'text-slate-700')}>
                  <Clock size={14} /> {formatCountdown(secondsLeft)}
                </span>
                <Button variant="ghost" size="icon-sm" onClick={toggleMute} aria-label={muted ? 'Turn alert sound on' : 'Mute alert sound'}>
                  {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-line p-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="violet">{current.complaint_label}</Badge>
                {sev && <Badge tone={sev.tone} dot>{sev.label}</Badge>}
                {current.needs_icu && <Badge tone="red">Needs ICU</Badge>}
                {current.requester_relationship === 'bystander' && <Badge tone="blue" icon={UserX}>Brought by a bystander</Badge>}
                {current.is_mlc && <Badge tone="amber" icon={ShieldAlert}>Police case</Badge>}
              </div>
              {current.patient_identified === false && (
                <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  <b>Patient not identified.</b> Register as unknown and inform the police on arrival.
                  {current.payer_route === 'mv_cashless' && ' Road accident: the central cashless scheme applies.'}
                </p>
              )}
              <p className="text-sm text-slate-900">
                <span className="font-medium">{current.patient_name || 'Unnamed patient'}</span>
                {(current.patient_age || current.patient_sex) && <span className="text-slate-500"> · {[current.patient_age && `${current.patient_age} y`, current.patient_sex].filter(Boolean).join(', ')}</span>}
              </p>
              {current.notes && <p className="text-sm text-slate-600">{current.notes}</p>}
              {current.pickup_address && <p className="text-xs text-slate-500 flex items-start gap-1"><MapPin size={12} className="mt-0.5 shrink-0" /><span className="line-clamp-2">{current.pickup_address}</span></p>}
              <p className="text-xs text-slate-500 flex items-center gap-1"><Route size={12} /> Patient is {current.distance_km} km from your hospital</p>
            </div>

            {diverting ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-slate-900">Why can't you take this patient?</p>
                <RadioCards value={reason} onChange={setReason} className="grid-cols-2"
                  options={(config?.divert_reasons || []).map(r => ({ value: r.code, label: r.label }))} aria-label="Divert reason" />
                <Input placeholder="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} aria-label="Divert note" />
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setDiverting(false)} disabled={busy}>Back</Button>
                  <Button variant="danger" onClick={() => respond('divert')} disabled={busy}>Can't take this patient</Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="secondary" size="lg" className="flex-1" onClick={() => setDiverting(true)} disabled={busy}>Divert</Button>
                <Button size="lg" className="flex-[2] bg-emerald-600 hover:bg-emerald-700" onClick={() => respond('accept')} disabled={busy}>
                  {busy ? 'Accepting…' : 'Accept patient'}
                </Button>
              </div>
            )}

            {pending.length > 1 && <p className="text-xs text-slate-500 text-center">{pending.length - 1} more request{pending.length > 2 ? 's' : ''} waiting</p>}
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
    </>
  );
};

export default IncomingRequestAlert;
