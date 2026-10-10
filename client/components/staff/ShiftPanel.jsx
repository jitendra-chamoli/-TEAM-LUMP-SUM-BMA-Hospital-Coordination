import React, { useState, useEffect, useCallback } from 'react';
import { Moon, Trash2, CalendarPlus } from 'lucide-react';
import { api, getErrorMessage } from '../../src/api';
import { showToast } from '../../src/toast';
import { formatShiftRange } from '../../src/format';
import { Segmented, Field, Input, Button, Skeleton, Badge, cn } from '../../src/ui';

const PRESETS = [
  { value: 'morning', label: 'Morning', start: '08:00', end: '14:00' },
  { value: 'day', label: 'Day', start: '09:00', end: '17:00' },
  { value: 'evening', label: 'Evening', start: '14:00', end: '22:00' },
  { value: 'night', label: 'Night', start: '22:00', end: '08:00' },
  { value: 'custom', label: 'Custom' }
];

const DAYS_SHOWN = 7;
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

const dayKey = (d) => {
  const local = new Date(d);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
};

const nextDays = () => Array.from({ length: DAYS_SHOWN }, (_, i) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + i);
  return d;
});

// An end time at or before the start means the shift runs past midnight.
const buildRange = (date, start, end) => {
  const startsAt = new Date(`${date}T${start}`);
  const endsAt = new Date(`${date}T${end}`);
  if (endsAt <= startsAt) endsAt.setDate(endsAt.getDate() + 1);
  return { startsAt, endsAt };
};

const ShiftPlanner = ({ doctor }) => {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(dayKey(new Date()));
  // Default to the next shift that hasn't ended yet today
  const [preset, setPreset] = useState(() => {
    const h = new Date().getHours();
    return h < 8 ? 'morning' : h < 14 ? 'evening' : 'night';
  });
  const [custom, setCustom] = useState({ start: '09:00', end: '17:00' });
  const [saving, setSaving] = useState(false);

  const fetchShifts = useCallback(async () => {
    try {
      const res = await api.get(`/api/doctors/${doctor.id}/shifts`);
      setShifts(res.data);
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not load shifts.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [doctor.id]);

  useEffect(() => { fetchShifts(); }, [fetchShifts]);

  const times = preset === 'custom' ? custom : PRESETS.find(p => p.value === preset);
  const { startsAt, endsAt } = buildRange(date, times.start, times.end);
  const overnight = dayKey(startsAt) !== dayKey(endsAt);

  const addShift = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/api/doctors/${doctor.id}/shifts`, { starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() });
      showToast('Shift added.', 'success');
      fetchShifts();
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not add the shift.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeShift = async (id) => {
    const previous = shifts;
    setShifts(prev => prev.filter(s => s.id !== id));
    try {
      await api.delete(`/api/doctors/shifts/${id}`);
    } catch (err) {
      setShifts(previous);
      showToast(getErrorMessage(err, 'Could not remove the shift.'), 'error');
    }
  };

  const days = nextDays();
  const byDay = (d) => shifts.filter(s => dayKey(s.starts_at) === dayKey(d) || (new Date(s.starts_at) < d && new Date(s.ends_at) > d && dayKey(d) === dayKey(new Date())));

  return (
    <div className="flex flex-col gap-6">
      {/* Week strip — click a day to plan on it */}
      <div>
        <p className="text-xs font-medium text-slate-500 mb-2">Next 7 days</p>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map(d => {
            const key = dayKey(d);
            const selected = key === date;
            const dayShifts = byDay(d);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setDate(key)}
                aria-pressed={selected}
                className={cn(
                  'flex flex-col items-stretch rounded-lg border p-1.5 min-h-[92px] text-left transition-colors',
                  selected ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/15' : 'border-line bg-white hover:border-slate-300',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40'
                )}
              >
                <span className="text-[11px] text-slate-500 leading-none">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span className={cn('text-sm font-semibold leading-tight mb-1', selected ? 'text-brand-700' : 'text-slate-900')}>{d.getDate()}</span>
                <span className="flex flex-col gap-0.5">
                  {loading ? <Skeleton className="h-4" /> : dayShifts.map(s => (
                    <span key={s.id} className="rounded bg-emerald-100 text-emerald-800 text-[10px] font-medium px-1 py-0.5 leading-tight tabular truncate">
                      {timeFmt.format(new Date(s.starts_at))}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Add a shift on the selected day */}
      <form onSubmit={addShift} className="rounded-lg border border-line p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-900">
            Add shift on {new Date(`${date}T00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
          </p>
          <Input type="date" value={date} min={dayKey(new Date())} onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-40 h-8 text-xs" aria-label="Shift date" />
        </div>

        <Segmented value={preset} onChange={setPreset} aria-label="Shift type" className="self-start flex-wrap"
          options={PRESETS.map(p => ({ value: p.value, label: p.label }))} />

        {preset === 'custom' ? (
          <div className="grid grid-cols-2 gap-3 max-w-xs">
            <Field label="Starts" htmlFor="shift-start">
              <Input id="shift-start" type="time" required value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} />
            </Field>
            <Field label="Ends" htmlFor="shift-end">
              <Input id="shift-end" type="time" required value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} />
            </Field>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600 tabular flex items-center gap-1.5">
            {formatShiftRange(startsAt, endsAt)}
            {overnight && <Badge tone="violet" icon={Moon}>Overnight</Badge>}
          </p>
          <Button type="submit" size="sm" disabled={saving}>
            <CalendarPlus size={14} /> {saving ? 'Adding…' : 'Add shift'}
          </Button>
        </div>
      </form>

      {/* Upcoming list */}
      <div>
        <p className="text-xs font-medium text-slate-500 mb-2">Upcoming shifts</p>
        {loading ? <Skeleton className="h-10" /> : shifts.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">No upcoming shifts. Pick a day above to add one.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {shifts.map(s => {
              const running = new Date(s.starts_at) <= new Date();
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="flex items-center gap-2 min-w-0 text-sm text-slate-700 tabular">
                    {running && <Badge tone="green" dot>Now</Badge>}
                    <span className="truncate">{formatShiftRange(s.starts_at, s.ends_at)}</span>
                  </span>
                  <Button variant="ghost" size="icon-sm" onClick={() => removeShift(s.id)} aria-label="Remove shift">
                    <Trash2 size={14} />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ShiftPlanner;
