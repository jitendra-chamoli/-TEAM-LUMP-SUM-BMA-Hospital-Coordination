import React, { useState, useEffect } from 'react';
import { subscribeToast } from '../src/toast';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const STYLES = {
    error: { icon: AlertCircle, iconColor: 'text-red-500' },
    success: { icon: CheckCircle2, iconColor: 'text-emerald-500' },
    info: { icon: Info, iconColor: 'text-brand-500' }
};

const ToastContainer = () => {
    const [toasts, setToasts] = useState([]);

    useEffect(() => {
        const unsubscribe = subscribeToast((toast) => {
            setToasts(prev => [...prev.slice(-3), toast]);
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== toast.id));
            }, 5000);
        });
        return unsubscribe;
    }, []);

    const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id));

    return (
        <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[60] flex flex-col gap-2 sm:w-80" aria-live="polite">
            {toasts.map((toast) => {
                const style = STYLES[toast.type] || STYLES.error;
                const Icon = style.icon;
                return (
                    <div key={toast.id} className="bg-white border border-line rounded-lg shadow-lg px-3.5 py-3 flex items-start gap-2.5 animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
                        <Icon className={`${style.iconColor} shrink-0 mt-px`} size={16} />
                        <p className="flex-1 text-sm text-slate-700">{toast.message}</p>
                        <button onClick={() => dismiss(toast.id)} className="text-slate-400 hover:text-slate-700" aria-label="Dismiss">
                            <X size={14} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
};

export default ToastContainer;
