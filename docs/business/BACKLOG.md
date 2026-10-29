# mainds business — Backlog ejecutable (Fases 0–5)

> Fuente: `docs/business/MAINDS_BUSINESS_PLAN.md` (aprobado). Elaborado por el `product-owner`; lo implementa el `dev` fase a fase y lo verifica el `qa`. **Restricción nº 1: proteger al 100 % la experiencia y los ingresos de mainds pro.**

## 0. Decisiones de PO que ajustan el plan

| # | Decisión | Por qué |
|---|---|---|
| D1 | **Los datos de clínica viven en tablas propias `org_*`.** No se escribe ninguna fila de clínica en las tablas heredadas (`sessions`, `care_relationships`, `invoices`, `session_entry`, `entries`, `templates`, `center`…) ni se les hace `ALTER`. La convergencia (paneles Pro con `workspace` + `organization_id` en tablas heredadas) pasa a la Fase 6. | `server.js` tiene ~146 consultas directas a esas tablas y ~275 accesos a la caché. Una sola consulta sin filtrar mezclaría datos de una clínica en la vista Pro: fuga de datos clínicos y además `checkRelationLimit` contaría mal. |
| D2 | **El espacio de trabajo va en la ruta (`/api/org/:orgId/...`)**, no en una cabecera `X-Workspace-Id`. `apiFetch` no se toca. | No cambia CORS ni las peticiones de Pro, y queda explícito. |
| D3 | **Adaptador de almacenamiento** `backend/business/store.js` con tres drivers: `supabase`, `file` y `memory`. | Permite probar de punta a punta en local sin Supabase. |
| D4 | **Verifactu**: huella encadenada, QR, modelo de registro e inmutabilidad, solo para facturas de clínica. **Sin envío a la AEAT, sin la leyenda "VERI\*FACTU" y sin tocar Pro.** | El envío exige certificado y declaración responsable. Poner la leyenda sin enviar los registros sería un incumplimiento. |
| D5 | **Se aplazan 2FA, Stripe Connect y el cifrado de los datos Pro existentes.** 2FA es **requisito** antes de activar Business en producción con datos reales. | Tocan login, pagos o datos de usuarios Pro existentes. |
| D6 | **No se cambia la fiscalidad de Pro** (IVA 21 % por defecto en `BillingPanel.tsx:212`, pie "exentos de retención" en `server.js:12345`) hasta que lo valide un asesor. | Cambiaría facturas reales de clientes. |

**Preguntas abiertas → decisiones tomadas (revisables por el fundador):**
1. D1 aceptada.
2. Stripe: 4 precios mensuales + 4 anuales (base y licencia de cada plan); la licencia es un precio por unidad aparte.
3. Los leads descartados se purgan a los 12 meses.
4. El titular cuenta como licencia facturable solo si tiene un rol clínico.

---

## 1. Reglas transversales

- **R1. Feature flag `BUSINESS_ENABLED`** (por defecto `false`).
  - Con el flag apagado: `GET /api/org/me` → `200 {enabled:false, memberships:[]}`; el resto de `/api/org/*` y `/api/public/org/*` → `404`.
  - `BUSINESS_BETA_EMAILS` (lista separada por comas): solo esas cuentas y los superadmin pueden **crear** organizaciones. Los invitados se unen siempre.
- **R2. Tablas sin migrar.**
  - El driver de Supabase, ante tabla inexistente (`42P01` / `PGRST205`), responde `503 {code:'BUSINESS_NOT_MIGRATED'}`.
  - Excepción: `GET /api/org/me` → `200 {enabled:false}`.
  - Nunca 500. Pro no se ve afectado.
- **R3. Adaptador `store`.**
  - Interfaz: `get`, `list({eq,in,gte,lte,order,limit})`, `insert`, `update`, `remove`.
  - **Lista blanca de tablas** (`organizations`, `org_*`, `access_audit`, `verifactu_records`); cualquier otra lanza error, y hay test que lo comprueba.
  - Tablas de solo inserción (`access_audit`, `verifactu_records`): `update`/`remove` lanzan error.
  - Los drivers `file` y `memory` emulan las restricciones únicas clave (slug, email de miembro por organización, número de factura por emisor y serie) y devuelven `UNIQUE_VIOLATION`.
  - Selección con `BUSINESS_STORE`:
    - Por defecto `supabase` si existe `supabaseAdmin`.
    - Si no, `file` en `backend/.business-store.local.json` (ruta configurable con `BUSINESS_STORE_FILE`, fichero en `.gitignore`).
    - **En serverless sin Supabase, Business queda deshabilitado.**
- **R4. Caché.**
  - Las tablas de Business **no entran** en `loadSupabaseCache` ni en `saveSupabaseDb`. Se consultan directamente y paginadas.
  - Rango máximo: 62 días o 500 filas; por encima → `400`.
