export const DEPARTMENTS = [
    'Emergency', 'Trauma', 'General Surgery', 'General Medicine', 'Orthopedics',
    'Dermatology', 'Cardiology', 'Urology', 'Nephrology', 'Neurology',
    'Neurosurgery', 'Ophthalmology', 'ENT', 'Obstetrics & Gynaecology', 'Paediatrics'
];

// Doctor status values (match the doctors.status ENUM on the server).
// "On Duty" and "On Call" count as available for emergency dispatch.
export const DOCTOR_STATUSES = [
    { value: 'on_duty', label: 'On duty', tone: 'green', dot: 'bg-emerald-500', hint: 'Available' },
    { value: 'on_call', label: 'On call', tone: 'sky', dot: 'bg-sky-500', hint: 'Available' },
    { value: 'in_surgery', label: 'In surgery', tone: 'amber', dot: 'bg-amber-500', hint: 'Busy' },
    { value: 'off_duty', label: 'Off duty', tone: 'neutral', dot: 'bg-slate-400', hint: 'Away' }
];

export const doctorStatus = (value) => DOCTOR_STATUSES.find(s => s.value === value) || DOCTOR_STATUSES[3];

// Resource types every department tracks (DEFAULT_RESOURCES on the dashboard).
export const DEFAULT_RESOURCES = ['Beds', 'ICU', 'Ventilators'];
