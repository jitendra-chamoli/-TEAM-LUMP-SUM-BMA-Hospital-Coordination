import React, { useState } from 'react';
import { Phone, CalendarClock, Stethoscope } from 'lucide-react';
import { describeShift } from '../../src/format';
import { Card, CardHeader, Segmented, Avatar, Badge, EmptyState } from '../../src/ui';
import { StatusMenu } from '../DoctorStatus';

const FILTERS = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'available', label: 'Available', dot: 'bg-emerald-500', test: d => d.status === 'on_duty' || d.status === 'on_call' },
  { value: 'in_surgery', label: 'In surgery', dot: 'bg-amber-500', test: d => d.status === 'in_surgery' },
  { value: 'off_duty', label: 'Off duty', dot: 'bg-slate-400', test: d => d.status === 'off_duty' }
];

// Compact doctor list grouped by department, filterable by status.
const DoctorList = ({ doctors, user, canEdit, onStatusChange }) => {
  const [filter, setFilter] = useState('all');
  const test = FILTERS.find(f => f.value === filter).test;
  const visible = doctors.filter(test);
  const departments = [...new Set(visible.map(d => d.department))].sort();

  return (
    <Card>
      <CardHeader
        title="Doctors"
        description={user.role === 'admin' ? 'All departments' : `${user.dept} department`}
        actions={
          <Segmented value={filter} onChange={setFilter} aria-label="Filter doctors by status"
            options={FILTERS.map(f => ({ value: f.value, label: f.label, dot: f.dot, count: doctors.filter(f.test).length }))} />
        }
      />
      {visible.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title={doctors.length === 0 ? 'No doctors yet' : 'No doctors with this status'}
          description={doctors.length === 0
            ? (user.role === 'admin' ? 'Add doctors from Staff & roster.' : `No doctors are registered for ${user.dept} yet.`)
            : null}
        />
      ) : (
        <div className="border-t border-line">
          {departments.map(dept => (
            <section key={dept}>
              {user.role === 'admin' && (
                <h4 className="px-5 py-1.5 text-xs font-medium text-slate-500 bg-slate-50/70 border-b border-line">{dept}</h4>
              )}
              <ul className="divide-y divide-line">
                {visible.filter(d => d.department === dept).map(doc => {
                  const isSelf = user.role === 'doctor' && user.doctor_id === doc.id;
                  const shift = describeShift(doc.next_shift_start, doc.next_shift_end);
                  return (
                    <li key={doc.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5">
                      <div className="flex items-center gap-3 min-w-0 flex-1 basis-56">
                        <Avatar name={doc.doctor_name} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {doc.doctor_name} {isSelf && <Badge tone="blue" className="ml-1 h-5">You</Badge>}
                          </p>
                          <p className="text-xs text-slate-500 truncate">{doc.specialization || doc.department}</p>
                        </div>
                      </div>
                      <div className="hidden md:flex items-center gap-4 text-xs text-slate-500">
                        {doc.phone && <span className="inline-flex items-center gap-1 tabular"><Phone size={12} />{doc.phone}</span>}
                        {shift && <span className="inline-flex items-center gap-1"><CalendarClock size={12} />{shift}</span>}
                      </div>
                      <StatusMenu status={doc.status} onChange={canEdit(doc) ? (s) => onStatusChange(doc.id, s) : null} label={`Status for ${doc.doctor_name}`} />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
};

export default DoctorList;
