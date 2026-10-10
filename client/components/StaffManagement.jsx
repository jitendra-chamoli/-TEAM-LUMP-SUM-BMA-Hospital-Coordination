import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, Search } from 'lucide-react';
import { api, getErrorMessage } from '../src/api';
import { showToast } from '../src/toast';
import { useSocketEvent } from '../src/useSocketEvent';
import { DEPARTMENTS } from '../src/constants';
import { PageHeader, Button, Tabs, TabsList, TabsTrigger, TabsContent, Input, Select, Switch } from '../src/ui';
import StaffTab from './staff/StaffTab';
import DoctorTab from './staff/DoctorTab';
import FleetTab from './staff/FleetTab';
import TemporaryPasswordDialog from './TemporaryPasswordNotice';

// Replace the item with the same id, or add it to the top.
const upsertById = (list, item) =>
  list.some(x => x.id === item.id) ? list.map(x => (x.id === item.id ? item : x)) : [item, ...list];

const matches = (query, ...fields) => {
  const q = query.trim().toLowerCase();
  return !q || fields.some(f => f && f.toLowerCase().includes(q));
};

const StaffManagement = () => {
  const [view, setView] = useState('staff');
  const [staffList, setStaffList] = useState([]);
  const [doctorList, setDoctorList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tempPassword, setTempPassword] = useState(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [fleetCount, setFleetCount] = useState(undefined);

  const fetchAll = useCallback(async () => {
    try {
      const [staffRes, doctorRes] = await Promise.all([api.get('/api/staff'), api.get('/api/doctors')]);
      setStaffList(staffRes.data);
      setDoctorList(doctorRes.data);
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not load staff and doctors.'), 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Live updates from other admins (and from our own actions — upsert keeps one row per id)
  useSocketEvent('staff_changed', (staff) => setStaffList(prev => upsertById(prev, staff)));
  useSocketEvent('doctor_changed', (doctor) => setDoctorList(prev => upsertById(prev, doctor)));
  useSocketEvent('doctor_removed', ({ id }) => setDoctorList(prev => prev.filter(d => d.id !== id)));

  const visibleStaff = staffList.filter(s =>
    (showInactive || s.is_active) && (!dept || s.department === dept) && matches(query, s.name, s.email));
  const visibleDoctors = doctorList.filter(d =>
    (!dept || d.department === dept) && matches(query, d.doctor_name, d.specialization, d.phone));
  const inactiveCount = staffList.filter(s => !s.is_active).length;

  return (
    <div>
      <PageHeader
        title="Staff & roster"
        description="Manage who can sign in, which doctors are available, and your ambulances and drivers."
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus size={15} /> {view === 'staff' ? 'Add staff' : view === 'doctor' ? 'Add doctor' : 'Add ambulance'}
          </Button>
        }
      />

      <Tabs value={view} onValueChange={setView}>
        <TabsList>
          <TabsTrigger value="staff" count={staffList.filter(s => s.is_active).length}>Staff accounts</TabsTrigger>
          <TabsTrigger value="doctor" count={doctorList.length}>Doctor roster</TabsTrigger>
          <TabsTrigger value="fleet" count={fleetCount}>Ambulances</TabsTrigger>
        </TabsList>

        {view === 'fleet' && <div className="pt-4" />}
        <div className={view === 'fleet' ? 'hidden' : 'flex flex-wrap items-center gap-2 py-4'}>
          <div className="w-full sm:w-64">
            <Input icon={Search} placeholder={view === 'staff' ? 'Search name or email' : 'Search name, specialty, phone'}
              value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
          </div>
          <div className="w-full sm:w-48">
            <Select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Filter by department">
              <option value="">All departments</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
          </div>
          {view === 'staff' && inactiveCount > 0 && (
            <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive}
              label={`Show deactivated (${inactiveCount})`} className="sm:ml-2" />
          )}
        </div>

        <TabsContent value="staff">
          <StaffTab
            staff={visibleStaff}
            totalCount={staffList.length}
            loading={loading}
            adding={adding && view === 'staff'}
            onAddingChange={setAdding}
            onSaved={(s) => setStaffList(prev => upsertById(prev, s))}
            onTemporaryPassword={setTempPassword}
          />
        </TabsContent>
        <TabsContent value="doctor">
          <DoctorTab
            doctors={visibleDoctors}
            totalCount={doctorList.length}
            loading={loading}
            adding={adding && view === 'doctor'}
            onAddingChange={setAdding}
            onSaved={(d) => setDoctorList(prev => upsertById(prev, d))}
            onRemoved={(id) => setDoctorList(prev => prev.filter(d => d.id !== id))}
            onTemporaryPassword={setTempPassword}
          />
        </TabsContent>
        <TabsContent value="fleet">
          <FleetTab
            adding={adding && view === 'fleet'}
            onAddingChange={setAdding}
            onTemporaryPassword={setTempPassword}
            onCount={setFleetCount}
          />
        </TabsContent>
      </Tabs>

      <TemporaryPasswordDialog value={tempPassword} onClose={() => setTempPassword(null)} />
    </div>
  );
};

export default StaffManagement;
