import React from 'react';
import { RadioGroup as RRadio } from 'radix-ui';
import { BedDouble, HeartPulse, Stethoscope, MapPin, AlertTriangle, Star } from 'lucide-react';
import { Badge, cn } from '../../src/ui';

// The facts behind a hospital's ranking, as short chips.
const Reasons = ({ option, specialistLabel }) => {
  const f = option.flags || {};
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      <Badge icon={MapPin}>{option.distance_km} km</Badge>
      <Badge tone={f.no_beds ? 'red' : 'neutral'} icon={BedDouble}>{option.beds_available} beds</Badge>
      {option.icu_available > 0
        ? <Badge tone="green" icon={HeartPulse}>{option.icu_available} ICU</Badge>
        : f.icu_unavailable && <Badge tone="red" icon={HeartPulse}>No ICU bed</Badge>}
      {option.specialist_doctors > 0
        ? <Badge tone="green" icon={Stethoscope}>{specialistLabel || 'Specialist'} on duty</Badge>
        : option.emergency_doctors > 0
          ? <Badge tone="blue" icon={Stethoscope}>ER doctor on duty</Badge>
          : <Badge tone="red" icon={AlertTriangle}>No doctor on duty</Badge>}
    </div>
  );
};

/**
 * Ranked hospital choices. The first is recommended; the dispatcher can pick another.
 * The others stay in the list as automatic fallbacks if the chosen one diverts.
 */
const OptionsList = ({ options, value, onChange, specialistLabel }) => (
  <RRadio.Root value={String(value)} onValueChange={(v) => onChange(Number(v))} className="flex flex-col gap-2" aria-label="Choose hospital">
    {options.map((option, i) => (
      <RRadio.Item
        key={option.id}
        value={String(option.id)}
        className={cn(
          'text-left rounded-lg border bg-white px-4 py-3 transition-colors hover:border-slate-300',
          'data-[state=checked]:border-brand-500 data-[state=checked]:ring-2 data-[state=checked]:ring-brand-500/15',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40'
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              {option.name}
              {i === 0 && <Badge tone="blue" icon={Star} className="h-5">Best match</Badge>}
            </p>
            {option.address && <p className="text-xs text-slate-500 line-clamp-1">{option.address}</p>}
          </div>
          <span className={cn('mt-0.5 h-4 w-4 shrink-0 rounded-full border-2', String(value) === String(option.id) ? 'border-brand-600 bg-brand-600 shadow-[inset_0_0_0_3px_white]' : 'border-slate-300')} />
        </div>
        <Reasons option={option} specialistLabel={specialistLabel} />
        {option.receiving_doctor && (
          <p className="text-xs text-slate-500 mt-2">
            Would be received by <span className="font-medium text-slate-700">{option.receiving_doctor.name}</span> · {option.receiving_doctor.department}
          </p>
        )}
      </RRadio.Item>
    ))}
  </RRadio.Root>
);

export default OptionsList;
