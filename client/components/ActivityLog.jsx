import React, { useState, useEffect, useCallback } from 'react';
import { History, Database, Stethoscope, Users, CalendarClock, KeyRound, Bot, Siren, Ambulance } from 'lucide-react';
import { api, getErrorMessage } from '../src/api';
import { showToast } from '../src/toast';
import { useSocketEvent } from '../src/useSocketEvent';
import { formatDateTime, timeAgo } from '../src/format';
import { PageHeader, Card, Segmented, Select, Button, EmptyState, SkeletonRows, Tip, cn } from '../src/ui';

const TYPES = [
  { value: 'all', label: 'All' },
  { value: 'incident', label: 'Dispatch', icon: Siren, color: 'text-red-600 bg-red-50' },
  { value: 'fleet', label: 'Ambulances', icon: Ambulance, color: 'text-emerald-600 bg-emerald-50' },
  { value: 'resource', label: 'Resources', icon: Database, color: 'text-brand-600 bg-brand-50' },
  { value: 'doctor', label: 'Doctors', icon: Stethoscope, color: 'text-emerald-600 bg-emerald-50' },
  { value: 'shift', label: 'Shifts', icon: CalendarClock, color: 'text-violet-600 bg-violet-50' },
  { value: 'staff', label: 'Staff', icon: Users, color: 'text-amber-600 bg-amber-50' },
  { value: 'account', label: 'Sign-in', icon: KeyRound, color: 'text-slate-600 bg-slate-100' }
];
const typeStyle = (type) => TYPES.find(t => t.value === type) || TYPES[TYPES.length - 1];

const ActivityLog = () => {
  const [entries, setEntries] = useState([]);
  const [type, setType] = useState('all');
  const [userFilter, setUserFilter] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (before) => {
    try {
      const res = await api.get('/api/activity', {
        params: { type: type === 'all' ? undefined : type, user: userFilter || undefined, before }
      });
      setEntries(prev => (before ? [...prev, ...res.data] : res.data));
      setHasMore(res.data.length === 50);
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not load activity.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [type, userFilter]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    api.get('/api/activity/users').then(res => setUsers(res.data)).catch(() => {});
  }, []);

  useSocketEvent('activity_logged', (entry) => {
    const typeOk = type === 'all' || entry.entity_type === type;
    const userOk = !userFilter || (userFilter === 'system' ? entry.user_id === null : String(entry.user_id) === userFilter);
    if (typeOk && userOk) setEntries(prev => (prev.some(e => e.id === entry.id) ? prev : [entry, ...prev]));
  });

  return (
    <div>
      <PageHeader title="Activity" description="Every change to resources, doctors, shifts and staff at your hospital." />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Segmented value={type} onChange={setType} aria-label="Filter by type" className="flex-wrap"
          options={TYPES.map(t => ({ value: t.value, label: t.label }))} />
        <div className="w-48">
          <Select size="sm" value={userFilter} onChange={(e) => setUserFilter(e.target.value)} aria-label="Filter by person">
            <option value="">Everyone</option>
            <option value="system">System (shift schedule)</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden">
        {loading ? <SkeletonRows rows={6} /> : entries.length === 0 ? (
          <EmptyState icon={History} title="Nothing recorded yet" description="Changes made by your team will show up here." />
        ) : (
          <ul className="divide-y divide-line">
            {entries.map(entry => {
              const style = typeStyle(entry.entity_type);
              const system = entry.user_name === 'System';
              const Icon = system ? Bot : style.icon;
              return (
                <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                  <div className={cn('h-7 w-7 rounded-md flex items-center justify-center shrink-0 mt-0.5', style.color)}><Icon size={14} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 break-words">{entry.summary}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{system ? 'System · shift schedule' : entry.user_name}</p>
                  </div>
                  <Tip content={formatDateTime(entry.created_at)}>
                    <time className="text-xs text-slate-400 whitespace-nowrap shrink-0 mt-0.5" dateTime={entry.created_at}>{timeAgo(entry.created_at)}</time>
                  </Tip>
                </li>
              );
            })}
          </ul>
        )}
        {hasMore && !loading && (
          <div className="px-5 py-3 border-t border-line">
            <Button variant="ghost" size="sm" onClick={() => load(entries[entries.length - 1].id)}>Load older</Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ActivityLog;
