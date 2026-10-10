import React from 'react';
import { ChevronDown } from 'lucide-react';
import { DOCTOR_STATUSES, doctorStatus } from '../src/constants';
import { Badge, Segmented, Menu, MenuTrigger, MenuContent, MenuRadioGroup, MenuRadioItem, cn } from '../src/ui';

export const StatusPill = ({ status }) => {
    const s = doctorStatus(status);
    return <Badge tone={s.tone} dot>{s.label}</Badge>;
};

// Coloured badge that opens a 4-option menu. Falls back to a plain badge when read-only.
export const StatusMenu = ({ status, onChange, disabled, label = 'Change status' }) => {
    const s = doctorStatus(status);
    if (!onChange || disabled) return <StatusPill status={status} />;

    return (
        <Menu>
            <MenuTrigger>
                <button
                    aria-label={`${label}: ${s.label}`}
                    className="group inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                >
                    <Badge tone={s.tone} dot className="pr-1.5 cursor-pointer group-hover:brightness-95">
                        {s.label}
                        <ChevronDown size={12} className="opacity-60" />
                    </Badge>
                </button>
            </MenuTrigger>
            <MenuContent align="start" className="min-w-[170px]">
                <MenuRadioGroup value={status} onValueChange={(v) => v !== status && onChange(v)}>
                    {DOCTOR_STATUSES.map(opt => (
                        <MenuRadioItem key={opt.value} value={opt.value}>
                            <span className={cn('h-2 w-2 rounded-full', opt.dot)} />
                            <span className="flex-1">{opt.label}</span>
                            {opt.hint && <span className="text-[11px] text-slate-400">{opt.hint}</span>}
                        </MenuRadioItem>
                    ))}
                </MenuRadioGroup>
            </MenuContent>
        </Menu>
    );
};

// Large segmented control for a doctor setting their own status.
export const StatusToggle = ({ value, onChange }) => (
    <Segmented
        size="md"
        value={value}
        onChange={onChange}
        aria-label="Your status"
        options={DOCTOR_STATUSES.map(s => ({ value: s.value, label: s.label, dot: s.dot }))}
    />
);
