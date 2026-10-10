import React, { useState, useEffect } from 'react';
import { ShieldAlert, ArrowDownLeft, ArrowUpRight, Ambulance } from 'lucide-react';
import { api, getErrorMessage } from '../src/api';
import { showToast } from '../src/toast';
import { useSocketEvent } from '../src/useSocketEvent';
import { formatDateTime } from '../src/format';
import { PageHeader, Card, Table, Th, Td, Badge, Segmented, Select, Switch, EmptyState, SkeletonRows } from '../src/ui';
import { INCIDENT_STATUS, isActive, getMyHospitalId } from '../src/dispatch';
import IncidentSheet from './dispatch/IncidentSheet';

const RANGES = { today: 1, '7d': 7, '30d': 30, all: null };
const SEVERITY_TONES = { critical: 'red', serious: 'amber', stable: 'green' };

const withinRange = (date, range) => {
    const days = RANGES[range];
    if (!days) return true;
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));
    return new Date(date) >= since;
};

const StatusBadge = ({ status }) => {
    const meta = INCIDENT_STATUS[status] || { label: status, tone: 'neutral' };
    return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
};

const IncidentLogs = () => {
    const [incidents, setIncidents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [direction, setDirection] = useState('all');
    const [range, setRange] = useState('7d');
    const [activeOnly, setActiveOnly] = useState(false);
    const [openId, setOpenId] = useState(null);

    const fetchIncidents = async () => {
        try {
            const res = await api.get('/api/incidents');
            setIncidents(res.data);
        } catch (err) {
            showToast(getErrorMessage(err, 'Could not load incidents.'), 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchIncidents(); }, []);

    // Any change to an incident involving this hospital updates its row (or adds it).
    useSocketEvent('incident_updated', (summary) => {
        const row = { ...summary, direction: summary.hospital_id === getMyHospitalId() ? 'incoming' : 'outgoing' };
        setIncidents(prev => prev.some(i => i.id === summary.id)
            ? prev.map(i => (i.id === summary.id ? { ...i, ...row } : i))
            : [row, ...prev]);
    });

    const inRange = incidents.filter(i => withinRange(i.created_at, range) && (!activeOnly || isActive(i.status)));
    const visible = inRange.filter(i => direction === 'all' || i.direction === direction);
    const count = (d) => inRange.filter(i => i.direction === d).length;

    return (
        <div>
            <PageHeader title="Incident log" description="Patients sent to your hospital, and dispatches your team requested for other hospitals." />

            <div className="flex flex-wrap items-center gap-2 mb-4">
                <Segmented value={direction} onChange={setDirection} aria-label="Direction" options={[
                    { value: 'all', label: 'All', count: inRange.length },
                    { value: 'incoming', label: 'Incoming', icon: ArrowDownLeft, count: count('incoming') },
                    { value: 'outgoing', label: 'Sent', icon: ArrowUpRight, count: count('outgoing') }
                ]} />
                <Switch id="active-only" checked={activeOnly} onCheckedChange={setActiveOnly} label="Active only" className="mr-2" />
                <div className="w-36">
                    <Select size="sm" value={range} onChange={(e) => setRange(e.target.value)} aria-label="Date range">
                        <option value="today">Today</option>
                        <option value="7d">Last 7 days</option>
                        <option value="30d">Last 30 days</option>
                        <option value="all">All time</option>
                    </Select>
                </div>
            </div>

            <Card className="overflow-hidden">
                {loading ? <SkeletonRows /> : visible.length === 0 ? (
                    <EmptyState icon={ShieldAlert} title="No incidents in this view" description="Try a longer date range, or turn off “Active only”." />
                ) : (
                    <Table>
                        <thead>
                            <tr>
                                <Th>Time</Th>
                                <Th>Direction</Th>
                                <Th>Severity</Th>
                                <Th className="hidden md:table-cell">Distance</Th>
                                <Th className="hidden lg:table-cell">Ambulance</Th>
                                <Th>Receiving doctor</Th>
                                <Th>Status</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map(inc => (
                                <tr key={inc.id} className="hover:bg-slate-50/60 cursor-pointer" onClick={() => setOpenId(inc.id)}
                                    tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpenId(inc.id)} aria-label={`Open dispatch ${inc.id}`}>
                                    <Td className="whitespace-nowrap">
                                        <p className="text-slate-900">{formatDateTime(inc.created_at)}</p>
                                        <p className="text-xs text-slate-500">#{inc.id}{inc.city ? ` · ${inc.city}` : ''}</p>
                                    </Td>
                                    <Td className="whitespace-nowrap">
                                        {inc.complaint_label && <p className="text-xs text-slate-500 mb-1">{inc.complaint_label}{inc.patient_name ? ` · ${inc.patient_name}` : ''}</p>}
                                        {inc.direction === 'incoming'
                                            ? <Badge tone="blue" icon={ArrowDownLeft}>Incoming</Badge>
                                            : <Badge tone="violet" icon={ArrowUpRight}>To {inc.hospital_name}</Badge>}
                                        {inc.requested_by_name && <p className="text-xs text-slate-500 mt-1">by {inc.requested_by_name}</p>}
                                    </Td>
                                    <Td>
                                        {inc.severity
                                            ? <Badge tone={SEVERITY_TONES[inc.severity]} dot className="capitalize">{inc.severity}</Badge>
                                            : <span className="text-slate-400">—</span>}
                                        {Boolean(inc.needs_icu) && <p className="text-xs text-slate-500 mt-1">Needs ICU</p>}
                                    </Td>
                                    <Td className="hidden md:table-cell text-slate-600 tabular whitespace-nowrap">{inc.distance_km ? `${inc.distance_km} km` : '—'}</Td>
                                    <Td className="hidden lg:table-cell whitespace-nowrap">
                                        {inc.ambulance_name
                                            ? <span className="inline-flex items-center gap-1.5 text-slate-700"><Ambulance size={14} className="text-emerald-600" />{inc.ambulance_name}</span>
                                            : <span className="text-slate-400">None assigned</span>}
                                    </Td>
                                    <Td>
                                        {inc.receiving_doctor_name ? (
                                            <>
                                                <p className="text-slate-900">{inc.receiving_doctor_name}</p>
                                                {inc.receiving_doctor_phone && <p className="text-xs text-slate-500 tabular">{inc.receiving_doctor_phone}</p>}
                                            </>
                                        ) : <span className="text-slate-400">None assigned</span>}
                                    </Td>
                                    <Td><StatusBadge status={inc.status} /></Td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                )}
            </Card>

            <IncidentSheet incidentId={openId} onClose={() => setOpenId(null)} />
        </div>
    );
};

export default IncidentLogs;
