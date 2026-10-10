import React, { useState } from 'react';
import { api, getErrorMessage, getStoredUser, saveSession } from '../src/api';
import { showToast } from '../src/toast';
import { Button, PasswordInput, Field } from '../src/ui';

// Used both for the forced first-login change (temporary password) and from Settings.
const ChangePassword = ({ forced = false, onDone }) => {
    const [form, setForm] = useState({ current: '', next: '', confirm: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const tooShort = form.next.length > 0 && form.next.length < 8;
    const mismatch = form.confirm.length > 0 && form.next !== form.confirm;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (form.next.length < 8) return setError('Your new password needs at least 8 characters.');
        if (form.next !== form.confirm) return setError("The new passwords don't match.");

        setSaving(true);
        try {
            await api.post('/api/auth/change-password', { current_password: form.current, new_password: form.next });
            const user = getStoredUser();
            if (user) saveSession(null, { ...user, must_change_password: false });
            setForm({ current: '', next: '', confirm: '' });
            showToast('Password updated.', 'success');
            onDone?.();
        } catch (err) {
            setError(getErrorMessage(err, 'Could not update your password.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label={forced ? 'Temporary password' : 'Current password'} htmlFor="pw-current">
                <PasswordInput id="pw-current" required autoComplete="current-password"
                    value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
            </Field>
            <Field label="New password" htmlFor="pw-new" hint="At least 8 characters." error={tooShort ? 'Needs at least 8 characters.' : null}>
                <PasswordInput id="pw-new" required autoComplete="new-password" invalid={tooShort}
                    value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
            </Field>
            <Field label="Confirm new password" htmlFor="pw-confirm" error={mismatch ? "Passwords don't match." : null}>
                <PasswordInput id="pw-confirm" required autoComplete="new-password" invalid={mismatch}
                    value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
            </Field>

            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

            <div>
                <Button type="submit" disabled={saving} size={forced ? 'lg' : 'md'} className={forced ? 'w-full' : ''}>
                    {saving ? 'Saving…' : forced ? 'Set password and continue' : 'Update password'}
                </Button>
            </div>
        </form>
    );
};

export default ChangePassword;
