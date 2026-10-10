import React, { useState } from 'react';
import { MoreHorizontal, Pencil, CalendarClock, KeyRound, Trash2, Phone, Stethoscope } from 'lucide-react';
import { api, getErrorMessage } from '../../src/api';
import { showToast } from '../../src/toast';
import { DEPARTMENTS } from '../../src/constants';
import { describeShift } from '../../src/format';
import {
  Card, Table, Th, Td, Avatar, Button, Dialog, Sheet, Field, Input, Select,
  Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator, EmptyState, SkeletonRows
} from '../../src/ui';
import ConfirmDialog from '../ConfirmDialog';
import { StatusMenu } from '../DoctorStatus';
import ShiftPlanner from './ShiftPanel';

const emptyForm = { name: '', dept: 'Emergency', specialization: '', phone: '' };

const DoctorForm = ({ id, value, onChange, onSubmit }) => (
  <form id={id} onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <Field label="Full name" htmlFor={`${id}-name`} className="sm:col-span-2">
      <Input id={`${id}-name`} required autoFocus value={value.name} placeholder="Dr. Meera Iyer"
        onChange={(e) => onChange({ ...value, name: e.target.value })} />
    </Field>
    <Field label="Department" htmlFor={`${id}-dept`}>
      <Select id={`${id}-dept`} value={value.dept} onChange={(e) => onChange({ ...value, dept: e.target.value })}>
        {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
      </Select>
    </Field>
    <Field label="Phone" htmlFor={`${id}-phone`} hint="Shown to ambulance crews.">
      <Input id={`${id}-phone`} type="tel" value={value.phone} placeholder="+91 98765 43210"
        onChange={(e) => onChange({ ...value, phone: e.target.value })} />
    </Field>
    <Field label="Specialization" htmlFor={`${id}-spec`} className="sm:col-span-2">
      <Input id={`${id}-spec`} value={value.specialization} placeholder="e.g. Interventional cardiology"
        onChange={(e) => onChange({ ...value, specialization: e.target.value })} />
    </Field>
  </form>
);

const DoctorTab = ({ doctors, totalCount, loading, adding, onAddingChange, onSaved, onRemoved, onTemporaryPassword }) => {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);       // { id, value }
  const [shiftsFor, setShiftsFor] = useState(null);   // doctor
  const [loginFor, setLoginFor] = useState(null);     // { doctor, email }
  const [confirm, setConfirm] = useState(null);

  const request = async (fn, fallback) => {
    try {
      return await fn();
    } catch (err) {
      showToast(getErrorMessage(err, fallback), 'error');
      return null;
    }
  };

  const addDoctor = async (e) => {
    e.preventDefault();
    setSaving(true);
    const res = await request(() => api.post('/api/doctors/add', form), 'Could not add the doctor.');
    setSaving(false);
    if (!res) return;
    onSaved(res.data.data);
    onAddingChange(false);
    showToast(`${form.name} added to the roster.`, 'success');
    setForm(emptyForm);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const res = await request(() => api.patch(`/api/doctors/${editing.id}`, editing.value), 'Could not save changes.');
    setSaving(false);
    if (!res) return;
    onSaved(res.data.data);
    setEditing(null);
    showToast('Changes saved.', 'success');
  };

  const changeStatus = async (doc, status) => {
    onSaved({ ...doc, status }); // optimistic
    const res = await request(() => api.post(`/api/doctors/${doc.id}/status`, { status }), 'Could not change status.');
    onSaved(res ? res.data.data : doc);
  };

  const createLogin = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { doctor, email } = loginFor;
    const res = await request(() => api.post(`/api/doctors/${doctor.id}/login`, { email }), 'Could not create the sign-in.');
    setSaving(false);
    if (!res) return;
    onSaved(res.data.data);
    setLoginFor(null);
    onTemporaryPassword({ name: doctor.doctor_name, email: res.data.data.login_email, password: res.data.temporary_password });
  };

  const resetLogin = (doc) => setConfirm({
    title: `Reset sign-in for ${doc.doctor_name}?`,
    description: "Their current password stops working and they're signed out. You'll get a new temporary password.",
    confirmLabel: 'Reset password',
    run: async () => {
      const res = await request(() => api.post(`/api/doctors/${doc.id}/login`, { email: doc.login_email }), 'Could not reset the sign-in.');
      if (!res) return;
      onSaved(res.data.data);
      onTemporaryPassword({ name: doc.doctor_name, email: doc.login_email, password: res.data.temporary_password });
    }
  });

  const remove = (doc) => setConfirm({
    title: `Remove ${doc.doctor_name}?`,
    description: `This deletes their shifts${doc.login_email ? ' and sign-in' : ''}. Past incidents keep their history.`,
    confirmLabel: 'Remove doctor',
    tone: 'danger',
    run: async () => {
      const res = await request(() => api.delete(`/api/doctors/${doc.id}`), 'Could not remove the doctor.');
      if (!res) return;
      onRemoved(doc.id);
      showToast(`${doc.doctor_name} removed from the roster.`, 'success');
    }
  });

  return (
    <>
      <Card className="overflow-hidden">
        {loading ? <SkeletonRows /> : doctors.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title={totalCount === 0 ? 'No doctors on the roster' : 'No doctors match these filters'}
            description={totalCount === 0 ? 'Use “Add doctor” above. Dispatch only sends patients to hospitals with an Emergency or Trauma doctor on duty or on call.' : 'Try a different search or department.'}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Doctor</Th>
                <Th>Department</Th>
                <Th>Status</Th>
                <Th className="hidden lg:table-cell">Schedule</Th>
                <Th className="hidden md:table-cell">Sign-in</Th>
                <Th className="w-12"><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody>
              {doctors.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50/60">
                  <Td>
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <Avatar name={doc.doctor_name} />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{doc.doctor_name}</p>
                        <p className="text-xs text-slate-500 truncate flex items-center gap-2">
                          {doc.specialization}
                          {doc.phone && <span className="inline-flex items-center gap-1"><Phone size={10} />{doc.phone}</span>}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600">{doc.department}</Td>
                  <Td><StatusMenu status={doc.status} onChange={(s) => changeStatus(doc, s)} label={`Status for ${doc.doctor_name}`} /></Td>
                  <Td className="hidden lg:table-cell text-xs text-slate-500 whitespace-nowrap">
                    {describeShift(doc.next_shift_start, doc.next_shift_end) || <span className="text-slate-400">No shifts planned</span>}
                  </Td>
                  <Td className="hidden md:table-cell text-xs">
                    {doc.login_email ? <span className="text-slate-600">{doc.login_email}</span> : <span className="text-slate-400">—</span>}
                  </Td>
                  <Td>
                    <Menu>
                      <MenuTrigger>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${doc.doctor_name}`}><MoreHorizontal size={16} /></Button>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem icon={Pencil} onSelect={() => setEditing({
                          id: doc.id,
                          value: { name: doc.doctor_name, dept: doc.department, specialization: doc.specialization || '', phone: doc.phone || '' }
                        })}>Edit details</MenuItem>
                        <MenuItem icon={CalendarClock} onSelect={() => setShiftsFor(doc)}>Plan shifts</MenuItem>
                        {doc.login_email
                          ? <MenuItem icon={KeyRound} onSelect={() => resetLogin(doc)}>Reset sign-in</MenuItem>
                          : <MenuItem icon={KeyRound} onSelect={() => setLoginFor({ doctor: doc, email: '' })}>Give sign-in</MenuItem>}
                        <MenuSeparator />
                        <MenuItem icon={Trash2} tone="danger" onSelect={() => remove(doc)}>Remove from roster</MenuItem>
                      </MenuContent>
                    </Menu>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Dialog
        open={adding}
        onOpenChange={onAddingChange}
        title="Add doctor"
        description="New doctors start as Off duty. Plan shifts or change their status from the roster."
        className="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => onAddingChange(false)}>Cancel</Button>
            <Button type="submit" form="add-doctor" disabled={saving}>{saving ? 'Adding…' : 'Add doctor'}</Button>
          </>
        }
      >
        <DoctorForm id="add-doctor" value={form} onChange={setForm} onSubmit={addDoctor} />
      </Dialog>

      <Sheet
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit doctor"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" form="edit-doctor" disabled={saving}>Save changes</Button>
          </>
        }
      >
        {editing && <DoctorForm id="edit-doctor" value={editing.value} onChange={(value) => setEditing({ ...editing, value })} onSubmit={saveEdit} />}
      </Sheet>

      <Sheet
        open={Boolean(shiftsFor)}
        onOpenChange={(open) => !open && setShiftsFor(null)}
        title={shiftsFor ? `Shifts · ${shiftsFor.doctor_name}` : ''}
        description="When a shift starts they go On duty, and when it ends Off duty. Manual changes in between always win."
        className="sm:max-w-xl"
      >
        {shiftsFor && <ShiftPlanner doctor={shiftsFor} />}
      </Sheet>

      <Dialog
        open={Boolean(loginFor)}
        onOpenChange={(open) => !open && setLoginFor(null)}
        title={loginFor ? `Give ${loginFor.doctor.doctor_name} a sign-in` : ''}
        description="They'll be able to update their own status. We'll create a one-time password for you to give them."
        footer={
          <>
            <Button variant="secondary" onClick={() => setLoginFor(null)}>Cancel</Button>
            <Button type="submit" form="doctor-login" disabled={saving}>{saving ? 'Creating…' : 'Create sign-in'}</Button>
          </>
        }
      >
        {loginFor && (
          <form id="doctor-login" onSubmit={createLogin}>
            <Field label="Doctor's email" htmlFor="doctor-login-email">
              <Input id="doctor-login-email" type="email" required autoFocus placeholder="doctor@hospital.com"
                value={loginFor.email} onChange={(e) => setLoginFor({ ...loginFor, email: e.target.value })} />
            </Field>
          </form>
        )}
      </Dialog>

      <ConfirmDialog action={confirm} onClose={() => setConfirm(null)} />
    </>
  );
};

export default DoctorTab;
