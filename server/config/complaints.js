// Chief complaints offered at dispatch, and the departments whose on-duty doctors
// should receive each one. Emergency and Trauma doctors can always receive a patient,
// but a hospital with the right specialist on duty is preferred.
// The client loads this list from GET /api/dispatch/config.

const COMPLAINTS = [
    { code: 'chest_pain', label: 'Chest pain / heart', departments: ['Cardiology'] },
    { code: 'stroke', label: 'Stroke / paralysis', departments: ['Neurology', 'Neurosurgery'] },
    { code: 'trauma', label: 'Accident / injury', departments: ['Trauma', 'Orthopedics', 'General Surgery'] },
    { code: 'breathing', label: 'Breathing difficulty', departments: ['General Medicine'] },
    { code: 'unconscious', label: 'Unconscious / seizure', departments: ['Neurology', 'General Medicine'] },
    { code: 'pregnancy', label: 'Pregnancy / labour', departments: ['Obstetrics & Gynaecology'] },
    { code: 'child', label: 'Sick child', departments: ['Paediatrics'] },
    { code: 'burns', label: 'Burns', departments: ['General Surgery', 'Dermatology'] },
    { code: 'poisoning', label: 'Poisoning / overdose', departments: ['General Medicine'] },
    { code: 'other', label: 'Other', departments: [] }
];

const EMERGENCY_DEPARTMENTS = ['Emergency', 'Trauma'];

const DIVERT_REASONS = [
    { code: 'no_beds', label: 'No beds free' },
    { code: 'no_icu', label: 'No ICU bed' },
    { code: 'no_specialist', label: 'No specialist available' },
    { code: 'equipment', label: 'Equipment unavailable' },
    { code: 'other', label: 'Other' }
];

const complaintByCode = (code) => COMPLAINTS.find(c => c.code === code) || COMPLAINTS[COMPLAINTS.length - 1];

module.exports = { COMPLAINTS, EMERGENCY_DEPARTMENTS, DIVERT_REASONS, complaintByCode };
