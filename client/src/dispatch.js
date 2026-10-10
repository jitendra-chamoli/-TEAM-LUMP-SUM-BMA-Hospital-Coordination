import { useEffect, useState } from 'react';
import { HeartPulse, Brain, Bone, Wind, Zap, Baby, Flame, FlaskConical, HelpCircle, Users } from 'lucide-react';
import { api, orchestratorApi, getStoredUser, getToken } from './api';

// ---------- Lifecycle ----------

export const INCIDENT_STATUS = {
    requested: { label: 'Waiting for hospital', tone: 'amber' },
    accepted: { label: 'Accepted', tone: 'blue' },
    picked_up: { label: 'Patient on board', tone: 'violet' },
    arrived: { label: 'At hospital', tone: 'sky' },
    handed_over: { label: 'Handed over', tone: 'green' },
    closed: { label: 'Closed', tone: 'neutral' },
    cancelled: { label: 'Cancelled', tone: 'neutral' },
    unplaced: { label: 'No hospital accepted', tone: 'red' }
};
export const ACTIVE_STATUSES = ['requested', 'accepted', 'picked_up', 'arrived', 'unplaced'];
export const isActive = (status) => ACTIVE_STATUSES.includes(status);

export const TIMELINE = [
    { key: 'created_at', label: 'Requested' },
    { key: 'accepted_at', label: 'Hospital accepted' },
    { key: 'picked_up_at', label: 'Patient picked up' },
    { key: 'arrived_at', label: 'Arrived at hospital' },
    { key: 'handed_over_at', label: 'Handed over' },
    { key: 'closed_at', label: 'Closed' }
];

export const SEVERITIES = [
    { value: 'critical', label: 'Critical', description: 'Life-threatening', dot: 'bg-red-500', tone: 'red' },
    { value: 'serious', label: 'Serious', description: 'Urgent, stable for now', dot: 'bg-amber-500', tone: 'amber' },
    { value: 'stable', label: 'Stable', description: 'Not time-critical', dot: 'bg-emerald-500', tone: 'green' }
];
export const severityMeta = (v) => SEVERITIES.find(s => s.value === v);

export const COMPLAINT_ICONS = {
    chest_pain: HeartPulse, stroke: Brain, trauma: Bone, breathing: Wind, unconscious: Zap,
    pregnancy: Users, child: Baby, burns: Flame, poisoning: FlaskConical, other: HelpCircle
};

export const CANCEL_REASONS = [
    'Patient no longer needs transport',
    'Duplicate request',
    'Patient taken by other means',
    'Wrong location',
    'Other'
];

// ---------- Who am I ----------

// Hospital of the signed-in user (from the session, or the token for older sessions).
export const getMyHospitalId = () => {
    const fromUser = getStoredUser()?.hospital_id;
    if (fromUser) return fromUser;
    try {
        return JSON.parse(atob(getToken().split('.')[1])).hospital_id;
    } catch {
        return null;
    }
};

// ---------- Config (complaints, divert reasons) ----------

let configCache = null;
let configPromise = null;

export function useDispatchConfig() {
    const [config, setConfig] = useState(configCache);
    useEffect(() => {
        if (configCache) return;
        configPromise = configPromise || api.get('/api/dispatch/config').then(res => (configCache = res.data));
        configPromise.then(setConfig).catch(() => { configPromise = null; });
    }, []);
    return config;
}

// ---------- Recommendation ----------

export async function recommendHospitals({ location, complaint, severity, needsIcu, config }) {
    const specialist = config?.complaints.find(c => c.code === complaint)?.departments || [];
    const res = await orchestratorApi.post('/api/recommend', {
        patient_lat: location.lat,
        patient_lng: location.lng,
        severity,
        needs_icu: needsIcu,
        complaint,
        specialist_departments: specialist
    });
    return res.data;
}

// "2 min 05 s" style countdown text
export const formatCountdown = (seconds) => {
    const s = Math.max(0, Math.round(seconds));
    return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
};

export const formatEta = (seconds) => {
    if (seconds === null || seconds === undefined) return null;
    if (seconds < 60) return 'under a minute';
    return `~${Math.round(seconds / 60)} min`;
};