- **R5. Ubicación del código.**
  - Backend: `backend/business/*.js`, con `index.js` exportando `createBusinessRouter({store, authenticateRequest, isSuperAdmin, stripe, deps})`.
  - Lógica pura: `backend/utils/{orgPermissions,commissions,settlements,fieldCrypto,nif}.js`.
  - Tests: `backend/test/business/*.test.js`.
  - Frontend: `components/business/*` y `services/businessService.ts`, cargados con `React.lazy`.
  - En `server.js` solo se permite: montar el router, la rama del webhook (F1), los arreglos de F0 y la inyección del lector de huecos ocupados personales (F2).
- **R6. Ámbito personal.** No cambia nada en los endpoints existentes (lo garantiza D1; lo vigilan los tests golden). Para la Fase 6: post-filtro `organization_id == null` en memoria.
- **R7. Migraciones.**
  - Ficheros `backend/scripts/business-00N-<tema>.sql` idempotentes, con `gen_random_uuid()` y `timestamptz`.
  - **RLS activado sin políticas** en todas las tablas nuevas.
  - Cada migración actualiza `SUPABASE_SCHEMA.md`. Las aplica el fundador a mano.
- **R8. Autorización.**
  - Toda ruta `/api/org/:orgId/*` pasa por `authenticateRequest` → `requireMember`.
  - No miembro, o membresía `left`/`suspended` → `404`. Sin permiso → `403 {code:'FORBIDDEN'}`.
  - `can(member, action)` sale solo de `orgPermissions.js`.
  - **Ser superadmin no da acceso a datos clínicos.**
- **R9. Estado de la suscripción.**
  - `orgAccess(org)` devuelve `full` (en prueba o `active`) o `read_only`.
  - En `read_only`, las mutaciones devuelven `402 ORG_SUBSCRIPTION_REQUIRED`, salvo las de facturación del titular.
  - Funciones Plus en una organización Essential fuera de prueba → `402 PLAN_UPGRADE_REQUIRED`.
- **R10. Privacidad.**
  - Nunca se loguea contenido clínico, ni nombres ni emails de pacientes.
  - El contenido clínico se cifra con `fieldCrypto` usando `CLINICAL_ENCRYPTION_KEY` (64 caracteres hex). Sin clave → `503 ENCRYPTION_NOT_CONFIGURED`.
- **R11. Dinero.** Cálculo en **céntimos enteros** con funciones puras y redondeo half-up por línea.
- **R12. Errores.** Formato `{error:'<texto en español>', code:'<CONSTANTE>'}`. Toda la interfaz en español.
- **R13. Dependencias.**
  - Solo se añade `qrcode` (F3).
  - TOTP y criptografía con `node:crypto`.
  - Playwright **no** se añade a `package.json`; los E2E van en `e2e/business/*.spec.mjs` y usan el Playwright del entorno.
- **R14. Definición de hecho por fase.**
  - `cd backend && npm test` en verde, incluidos los golden.
  - `npm run build` en verde.
  - `PORT=3099 node server.js` sin variables de Supabase arranca con el flag apagado y encendido, y `GET /api/plans` → `200`.
  - Con el flag apagado, la interfaz Pro es idéntica (no aparece `data-testid="workspace-switcher"`).
  - Cada fase entrega su migración y su commit.
  - Arranque para QA:
    ```
    BUSINESS_ENABLED=true BUSINESS_STORE=file BUSINESS_BETA_EMAILS=owner@test.local \
    CLINICAL_ENCRYPTION_KEY=<64hex> MAINDS_DB_FILE=<tmp>.json PORT=3099 node server.js
    ```

---

## 2. Fases

### Fase 0 — Cimientos

**Alcance**
- **0.1 Autorización de centros y plantillas.**
  - Rutas afectadas: `GET/POST/PATCH/DELETE /api/centers*`, `GET /api/center/:centerId/unbilled` y `GET/POST/PUT/DELETE/PATCH(archive|unarchive) /api/templates*`.
  - Comparan `psychologistId` / `psych_user_id` (de query o body) con `req.authenticatedUserId`.
  - Si no coincide y no es superadmin → `403 {error:'Acceso denegado'}`.
  - La comprobación va **antes** de la rama de Supabase.
- **0.2 Banco de tests.**
  - `"test": "node --test test/"`.
  - `MAINDS_DB_FILE` configurable (`server.js:119`).
  - `test/helpers/server.js`: puerto aleatorio, base de datos temporal, sin variables de Supabase ni de Stripe; usuarios de prueba vía `/api/auth/register|login`.
