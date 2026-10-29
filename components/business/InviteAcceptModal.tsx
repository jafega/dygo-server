import React, { useState } from 'react';
import { Building2, Loader2, X } from 'lucide-react';
import { acceptInvitation, declineInvitation, ROLE_LABELS, type PendingInvitation } from '../../services/businessService';

interface InviteAcceptModalProps {
  /** Token del enlace del email (?org_invite=…). Sin token solo se listan las invitaciones. */
  token: string | null;
  pending: PendingInvitation[];
  userEmail?: string;
  onAccepted: (orgId: string) => void;
  onClose: () => void;
}

/**
 * Aceptar o rechazar una invitación a una clínica. Aceptar requiere el enlace
 * del email (prueba que la invitación llegó a esa dirección).
 */
const InviteAcceptModal: React.FC<InviteAcceptModalProps> = ({ token, pending, userEmail, onAccepted, onClose }) => {
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    if (!token) return;
    setBusy('accept');
    setError(null);
    const r = await acceptInvitation(token);
    setBusy(null);
    if (r.ok && r.data) return onAccepted(r.data.organization.id);
    setError(r.code === 'INVITATION_EMAIL_MISMATCH'
      ? `${r.error} Ahora estás con ${userEmail || 'otra cuenta'}.`
      : r.code === 'INVITATION_USED' ? 'Esta invitación ya se aceptó.' : (r.error || 'No se pudo aceptar la invitación.'));
  };

  const decline = async () => {
    if (!token) return onClose();
    setBusy('decline');
    await declineInvitation(token);
    setBusy(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center"><Building2 size={18} /></div>
          <h2 id="invite-title" className="text-lg font-bold text-slate-900 flex-1">Invitación a una clínica</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4 text-sm text-slate-700">
          {token ? (
            <p>Te han invitado a unirte a una clínica en mainds. Entrarás con tu cuenta actual; los datos de la clínica quedan separados de tu espacio personal.</p>
          ) : (
            <>
              <p>Tienes invitaciones pendientes. Para aceptarlas abre el enlace que te llegó por email.</p>
              <ul className="space-y-2">
                {pending.map(p => (
                  <li key={p.memberId} className="rounded-lg border border-slate-200 px-3 py-2">
                    <p className="font-semibold text-slate-900">{p.orgName}</p>
                    <p className="text-xs text-slate-500">{ROLE_LABELS[p.role] || p.role}{p.expiresAt ? ` · caduca el ${new Date(p.expiresAt).toLocaleDateString('es-ES')}` : ''}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
          {error && <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
          {token ? (
            <>
              <button type="button" onClick={decline} disabled={!!busy} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                {busy === 'decline' ? 'Rechazando…' : 'Rechazar'}
              </button>
              <button type="button" onClick={accept} disabled={!!busy} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                {busy === 'accept' && <Loader2 size={16} className="animate-spin" />} Aceptar y entrar
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700">Entendido</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default InviteAcceptModal;
