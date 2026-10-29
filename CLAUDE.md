# MAINDS — Contexto del proyecto

Guía compartida para cualquier agente (y para Claude) que trabaje en este repo.
Los roles `product-owner`, `dev` y `qa` viven en `.claude/agents/` y deben partir de este contexto.

## Qué es MAINDS

App de salud mental que conecta **psicólogos** y **pacientes**. Diario emocional
(incluido diario de voz con IA), seguimiento de metas, gestión de sesiones,
facturación y un panel de insights. El idioma de producto es **español**.

## Stack

- **Frontend:** React 19 + Vite + TypeScript + Tailwind. Raíz en `App.tsx` (monolito grande),
  vistas en `components/*`, lógica de cliente en `services/*`.
- **Backend:** Express (`backend/server.js`) + arranque en `backend/start-server.js`.
- **Funciones serverless:** `api/*` (desplegadas en Vercel).
- **Persistencia:** `backend/db.json` (dev/fichero) o **Supabase/Postgres** (`DATABASE_URL`)
  en producción. En Vercel el FS es efímero: **todo dato duradero va a Postgres**.
- **IA:** Gemini vía `@google/genai` (`services/genaiService.ts`).
- **Pagos:** Stripe (`stripe@11`, `api/stripe/*`, lógica de planes en `backend/server.js`).
- **Node:** 22.x.

## Modelo de negocio (crítico — no romper)

- **Planes de psicólogo:** Starter (€9,99, ≤10 pacientes), Mainder (€19,99, ≤30),
  Supermainder (€29,99, ilimitado). Trial de 14 días.
  Enforcement en `backend/server.js` (`PSYCH_PLANS`, `checkRelationLimit`).
  Price IDs por env: `STRIPE_PRICE_ID_STARTER|MAINDER|SUPERMAINDER`.
- **Premium de paciente:** €4,99/mes, trial 14 días, para el diario de voz con IA.
  Suscripción separada: `patientSubscriptions` (local) / `patient_subscriptions` (Supabase).
  Un usuario puede tener suscripción de psicólogo **y** de paciente a la vez.

## Comandos

```bash
npm run dev            # frontend (vite) + backend concurrentes
npm run build          # build de frontend
cd backend && npm start        # solo backend
cd backend && npm run test:webhook   # test del handler de webhooks de Stripe
```

## Reglas y deuda conocida (tenerlas presentes siempre)

- ⚠️ **Passwords en plano** en el build demo. Cualquier cambio de auth debe ir hacia
  hashing/rate-limiting/tokens seguros, nunca en sentido contrario.
- ⚠️ **No usar almacenamiento de fichero en producción** (db.json/SQLite en Vercel se pierde).
- ⚠️ **Nunca** commitear secretos. Claves en `.env` / variables de entorno del host.
- **Privacidad:** son datos clínicos sensibles. Cuidado con logs, anonimización
  (`services/chatAnonymizer.ts`) y qué se expone al frontend.
- Mantener el producto en **español** (UI y textos).

## Convenciones

- TypeScript en front; respeta los patrones ya existentes en `components/` y `services/`.
- No introduzcas dependencias nuevas sin justificarlo.
- Cambios pequeños y revisables; explica el "por qué" en el mensaje de commit.
