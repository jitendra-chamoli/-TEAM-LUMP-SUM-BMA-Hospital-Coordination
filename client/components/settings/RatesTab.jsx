import React, { useState, useEffect, useCallback } from 'react';
import { IndianRupee, Info } from 'lucide-react';
import { api, getErrorMessage } from '../../src/api';
import { showToast } from '../../src/toast';
import { formatDateTime } from '../../src/format';
import { Card, CardHeader, Button, Field, Input, Select, Switch, Skeleton, Table, Th, Td, cn } from '../../src/ui';

// Hospitals publish the few costs that are knowable before a patient is examined.
// Everything else depends on what's found, so it is never shown.
const RatesTab = () => {
  const [data, setData] = useState(null);
  const [type, setType] = useState('private');
  const [trauma, setTrauma] = useState(false);
  const [schemes, setSchemes] = useState([]);
  const [tariffs, setTariffs] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/hospital');
      setData(res.data);
      setType(res.data.type);
      setTrauma(Boolean(res.data.is_trauma_centre));
      setSchemes(res.data.schemes || []);
      setTariffs(Object.fromEntries((res.data.tariffs || []).map(t => [t.item, { min: String(t.min_price), max: t.max_price === null ? '' : String(t.max_price), updated_at: t.updated_at }])));
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not load your rates.'), 'error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleScheme = (code) => setSchemes(s => (s.includes(code) ? s.filter(x => x !== code) : [...s, code]));
  const setPrice = (item, key, value) =>
    setTariffs(t => ({ ...t, [item]: { ...t[item], [key]: value.replace(/\D/g, '').slice(0, 7) } }));

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/api/hospital', { type, is_trauma_centre: trauma });
      await api.put('/api/hospital/schemes', { schemes });
      await api.put('/api/hospital/tariffs', {
        tariffs: (data.options?.tariff_items || []).map(item => {
          const row = tariffs[item.code];
          const min = row?.min?.trim();
          return { item: item.code, min_price: min ? Number(min) : null, max_price: row?.max?.trim() ? Number(row.max) : null };
        })
      });
      showToast('Rates and schemes saved.', 'success');
      await load();
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not save.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!data) return <Card className="p-5 space-y-3"><Skeleton className="h-9" /><Skeleton className="h-9" /><Skeleton className="h-32" /></Card>;

  const options = data.options || { schemes: [], tariff_items: [], types: [] };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Hospital type" description="Used when routing a patient whose payment route isn't known." />
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Type" htmlFor="hosp-type">
            <Select id="hosp-type" value={type} onChange={(e) => setType(e.target.value)}>
              {options.types.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
            </Select>
          </Field>
          <div className="flex items-end pb-2">
            <Switch id="hosp-trauma" checked={trauma} onCheckedChange={setTrauma} label="Designated trauma centre" />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Schemes you accept" description="Patients carrying these are preferentially routed to you." />
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {options.schemes.map(s => (
            <label key={s.code}
              className={cn('flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors',
                schemes.includes(s.code) ? 'border-brand-500 bg-brand-50/50' : 'border-line bg-white hover:border-slate-300')}>
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={schemes.includes(s.code)}
                onChange={() => toggleScheme(s.code)} />
              <span className="text-sm text-slate-800">{s.label}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Published arrival costs"
          description="Shown to the public only for non-urgent cases. Leave an item blank to hide it." />
        <div className="px-5 pb-3">
          <p className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 border border-line rounded-lg px-3 py-2.5">
            <Info size={14} className="mt-0.5 shrink-0 text-slate-400" />
            These are arrival costs only. Tests, surgery and medicines depend on what's found, so no total is ever shown.
            Keep them current: the public sees the date you last updated them.
          </p>
        </div>
        <Table>
          <thead>
            <tr><Th>Item</Th><Th className="w-32">From (₹)</Th><Th className="w-32">To (₹)</Th><Th className="hidden sm:table-cell">Updated</Th></tr>
          </thead>
          <tbody>
            {options.tariff_items.map(item => (
              <tr key={item.code}>
                <Td>
                  <p className="text-slate-900">{item.label}</p>
                  <p className="text-xs text-slate-500">{item.unit}</p>
                </Td>
                <Td>
                  <Input aria-label={`${item.label} from`} inputMode="numeric" icon={IndianRupee} className="h-8"
                    value={tariffs[item.code]?.min || ''} onChange={(e) => setPrice(item.code, 'min', e.target.value)} />
                </Td>
                <Td>
                  <Input aria-label={`${item.label} to`} inputMode="numeric" icon={IndianRupee} className="h-8" placeholder="same"
                    value={tariffs[item.code]?.max || ''} onChange={(e) => setPrice(item.code, 'max', e.target.value)} />
                </Td>
                <Td className="hidden sm:table-cell text-xs text-slate-500 whitespace-nowrap">
                  {tariffs[item.code]?.updated_at ? formatDateTime(tariffs[item.code].updated_at) : '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save rates and schemes'}</Button>
      </div>
    </div>
  );
};

export default RatesTab;
