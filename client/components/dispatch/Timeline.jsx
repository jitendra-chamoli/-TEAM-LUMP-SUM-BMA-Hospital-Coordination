import React from 'react';
import { Check, X } from 'lucide-react';
import { TIMELINE } from '../../src/dispatch';
import { cn } from '../../src/ui';

const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

// Vertical list of lifecycle steps; done steps show their time, the next one is highlighted.
const Timeline = ({ incident, compact }) => {
  const cancelled = incident.status === 'cancelled';
  const steps = TIMELINE.filter(s => !(cancelled && !incident[s.key]));
  const nextIndex = steps.findIndex(s => !incident[s.key]);

  return (
    <ol className={cn('flex flex-col', compact ? 'gap-2' : 'gap-3')}>
      {steps.map((step, i) => {
        const done = Boolean(incident[step.key]);
        const current = !cancelled && i === nextIndex;
        return (
          <li key={step.key} className="flex items-center gap-3">
            <span className={cn(
              'h-5 w-5 shrink-0 rounded-full flex items-center justify-center border',
              done ? 'bg-emerald-500 border-emerald-500 text-white' : current ? 'border-brand-500 bg-brand-50' : 'border-line bg-white'
            )}>
              {done ? <Check size={12} strokeWidth={3} /> : current ? <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" /> : null}
            </span>
            <span className={cn('text-sm flex-1', done ? 'text-slate-900' : current ? 'text-slate-900 font-medium' : 'text-slate-400')}>{step.label}</span>
            {done && <span className="text-xs text-slate-500 tabular">{time.format(new Date(incident[step.key]))}</span>}
          </li>
        );
      })}
      {cancelled && (
        <li className="flex items-center gap-3">
          <span className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center bg-red-500 text-white"><X size={12} strokeWidth={3} /></span>
          <span className="text-sm text-slate-900 flex-1">Cancelled{incident.cancel_reason ? ` · ${incident.cancel_reason}` : ''}</span>
          <span className="text-xs text-slate-500 tabular">{time.format(new Date(incident.cancelled_at))}</span>
        </li>
      )}
    </ol>
  );
};

export default Timeline;
