import React, { useState, useEffect, useCallback } from 'react';
import { MoreHorizontal, Pencil, Archive, ArchiveRestore, KeyRound, Ambulance, UserPlus, Satellite } from 'lucide-react';
import { api, getErrorMessage } from '../../src/api';
import { showToast } from '../../src/toast';
import { useSocketEvent } from '../../src/useSocketEvent';
import { timeAgo } from '../../src/format';
import {
  Card, CardHeader, Table, Th, Td, Badge, Switch, Avatar, Button, Dialog, Sheet, Field, Input, Select, RadioCards,
  Menu, MenuTrigger, MenuContent, MenuItem, EmptyState, SkeletonRows, Tip, cn
} from '../../src/ui';
import ConfirmDialog from '../ConfirmDialog';

const TYPES = [
  { value: 'basic', label: 'Basic', description: 'Transport, first aid' },
  { value: 'advanced', label: 'Advanced', description: 'Paramedic, cardiac monitor' },
  { value: 'icu', label: 'ICU', description: 'Ventilator, critical care' }
];
const typeLabel = (t) => TYPES.find(x => x.value === t)?.label || t;
const GPS_STALE_MS = 10 * 60 * 1000;

const AmbulanceStatus = ({ a }) => {
  if (!a.is_active) return <Badge>Retired</Badge>;
  if (a.status === 'dispatched') return <Badge tone="amber" dot>On a job</Badge>;
  if (a.status === 'available') return <Badge tone="green" dot>Available</Badge>;
  return <Badge>Off shift</Badge>;
};

const LocationCell = ({ a, now }) => {
  if (!a.current_driver_id) return <span className="text-slate-400">—</span>;
  if (!a.location_updated_at) return <span className="text-amber-700 text-xs">Waiting for GPS</span>;
  const stale = now - new Date(a.location_updated_at) > GPS_STALE_MS;
  return (
    <Tip content={stale ? 'No location for over 10 minutes: not offered for new jobs' : `${Number(a.latitude).toFixed(5)}, ${Number(a.longitude).toFixed(5)}`}>
      <span className={cn('inline-flex items-center gap-1.5 text-xs', stale ? 'text-red-600' : 'text-emerald-700')}>
        <Satellite size={13} /> {stale ? 'Stale' : 'Live'} · {timeAgo(a.location_updated_at)}{a.location_accuracy_m ? ` · ±${a.location_accuracy_m} m` : ''}
      </span>
    </Tip>
  );
};

const DriverAccount = ({ d }) => {
  if (!d.is_active) return <Badge>Deactivated</Badge>;
  if (d.must_change_password) return <Badge tone="amber" dot>Awaiting first sign-in</Badge>;
  if (d.on_shift) return <Badge tone="green" dot>On shift</Badge>;
  return <Badge tone="neutral">Off shift</Badge>;
};

const AmbulanceForm = ({ id, value, onChange, onSubmit }) => (
  <form id={id} onSubmit={onSubmit} className="flex flex-col gap-4">
    <Field label="Vehicle number" htmlFor={`${id}-number`} hint="As on the number plate, e.g. UK07 PA 1234">
      <Input id={`${id}-number`} required autoFocus value={value.vehicle_number} placeholder="UK07 PA 1234"
        onChange={(e) => onChange({ ...value, vehicle_number: e.target.value })} />
    </Field>
    <div>
      <p className="text-xs font-medium text-slate-700 mb-1.5">Type</p>
      <RadioCards value={value.type} onChange={(type) => onChange({ ...value, type })} options={TYPES} className="grid-cols-1 sm:grid-cols-3" aria-label="Ambulance type" />
    </div>
  </form>
);