- **0.3 Tests golden** (`test/golden.test.js` + `test/golden/*.json`), **generados antes de cualquier cambio**.
  - Semilla: un Pro, 2 pacientes, una relación, sesiones (fechas en 2030) y una factura.
  - Endpoints capturados: `/api/sessions`, `/api/relationships`, `/api/invoices`, `/api/centers` y `/api/templates`, con ids y fechas normalizados.
- **0.4 Esqueleto Business.**
  - `backend/business/{index,store,flags,errors}.js`, montado en `/api/org` y `/api/public/org`.
  - `GET /api/org/me` según R1/R2.
- **0.5 `utils/fieldCrypto.js`.**
  - AES-256-GCM con formato `enc:v1:<iv>:<tag>:<data>`.
  - El texto en claro antiguo pasa tal cual; el cifrado alterado lanza error.
- **0.6 Auditoría.**
  - Migración `business-001-foundations.sql` con la tabla `access_audit`.
  - `business/audit.js recordAccess()` nunca lanza; si falla, recurre a `auditLog`.
- **0.7 Análisis** en `docs/business/VERIFACTU.md`.

**Fuera de alcance**
- Cifrar o auditar los datos Pro.
- Borrado RGPD y términos en BD.
- Barrido completo de autorización: el dev solo **lista** otros endpoints sospechosos.

**Criterios de aceptación**
- Centros:
  - `GET /api/centers?psychologistId=<otro>` → `403`.
  - Con el id propio → `200`.
- Mismo comportamiento (→ `403` con un id ajeno) en `GET /api/templates?psych_user_id=<otro>`, `POST /api/centers` con un id ajeno y `PUT /api/templates/:id` con `psych_user_id` ajeno.
- El superadmin no recibe `403`.
- Tests de `fieldCrypto`: ida y vuelta, IV distinto, error si se altera, texto en claro sin cambios y error si falta la clave.
- `npm test` incluye colaboradores, golden, autorización y crypto, y `npm run test:webhook` sigue pasando.
- `db.json` del repo **no cambia** al ejecutar los tests.
- Con el flag apagado: `GET /api/org/me` → `200 {enabled:false}` y `GET /api/org/x` → `404`.

**Riesgos.** El frontend podría enviar un `psychologistId` distinto del usuario; QA revisa con `grep` `CentrosPanel`, `TemplatesPanel` y `BillingPanel`. **La corrección 0.1 se puede desplegar en producción ya.**

---

### Fase 1 — Núcleo multi-tenant

**Migración `business-002-orgs.sql`**
- `organizations`: campos del plan + `trial_ends_at`, `plan_id` y `billing_interval`.
- `org_members`: campos del plan + `invitation_token_hash`, `invitation_expires_at`, `irpf_rate`, `public_profile jsonb` y `accepts_leads`.

**Alcance**
- **1.1 `utils/orgPermissions.js`.**
  - Roles: `titular`, `gerente`, `director_clinico`, `psicologo`, `en_practicas`, `recepcion` y `contable`.
  - Acciones cerradas:
    - `org.subscription`, `org.delete`, `org.settings`
    - `team.manage`
    - `agenda.view_all`, `agenda.view_busy`, `agenda.manage_all`, `agenda.manage_own`
    - `patients.contact_all`, `patients.contact_assigned`
    - `clinical.read_assigned`, `clinical.read_all`, `clinical.break_glass`
    - `billing.manage`, `billing.own`, `billing.read_export`
    - `settlements.manage`, `settlements.own`, `settlements.read`
    - `leads.manage`, `leads.assigned`
    - `library.manage`, `library.consume`
    - `audit.view`
  - `permissions_override` solo quita permisos o concede los delegables. **Nunca concede `clinical.*` a `recepcion` ni a `contable`.**
- **1.2 `business/workspace.js`.** `requireMember` rellena `req.workspace = {orgId, org, member, can, access}`.
- **1.3 Endpoints.**
  - `GET /api/org/me` → `{enabled, canCreateOrg, memberships:[{orgId,name,slug,logo_url,role,status,permissions}], pendingInvitations}`.
  - `POST /api/org` → `201`:
    - Crea el titular `active`, la organización `trialing` y `trial_ends_at` a +14 días.
    - Exige `dpa_accepted:true` y `dpa_version === BUSINESS_DPA_VERSION` (si no, `400`). Guarda los datos del DPA y audita con la IP.
    - Fuera de la lista beta → `403 BUSINESS_NOT_ALLOWED`. Slug duplicado → `409`. Sin nombre → `400`.
  - `GET /api/org/:orgId` (cualquier miembro) y `PATCH /api/org/:orgId` (`org.settings`).
  - `GET /api/org/:orgId/members`: email, tipo de relación y modelo de facturación solo con `team.manage`.
  - `POST .../members/invite {email, role, employment_type, billing_model, supervisor_member_id?}` → `201 {member, invite_url}`:
    - Token de 32 bytes; se guarda solo su sha256; caduca a los 7 días.
    - `role:'titular'` → `400`. Email ya activo o invitado → `409`.
    - Se envía con Resend si existe el helper; si no, la interfaz muestra el enlace.
  - `PATCH .../members/:id`: nadie cambia el rol del titular ni se escala sus propios permisos (`403`).
  - `POST .../members/:id/suspend|reactivate` y `DELETE .../members/:id` (→ `left`).
  - `POST /api/org/:orgId/leave`: el titular recibe `400`.
  - `POST /api/org/invitations/accept {token}` → `200`:
    - Token inválido o caducado → `404`. Email distinto → `403`. Ya aceptada → `409`.
    - **No toca `users.is_psychologist`.**
  - `POST /api/org/invitations/decline`.
  - `GET /api/org/admin/orgs`: solo superadmin, sin datos clínicos.
