import React, { useState } from 'react';
import { Dialog, Button } from '../src/ui';

// Confirmation for destructive or account-changing actions (browser confirm() is avoided).
// `action` = { title, description, confirmLabel, tone: 'danger' | 'primary', run: async () => {} } or null.
const ConfirmDialog = ({ action, onClose }) => {
    const [busy, setBusy] = useState(false);

    const confirm = async () => {
        setBusy(true);
        try {
            await action.run();
            onClose();
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog
            open={Boolean(action)}
            onOpenChange={(open) => !open && !busy && onClose()}
            title={action?.title}
            description={action?.description}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
                    <Button variant={action?.tone === 'danger' ? 'danger' : 'primary'} onClick={confirm} disabled={busy}>
                        {busy ? 'Working…' : action?.confirmLabel || 'Confirm'}
                    </Button>
                </>
            }
        >
            {action?.body || null}
        </Dialog>
    );
};

export default ConfirmDialog;
