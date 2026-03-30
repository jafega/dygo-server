import React, { useState } from 'react';
import { User } from '../types';
import { API_URL } from '../services/config';
import { apiFetch } from '../services/authService';

interface PlanInfo {
  id: string;
  name: string;
  price: number;
  maxRelations: number | null; // null = unlimited
}

const PLANS: PlanInfo[] = [
  { id: 'starter', name: 'Starter', price: 9.99, maxRelations: 10 },
  { id: 'mainder', name: 'Mainder', price: 19.99, maxRelations: 30 },
  { id: 'supermainder', name: 'Supermainder', price: 29.99, maxRelations: null }
];

interface UpgradeModalProps {
  currentUser: User;
  trialDaysLeft?: number;
  onClose: () => void;
  returnPanel?: string;
  currentPlanId?: string;
  activeRelations?: number;
  suggestedPlanId?: string;
}

const CheckIcon = () => (
  <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

const UpgradeModal: React.FC<UpgradeModalProps> = ({ currentUser, trialDaysLeft, onClose, returnPanel, currentPlanId, activeRelations, suggestedPlanId }) => {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trialExpired = trialDaysLeft === undefined || trialDaysLeft <= 0;

  const handleSubscribe = async (planId: string) => {
    setLoading(planId);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId, subscription_type: 'psychologist' })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al iniciar el pago');
      }
      const { url } = await res.json();
      if (url) {
        if (returnPanel) {
          localStorage.setItem('mainds_stripe_return_panel', returnPanel);
        }
        window.location.href = url;
      }
    } catch (err: any) {
      setError(err.message || 'Error al conectar con Stripe');
    } finally {
      setLoading(null);
    }
  };

  const isCurrentPlan = (planId: string) => currentPlanId === planId;
  const isSuggested = (planId: string) => suggestedPlanId === planId;

  // A plan is insufficient if it can't cover the existing patient count
  const isPlanInsufficient = (plan: PlanInfo): boolean => {
    if (plan.maxRelations === null) return false; // unlimited always ok
    if (typeof activeRelations !== 'number') return false;
    return activeRelations > plan.maxRelations;
  };

  // Auto-derive the minimum viable plan from activeRelations when no suggestedPlanId given
  const effectiveSuggestedId = suggestedPlanId ?? (() => {
    if (typeof activeRelations !== 'number') return undefined;
    const viable = PLANS.find(p => p.maxRelations === null || p.maxRelations > activeRelations);
    return viable?.id;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-8 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl leading-none"
          aria-label="Cerrar"
        >
          &times;
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
            <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          {trialExpired ? (
            <>
              <h2 className="text-2xl font-bold text-gray-900">Elige tu plan</h2>
              <p className="text-gray-500 mt-1">Tu prueba gratuita de 14 días ha terminado</p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-900">Elige tu plan</h2>
              <p className="text-gray-500 mt-1">Te quedan <span className="font-semibold text-indigo-600">{trialDaysLeft} días</span> de prueba gratuita</p>
            </>
          )}
          {typeof activeRelations === 'number' && (
            <p className="text-sm text-gray-400 mt-1">Pacientes activos: <span className="font-medium text-gray-600">{activeRelations}</span></p>
          )}
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {PLANS.map((plan) => {
            const current = isCurrentPlan(plan.id);
            const insufficient = isPlanInsufficient(plan);
            const suggested = plan.id === effectiveSuggestedId;
            const highlight = suggested || (plan.id === 'mainder' && !currentPlanId && !effectiveSuggestedId);
            const disabled = loading !== null || current || insufficient;
            return (
              <div
                key={plan.id}
                className={`rounded-xl border-2 p-5 flex flex-col transition-all ${
                  insufficient
                    ? 'border-gray-200 bg-gray-50 opacity-50'
                    : highlight
                      ? 'border-indigo-500 bg-indigo-50 shadow-lg scale-[1.02]'
                      : 'border-gray-200 bg-white'
                } ${current ? 'opacity-70' : ''}`}
              >
                {insufficient && (
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">No disponible</span>
                )}
                {!insufficient && highlight && (
                  <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">
                    {suggested ? (currentPlanId ? 'Upgrade recomendado' : 'Recomendado') : 'Más popular'}
                  </span>
                )}
                <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                <div className="mt-2 mb-4">
                  <span className="text-3xl font-extrabold text-gray-900">€{plan.price.toFixed(2)}</span>
                  <span className="text-gray-500 text-sm">/mes</span>
                </div>
                <ul className="space-y-2 mb-4 flex-1 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <CheckIcon />
                    {plan.maxRelations ? `Hasta ${plan.maxRelations} pacientes activos` : 'Pacientes ilimitados'}
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon />
                    Todas las funcionalidades
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon />
                    Cancela cuando quieras
                  </li>
                </ul>
                <button
                  onClick={() => !disabled && handleSubscribe(plan.id)}
                  disabled={disabled}
                  className={`w-full font-semibold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm ${
                    current
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : insufficient
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : highlight
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          : 'bg-gray-800 hover:bg-gray-900 text-white'
                  } disabled:opacity-60`}
                >
                  {loading === plan.id ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Redirigiendo...
                    </>
                  ) : current ? (
                    'Plan actual'
                  ) : insufficient ? (
                    'No disponible'
                  ) : (
                    `Elegir ${plan.name}`
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <p className="text-red-600 text-sm text-center mb-4">{error}</p>
        )}

        <p className="text-center text-xs text-gray-400">
          Pago seguro procesado por Stripe. Puedes cancelar cuando quieras.
        </p>
      </div>
    </div>
  );
};

export default UpgradeModal;