- **1.4 Suscripción de la clínica** (`business/billing.js`).
  - Variables de entorno: `STRIPE_PRICE_ID_BUSINESS_{ESSENTIAL|PLUS}_{BASE|SEAT}[_YEARLY]`.
  - `POST /api/org/:orgId/billing/checkout {plan, interval}`:
    - Solo el titular. Sin precios configurados → `503 STRIPE_NOT_CONFIGURED`.
    - Checkout con 2 líneas (base y licencias×`quantity`) y `metadata {mainds_kind:'organization', organization_id}` en la sesión y en la suscripción.
  - `GET .../billing`: estado, licencias facturables y días de prueba.
  - `syncSeats(org)`:
    - `quantity` = miembros `active` con `seat_billable` (`psicologo`, `director_clinico`, `en_practicas`; el titular, solo si es clínico).
    - Se ejecuta al aceptar, suspender o dar de baja.
    - Sin Stripe no hace nada. Si falla, no bloquea y marca `settings.seat_sync_pending`.
  - **Webhook** (`server.js` ~6774, justo tras `constructEvent`): `if (isOrgStripeEvent(event)) return handleOrgStripeEvent(...)`. Va **primero**, antes de cualquier lógica Pro.
- **1.5 Frontend.**
  - `services/businessService.ts`.
  - En `App.tsx`:
    - `activeWorkspace` (`'personal'` o el `orgId`) en localStorage por usuario, dentro de try/catch.
    - Una sola llamada a `/api/org/me` tras el login. Si no devuelve `200`, o devuelve `enabled:false` sin membresías ni `canCreateOrg`, todo funciona como hoy.
  - `components/business/`:
    - `WorkspaceSwitcher`: **solo** si hay membresías o `canCreateOrg`.
    - `ClinicWorkspace`: barra lateral según permisos.
    - `CreateClinicWizard`: nombre, slug, plan y casilla del DPA.
    - `TeamPanel`.
    - `InviteAcceptScreen`: `?org_invite=<token>` tras el login.
    - Para quien no es psicólogo: botón "Abrir Clínica X" en la vista de paciente.
    - Banner de prueba o caducidad con CTA para el titular.
  - `docs/business/legal/DPA_v1.md`, marcado **BORRADOR**.

**Fuera de alcance:** 2FA, 3 meses de Pro gratis, Enterprise, portal de cliente de Stripe de la organización, varios titulares.

**Criterios de aceptación**
- Tests de `orgPermissions`: cubren **todas las celdas** de la matriz del plan (§1.3), y el override no puede conceder `clinical.*` a `recepcion`.
- Store: tabla fuera de la lista blanca → error; `update` en `access_audit` → error.
- Integración local con el driver `file`, en este orden:
  1. El usuario beta crea una clínica → `201`; otro usuario → `403`.
  2. El titular invita a A → `201`.
  3. B acepta con el token de A → `403`.
  4. A acepta → `200`.
  5. C (no miembro) → `404`.
  6. Recepción invita → `403`.
  7. Se da de baja a A → su siguiente petición → `404`. Su espacio personal y los golden no cambian.
- Webhook: un evento con `metadata.mainds_kind='organization'` actualiza la organización y no invoca la lógica Pro. `test:webhook` sigue pasando.
- `orgAccess`: con la prueba caducada, `POST` → `402` y `GET` → `200`.
- No regresión:
  - Un Pro sin membresías con el flag encendido: golden idénticos, `{enabled:true, memberships:[], canCreateOrg:false}` y sin selector.
  - El chunk principal crece menos de 5 KB gzip.
- E2E `e2e/business/f1.spec.mjs`: crear → invitar → aceptar → cambiar de espacio.

**Riesgos.** Que el webhook confunda un pago de clínica con uno Pro (mitigado: la rama va primera y tiene test). Carreras en `syncSeats` (se recalcula siempre desde la BD). DPA en borrador.

---

### Fase 2 — Operativa clínica

