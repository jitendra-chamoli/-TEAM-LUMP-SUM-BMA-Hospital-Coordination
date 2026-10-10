import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

// Critical "resource hit zero" alerts, stacked at the top right.
const AlertBanner = ({ alerts, onDismiss }) => {
    if (alerts.length === 0) return null;

    return (
        <div className="fixed top-16 right-4 left-4 sm:left-auto z-[60] flex flex-col gap-2 sm:w-80" role="alert">
            {alerts.map((alert) => (
                <div key={alert.id} className="bg-white border border-red-200 border-l-4 border-l-red-500 rounded-lg shadow-lg px-3.5 py-3 flex items-start gap-2.5 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                    <AlertTriangle className="text-red-500 shrink-0 mt-px" size={16} />
                    <div className="flex-1 text-sm">
                        <p className="font-semibold text-slate-900">{alert.resource_name} ran out</p>
                        <p className="text-slate-600">{alert.department} has 0 {alert.resource_name.toLowerCase()} available.</p>
                    </div>
                    <button onClick={() => onDismiss(alert.id)} className="text-slate-400 hover:text-slate-700" aria-label="Dismiss">
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
};

export default AlertBanner;
