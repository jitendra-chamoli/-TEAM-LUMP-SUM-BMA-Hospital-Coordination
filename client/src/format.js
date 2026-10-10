const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const timeOnly = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
const dayOnly = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export const formatDateTime = (value) => (value ? dateTime.format(new Date(value)) : '—');

const isSameDay = (a, b) => a.toDateString() === b.toDateString();

// "Mon 6 Oct, 09:00 – 17:00" or "Mon 6 Oct, 21:00 – Tue 7 Oct, 07:00"
export const formatShiftRange = (start, end) => {
    const s = new Date(start), e = new Date(end);
    const startText = `${dayOnly.format(s)}, ${timeOnly.format(s)}`;
    const endText = isSameDay(s, e) ? timeOnly.format(e) : `${dayOnly.format(e)}, ${timeOnly.format(e)}`;
    return `${startText} – ${endText}`;
};

// "Now until 17:00" for a running shift, otherwise the range.
export const describeShift = (start, end) => {
    if (!start) return null;
    const now = new Date();
    if (new Date(start) <= now) return `On shift until ${timeOnly.format(new Date(end))}`;
    return `Next: ${formatShiftRange(start, end)}`;
};

export const timeAgo = (value) => {
    const seconds = Math.round((Date.now() - new Date(value)) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
    return formatDateTime(value);
};
