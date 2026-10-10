import React, { useState } from 'react';
import { MoreHorizontal, Pencil, KeyRound, Users } from 'lucide-react';
import { api, getErrorMessage } from '../../src/api';
import { showToast } from '../../src/toast';
import { DEPARTMENTS } from '../../src/constants';
import { formatDateTime } from '../../src/format';
import {
  Card, Table, Th, Td, Badge, Switch, Avatar, Button, Dialog, Sheet, Field, Input, Select,
  Menu, MenuTrigger, MenuContent, MenuItem, EmptyState, SkeletonRows, Tip, cn
} from '../../src/ui';
import ConfirmDialog from '../ConfirmDialog';

const AccountBadge = ({ member }) => {
  if (!member.is_active) return <Badge tone="neutral">Deactivated</Badge>;
  if (member.must_change_password) return <Badge tone="amber" dot>Awaiting first sign-in</Badge>;
  return <Badge tone="green" dot>Active</Badge>;
};

const StaffForm = ({ id, value, onChange, onSubmit, withEmail }) => (
  <form id={id} onSubmit={onSubmit} className="flex flex-col gap-4">
    <Field label="Full name" htmlFor={`${id}-name`}>
      <Input id={`${id}-name`} required autoFocus value={value.name} placeholder="Asha Rawat"
        onChange={(e) => onChange({ ...value, name: e.target.value })} />
    </Field>
    {withEmail && (
      <Field label="Email" htmlFor={`${id}-email`} hint="They'll use this to sign in.">
        <Input id={`${id}-email`} type="email" required value={value.email} placeholder="asha@hospital.com"
          onChange={(e) => onChange({ ...value, email: e.target.value })} />
      </Field>
    )}
    <Field label="Department" htmlFor={`${id}-dept`} hint="Staff can update beds and doctors in this department only.">
      <Select id={`${id}-dept`} value={value.dept} onChange={(e) => onChange({ ...value, dept: e.target.value })}>
        {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
      </Select>
    </Field>
  </form>
);

const emptyForm = { name: '', email: '', dept: 'Emergency' };

const StaffTab = ({ staff, totalCount, loading, adding, onAddingChange, onSaved, onTemporaryPassword }) => {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);   // { id, name, dept }
  const [confirm, setConfirm] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const addStaff = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post('/api/staff/add', form);
      onSaved(res.data.data);
      onAddingChange(false);
      onTemporaryPassword({ name: form.name, email: form.email, password: res.data.temporary_password });
      setForm(emptyForm);
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not create the staff account.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const patch = async (id, changes, message) => {
    setBusyId(id);
    try {
      const res = await api.patch(`/api/staff/${id}`, changes);
      onSaved(res.data.data);
      if (message) showToast(message, 'success');
      return true;
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not update this staff member.'), 'error');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (await patch(editing.id, { name: editing.name, dept: editing.dept }, 'Changes saved.')) setEditing(null);
  };

  const toggleActive = (member, active) => {
    if (active) {
      patch(member.id, { is_active: true }, `${member.name} can sign in again.`);
      return;
    }
    setConfirm({
      title: `Deactivate ${member.name}?`,
      description: 'They are signed out immediately and can no longer sign in. You can reactivate them at any time.',
      confirmLabel: 'Deactivate',
      tone: 'danger',
      run: () => patch(member.id, { is_active: false }, `${member.name} has been deactivated.`)
    });
  };

  const resetPassword = (member) => setConfirm({
    title: `Reset password for ${member.name}?`,
    description: "Their current password stops working and they're signed out. You'll get a new temporary password to give them.",
    confirmLabel: 'Reset password',
    run: async () => {
      try {
        const res = await api.post(`/api/staff/${member.id}/reset-password`);
        onSaved(res.data.data);
        onTemporaryPassword({ name: member.name, email: member.email, password: res.data.temporary_password });
      } catch (err) {
        showToast(getErrorMessage(err, 'Could not reset the password.'), 'error');
      }
    }
  });

  return (
    <>
      <Card className="overflow-hidden">
        {loading ? <SkeletonRows /> : staff.length === 0 ? (
          <EmptyState
            icon={Users}
            title={totalCount === 0 ? 'No staff accounts yet' : 'No staff match these filters'}
            description={totalCount === 0 ? 'Use “Add staff” above. Staff sign in to keep their department’s beds and doctor availability up to date.' : 'Try a different search or department.'}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Department</Th>
                <Th>Account</Th>
                <Th className="hidden md:table-cell">Added</Th>
                <Th className="w-20">Active</Th>
                <Th className="w-12"><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody>
              {staff.map(member => (
                <tr key={member.id} className={cn('hover:bg-slate-50/60', !member.is_active && 'text-slate-400')}>
                  <Td>
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <Avatar name={member.name} className={!member.is_active ? 'opacity-50' : ''} />
                      <div className="min-w-0">
                        <p className={cn('font-medium truncate', member.is_active ? 'text-slate-900' : 'text-slate-500')}>{member.name}</p>
                        <p className="text-xs text-slate-500 truncate">{member.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600">{member.department || '—'}</Td>
                  <Td><AccountBadge member={member} /></Td>
                  <Td className="hidden md:table-cell text-xs text-slate-500 whitespace-nowrap">{formatDateTime(member.created_at)}</Td>
                  <Td>
                    <Tip content={member.is_active ? 'Deactivate account' : 'Reactivate account'}>
                      <span>
                        <Switch checked={Boolean(member.is_active)} disabled={busyId === member.id}
                          onCheckedChange={(v) => toggleActive(member, v)} />
                      </span>
                    </Tip>
                  </Td>
                  <Td>
                    <Menu>
                      <MenuTrigger>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${member.name}`}><MoreHorizontal size={16} /></Button>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem icon={Pencil} onSelect={() => setEditing({ id: member.id, name: member.name, dept: member.department || 'Emergency' })}>
                          Edit details
                        </MenuItem>
                        <MenuItem icon={KeyRound} disabled={!member.is_active} onSelect={() => resetPassword(member)}>
                          Reset password
                        </MenuItem>
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
        title="Add staff account"
        description="We'll create a one-time password for you to give them."
        footer={
          <>
            <Button variant="secondary" onClick={() => onAddingChange(false)}>Cancel</Button>
            <Button type="submit" form="add-staff" disabled={saving}>{saving ? 'Creating…' : 'Create account'}</Button>
          </>
        }
      >
        <StaffForm id="add-staff" value={form} onChange={setForm} onSubmit={addStaff} withEmail />
      </Dialog>

      <Sheet
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit staff member"
        description="Moving someone to another department changes what they can update straight away."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" form="edit-staff" disabled={busyId === editing?.id}>Save changes</Button>
          </>
        }
      >
        {editing && <StaffForm id="edit-staff" value={editing} onChange={setEditing} onSubmit={saveEdit} />}
      </Sheet>

      <ConfirmDialog action={confirm} onClose={() => setConfirm(null)} />
    </>
  );
};

export default StaffTab;
