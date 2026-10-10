// Shared UI primitives. Every screen builds from these so sizes, radii and
// colours stay consistent. Interactive widgets (switch, menus, dialogs, tabs,
// toggle groups, tooltips, radio cards) wrap Radix for keyboard and screen-reader support.

import React, { useState } from 'react';
import { twMerge } from 'tailwind-merge';
import {
    Switch as RSwitch, Tabs as RTabs, ToggleGroup as RToggleGroup, DropdownMenu as RMenu,
    Dialog as RDialog, Tooltip as RTooltip, RadioGroup as RRadio
} from 'radix-ui';
import { ChevronDown, Eye, EyeOff, Minus, Plus, X, Check } from 'lucide-react';

export const cn = (...classes) => twMerge(classes.filter(Boolean).join(' '));

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1';

// ---------------- Button ---------------- //

const BUTTON_VARIANTS = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
    secondary: 'bg-white text-slate-700 border border-line hover:bg-slate-50 hover:text-slate-900 shadow-xs',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
    'danger-ghost': 'text-red-600 hover:bg-red-50',
    dark: 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm'
};

const BUTTON_SIZES = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-9 px-3.5 text-sm gap-2',
    lg: 'h-10 px-5 text-sm gap-2',
    icon: 'h-8 w-8 justify-center',
    'icon-sm': 'h-7 w-7 justify-center'
};

export const Button = React.forwardRef(({ variant = 'primary', size = 'md', className, children, type = 'button', ...props }, ref) => (
    <button
        ref={ref}
        type={type}
        className={cn(
            'inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors select-none',
            'disabled:opacity-50 disabled:pointer-events-none [&_svg]:shrink-0',
            focusRing, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className
        )}
        {...props}
    >
        {children}
    </button>
));
Button.displayName = 'Button';

// ---------------- Form fields ---------------- //

const fieldBase = 'w-full h-9 rounded-md border border-line bg-white text-sm text-slate-900 placeholder:text-slate-400 transition-colors ' +
    'hover:border-slate-300 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-slate-400';

