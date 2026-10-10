import React, { useState, useEffect, useCallback } from 'react';
import { BedDouble, HeartPulse, Wind, Stethoscope } from 'lucide-react';
import { api, getErrorMessage, getStoredUser } from '../../src/api';
import { useSocketEvent } from '../../src/useSocketEvent';
import { showToast } from '../../src/toast';
import { PageHeader, Card, Skeleton } from '../../src/ui';
import { StatusToggle } from '../DoctorStatus';
import ResourceTable from './ResourceTable';
import DoctorList from './DoctorList';
import IncomingPatients from './IncomingPatients';
import IncidentSheet from '../dispatch/IncidentSheet';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const StatTile = ({ icon: Icon, label, value, total, tone }) => (
  <Card className="px-4 py-3.5 flex items-center gap-3">
    <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tone}`}><Icon size={17} /></div>
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900 tabular leading-tight">
        {value}{total ? <span className="text-sm font-normal text-slate-400"> / {total}</span> : null}
      </p>
    </div>
  </Card>
);

const Dashboard = () => {
  const [user] = useState(() => {
    const savedUser = getStoredUser() || { name: '', role: '', hospital: '' };
    return { ...savedUser, dept: savedUser.dept || savedUser.department };
  });
  const [resources, setResources] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openIncident, setOpenIncident] = useState(null);

  const fetchResources = useCallback(async () => {
    const res = await api.get('/api/resources');
    setResources(res.data);
  }, []);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [resData, docData] = await Promise.all([api.get('/api/resources'), api.get('/api/doctors')]);
      setResources(resData.data);
      setDoctors(docData.data);
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not load the dashboard.'), 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useSocketEvent('resource_updated', ({ id, newValue, capacity }) => {
    setResources(prev => prev.map(r => (r.id === id ? { ...r, current_count: newValue, capacity: capacity !== undefined ? capacity : r.capacity } : r)));
  });
  useSocketEvent('resource_created', () => fetchResources().catch(() => {}));

  // Doctors outside a staff member's (or doctor's) department are dropped, e.g. after a move.
  useSocketEvent('doctor_changed', (doc) => {
    const visible = user.role === 'admin' || doc.department === user.dept;
    setDoctors(prev => {
      const others = prev.filter(d => d.id !== doc.id);
      if (!visible) return others;
      return prev.some(d => d.id === doc.id) ? prev.map(d => (d.id === doc.id ? doc : d)) : [...prev, doc];
    });
  });
  useSocketEvent('doctor_removed', ({ id }) => setDoctors(prev => prev.filter(d => d.id !== id)));

  const updateResource = async (id, changes) => {
    const previous = resources;
    setResources(prev => prev.map(r => (r.id === id ? {
      ...r,
      ...(changes.newValue !== undefined && { current_count: changes.newValue }),
      ...(changes.capacity !== undefined && { capacity: changes.capacity })
    } : r)));
    try {
      await api.patch('/api/resources/update', { id, ...changes });
    } catch (err) {
      setResources(previous);
      showToast(getErrorMessage(err, 'Could not save that change.'), 'error');
    }
  };

  const initResource = async (payload) => {
    try {
      await api.post('/api/resources/init', payload);
      await fetchResources();
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not save that change.'), 'error');
    }
  };

  const setDoctorStatus = async (id, status) => {
    const previous = doctors;
    setDoctors(prev => prev.map(doc => (doc.id === id ? { ...doc, status } : doc)));
    try {
      await api.post(`/api/doctors/${id}/status`, { status });
    } catch (err) {
      setDoctors(previous);
      showToast(getErrorMessage(err, 'Could not update the status.'), 'error');
    }
  };

  const canEditDoctor = (doc) =>
    user.role === 'admin' ||
    (user.role === 'staff' && user.dept === doc.department) ||
    (user.role === 'doctor' && user.doctor_id === doc.id);

  const total = (type, field) => resources
    .filter(r => r.resource_name.toLowerCase() === type)
    .reduce((sum, r) => sum + (r[field] || 0), 0);
  const available = doctors.filter(d => d.status === 'on_duty' || d.status === 'on_call').length;
  const self = user.role === 'doctor' ? doctors.find(d => d.id === user.doctor_id) : null;

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${user.name?.replace(/^Dr\.?\s+/i, user.role === 'doctor' ? 'Dr. ' : '').split(' ').slice(0, user.role === 'doctor' ? 2 : 1).join(' ') || 'there'}`}
        description={user.role === 'admin' ? 'Live availability across your hospital.' : `Live availability for ${user.dept}.`}
      />

      {self && (
        <Card className="mb-6 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Your status</p>
            <p className="text-xs text-slate-500">Emergency dispatch uses this to decide where to send patients.</p>
          </div>
          <StatusToggle value={self.status} onChange={(s) => setDoctorStatus(self.id, s)} />
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[66px] rounded-xl" />) : (
          <>
            <StatTile icon={BedDouble} label="Beds free" value={total('beds', 'current_count')} total={total('beds', 'capacity') || null} tone="bg-brand-50 text-brand-600" />
            <StatTile icon={HeartPulse} label="ICU free" value={total('icu', 'current_count')} total={total('icu', 'capacity') || null} tone="bg-red-50 text-red-600" />
            <StatTile icon={Wind} label="Ventilators free" value={total('ventilators', 'current_count')} total={total('ventilators', 'capacity') || null} tone="bg-sky-50 text-sky-600" />
            <StatTile icon={Stethoscope} label="Doctors available" value={available} total={doctors.length || null} tone="bg-emerald-50 text-emerald-600" />
          </>
        )}
      </div>

      <div className="flex flex-col gap-6">
        {user.role !== 'doctor' && <IncomingPatients onOpen={setOpenIncident} />}
        {loading ? <Skeleton className="h-56 rounded-xl" /> : (
          <ResourceTable resources={resources} user={user} onUpdate={updateResource} onInit={initResource} />
        )}
        {loading ? <Skeleton className="h-64 rounded-xl" /> : (
          <DoctorList doctors={doctors} user={user} canEdit={canEditDoctor} onStatusChange={setDoctorStatus} />
        )}
      </div>

      <IncidentSheet incidentId={openIncident} onClose={() => setOpenIncident(null)} />
    </div>
  );
};

export default Dashboard;
