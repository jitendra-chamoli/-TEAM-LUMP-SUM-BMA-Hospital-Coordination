import React, { useState } from 'react';
import { api, getErrorMessage } from '../src/api';
import { showToast } from '../src/toast';
import { User, Mail, Hospital, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button, Input, PasswordInput, Field, cn } from '../src/ui';
import LocationPicker from './LocationPicker';

const STEPS = ['Admin & hospital', 'Location'];

const StepBar = ({ step }) => (
    <div className="mb-6">
        <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
                <div key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i < step ? 'bg-brand-600' : 'bg-slate-200')} />
            ))}
        </div>
        <p className="text-xs text-slate-500 mt-2">Step {step} of {STEPS.length} · {STEPS[step - 1]}</p>
    </div>
);

const Register = ({ onSuccess }) => {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ name: '', email: '', password: '', hospital_name: '' });
    const [location, setLocation] = useState(null);

    const set = (key) => (e) => setFormData({ ...formData, [key]: e.target.value });

    const submit = async () => {
        setLoading(true);
        try {
            await api.post('/api/auth/register', {
                ...formData,
                address: location.address,
                city: location.city,
                latitude: location.lat,
                longitude: location.lng
            });
            showToast('Hospital registered. Sign in to continue.', 'success');
            onSuccess();
        } catch (err) {
            showToast(getErrorMessage(err, 'Registration failed.'), 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <StepBar step={step} />

            {step === 1 && (
                <form onSubmit={(e) => { e.preventDefault(); setStep(2); }} className="flex flex-col gap-4">
                    <Field label="Your full name" htmlFor="reg-name">
                        <Input id="reg-name" icon={User} placeholder="Priya Sharma" required value={formData.name} onChange={set('name')} />
                    </Field>
                    <Field label="Work email" htmlFor="reg-email">
                        <Input id="reg-email" icon={Mail} type="email" autoComplete="email" placeholder="admin@hospital.com" required value={formData.email} onChange={set('email')} />
                    </Field>
                    <Field label="Password" htmlFor="reg-password" hint="At least 6 characters.">
                        <PasswordInput id="reg-password" autoComplete="new-password" required minLength={6} value={formData.password} onChange={set('password')} />
                    </Field>
                    <Field label="Hospital name" htmlFor="reg-hospital">
                        <Input id="reg-hospital" icon={Hospital} placeholder="City Care Hospital" required value={formData.hospital_name} onChange={set('hospital_name')} />
                    </Field>
                    <Button type="submit" size="lg" className="w-full mt-1">
                        Continue <ArrowRight size={15} />
                    </Button>
                </form>
            )}

            {step === 2 && (
                <div className="flex flex-col gap-4">
                    <LocationPicker value={location} onChange={setLocation} placeholder="Search your hospital's address…" autoFocus />

                    {location && (
                        <Field label="City" htmlFor="reg-city" hint="Emergency dispatch finds hospitals by city, so check this is right.">
                            <Input id="reg-city" required placeholder="e.g. Bengaluru" value={location.city}
                                onChange={(e) => setLocation({ ...location, city: e.target.value })} />
                        </Field>
                    )}

                    <div className="flex gap-2 pt-1">
                        <Button variant="secondary" onClick={() => setStep(1)} disabled={loading}>
                            <ArrowLeft size={15} /> Back
                        </Button>
                        <Button className="flex-1" disabled={!location?.address || !location?.city || loading} onClick={submit}>
                            {loading ? 'Creating your hospital…' : 'Register hospital'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Register;
