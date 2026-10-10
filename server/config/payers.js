// Payment routes, hospital empanelment and the few costs that can honestly be
// published before a patient is examined.
//
// Legal background (India), which drives the rules below:
//  - Clinical Establishments Act 2010 s.12(2): every clinical establishment must
//    provide treatment to stabilise an emergency case. Cost never blocks stabilisation.
//  - MV Act s.134A + Good Samaritan guidelines: a bystander who brings in a victim
//    is not liable, and hospitals may not demand money from them.
//  - MV Act s.162 + Cashless Treatment of Road Accident Victims Scheme 2025:
//    road-accident victims get cashless care up to a cap, funded centrally.

// What the person booking says about payment.
const PAYER_OPTIONS = [
    { code: 'pmjay', label: 'Ayushman Bharat / state health card', scheme: 'pmjay' },
    { code: 'insurance', label: 'Health insurance', scheme: null, needsNote: true },
    { code: 'self_pay', label: 'Paying myself', scheme: null },
    { code: 'unknown', label: "Don't know / not my patient", scheme: null }
];

// Schemes a hospital can be empanelled for.
const SCHEMES = [
    { code: 'pmjay', label: 'Ayushman Bharat (PM-JAY)' },
    { code: 'mv_cashless', label: 'Road accident cashless scheme' },
    { code: 'state_scheme', label: 'State health scheme' },
    { code: 'cghs', label: 'CGHS' },
    { code: 'esi', label: 'ESI' }
];

const HOSPITAL_TYPES = [
    { code: 'government', label: 'Government' },
    { code: 'trust', label: 'Trust / charitable' },
    { code: 'private', label: 'Private' }
];

// Only predictable, publishable items. Never a total for the episode: nobody can
// know that before the patient is examined.
const TARIFF_ITEMS = [
    { code: 'ambulance_basic', label: 'Ambulance (basic)', unit: 'per trip' },
    { code: 'ambulance_advanced', label: 'Ambulance (advanced)', unit: 'per trip' },
    { code: 'ambulance_icu', label: 'Ambulance (ICU)', unit: 'per trip' },
    { code: 'casualty_fee', label: 'Casualty registration / consultation', unit: 'one-off' },
    { code: 'ward_bed_day', label: 'General ward bed', unit: 'per day' },
    { code: 'icu_bed_day', label: 'ICU bed', unit: 'per day' }
];

// Complaints that make an incident a medico-legal case: the hospital must inform police.
const MLC_COMPLAINTS = ['trauma', 'burns', 'poisoning'];

// A road accident is covered by the central cashless scheme; everything else falls
// back to the patient's own cover. `motorVehicle` comes from the booking question.
function resolvePayerRoute({ complaint, motorVehicle, payer }) {
    if (complaint === 'trauma' && motorVehicle) return 'mv_cashless';
    if (payer === 'pmjay') return 'pmjay';
    if (payer === 'insurance') return 'insurance';
    if (payer === 'self_pay') return 'self_pay';
    return 'unknown';
}

// Which empanelment a hospital should ideally have for this incident.
const schemeForRoute = (route) => (['mv_cashless', 'pmjay', 'state_scheme'].includes(route) ? route : null);

const isMlc = (complaint, motorVehicle) => MLC_COMPLAINTS.includes(complaint) || Boolean(motorVehicle);

module.exports = { PAYER_OPTIONS, SCHEMES, HOSPITAL_TYPES, TARIFF_ITEMS, MLC_COMPLAINTS, resolvePayerRoute, schemeForRoute, isMlc };
