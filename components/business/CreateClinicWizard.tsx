import React, { useMemo, useState } from 'react';
import { X, Building2, Loader2, ShieldCheck, Check } from 'lucide-react';
import { createOrganization, PLAN_INFO, type OrgPlan, type Organization } from '../../services/businessService';
import { useEscapeToClose } from './useEscapeToClose';

interface CreateClinicWizardProps {
  dpaVersion: string;
  onClose: () => void;
  onCreated: (org: Organization) => void;
}

const slugify = (text: string) => text
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

const PLAN_FEATURES: Record<OrgPlan, string[]> = {
  essential: [
    'Equipo con roles y permisos',
    'Agenda compartida, sedes y salas',
    'Pacientes e historia clínica de la clínica',
    'Facturación de la clínica y liquidaciones',
    'Registro de accesos (auditoría)'
  ],
  plus: [
    'Todo lo de Essential',
    'Página pública y widget de reservas',
    'Bandeja de leads con asignación y atribución',
    'Biblioteca y formación con IA',
    'Panel del dueño con métricas'
  ]
};

const CreateClinicWizard: React.FC<CreateClinicWizardProps> = ({ dpaVersion, onClose, onCreated }) => {
  useEscapeToClose();
  const [name, setName] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugInput, setSlugInput] = useState('');
  const [legalName, setLegalName] = useState('');
  const [cif, setCif] = useState('');
  const [plan, setPlan] = useState<OrgPlan>('essential');
  const [isClinical, setIsClinical] = useState(true);
  const [dpaAccepted, setDpaAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = useMemo(() => (slugTouched ? slugInput : slugify(name)), [slugTouched, slugInput, name]);
  const canSubmit = name.trim().length > 1 && slug.length >= 3 && dpaAccepted && !saving;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    const r = await createOrganization({
      name: name.trim(), slug, plan, billing_interval: 'month',
      legal_name: legalName.trim() || undefined, cif: cif.trim() || undefined,
      is_clinical: isClinical, dpa_accepted: true, dpa_version: dpaVersion
    });
    setSaving(false);
    if (!r.ok || !r.data) {
      setError(r.status === 409 ? 'Ese identificador ya está en uso. Prueba con otro.' : (r.error || 'No se pudo crear la clínica'));
      return;
    }
    onCreated(r.data.organization);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="create-clinic-title">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center"><Building2 size={18} /></div>
          <h2 id="create-clinic-title" className="text-lg font-bold text-slate-900 flex-1">Crear clínica en mainds business</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <p className="text-sm text-slate-600">
            La clínica es un espacio de trabajo aparte: tu consulta personal de mainds pro no cambia y sus datos no se mezclan con los de la clínica.
            Tienes 14 días de prueba con todas las funciones.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">Nombre de la clínica *</span>
              <input value={name} onChange={e => setName(e.target.value)} required maxLength={120}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Centro de Psicología Mar Azul" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Identificador</span>
              <input value={slug} onChange={e => { setSlugTouched(true); setSlugInput(slugify(e.target.value)); }} maxLength={50}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <span className="text-xs text-slate-500">Se usará en la página pública: mainds.app/c/{slug || '…'}</span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">CIF</span>
              <input value={cif} onChange={e => setCif(e.target.value.toUpperCase())} maxLength={20}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="B12345678" />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">Razón social</span>
              <input value={legalName} onChange={e => setLegalName(e.target.value)} maxLength={200}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Mar Azul Psicología, S.L." />
            </label>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-slate-700 mb-2">Plan (se puede cambiar antes de pagar)</legend>
            <div className="grid sm:grid-cols-2 gap-3">
              {(Object.keys(PLAN_INFO) as OrgPlan[]).map(p => (
                <label key={p} className={`block rounded-xl border-2 p-4 cursor-pointer ${plan === p ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input type="radio" name="plan" value={p} checked={plan === p} onChange={() => setPlan(p)} className="sr-only" />
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-slate-900">{PLAN_INFO[p].name}</span>
                    {plan === p && <Check size={16} className="text-indigo-600" />}
                  </div>
                  <p className="text-sm text-slate-700 mt-1">
                    <strong>{PLAN_INFO[p].base} €</strong>/mes + <strong>{PLAN_INFO[p].seat} €</strong>/profesional
                  </p>
                  <ul className="mt-2 space-y-1">
                    {PLAN_FEATURES[p].map(f => <li key={f} className="text-xs text-slate-600">· {f}</li>)}
                  </ul>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">Recepción, gerencia y gestoría no pagan licencia. Pacientes ilimitados. IVA no incluido.</p>
            <p className="text-xs text-slate-500 mt-1">La clínica se factura aparte: si pagas mainds pro, tu suscripción personal sigue igual y se cobra por separado.</p>
          </fieldset>

          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" checked={isClinical} onChange={e => setIsClinical(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600" />
            <span>Yo también atiendo pacientes en la clínica <span className="text-slate-500">(ocupas una licencia de profesional de la clínica, que paga la clínica)</span></span>
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><ShieldCheck size={16} className="text-emerald-600" /> Protección de datos</div>
            <p className="text-xs text-slate-600">
              En el espacio de la clínica, <strong>la clínica es la responsable del tratamiento</strong> de los datos de sus pacientes y mainds actúa como
              encargado del tratamiento. Los datos clínicos se cifran, cada acceso a la historia clínica queda registrado y nadie de mainds puede leerlos.
            </p>
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input type="checkbox" checked={dpaAccepted} onChange={e => setDpaAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600" required />
              <span>Acepto, en nombre de la clínica, el contrato de encargo del tratamiento (versión {dpaVersion}).</span>
            </label>
          </div>

          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 sticky bottom-0 bg-white">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100">Cancelar</button>
          <button type="submit" disabled={!canSubmit} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 size={16} className="animate-spin" />} Crear clínica
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateClinicWizard;
