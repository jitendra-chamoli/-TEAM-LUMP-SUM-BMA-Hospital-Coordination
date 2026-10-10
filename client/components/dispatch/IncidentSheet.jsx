import React from 'react';
import { Sheet } from '../../src/ui';
import IncidentView from './IncidentView';

// Side panel with the full, live detail of one incident.
const IncidentSheet = ({ incidentId, onClose }) => (
  <Sheet
    open={Boolean(incidentId)}
    onOpenChange={(open) => !open && onClose()}
    title={incidentId ? `Dispatch #${incidentId}` : ''}
    className="sm:max-w-xl"
  >
    {incidentId && <IncidentView incidentId={incidentId} layout="sheet" />}
  </Sheet>
);

export default IncidentSheet;
