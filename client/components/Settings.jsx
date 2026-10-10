import React, { useState, useEffect } from 'react';
import { api, getErrorMessage, getStoredUser, saveSession } from '../src/api';
import { showToast } from '../src/toast';
import { PageHeader, Card, CardHeader, Tabs, TabsList, TabsTrigger, TabsContent, Field, Input, Button, Skeleton } from '../src/ui';
import ChangePassword from './ChangePassword';
import RatesTab from './settings/RatesTab';

const ROLE_LABELS = { admin: 'Hospital admin', staff: 'Staff', doctor: 'Doctor' };

const ProfileTab = ({ user }) => (
  <Card>
    <CardHeader title="Your profile" description="Ask your hospital admin to change your name or department." />
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 px-5 pb-5">
      {[
        ['Name', user.name],
        ['Role', ROLE_LABELS[user.role] || user.role],
        ['Hospital', user.hospital],
        ['Department', user.department || (user.role === 'admin' ? 'All departments' : '—')]
      ].map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className="text-sm font-medium text-slate-900 mt-0.5">{value}</dd>
        </div>
      ))}
    </dl>
  </Card>
);

const HospitalTab = ({ onUserChange }) => {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/hospital')
      .then(res => {
        const value = { name: res.data.name, phone: res.data.phone || '', city: res.data.city, address: res.data.address };
        setForm(value);
        setSaved(value);
      })
      .catch(err => showToast(getErrorMessage(err, 'Could not load hospital details.'), 'error'));
  }, []);

  const dirty = form && saved && Object.keys(form).some(k => form[k] !== saved[k]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.patch('/api/hospital', form);
      const value = { name: res.data.name, phone: res.data.phone || '', city: res.data.city, address: res.data.address };
      setForm(value);
      setSaved(value);
      // Keep the hospital name in the header in sync
      const user = getStoredUser();
      if (user) {
        const next = { ...user, hospital: res.data.name, address: res.data.address };
        saveSession(null, next);
        onUserChange?.(next);
      }
      showToast('Hospital details saved.', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not save hospital details.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Hospital details" description="Emergency dispatch uses the city to find nearby hospitals." />
      {!form ? (
        <div className="px-5 pb-5 space-y-3"><Skeleton className="h-9" /><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
      ) : (
        <form onSubmit={save} className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Hospital name" htmlFor="hosp-name" className="sm:col-span-2">
            <Input id="hosp-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="City" htmlFor="hosp-city">
            <Input id="hosp-city" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </Field>
          <Field label="Front desk phone" htmlFor="hosp-phone">
            <Input id="hosp-phone" type="tel" placeholder="+91 135 271 0000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Address" htmlFor="hosp-address" className="sm:col-span-2">
            <Input id="hosp-address" required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button variant="secondary" disabled={!dirty || saving} onClick={() => setForm(saved)}>Discard</Button>
            <Button type="submit" disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </div>
        </form>
      )}
    </Card>
  );
};

const Settings = ({ user, onUserChange }) => (
  <div className="max-w-3xl">
    <PageHeader title="Settings" description="Your account and hospital preferences." />

    <Tabs defaultValue="profile">
      <TabsList className="mb-5">
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
        {user.role === 'admin' && <TabsTrigger value="hospital">Hospital</TabsTrigger>}
        {user.role === 'admin' && <TabsTrigger value="rates">Rates & schemes</TabsTrigger>}
      </TabsList>

      <TabsContent value="profile"><ProfileTab user={user} /></TabsContent>
      <TabsContent value="password">
        <Card>
          <CardHeader title="Change password" description="You'll stay signed in on this device." />
          <div className="px-5 pb-5 max-w-sm"><ChangePassword /></div>
        </Card>
      </TabsContent>
      {user.role === 'admin' && <TabsContent value="hospital"><HospitalTab onUserChange={onUserChange} /></TabsContent>}
      {user.role === 'admin' && <TabsContent value="rates"><RatesTab /></TabsContent>}
    </Tabs>
  </div>
);

export default Settings;