const DriverForm = ({ id, value, onChange, onSubmit, ambulances, withEmail }) => (
  <form id={id} onSubmit={onSubmit} className="flex flex-col gap-4">
    <Field label="Full name" htmlFor={`${id}-name`}>
      <Input id={`${id}-name`} required autoFocus value={value.name} placeholder="Ramesh Negi" onChange={(e) => onChange({ ...value, name: e.target.value })} />
    </Field>
    {withEmail && (
      <Field label="Email" htmlFor={`${id}-email`} hint="They sign in with this on their phone.">
        <Input id={`${id}-email`} type="email" required value={value.email} placeholder="ramesh@hospital.com" onChange={(e) => onChange({ ...value, email: e.target.value })} />
      </Field>
    )}
    <Field label="Phone" htmlFor={`${id}-phone`} hint="Shown to dispatchers and the receiving hospital during a job.">
      <Input id={`${id}-phone`} type="tel" required value={value.phone} placeholder="+91 90000 11111" onChange={(e) => onChange({ ...value, phone: e.target.value })} />
    </Field>
    <Field label="Ambulance" htmlFor={`${id}-ambulance`}>
      <Select id={`${id}-ambulance`} value={value.ambulance_id ?? ''} onChange={(e) => onChange({ ...value, ambulance_id: e.target.value ? Number(e.target.value) : null })}>
        <option value="">Not assigned</option>
        {ambulances.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.vehicle_number} · {typeLabel(a.type)}</option>)}
      </Select>
    </Field>
  </form>
);

const emptyAmbulance = { vehicle_number: '', type: 'basic' };
const emptyDriver = { name: '', email: '', phone: '', ambulance_id: null };

