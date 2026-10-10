import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Dialog, Button } from '../src/ui';

// Shown once after creating an account or resetting a password. The password
// isn't stored anywhere readable, so the admin must pass it on now.
// value = { name, email, password } | null
const TemporaryPasswordDialog = ({ value, onClose }) => {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value.password);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopied(false);
        }
    };

    return (
        <Dialog
            open={Boolean(value)}
            onOpenChange={(open) => !open && onClose()}
            title={value ? `Temporary password for ${value.name}` : ''}
            description="Give this to them in person or by phone. It won't be shown again."
            footer={<Button onClick={onClose}>Done</Button>}
        >
            {value && (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <code className="flex-1 font-mono text-lg tracking-widest text-slate-900 bg-slate-50 border border-line rounded-md px-3 py-2 select-all">
                            {value.password}
                        </code>
                        <Button variant="secondary" onClick={copy}>
                            {copied ? <><Check size={14} className="text-emerald-600" /> Copied</> : <><Copy size={14} /> Copy</>}
                        </Button>
                    </div>
                    <p className="text-sm text-slate-600">
                        They sign in with <span className="font-medium text-slate-900">{value.email}</span> and must choose their own password straight away.
                    </p>
                </div>
            )}
        </Dialog>
    );
};

export default TemporaryPasswordDialog;
