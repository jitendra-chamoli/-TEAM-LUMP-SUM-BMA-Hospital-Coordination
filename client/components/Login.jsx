import React, { useState } from 'react';
import { api, getErrorMessage, saveSession } from '../src/api';
import { Mail } from 'lucide-react';
import { Button, Input, PasswordInput, Field } from '../src/ui';

const Login = ({ onSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const response = await api.post('/api/auth/login', { email, password });
            saveSession(response.data.token, response.data.user);
            onSuccess();
        } catch (err) {
            setError(getErrorMessage(err, 'Sign-in failed. Check your email and password.'));
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <Field label="Email" htmlFor="login-email">
                <Input id="login-email" icon={Mail} type="email" autoComplete="email" placeholder="you@hospital.com"
                    value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password" htmlFor="login-password">
                <PasswordInput id="login-password" autoComplete="current-password"
                    value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>

            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

            <Button type="submit" size="lg" disabled={loading} className="w-full mt-1">
                {loading ? 'Signing in…' : 'Sign in'}
            </Button>
        </form>
    );
};

export default Login;