export const Input = React.forwardRef(({ icon: Icon, right, className, invalid, ...props }, ref) => (
    <div className="relative">
        {Icon && <Icon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />}
        <input
            ref={ref}
            aria-invalid={invalid || undefined}
            className={cn(fieldBase, Icon ? 'pl-9' : 'pl-3', right ? 'pr-10' : 'pr-3', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-500/20', className)}
            {...props}
        />
        {right && <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">{right}</div>}
    </div>
));
Input.displayName = 'Input';
export const TextInput = Input;

export const PasswordInput = React.forwardRef((props, ref) => {
    const [visible, setVisible] = useState(false);
    return (
        <Input
            ref={ref}
            type={visible ? 'text' : 'password'}
            right={
                <button type="button" onClick={() => setVisible(v => !v)}
                    className={cn('h-7 w-7 rounded flex items-center justify-center text-slate-400 hover:text-slate-700', focusRing)}
                    aria-label={visible ? 'Hide password' : 'Show password'}>
                    {visible ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
            }
            {...props}
        />
    );
});
PasswordInput.displayName = 'PasswordInput';

export const Select = React.forwardRef(({ className, children, size = 'md', ...props }, ref) => (
    <div className="relative">
        <select
            ref={ref}
            className={cn(fieldBase, 'appearance-none pl-3 pr-8 cursor-pointer', size === 'sm' && 'h-8 text-xs', className)}
            {...props}
        >
            {children}
        </select>
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
));
Select.displayName = 'Select';

export const Label = ({ className, children, ...props }) => (
    <label className={cn('block text-xs font-medium text-slate-700 mb-1.5', className)} {...props}>{children}</label>
);
export const FieldLabel = Label;

export const Field = ({ label, htmlFor, hint, error, className, children }) => (
    <div className={className}>
        {label && <Label htmlFor={htmlFor}>{label}</Label>}
        {children}
        {error ? <p className="text-xs text-red-600 mt-1.5">{error}</p> : hint && <p className="text-xs text-slate-500 mt-1.5">{hint}</p>}
    </div>
);

// ---------------- Surfaces ---------------- //

export const Card = ({ className, children, ...props }) => (
    <div className={cn('bg-white rounded-xl border border-line', className)} {...props}>{children}</div>
);

export const CardHeader = ({ title, description, actions, className }) => (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
        <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 max-w-full min-w-0">{actions}</div>}
    </div>
);

export const SectionLabel = ({ icon: Icon, iconColor = 'text-slate-400', children }) => (
    <div className="flex items-center gap-2">
        {Icon && <Icon size={16} className={iconColor} />}
        <h3 className="text-sm font-semibold text-slate-900">{children}</h3>
    </div>
);

export const PageHeader = ({ title, description, actions }) => (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 text-balance">{title}</h1>
            {description && <p className="text-sm text-slate-500 mt-1 max-w-2xl">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
);

export const EmptyState = ({ icon: Icon, title, description, action, className }) => (
    <div className={cn('flex flex-col items-center text-center px-6 py-12', className)}>
        {Icon && <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3"><Icon size={18} /></div>}
        <p className="text-sm font-medium text-slate-900">{title}</p>
        {description && <p className="text-sm text-slate-500 mt-1 max-w-sm">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
    </div>
);

export const Skeleton = ({ className }) => <div className={cn('animate-pulse rounded-md bg-slate-200/70', className)} />;

export const SkeletonRows = ({ rows = 4, className }) => (
    <div className={cn('divide-y divide-line', className)}>
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-1/5" /></div>
                <Skeleton className="h-6 w-20" />
            </div>
        ))}
    </div>
);

// ---------------- Badge ---------------- //

const BADGE_TONES = {
    neutral: 'bg-slate-100 text-slate-600 border-slate-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    blue: 'bg-brand-50 text-brand-700 border-brand-100',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200'
};
const DOT_TONES = { neutral: 'bg-slate-400', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500', blue: 'bg-brand-500', sky: 'bg-sky-500', violet: 'bg-violet-500' };

export const Badge = ({ tone = 'neutral', dot, icon: Icon, className, children }) => (
    <span className={cn('inline-flex items-center gap-1.5 h-6 px-2 rounded-md border text-xs font-medium whitespace-nowrap', BADGE_TONES[tone], className)}>
        {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOT_TONES[tone])} />}
        {Icon && <Icon size={12} />}
        {children}
    </span>
);

// ---------------- Progress ---------------- //

// Colour follows how much is left: under 20% red, under 40% amber.
export const Progress = ({ value, max, className }) => {
    const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    const color = pct < 20 ? 'bg-red-500' : pct < 40 ? 'bg-amber-500' : 'bg-emerald-500';
    return (
        <div className={cn('h-1.5 w-full rounded-full bg-slate-100 overflow-hidden', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
            <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
        </div>
    );
};

// ---------------- Switch ---------------- //

export const Switch = ({ checked, onCheckedChange, disabled, id, label, className }) => (
    <span className={cn('inline-flex items-center gap-2', className)}>
        <RSwitch.Root
            id={id}
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
            className={cn('relative h-5 w-9 shrink-0 rounded-full bg-slate-300 transition-colors data-[state=checked]:bg-brand-600 disabled:opacity-50 cursor-pointer', focusRing)}
        >
            <RSwitch.Thumb className="block h-4 w-4 rounded-full bg-white shadow-sm transition-transform translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
        </RSwitch.Root>
        {label && <label htmlFor={id} className="text-sm text-slate-700 cursor-pointer select-none">{label}</label>}
    </span>
);

// ---------------- Tabs (underline) ---------------- //

export const Tabs = RTabs.Root;
export const TabsContent = ({ className, ...props }) => <RTabs.Content className={cn('focus-visible:outline-none', className)} {...props} />;
export const TabsList = ({ className, ...props }) => (
    <RTabs.List className={cn('flex items-center gap-1 border-b border-line', className)} {...props} />
);
export const TabsTrigger = ({ className, children, count, ...props }) => (
    <RTabs.Trigger
        className={cn(
            'relative -mb-px inline-flex items-center gap-2 h-10 px-3 text-sm font-medium text-slate-500 border-b-2 border-transparent transition-colors',
            'hover:text-slate-900 data-[state=active]:text-slate-900 data-[state=active]:border-brand-600', focusRing, className
        )}
        {...props}
    >
        {children}
        {count !== undefined && <span className="tabular text-xs px-1.5 rounded bg-slate-100 text-slate-600">{count}</span>}
    </RTabs.Trigger>
);

// ---------------- Segmented control (single-choice toggle group) ---------------- //

export const Segmented = ({ value, onChange, options, size = 'sm', className, 'aria-label': ariaLabel }) => (
    <RToggleGroup.Root
        type="single"
        value={value}
        onValueChange={(v) => v && onChange(v)}
        aria-label={ariaLabel}
        className={cn('inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 border border-line max-w-full overflow-x-auto', className)}
    >
        {options.map(opt => (
            <RToggleGroup.Item
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
                className={cn(
                    'inline-flex items-center gap-1.5 rounded-md font-medium text-slate-500 transition-colors whitespace-nowrap',
                    size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
                    'hover:text-slate-900 data-[state=on]:bg-white data-[state=on]:text-slate-900 data-[state=on]:shadow-sm disabled:opacity-40',
                    focusRing
                )}
            >
                {opt.dot && <span className={cn('h-1.5 w-1.5 rounded-full', opt.dot)} />}
                {opt.icon && <opt.icon size={13} />}
                {opt.label}
                {opt.count !== undefined && <span className="tabular text-[11px] text-slate-400">{opt.count}</span>}
            </RToggleGroup.Item>
        ))}
    </RToggleGroup.Root>
);

// ---------------- Dropdown menu ---------------- //

export const Menu = RMenu.Root;
export const MenuTrigger = (props) => <RMenu.Trigger asChild {...props} />;

export const MenuContent = ({ className, align = 'end', children, ...props }) => (
    <RMenu.Portal>
        <RMenu.Content
            align={align}
            sideOffset={4}
            className={cn(
                'z-50 min-w-[180px] rounded-lg border border-line bg-white p-1 shadow-lg',
                'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
                className
            )}
            {...props}
        >
            {children}
        </RMenu.Content>
    </RMenu.Portal>
);

export const MenuItem = ({ icon: Icon, tone, className, children, ...props }) => (
    <RMenu.Item
        className={cn(
            'flex items-center gap-2 h-8 px-2 rounded-md text-sm cursor-pointer outline-none select-none',
            tone === 'danger' ? 'text-red-600 data-[highlighted]:bg-red-50' : 'text-slate-700 data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900',
            'data-[disabled]:opacity-40 data-[disabled]:pointer-events-none', className
        )}
        {...props}
    >
        {Icon && <Icon size={14} className={tone === 'danger' ? '' : 'text-slate-400'} />}
        {children}
    </RMenu.Item>
);

export const MenuRadioGroup = RMenu.RadioGroup;
export const MenuRadioItem = ({ className, children, ...props }) => (
    <RMenu.RadioItem
        className={cn('flex items-center gap-2 h-8 pl-2 pr-7 rounded-md text-sm cursor-pointer outline-none select-none relative text-slate-700 data-[highlighted]:bg-slate-100', className)}
        {...props}
    >
        {children}
        <RMenu.ItemIndicator className="absolute right-2"><Check size={14} className="text-brand-600" /></RMenu.ItemIndicator>
    </RMenu.RadioItem>
);

export const MenuSeparator = () => <RMenu.Separator className="my-1 h-px bg-line" />;
export const MenuLabel = ({ children }) => <RMenu.Label className="px-2 py-1.5 text-xs font-medium text-slate-500">{children}</RMenu.Label>;

// ---------------- Dialog & Sheet ---------------- //

const overlayClass = 'fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0';

const DialogHeaderBlock = ({ title, description }) => (
    <div className="pr-8">
        <RDialog.Title className="text-base font-semibold text-slate-900">{title}</RDialog.Title>
        {description
            ? <RDialog.Description className="text-sm text-slate-500 mt-1">{description}</RDialog.Description>
            : <RDialog.Description className="sr-only">{title}</RDialog.Description>}
    </div>
);

const CloseButton = () => (
    <RDialog.Close asChild>
        <button className={cn('absolute right-3 top-3 h-8 w-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100', focusRing)} aria-label="Close">
            <X size={16} />
        </button>
    </RDialog.Close>
);

export const Dialog = ({ open, onOpenChange, title, description, children, footer, className }) => (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
        <RDialog.Portal>
            <RDialog.Overlay className={overlayClass} />
            <RDialog.Content
                className={cn(
                    'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-white shadow-xl',
                    'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
                    className
                )}
            >
                <div className={cn('p-5', children && 'pb-0')}><DialogHeaderBlock title={title} description={description} /></div>
                <CloseButton />
                {children && <div className="p-5">{children}</div>}
                {footer && <div className="flex justify-end gap-2 px-5 py-3 border-t border-line bg-slate-50/60 rounded-b-xl">{footer}</div>}
            </RDialog.Content>
        </RDialog.Portal>
    </RDialog.Root>
);

export const Sheet = ({ open, onOpenChange, title, description, children, footer, className }) => (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
        <RDialog.Portal>
            <RDialog.Overlay className={overlayClass} />
            <RDialog.Content
                className={cn(
                    'fixed inset-y-0 right-0 z-50 flex flex-col w-full sm:max-w-lg border-l border-line bg-white shadow-xl',
                    'data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right',
                    className
                )}
            >
                <div className="px-5 py-4 border-b border-line"><DialogHeaderBlock title={title} description={description} /></div>
                <CloseButton />
                <div className="flex-1 overflow-y-auto p-5">{children}</div>
                {footer && <div className="flex justify-end gap-2 px-5 py-3 border-t border-line">{footer}</div>}
            </RDialog.Content>
        </RDialog.Portal>
    </RDialog.Root>
);

// ---------------- Tooltip ---------------- //

export const TooltipProvider = ({ children }) => <RTooltip.Provider delayDuration={300}>{children}</RTooltip.Provider>;

export const Tip = ({ content, children, side = 'top' }) => {
    if (!content) return children;
    return (
        <RTooltip.Root>
            <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
            <RTooltip.Portal>
                <RTooltip.Content side={side} sideOffset={4}
                    className="z-50 rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-md data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0">
                    {content}
                </RTooltip.Content>
            </RTooltip.Portal>
        </RTooltip.Root>
    );
};

// ---------------- Radio cards ---------------- //

export const RadioCards = ({ value, onChange, options, className, 'aria-label': ariaLabel }) => (
    <RRadio.Root value={value} onValueChange={onChange} aria-label={ariaLabel} className={cn('grid gap-2', className)}>
        {options.map(opt => (
            <RRadio.Item
                key={opt.value}
                value={opt.value}
                className={cn(
                    'group text-left rounded-lg border border-line bg-white px-3 py-2.5 transition-colors hover:border-slate-300',
                    'data-[state=checked]:border-brand-500 data-[state=checked]:ring-2 data-[state=checked]:ring-brand-500/15 data-[state=checked]:bg-brand-50/40',
                    focusRing
                )}
            >
                <div className="flex items-center gap-2">
                    {opt.dot && <span className={cn('h-2 w-2 rounded-full', opt.dot)} />}
                    <span className="text-sm font-medium text-slate-900">{opt.label}</span>
                </div>
                {opt.description && <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>}
            </RRadio.Item>
        ))}
    </RRadio.Root>
);

// ---------------- Number stepper ---------------- //

// [−] 12 [+]. Buttons save immediately; the number can be typed and saves on Enter or blur.
export const Stepper = ({ value, onCommit, min = 0, max, disabled, size = 'md', label }) => {
    const [draft, setDraft] = useState(String(value ?? 0));
    const [shownValue, setShownValue] = useState(value);

    // Follow outside changes (e.g. a live update from another user)
    if (value !== shownValue) {
        setShownValue(value);
        setDraft(String(value ?? 0));
    }

    const clamp = (n) => Math.max(min, max !== undefined ? Math.min(max, n) : n);
    const commit = (n) => {
        const next = clamp(Number.isFinite(n) ? n : value);
        setDraft(String(next));
        if (next !== value) onCommit(next);
    };

    const btn = cn('flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none', size === 'sm' ? 'w-7' : 'w-8', focusRing);

    return (
        <div className={cn('inline-flex items-stretch rounded-md border border-line bg-white overflow-hidden', size === 'sm' ? 'h-7' : 'h-8', disabled && 'opacity-60')}>
            <button type="button" className={btn} disabled={disabled || value <= min} onClick={() => commit(value - 1)} aria-label={`Decrease ${label || ''}`}><Minus size={13} /></button>
            <input
                type="text"
                inputMode="numeric"
                aria-label={label}
                disabled={disabled}
                value={draft}
                onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={() => commit(parseInt(draft, 10))}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(String(value)); e.currentTarget.blur(); } }}
                className={cn('w-11 text-center tabular font-semibold text-slate-900 border-x border-line focus:outline-none focus:bg-brand-50/50', size === 'sm' ? 'text-xs' : 'text-sm')}
            />
            <button type="button" className={btn} disabled={disabled || (max !== undefined && value >= max)} onClick={() => commit(value + 1)} aria-label={`Increase ${label || ''}`}><Plus size={13} /></button>
        </div>
    );
};

// ---------------- Table ---------------- //

export const Table = ({ className, children }) => (
    <div className="overflow-x-auto">
        <table className={cn('w-full text-sm', className)}>{children}</table>
    </div>
);
export const Th = ({ className, children, ...props }) => (
    <th className={cn('h-9 px-4 text-left text-xs font-medium text-slate-500 bg-slate-50/70 border-b border-line whitespace-nowrap', className)} {...props}>{children}</th>
);
export const Td = ({ className, children, ...props }) => (
    <td className={cn('px-4 py-3 align-middle border-b border-line', className)} {...props}>{children}</td>
);

// ---------------- Avatar ---------------- //

export const Avatar = ({ name = '', className }) => {
    const initials = name.replace(/^Dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
    return (
        <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600', className)}>
            {initials}
        </span>
    );
};
