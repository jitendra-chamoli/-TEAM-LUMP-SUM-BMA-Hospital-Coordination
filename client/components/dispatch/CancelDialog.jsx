import React, { useState } from 'react';
import { api, getErrorMessage } from '../../src/api';
import { showToast } from '../../src/toast';
import { CANCEL_REASONS } from '../../src/dispatch';
import { Dialog, Button, Field, Select, Input } from '../../src/ui';

// Cancel an active incident with a reason. Releases held beds and frees the ambulance.
const CancelDialog = ({ incident, open, onOpenChange, onCancelled }) => {
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const text = reason === 'Other' ? note.trim() || 'Other' : reason;
      const res = await api.post(`/api/incidents/${incident.id}/cancel`, { reason: text });
      showToast(`Dispatch #${incident.id} cancelled.`, 'success');
      onCancelled?.(res.data);
      onOpenChange(false);
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not cancel this dispatch.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !busy && onOpenChange(v)}
      title={`Cancel dispatch #${incident?.id}?`}
      description="The ambulance is released, held beds are freed, and both hospitals are told."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>Keep dispatch</Button>
          <Button variant="danger" type="submit" form="cancel-incident" disabled={busy}>{busy ? 'Cancelling…' : 'Cancel dispatch'}</Button>
        </>
      }
    >
      <form id="cancel-incident" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Reason" htmlFor="cancel-reason">
          <Select id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {CANCEL_REASONS.map(r => <option key={r}>{r}</option>)}
          </Select>
        </Field>
        {reason === 'Other' && (
          <Field label="Details" htmlFor="cancel-note">
            <Input id="cancel-note" required autoFocus value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          </Field>
        )}
      </form>
    </Dialog>
  );
};

export default CancelDialog;
