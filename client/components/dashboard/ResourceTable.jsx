import React, { useState } from 'react';
import { Plus, Lock } from 'lucide-react';
import { DEFAULT_RESOURCES, DEPARTMENTS } from '../../src/constants';
import { Card, CardHeader, Table, Th, Td, Stepper, Progress, Input, Select, Switch, Button, Tip, EmptyState } from '../../src/ui';

// Capacity is edited inline in "edit capacity" mode; blank clears it.
const CapacityInput = ({ value, onCommit, label }) => {
  const [draft, setDraft] = useState(value ?? '');
  const [shown, setShown] = useState(value);
  if (value !== shown) { setShown(value); setDraft(value ?? ''); }

  const commit = () => {
    const next = draft === '' ? null : Math.max(0, parseInt(draft, 10));
    if (next !== (value ?? null) && !Number.isNaN(next)) onCommit(next);
  };

  return (
    <Input
      value={draft}
      inputMode="numeric"
      placeholder="Total"
      aria-label={`${label} capacity`}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="h-7 w-20 text-xs tabular"
    />
  );
};

const ResourceCell = ({ record, canEdit, editCapacity, label, onCount, onCapacity }) => {
  const count = record?.current_count ?? 0;
  const capacity = record?.capacity;

  return (
    <div className="flex flex-col gap-1.5 min-w-[150px]">
      <div className="flex items-center gap-2">
        {canEdit ? (
          <Stepper size="sm" value={count} label={label} onCommit={onCount} />
        ) : (
          <span className="text-sm font-semibold tabular text-slate-900 w-[94px]">{record ? count : '—'}</span>
        )}
        {editCapacity && canEdit ? (
          <CapacityInput value={capacity} label={label} onCommit={onCapacity} />
        ) : capacity ? (
          <span className="text-xs text-slate-500 tabular">of {capacity}</span>
        ) : null}
      </div>
      {capacity ? <Progress value={count} max={capacity} className="w-[150px]" /> : (
        record && count === 0 ? <span className="text-[11px] font-medium text-red-600">None available</span> : null
      )}
    </div>
  );
};

/**
 * Departments × resource types. Admins see every department they track and can
 * start tracking another; staff and doctors see their own department only.
 */
const ResourceTable = ({ resources, user, onUpdate, onInit }) => {
  const isAdmin = user.role === 'admin';
  const [editCapacity, setEditCapacity] = useState(false);
  const [extraDepts, setExtraDepts] = useState([]);

  const trackedDepts = [...new Set(resources.map(r => r.department))];
  const departments = isAdmin
    ? DEPARTMENTS.filter(d => trackedDepts.includes(d) || extraDepts.includes(d))
    : [user.dept].filter(Boolean);
  const untracked = DEPARTMENTS.filter(d => !departments.includes(d));

  const find = (dept, type) => resources.find(r => r.department === dept && r.resource_name.toLowerCase() === type.toLowerCase());
  const canEdit = (dept) => isAdmin || (user.role === 'staff' && user.dept === dept);

  return (
    <Card>
      <CardHeader
        title="Beds & equipment"
        description={isAdmin ? 'Available units by department. Click a number to type it, or use − and +.' : `${user.dept} department`}
        actions={
          <>
            {(isAdmin || user.role === 'staff') && (
              <Switch id="edit-capacity" checked={editCapacity} onCheckedChange={setEditCapacity} label="Edit capacity" />
            )}
            {isAdmin && untracked.length > 0 && (
              <div className="w-44">
                <Select size="sm" value="" aria-label="Track another department"
                  onChange={(e) => e.target.value && setExtraDepts(prev => [...prev, e.target.value])}>
                  <option value="">+ Add department</option>
                  {untracked.map(d => <option key={d} value={d}>{d}</option>)}
                </Select>
              </div>
            )}
          </>
        }
      />
      {departments.length === 0 ? (
        <EmptyState
          title="No departments tracked yet"
          description="Add a department to start recording its beds, ICU and ventilators."
          action={isAdmin && <Button size="sm" onClick={() => setExtraDepts(['Emergency'])}><Plus size={14} /> Track Emergency</Button>}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th className="w-48">Department</Th>
              {DEFAULT_RESOURCES.map(type => <Th key={type}>{type}</Th>)}
            </tr>
          </thead>
          <tbody>
            {departments.map(dept => (
              <tr key={dept}>
                <Td className="font-medium text-slate-900 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    {dept}
                    {!canEdit(dept) && <Tip content="View only"><Lock size={12} className="text-slate-400" /></Tip>}
                  </span>
                </Td>
                {DEFAULT_RESOURCES.map(type => {
                  const record = find(dept, type);
                  return (
                    <Td key={type}>
                      <ResourceCell
                        record={record}
                        label={`${dept} ${type}`}
                        canEdit={canEdit(dept)}
                        editCapacity={editCapacity}
                        onCount={(value) => record ? onUpdate(record.id, { newValue: value }) : onInit({ name: type, department: dept, value })}
                        onCapacity={(capacity) => record ? onUpdate(record.id, { capacity }) : onInit({ name: type, department: dept, value: 0, capacity })}
                      />
                    </Td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
};

export default ResourceTable;
