# mainds business — estado, puesta en marcha y siguientes pasos

> Producto para clínicas y despachos de psicología dentro de mainds: mismo repo, misma infraestructura, misma cuenta de usuario. Plan: [`MAINDS_BUSINESS_PLAN.md`](MAINDS_BUSINESS_PLAN.md) · Backlog con criterios de aceptación: [`BACKLOG.md`](BACKLOG.md) · Evaluación de una titular: [`EVALUACION_TITULAR.md`](EVALUACION_TITULAR.md) · Verifactu: [`VERIFACTU.md`](VERIFACTU.md) · DPA (borrador): [`legal/DPA_v1.md`](legal/DPA_v1.md)

## Qué está construido (Fases 0–6)

| Fase | Qué incluye |
|---|---|
| **0. Cimientos** | Cierre de un fallo de autorización en `/api/centers*` y `/api/templates*` (cualquier usuario con sesión podía leer o tocar los de otro). Banco de tests con tests *golden* de no regresión de Pro. Registro de accesos. Cifrado de campos clínicos. |
| **1. Núcleo** | Clínicas, equipo con 7 roles y matriz de permisos, invitaciones por email, selector de espacio, suscripción por licencias en Stripe, solo lectura si la suscripción caduca, DPA aceptado y registrado. |
| **2. Operativa** | Agenda semanal con salas y control de conflictos, agenda unificada entre espacios (solo "ocupado"), pacientes de la clínica, historia clínica **cifrada e inmutable**, anotaciones privadas que solo ve su autor, supervisión de alumnos en prácticas, acceso de emergencia auditado, consentimientos, baja con reasignación. |
| **3. Dinero** | Emisores (CIF), reglas de comisión congeladas en cada cita, facturas (numeración por NIF y serie, F1/F2, rectificativas R4/R5), liquidaciones para los 4 modelos (nómina, autónomo al que factura la clínica, autónomo que factura él, alquiler de despacho), huella Verifactu oficial y QR, exportación CSV. |
| **4. Captación** | Página pública `/c/:slug`, widget embebible, solicitudes con consentimiento, honeypot y límite por IP, bandeja con reparto manual, rotatorio o por profesional elegido, conversión a paciente (activa la comisión de lead), métricas por canal y por profesional. |
| **5. Conocimiento** | Biblioteca, cursos con progreso y horas, registro de supervisión cifrado, asistente IA sobre la biblioteca (la pregunta se anonimiza en el navegador) y panel del dueño. |
| **6. Operativa diaria** | Lo que pidió la evaluación de una titular que también pasa consulta. Inicio con el día, los pendientes que bloquean dinero y los primeros pasos. Tarifas por servicio y precio por paciente. Citas semanales o quincenales. Alta rápida de paciente desde la cita. Cierre en bloque de citas pasadas. Facturación en lote con emisión de una vez. Ficha con sus citas. Menú agrupado y agenda de día en el móvil. |

**Garantía para Pro:** todo vive en tablas propias (`organizations`, `org_*`, `access_audit`, `verifactu_records`). Business no escribe en ninguna tabla de mainds pro.
- El store tiene una lista blanca de tablas y hay un test que lo comprueba.
- Los tests *golden* comprueban que las respuestas de Pro son idénticas con Business apagado, encendido y con el psicólogo siendo titular de una clínica.
- El bundle de Pro crece unos 2 KB gzip: todo lo de clínicas se carga solo si el usuario tiene alguna.

## Pro y Business: cuentas y cobros

- **Tener mainds pro y una clínica a la vez.**
  - Son dos espacios y **dos suscripciones**: la de Pro (personal) sigue igual y se cobra por separado.
  - La clínica paga su base y una licencia por profesional. Si el titular atiende pacientes, **ocupa una licencia** que paga la clínica.
  - Business nunca escribe en la suscripción de Pro: lo comprueban el store y los golden.
- **Cerrar el centro y seguir en Pro** (*Ajustes → Cerrar la clínica*, solo el titular, confirmando el nombre):
  - se cancela al momento la suscripción de Stripe de la **clínica** y no se cobra nada más;
  - el equipo pierde el acceso y las invitaciones se anulan;
  - la clínica queda en solo lectura para el titular, porque la historia clínica se conserva 5 años (Ley 41/2002);
  - el titular vuelve a su consulta Pro sin ningún cambio;
  - para reabrirla basta con activar de nuevo la suscripción.
  - El golden "el Pro abrió y cerró su clínica" comprueba que Pro queda idéntico.

## Cómo activarlo