**Migración `business-003-clinical.sql`**
- `org_locations` y `org_rooms`.
- `org_patients`: `assigned_member_ids uuid[]`, `acquisition_source`, `lead_id`, `status`, `email` y `phone`.
- `org_appointments`: `member_id`, `patient_id`, `location_id`, `room_id`, `starts_at`, `ends_at`, `status` (`scheduled|completed|cancelled|no_show`), `service_type`, `price`, `psych_percent` y `psych_fixed_fee`.
- `org_clinical_notes`: `patient_id`, `author_member_id`, `appointment_id?`, `visibility` (`clinical_record|private_annotation`), `content_enc` y `amends_note_id`.
- `org_consent_templates` y `org_patient_consents`.

**Alcance**
- **2.1 Sedes y salas.** CRUD con `team.manage`. Borrar una sala con citas futuras → `409 ROOM_HAS_APPOINTMENTS`.
- **2.2 Pacientes.**
  - `patients.contact_all` gestiona a todos; el psicólogo, solo a los suyos.
  - En `GET /patients`, el psicólogo y el de prácticas ven solo sus asignados; un paciente ajeno → `404`.
  - Asignación: `PUT /patients/:id/assignments`.
- **2.3 Agenda.**
  - `GET /appointments?from&to&memberId&roomId&locationId`, con un máximo de 62 días.
  - Con solo `agenda.view_busy`, las citas de otros llegan como `{id, member_id, room_id, starts_at, ends_at, busy:true}`.
  - `POST/PATCH /appointments`:
    - Sala ocupada → `409 ROOM_CONFLICT`. Profesional ocupado → `409 PROFESSIONAL_CONFLICT`.
    - El psicólogo solo puede crear para sí y para sus asignados (si no, `403`).
- **2.4 Agenda unificada.**
  - `GET /api/org/me/busy?from&to`: los bloques ocupados de todas las membresías y del espacio personal.
  - El espacio personal se lee con `deps.readPersonalBusy(userId, from, to)`, inyectado desde `server.js`: solo lectura, solo inicio y fin.
  - Si una cita choca con otro espacio → `201` con `warnings:['CONFLICT_OTHER_WORKSPACE']`.
- **2.5 Historia clínica y anotaciones privadas.**
  - `POST /patients/:id/notes`: solo clínicos asignados o el director, con el contenido cifrado.
  - La historia clínica es inmutable: se corrige con `amends_note_id`. La anotación privada la edita su autor.
  - `GET /patients/:id/notes`:
    - Asignado, supervisor del de prácticas y director → `200`. Recepción, contable, gerente y titular no clínico → `403`.
    - Se audita `clinical.read` o `clinical.read.denied`.
  - `POST /patients/:id/break-glass {justification≥20}`: solo el titular. Devuelve solo la historia clínica y se audita.
  - **Las anotaciones privadas solo las ve su autor, siempre.**
- **2.6 Consentimientos.**
  - Plantillas: CRUD con `team.manage` o el director.
  - `POST /patients/:id/consents {template_id, method}` guarda una copia del texto, su sha256, `signed_at` y `registered_by`.
- **2.7 Auditoría.** `GET /api/org/:orgId/audit` (`audit.view`) y `AuditPanel`.
- **2.8 Baja con reasignación.** `POST /members/:id/offboard {reassign}`.
- **2.9 Interfaz.** `AgendaPanel`, `PatientsPanel`, `PatientClinicalPanel`, `LocationsRoomsPanel` y `AuditPanel`.

**Fuera de alcance:** 2FA; marca de la clínica en la app del paciente; bonos; Google Calendar de la clínica; `dispo` por espacio; traspaso de historia; exportación; recordatorios; firma digital; bloques de clínica en `PsychologistSchedule`.

**Criterios de aceptación**
- Aislamiento: un psicólogo en las clínicas A y B y en su espacio personal no ve en ningún espacio datos de los otros; `GET /api/org/B/patients/:idDeA` → `404`; golden sin cambios.
- Recepción lee notas → `403` + fila `clinical.read.denied`.
- Las anotaciones privadas no aparecen en las respuestas del director, del supervisor ni de break-glass.
- El contenido guardado empieza por `enc:v1:`.
- Conflictos: sala ocupada → `409 ROOM_CONFLICT`; psicólogo creando una cita para otro → `403`.
- Vista `busy` sin `patient_id`.
- Tests del detector de solapes: bordes contiguos no chocan; las citas canceladas no cuentan.
- E2E: recepción crea paciente → asigna → reserva sala → P1 escribe notas → el director solo ve la historia → aparece en auditoría.

**Riesgos.** Un filtro olvidado (mitigación: un único `patientScope(member)`). Rendimiento de la agenda. Pilotar sin 2FA ni DPA revisado está **prohibido**.

