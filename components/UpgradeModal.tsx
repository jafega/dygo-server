import React, { useState } from 'react';
import { User } from '../types';
import { API_URL } from '../services/config';
import { apiFetch } from '../services/authService';

interface UpgradeModalProps {
  currentUser: User;
  trialDaysLeft?: number;
  onClose: () => void;
  returnPanel?: string;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ currentUser, trialDaysLeft, onClose, returnPanel }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trialExpired = trialDaysLeft === undefined || trialDaysLeft <= 0;

  const handleSubscribe = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        }
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
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 relative">
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          {trialExpired ? (
            <>
              <h2 className="text-2xl font-bold text-gray-900">Período de prueba finalizado</h2>
              <p className="text-gray-500 mt-1">Tu prueba gratuita de 14 días ha terminado</p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-900">Activa tu suscripción</h2>
              <p className="text-gray-500 mt-1">Te quedan <span className="font-semibold text-indigo-600">{trialDaysLeft} días</span> de prueba gratuita</p>
            </>
          )}
        </div>

        {/* Pricing info */}
        <div className="bg-indigo-50 rounded-xl p-5 mb-6">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-medium text-indigo-700">Plan profesional</span>
            <span className="text-sm font-semibold text-indigo-900">€24.99 / mes</span>
          </div>
          <div className="border-t border-indigo-200 pt-3">
            <p className="text-xs text-indigo-600">Tarifa fija mensual — pacientes ilimitados</p>
          </div>
        </div>

        <ul className="space-y-2 mb-6 text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Pacientes ilimitados sin coste adicional
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Precio fijo de €24.99/mes, sin sorpresas
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Cancela en cualquier momento desde el portal de facturación
          </li>
        </ul>

        {error && (
          <p className="text-red-600 text-sm text-center mb-4">{error}</p>
        )}

        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Redirigiendo a Stripe...
            </>
          ) : (
            'Activar suscripción — €24.99/mes'
          )}
        </button>

        <p className="text-center text-xs text-gray-400 mt-3">
          Pago seguro procesado por Stripe. Puedes cancelar cuando quieras.
        </p>
      </div>
    </div>
  );
};

export default UpgradeModal;