const FleetTab = ({ adding, onAddingChange, onTemporaryPassword, onCount }) => {
  const [fleet, setFleet] = useState(null);
  const [ambForm, setAmbForm] = useState(emptyAmbulance);
  const [editingAmb, setEditingAmb] = useState(null);
  const [addingDriver, setAddingDriver] = useState(false);
  const [driverForm, setDriverForm] = useState(emptyDriver);
  const [editingDriver, setEditingDriver] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  // Re-evaluates "Live / Stale" and "x min ago" as time passes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/fleet');
      setFleet(res.data);
      onCount?.(res.data.ambulances.filter(a => a.is_active).length);
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not load ambulances.'), 'error');
    }
  }, [onCount]);

  useEffect(() => { load(); }, [load]);
  useSocketEvent('fleet_updated', load);
  useSocketEvent('incident_updated', load);
  useSocketEvent('fleet_location', ({ ambulance_id, lat, lng, accuracy, at }) => {
    setFleet(f => f && ({
      ...f,
      ambulances: f.ambulances.map(a => (a.id === ambulance_id
        ? { ...a, latitude: lat, longitude: lng, location_updated_at: at, location_accuracy_m: accuracy ? Math.round(accuracy) : a.location_accuracy_m }
        : a))
    }));
  });

  const run = async (fn, fallback, onDone) => {
    setSaving(true);
    try {
      const res = await fn();
      await load();
      onDone?.(res);
      return true;
    } catch (err) {
      showToast(getErrorMessage(err, fallback), 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addAmbulance = (e) => {
    e.preventDefault();
    run(() => api.post('/api/fleet/ambulances', ambForm), 'Could not add the ambulance.', () => {
      showToast(`${ambForm.vehicle_number.toUpperCase()} added. Assign a driver so it can take jobs.`, 'success');
      setAmbForm(emptyAmbulance);
      onAddingChange(false);
    });
  };

  const saveAmbulance = (e) => {
    e.preventDefault();
    run(() => api.patch(`/api/fleet/ambulances/${editingAmb.id}`, { vehicle_number: editingAmb.vehicle_number, type: editingAmb.type }),
      'Could not save the ambulance.', () => { setEditingAmb(null); showToast('Changes saved.', 'success'); });
  };

  const setRetired = (a, retire) => {
    if (!retire) return run(() => api.patch(`/api/fleet/ambulances/${a.id}`, { is_active: true }), 'Could not update the ambulance.');
    setConfirm({
      title: `Retire ${a.vehicle_number}?`,
      description: 'It stops taking jobs and any driver on shift is signed off it. You can return it to service later.',
      confirmLabel: 'Retire ambulance', tone: 'danger',
      run: () => run(() => api.patch(`/api/fleet/ambulances/${a.id}`, { is_active: false }), 'Could not retire the ambulance.')
    });
  };

  const addDriver = (e) => {
    e.preventDefault();
    run(() => api.post('/api/fleet/drivers', driverForm), 'Could not add the driver.', (res) => {
      onTemporaryPassword({ name: driverForm.name, email: driverForm.email, password: res.data.temporary_password });
      setDriverForm(emptyDriver);
      setAddingDriver(false);
    });
  };

  const saveDriver = (e) => {
    e.preventDefault();
    const { id, name, phone, ambulance_id } = editingDriver;
    run(() => api.patch(`/api/fleet/drivers/${id}`, { name, phone, ambulance_id }), 'Could not save the driver.',
      () => { setEditingDriver(null); showToast('Changes saved.', 'success'); });
  };

  const toggleDriver = (d, active) => {
    if (active) return run(() => api.patch(`/api/fleet/drivers/${d.id}`, { is_active: true }), 'Could not update the driver.');
    setConfirm({
      title: `Deactivate ${d.name}?`,
      description: d.on_shift ? 'Their shift ends and they are signed out immediately.' : 'They can no longer sign in. You can reactivate them later.',
      confirmLabel: 'Deactivate', tone: 'danger',
      run: () => run(() => api.patch(`/api/fleet/drivers/${d.id}`, { is_active: false }), 'Could not deactivate the driver.')
    });
  };

  const resetPassword = (d) => setConfirm({
    title: `Reset password for ${d.name}?`,
    description: "Their current password stops working and they're signed out. You'll get a new temporary password.",
    confirmLabel: 'Reset password',
    run: () => run(() => api.post(`/api/fleet/drivers/${d.id}/reset-password`), 'Could not reset the password.',
      (res) => onTemporaryPassword({ name: d.name, email: d.email, password: res.data.temporary_password }))
  });

  const ambulances = fleet?.ambulances || [];
  const drivers = fleet?.drivers || [];

  return (
    <div className="flex flex-col gap-5">
      <Card className="overflow-hidden">
        <CardHeader title="Ambulances" description="Only ambulances with a driver on shift and a live location are offered for new jobs." />
        {!fleet ? <SkeletonRows /> : ambulances.length === 0 ? (
          <EmptyState icon={Ambulance} title="No ambulances yet" description="Use “Add ambulance” above, then add a driver for it. Until then, dispatch uses the demo fleet." />
        ) : (
          <Table>
            <thead>
              <tr><Th>Vehicle</Th><Th>Status</Th><Th>Driver on shift</Th><Th className="hidden md:table-cell">Location</Th><Th className="hidden lg:table-cell">Drivers</Th><Th className="w-12"><span className="sr-only">Actions</span></Th></tr>
            </thead>
            <tbody>
              {ambulances.map(a => (
                <tr key={a.id} className={cn('hover:bg-slate-50/60', !a.is_active && 'text-slate-400')}>
                  <Td>
                    <p className="font-medium text-slate-900 tabular">{a.vehicle_number}</p>
                    <p className="text-xs text-slate-500">{typeLabel(a.type)}</p>
                  </Td>
                  <Td><AmbulanceStatus a={a} /></Td>
                  <Td>{a.current_driver_name ? <><p className="text-slate-900">{a.current_driver_name}</p><p className="text-xs text-slate-500 tabular">{a.current_driver_phone}</p></> : <span className="text-slate-400">—</span>}</Td>
                  <Td className="hidden md:table-cell"><LocationCell a={a} now={now} /></Td>
                  <Td className="hidden lg:table-cell text-slate-600 tabular">{a.assigned_drivers}</Td>
                  <Td>
                    <Menu>
                      <MenuTrigger><Button variant="ghost" size="icon" aria-label={`Actions for ${a.vehicle_number}`}><MoreHorizontal size={16} /></Button></MenuTrigger>
                      <MenuContent>
                        <MenuItem icon={Pencil} onSelect={() => setEditingAmb({ id: a.id, vehicle_number: a.vehicle_number, type: a.type })}>Edit</MenuItem>
                        {a.is_active
                          ? <MenuItem icon={Archive} tone="danger" onSelect={() => setRetired(a, true)}>Retire</MenuItem>
                          : <MenuItem icon={ArchiveRestore} onSelect={() => setRetired(a, false)}>Return to service</MenuItem>}
                      </MenuContent>
                    </Menu>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Drivers"
          description="Drivers sign in on their phone, start a shift, and share their location."
          actions={<Button variant="secondary" size="sm" onClick={() => setAddingDriver(true)} disabled={!ambulances.some(a => a.is_active)}><UserPlus size={14} /> Add driver</Button>}
        />
        {!fleet ? <SkeletonRows rows={2} /> : drivers.length === 0 ? (
          <EmptyState title="No drivers yet" description={ambulances.some(a => a.is_active) ? 'Add a driver and give them the temporary password to sign in on their phone.' : 'Add an ambulance first.'} />
        ) : (
          <Table>
            <thead>
              <tr><Th>Driver</Th><Th>Ambulance</Th><Th>Account</Th><Th className="w-20">Active</Th><Th className="w-12"><span className="sr-only">Actions</span></Th></tr>
            </thead>
            <tbody>
              {drivers.map(d => (
                <tr key={d.id} className={cn('hover:bg-slate-50/60', !d.is_active && 'text-slate-400')}>
                  <Td>
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <Avatar name={d.name} className={!d.is_active ? 'opacity-50' : ''} />
                      <div className="min-w-0">
                        <p className={cn('font-medium truncate', d.is_active ? 'text-slate-900' : 'text-slate-500')}>{d.name}</p>
                        <p className="text-xs text-slate-500 truncate">{d.email} · <span className="tabular">{d.phone}</span></p>
                      </div>
                    </div>
                  </Td>
                  <Td className="tabular whitespace-nowrap">{d.vehicle_number || <span className="text-slate-400">Not assigned</span>}</Td>
                  <Td><DriverAccount d={d} /></Td>
                  <Td><Switch checked={Boolean(d.is_active)} onCheckedChange={(v) => toggleDriver(d, v)} /></Td>
                  <Td>
                    <Menu>
                      <MenuTrigger><Button variant="ghost" size="icon" aria-label={`Actions for ${d.name}`}><MoreHorizontal size={16} /></Button></MenuTrigger>
                      <MenuContent>
                        <MenuItem icon={Pencil} onSelect={() => setEditingDriver({ id: d.id, name: d.name, phone: d.phone || '', ambulance_id: d.ambulance_id })}>Edit details</MenuItem>
                        <MenuItem icon={KeyRound} disabled={!d.is_active} onSelect={() => resetPassword(d)}>Reset password</MenuItem>
                      </MenuContent>
                    </Menu>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Dialog open={adding} onOpenChange={onAddingChange} title="Add ambulance" className="max-w-lg"
        description="It can take jobs once a driver starts a shift in it and shares their location."
        footer={<><Button variant="secondary" onClick={() => onAddingChange(false)}>Cancel</Button><Button type="submit" form="add-ambulance" disabled={saving}>{saving ? 'Adding…' : 'Add ambulance'}</Button></>}>
        <AmbulanceForm id="add-ambulance" value={ambForm} onChange={setAmbForm} onSubmit={addAmbulance} />
      </Dialog>

      <Sheet open={Boolean(editingAmb)} onOpenChange={(o) => !o && setEditingAmb(null)} title="Edit ambulance"
        footer={<><Button variant="secondary" onClick={() => setEditingAmb(null)}>Cancel</Button><Button type="submit" form="edit-ambulance" disabled={saving}>Save changes</Button></>}>
        {editingAmb && <AmbulanceForm id="edit-ambulance" value={editingAmb} onChange={setEditingAmb} onSubmit={saveAmbulance} />}
      </Sheet>

      <Dialog open={addingDriver} onOpenChange={setAddingDriver} title="Add driver"
        description="We'll create a one-time password for you to give them."
        footer={<><Button variant="secondary" onClick={() => setAddingDriver(false)}>Cancel</Button><Button type="submit" form="add-driver" disabled={saving}>{saving ? 'Creating…' : 'Create account'}</Button></>}>
        <DriverForm id="add-driver" value={driverForm} onChange={setDriverForm} onSubmit={addDriver} ambulances={ambulances} withEmail />
      </Dialog>

      <Sheet open={Boolean(editingDriver)} onOpenChange={(o) => !o && setEditingDriver(null)} title="Edit driver"
        description="A driver on shift must end the shift before moving to another ambulance."
        footer={<><Button variant="secondary" onClick={() => setEditingDriver(null)}>Cancel</Button><Button type="submit" form="edit-driver" disabled={saving}>Save changes</Button></>}>
        {editingDriver && <DriverForm id="edit-driver" value={editingDriver} onChange={setEditingDriver} onSubmit={saveDriver} ambulances={ambulances} />}
      </Sheet>

      <ConfirmDialog action={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};

export default FleetTab;