---

### Fase 3 — Dinero

**Migración `business-004-money.sql`**
- `org_billing_entities` y `org_commission_rules`.
- `org_invoices`:
  - `issuer_type` (`entity|member`), `billing_entity_id`, `issuer_member_id`, `series`, `number`.
  - `kind` (`patient|psych_to_org|org_to_psych`), `lines jsonb`, totales.
  - `status` (`draft|issued|rectified|paid`), `rectifies_invoice_id`.
  - Índice único `(issuer_key, series, number)`.
- `org_settlements`.
- `verifactu_records` (solo inserción).

**Alcance**
- **3.1 Emisores.** CRUD con `billing.manage`, validación de NIF/NIE/CIF en `utils/nif.js`, series por año y exención de IVA por defecto (art. 20.1.3º LIVA).
- **3.2 Facturas al paciente.**
  - `POST /invoices` crea el borrador a partir de citas `completed` no facturadas; una cita ya facturada → `409`.
  - `POST /invoices/:id/issue`: numeración con índice único y hasta 3 reintentos.
  - Una factura emitida es inmutable: `PATCH` → `409`.
  - Permisos: `billing.manage` y recepción, todas; el psicólogo, las suyas; el contable, solo lectura.
- **3.3 Rectificativas.** `POST /invoices/:id/rectify {reason}`: serie R con importes negativos; la original pasa a `rectified`.
- **3.4 Verifactu (`business/verifactu.js`).**
  - Huella SHA-256 encadenada **por NIF del emisor** con la concatenación oficial de la AEAT. Tipo F1, o R4 para rectificativas.
  - URL del QR de cotejo y su imagen (`qrcode`).
  - `status:'pending_submission'`, **sin la leyenda VERI\*FACTU**.
- **3.5 Reglas de comisión.**
  - `utils/commissions.js resolveRule()` con esta precedencia: miembro+servicio+origen > miembro+servicio > miembro+origen > miembro > servicio+origen > servicio > origen > regla por defecto. Ante empate, gana el `valid_from` más reciente.
  - El valor se **congela en la cita**.
- **3.6 Liquidaciones** con `utils/settlements.js buildSettlement()` para los 4 modelos:
  - Nómina: informe de productividad (`GET /reports/productivity`).
  - Autónomo y factura la clínica: lo que corresponde al psicólogo, IRPF (`irpf_rate` 15/7/0), IVA exento configurable y licencia repercutible opcional.
  - Autónomo y factura el psicólogo: canon de la clínica al psicólogo con IVA del 21 %.
  - Alquiler de despacho: horas de sala × `hourly_rate`, o cuota fija, con IVA del 21 %.

  Endpoints:
  - `POST /settlements/generate {period}`: idempotente; solo regenera borradores.
  - `POST /settlements/:id/validate`: **solo el propio miembro**.
  - `POST /settlements/:id/invoice`: genera la factura `psych_to_org` con su registro Verifactu.
  - `POST /settlements/:id/mark-paid`.
- **3.7 Exportación para la gestoría.** `GET /invoices/export.csv` (`billing.read_export`), con `;`, coma decimal y BOM.
- **3.8 Interfaz.** `BillingEntitiesPanel`, `ClinicInvoicesPanel` (HTML imprimible con QR), `CommissionRulesPanel` y `SettlementsPanel`.

**Fuera de alcance:** envío a la AEAT, firma XAdES y declaración responsable; Verifactu para Pro (sesión propia, urgente); A3/Holded; factura del autónomo dentro de su Pro; vinculación del `center` por CIF; cambios fiscales en Pro; cobro online.

**Criterios de aceptación**
- Huella: coincide con el **ejemplo oficial de la AEAT**, y hay test de encadenamiento.
- Numeración: 20 emisiones consecutivas sin huecos; los duplicados se reintentan; cada emisor tiene su propia secuencia.
- Una factura emitida → `409` al hacer `PATCH`; la rectificativa suma cero con la original.
- Comisiones: test de precedencia y de vigencia; cambiar una regla no altera las citas ni las liquidaciones ya creadas.
- `buildSettlement` cubre los 4 modelos al céntimo.
- E2E: cita → factura → liquidación → validación → factura del autónomo con QR.
- Golden idénticos y `allocateNextInvoiceNumber` sin tocar.

**Riesgos.** Fiscales (lo valida un asesor antes del lanzamiento). Huella sin validar contra el vector oficial. Concurrencia en la numeración (se resuelve con el índice único de la BD).

---

### Fase 4 — Captación

**Migración `business-005-leads.sql`**
- `org_leads`, con los campos del plan y `events jsonb`.
- `organizations.settings.public_page`.

