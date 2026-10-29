import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, CheckCircle2, MapPin, Phone, Mail, Video, Users } from 'lucide-react';
import { API_URL } from '../../services/config';

interface PublicClinic {
  clinic: {
    name: string; slug: string; logo_url: string | null; headline: string | null; description: string | null;
    specialties: string[]; phone: string | null; email: string | null; address: string | null; city: string | null; modalities: string[];
  };
  team: { ref: string; name: string; bio: string | null; specialties: string[]; photo_url: string | null; accepts_leads: boolean }[];
  consent: { version: string; text: string };
}

/**
 * Página pública de una clínica (mainds.app/c/:slug) y su widget embebible
 * (?embed=1). No necesita sesión ni carga nada de la app privada.
 */
const PublicClinicPage: React.FC<{ slug: string }> = ({ slug }) => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const embed = params.get('embed') === '1';
  const [data, setData] = useState<PublicClinic | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [form, setForm] = useState({ name: '', email: '', phone: '', reason: '', modality: 'any', professional_ref: '', preferences: '', consent: false, website: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/public/org/${encodeURIComponent(slug)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) { setData(d); setState('ready'); document.title = `${d.clinic.name} · Pide cita`; } else setState('missing'); })
      .catch(() => setState('missing'));
  }, [slug]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    const utm: Record<string, string> = {};
    for (const k of ['source', 'medium', 'campaign', 'term', 'content']) {
      const v = params.get(`utm_${k}`);
      if (v) utm[k] = v;
    }
    try {
      const r = await fetch(`${API_URL}/public/org/${encodeURIComponent(slug)}/leads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, professional_ref: form.professional_ref || undefined, embed, utm })
      });
      const j = await r.json().catch(() => null);
      if (r.ok) setSent(true); else setError(j?.error || 'No se pudo enviar. Inténtalo de nuevo.');
    } catch {
      setError('No hay conexión. Inténtalo de nuevo.');
    }
    setSending(false);
  };

  if (state === 'loading') return <div className="min-h-dvh flex items-center justify-center"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>;
  if (state === 'missing' || !data) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 p-6 text-center bg-slate-50">
        <Building2 size={36} className="text-slate-300" />
        <p className="text-slate-700 font-semibold">Esta página no está disponible.</p>
        <a href="https://mainds.app" className="text-sm text-indigo-700 hover:underline">mainds</a>
      </div>
    );
  }

  const { clinic, team, consent } = data;
  const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const formCard = (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6" id="pedir-cita">
      {sent ? (
        <div className="text-center space-y-3 py-6" role="status">
          <CheckCircle2 size={40} className="mx-auto text-emerald-600" />
          <p className="text-lg font-semibold text-slate-900">¡Solicitud enviada!</p>
          <p className="text-sm text-slate-600">{clinic.name} se pondrá en contacto contigo para darte cita.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">Pide cita</h2>
          <label className="block"><span className="text-sm font-medium text-slate-700">Nombre *</span>
            <input required maxLength={120} className={input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoComplete="name" /></label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="text-sm font-medium text-slate-700">Email</span>
              <input type="email" className={input} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="email" /></label>
            <label className="block"><span className="text-sm font-medium text-slate-700">Teléfono</span>
              <input type="tel" className={input} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} autoComplete="tel" /></label>
          </div>
          <label className="block"><span className="text-sm font-medium text-slate-700">¿En qué podemos ayudarte?</span>
            <textarea rows={3} maxLength={2000} className={input} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Cuéntanos brevemente el motivo (opcional)" /></label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="text-sm font-medium text-slate-700">Modalidad</span>
              <select className={`${input} bg-white`} value={form.modality} onChange={e => setForm({ ...form, modality: e.target.value })}>
                <option value="any">Me da igual</option>
                {clinic.modalities.includes('in_person') && <option value="in_person">Presencial</option>}
                {clinic.modalities.includes('online') && <option value="online">Online</option>}
              </select></label>
            {team.some(m => m.accepts_leads) && (
              <label className="block"><span className="text-sm font-medium text-slate-700">Profesional</span>
                <select className={`${input} bg-white`} value={form.professional_ref} onChange={e => setForm({ ...form, professional_ref: e.target.value })}>
                  <option value="">Sin preferencia</option>
                  {team.filter(m => m.accepts_leads).map(m => <option key={m.ref} value={m.ref}>{m.name}</option>)}
                </select></label>
            )}
          </div>
          <label className="block"><span className="text-sm font-medium text-slate-700">Horario preferido</span>
            <input maxLength={1000} className={input} value={form.preferences} onChange={e => setForm({ ...form, preferences: e.target.value })} placeholder="Ej.: tardes a partir de las 17 h" /></label>
          {/* Campo trampa para bots: invisible para las personas. */}
          <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
            <label>No rellenar<input tabIndex={-1} autoComplete="off" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} name="website" /></label>
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" required checked={form.consent} onChange={e => setForm({ ...form, consent: e.target.checked })} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600" />
            <span>{consent.text}</span>
          </label>
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>}
          <button type="submit" disabled={sending || !form.consent || !form.name.trim() || (!form.email.trim() && !form.phone.trim())}
            className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {sending && <Loader2 size={16} className="animate-spin" />} Enviar solicitud
          </button>
          <p className="text-[11px] text-slate-400 text-center">Déjanos al menos un email o un teléfono.</p>
        </form>
      )}
    </div>
  );

  if (embed) {
    return <div className="p-3 bg-transparent text-slate-900">{formCard}</div>;
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12 flex flex-col sm:flex-row gap-6 items-start">
          {clinic.logo_url
            ? <img src={clinic.logo_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
            : <div className="w-16 h-16 rounded-xl bg-indigo-600 text-white flex items-center justify-center"><Building2 size={28} /></div>}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold">{clinic.name}</h1>
            {clinic.headline && <p className="text-lg text-slate-600 mt-1">{clinic.headline}</p>}
            {clinic.specialties.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {clinic.specialties.map(s => <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800">{s}</span>)}
              </div>
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-4 text-sm text-slate-600">
              {(clinic.address || clinic.city) && <span className="flex items-center gap-1"><MapPin size={14} /> {[clinic.address, clinic.city].filter(Boolean).join(', ')}</span>}
              {clinic.phone && <a href={`tel:${clinic.phone}`} className="flex items-center gap-1 hover:text-indigo-700"><Phone size={14} /> {clinic.phone}</a>}
              {clinic.email && <a href={`mailto:${clinic.email}`} className="flex items-center gap-1 hover:text-indigo-700"><Mail size={14} /> {clinic.email}</a>}
              {clinic.modalities.includes('online') && <span className="flex items-center gap-1"><Video size={14} /> También online</span>}
            </div>
          </div>
          <a href="#pedir-cita" className="sm:self-center px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700">Pedir cita</a>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8 grid lg:grid-cols-[1fr_380px] gap-8">
        <div className="space-y-8">
          {clinic.description && <p className="text-slate-700 whitespace-pre-line leading-relaxed">{clinic.description}</p>}
          {team.length > 0 && (
            <section>
              <h2 className="text-lg font-bold flex items-center gap-2 mb-3"><Users size={18} /> Equipo</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {team.map(m => (
                  <div key={m.ref} className="bg-white rounded-xl border border-slate-200 p-4 flex gap-3">
                    {m.photo_url
                      ? <img src={m.photo_url} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-semibold flex-shrink-0">{m.name.charAt(0)}</div>}
                    <div className="min-w-0">
                      <p className="font-semibold">{m.name}</p>
                      {m.specialties.length > 0 && <p className="text-xs text-indigo-700">{m.specialties.join(' · ')}</p>}
                      {m.bio && <p className="text-sm text-slate-600 mt-1 line-clamp-4">{m.bio}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
        <div className="lg:sticky lg:top-6 self-start">{formCard}</div>
      </main>
      <footer className="text-center text-xs text-slate-400 py-6">Gestionado con <a href="https://mainds.app" className="hover:text-slate-600">mainds</a></footer>
    </div>
  );
};

export default PublicClinicPage;