1. **Migraciones**, en el SQL Editor de Supabase y en este orden. Son idempotentes, así que se pueden repetir.
   1. `backend/scripts/business-001-foundations.sql`
   2. `backend/scripts/business-002-orgs.sql`
   3. `backend/scripts/business-003-clinical.sql`
   4. `backend/scripts/business-004-money.sql`
   5. `backend/scripts/business-005-leads.sql`
   6. `backend/scripts/business-006-knowledge.sql`
   7. `backend/scripts/business-007-daily-ops.sql`

   Todas se han probado en Postgres 16: se aplican dos veces sin error y sus triggers y restricciones se han verificado.
2. **Variables de entorno** (Vercel):

| Variable | Para qué | Obligatoria |
|---|---|---|
| `BUSINESS_ENABLED=true` | Enciende Business. Apagado, Pro no cambia y `/api/org/*` responde 404. | Sí |
| `BUSINESS_BETA_EMAILS` | Emails (separados por comas) que pueden **crear** clínicas. Los invitados se unen siempre. | Sí, en beta |
| `BUSINESS_SELF_SERVE=true` | Business a demanda: cualquier **psicólogo** crea su clínica desde *Mi Perfil* ("¿Tienes un centro de psicología?"). Quien no lo hace no ve ningún cambio en Pro: el selector de espacio solo aparece al tener clínica o invitación. | No |
| `CLINICAL_ENCRYPTION_KEY` | 64 caracteres hex (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). **Guárdala fuera del repo**: sin ella no se puede leer la historia clínica. | Sí |
| `STRIPE_PRICE_ID_BUSINESS_{ESSENTIAL\|PLUS}_{BASE\|SEAT}[_YEARLY]` | 8 precios en Stripe: base por clínica y licencia por profesional, mensual y anual. | Para cobrar |
| `BUSINESS_DPA_VERSION` | Versión vigente del DPA. Por defecto `v1-borrador`. | Al publicar el DPA revisado |
| `VERIFACTU_MODE`, `VERIFACTU_ENV` | `noverifactu`/`verifactu` y `production`/`test` para la URL del QR. | No |
| `GEMINI_API_KEY` | Ya existe. Activa el asistente de la biblioteca. | No |

3. El webhook de Stripe es el mismo de siempre: los eventos de las clínicas llevan `metadata.mainds_kind=organization` y se procesan antes y aparte de los de Pro.

## Antes de usarlo con datos reales de una clínica (bloqueante)

1. **2FA** para los miembros de las clínicas. No está hecho y es requisito del plan.
2. **DPA revisado por un abogado** (sustituye a `legal/DPA_v1.md`, que es un borrador).
3. **Validación del asesor fiscal**:
   - exención de IVA de las sesiones y de la factura del autónomo a la clínica;
   - IRPF del 15 % y del 7 %;
   - IVA del 21 % de la comisión y del alquiler;
   - facturas simplificadas.
4. **Verifactu**: falta el envío a la AEAT y la declaración responsable. Hasta entonces las facturas no llevan la leyenda VERI\*FACTU. Ver `VERIFACTU.md`; para autónomos es obligatorio desde julio de 2027 y afecta también a Pro.
5. Precios creados en Stripe y webhook probado en modo test.

## Cómo se prueba

```bash
cd backend && npm test                  # 209 tests: unitarios, integración con el servidor real y golden de Pro
node e2e/business/f1.spec.mjs           # E2E con Playwright (f1…f6, f7-self-serve, f8-close-clinic), arrancan backend y Vite solos
node e2e/business/explore-owner.mjs     # recorrido exploratorio de la titular (capturas, no es un test)
```

Los E2E guardan capturas en `e2e/.shots/` (ignorado por git).

## Pendiente (Fase 7 y siguientes)

- **Bloqueante para producción:** 2FA, Verifactu con envío a la AEAT (también para Pro) y textos legales revisados.
- **Integración con Pro:**
  - que el paciente vea "Clínica X" en su app;
  - bloques de la clínica dentro de la agenda Pro;
  - vincular el "centro" de un Pro con la clínica por CIF;
  - convergencia de paneles (backlog D1).
- **Cobro online** con Stripe Connect.
- **Reserva directa de huecos** desde el widget (necesita disponibilidad por espacio).
- **Comunicaciones:** recordatorios de cita a pacientes (el primer agujero de dinero según la evaluación; se apoyan en las series), WhatsApp entrante y avisos de nuevas solicitudes.
- **Otros:**
  - exportaciones A3/Holded y exportación completa por organización;
  - firma digital del paciente;
  - subida de ficheros a la biblioteca;
  - Enterprise y multisede grande.