**Alcance**
- **4.1 Página pública.**
  - `GET /api/public/org/:slug` devuelve `200` solo si la organización es Plus o está en prueba y tiene la página activa; si no, `404`.
  - Solo publica de los miembros los datos de `public_profile`: **nunca emails, teléfonos ni ids internos**.
  - `App.tsx` detecta `/c/:slug` antes del login y muestra `PublicClinicPage` con lazy loading.
- **4.2 Widget.**
  - `/c/:slug?embed=1` y el snippet para copiar.
  - Se permite embeber en iframe **solo en `/c/*`**.
- **4.3 Solicitud.** `POST /api/public/org/:slug/leads` → `201`:
  - Guarda los `utm` y `consent_at`.
  - Sin consentimiento → `400`.
  - Si el honeypot viene relleno, responde `201` pero no guarda nada.
  - Más de 5 solicitudes por hora, IP y organización → `429`.
- **4.4 Bandeja.**
  - Alta manual con origen teléfono, WhatsApp u otro.
  - Estados `nuevo → contactado → primera_cita → paciente | descartado`; una transición no válida → `400`.
  - Asignación manual o rotatoria (entre quienes tienen `accepts_leads`).
  - El psicólogo ve solo los suyos.
  - `POST /leads/:id/convert` crea un `org_patient` con `acquisition_source:'clinic_lead'`.
- **4.5 Métricas.** `GET /leads/metrics`, por canal y por profesional.
- **Interfaz.** `LeadsInbox`, `PublicPageSettings` y `PublicClinicPage`.

**Fuera de alcance:** Stripe Connect; reserva directa de huecos; WhatsApp entrante; asignación por especialidad; avisos por email; perfil público para Pro.

**Criterios de aceptación**
- La respuesta pública no contiene `@` ni teléfonos.
- Organización Essential fuera de prueba → `404` en la página y `402` en `/leads`.
- Honeypot, falta de consentimiento y `429` cubiertos por tests.
- La asignación rotatoria reparte A, B, A, B.
- Un lead convertido liquida con la regla `clinic` (60 %) y no con la de paciente propio (80 %).
- E2E: formulario → bandeja → asignar → convertir → cita.

**Riesgos.** Spam. Cabeceras del iframe (deben limitarse a `/c/*`). Retención: los descartados se purgan a los 12 meses.

---

### Fase 5 — Conocimiento y panel del dueño

**Migración `business-006-knowledge.sql`**
- `org_library_items`, `org_courses`, `org_course_modules`, `org_course_progress` y `org_supervision_logs`.

**Alcance**
- **5.1 Biblioteca.** Protocolos, materiales, plantillas y enlaces (Markdown, URL, etiquetas).
  - `library.manage`: titular, gerente y director.
  - `library.consume`: psicólogo y en prácticas.
  - Recepción y contable → `403`.
- **5.2 Cursos.** Módulos con minutos.
  - `POST /courses/:id/modules/:mid/complete`.
  - Horas por miembro: el gestor ve las de todos; cada miembro, las suyas.
- **5.3 Supervisión.** Registro con notas cifradas. Solo lo ven los dos implicados y el director.
- **5.4 IA sobre la biblioteca.** `POST /library/ask`:
  - Selecciona por palabras clave y llama a Gemini.
  - La pregunta se anonimiza en el cliente con `chatAnonymizer.ts`; el backend solo envía la biblioteca.
  - Sin clave → `503 AI_NOT_CONFIGURED`.
  - Cliente de IA inyectable. Es una función Plus.
- **5.5 Panel del dueño.** `GET /api/org/:orgId/dashboard` (titular y gerente):
  - ingresos por profesional y sede;
  - ocupación de salas;
  - no-show;
  - pacientes activos;
  - leads y conversión;
  - liquidaciones pendientes.

  Interfaz con `recharts`.

**Fuera de alcance:** subida de ficheros, RAG con vectores, certificados, IA sobre la historia clínica, Fase 6.

**Criterios de aceptación**
- Matriz de permisos de biblioteca, cursos y supervisión con tests.
- El prompt que recibe la IA simulada no contiene datos de `org_patients` ni de las notas.
- KPIs con función pura (p. ej. 2 no-shows de 10 → 20 %).
- E2E: curso → módulo completado → horas en el panel.

**Riesgos.** Alucinaciones (la interfaz muestra un aviso y las fuentes). Coste de Gemini (límite de peticiones por miembro).

### Fase 6 — Operativa diaria (feedback de la titular)

> Sale de la evaluación de una titular que también pasa consulta: [`EVALUACION_TITULAR.md`](EVALUACION_TITULAR.md).

**Migración `business-007-daily-ops.sql`.** Aditiva e idempotente:
- `org_patients.default_price`;
- `org_appointments.series_id`;
- índices para los pendientes.

Las tarifas por servicio van en `organizations.settings.service_prices` y no necesitan columna.

**Alcance**
- **6.1 Tarifas y precio en el servidor.**
  - `PATCH /api/org/:orgId` acepta `service_prices` (`org.settings`).
  - Al crear una cita, el precio se resuelve así: el indicado, si no el del paciente, si no la tarifa del servicio. Es una función pura, `resolvePrice`.
  - `0` es un precio válido (sesión gratuita), no "sin precio".
- **6.2 Citas periódicas.**
  - `POST /appointments` acepta `repeat: { every_weeks: 1-4, count: 2-26 }`.
  - Se mantiene la hora de reloj de España con el cambio de hora (`addDaysLocal`).
  - Si la primera cita choca, `409` como siempre.
  - Las repeticiones que chocan se saltan y se devuelven en `series.skipped`.
  - `POST /appointments/:id/cancel-following` no toca citas pasadas ni facturadas.
- **6.3 Inicio.** `GET /home` en una sola llamada, filtrado por permisos:
  - mis citas de hoy (si atiendo pacientes);
  - la clínica hoy (`agenda.view_all`);
  - pendientes: citas pasadas sin cerrar, sesiones sin facturar con su importe y las que no tienen precio, borradores, solicitudes nuevas, liquidaciones por validar e invitaciones;
  - primeros pasos (`team.manage`/`org.settings`).
- **6.4 Cierre en bloque.** `POST /appointments/bulk-status`:
  - solo citas programadas ya empezadas y no facturadas;
  - cada una con su permiso (un psicólogo solo cierra las suyas).
- **6.5 Facturación en lote** (`billing.manage`).
  - `POST /invoices/bulk` crea un borrador por paciente con el mismo creador que la factura individual (`createPatientDraft`).
  - Las citas sin precio se informan (`MISSING_PRICE`).
  - `POST /invoices/issue-batch` emite cada borrador por separado (número y Verifactu).
- **6.6 Citas de un paciente.** `GET /patients/:id/appointments`. Quien solo ve huecos ve las citas de otros profesionales como "ocupado".
- **6.7 Interfaz.**
  - Inicio con saludo, acciones rápidas, "Tu día", "Pendiente" y "Primeros pasos", con el mismo formato que mainds pro.
  - Navegación entre secciones con parámetros (`ClinicContext.open`).
  - Menú agrupado (Día a día, Gestión, Equipo, Clínica), sin el botón duplicado de volver.
  - Agenda:
    - alta rápida de paciente;
    - precio sugerido;
    - repetición;
    - vista de día (por defecto en el móvil);
    - detalle de la cita con Ficha, Nota de la sesión y Facturar.
  - Ficha:
    - pestaña Citas y "Nueva cita";
    - precio propio;
    - profesional por defecto al crear el paciente.
  - Facturación: pestañas "Facturar pendientes" y "Tarifas".
  - Escape cierra los modales.

**Criterios de aceptación**
- Los tests de `f6-daily-ops.test.js` pasan:
  - `resolvePrice`;
  - repetición a través del cambio de hora;
  - día de Madrid;
  - permisos de `/home`;
  - serie con conflicto saltado;
  - cierre en bloque con permisos;
  - lote sin duplicados;
  - `MISSING_PRICE`;
  - emisión con Verifactu.
- E2E `f6.spec.mjs`: primeros pasos → tarifas → cita semanal con paciente nuevo → ficha con citas → cerrar pasadas desde Inicio → facturar y emitir → "Todo al día" → agenda de día en el móvil.
- La migración 007 se aplica dos veces en Postgres 16.
- Los golden de Pro no cambian.

**Fase 7 (siguiente)**
- Recordatorios a pacientes por email o SMS, con consentimiento y sobre `series_id`.
- El paciente ve "Clínica X" en su app.
- Tarifa por profesional.
- Reserva directa desde el widget con las tarifas.

---

## 3. Orden y requisitos para producción

- **Orden:** 0 → 1 → 2 → 3 → 4 → 5 → 6. QA valida cada fase antes de pasar a la siguiente.
- **Se despliega ya, sin flag:** el arreglo de autorización 0.1.
- **Antes de `BUSINESS_ENABLED=true` en producción con datos reales:**
  1. Migraciones aplicadas y RLS comprobado.
  2. `CLINICAL_ENCRYPTION_KEY` configurada.
  3. **2FA TOTP para los miembros** (sesión "Fase 1.5").
  4. DPA revisado por un abogado.
  5. Precios de Stripe creados y webhook probado en modo test.
  6. Validación del asesor fiscal antes de facturar.
- **Verifactu para Pro:** obligatorio para autónomos desde el **1 de julio de 2027** (ver `docs/business/VERIFACTU.md`; comprobar el plazo vigente). Hay que planificar la sesión "Verifactu Pro + envío a la AEAT".
