# mainds business — Plan de producto y desarrollo

## Contexto

mainds hoy es un SaaS para psicólogos autónomos (mainds pro). Queremos venderlo también a **despachos y clínicas de psicología**: varios profesionales (contratados, autónomos, en prácticas), un dueño, recepción, y varios modelos de reparto de ingresos. Debe ser **el mismo producto, repo, infraestructura y base de datos**, sin degradar ni cambiar la experiencia del psicólogo individual actual.

### Lo que hay hoy (resultado de explorar el código)
- **Todo pertenece a un `psychologist_user_id`**. No existe ningún concepto de organización, tenant o equipo (SUPABASE_SCHEMA.md; `backend/server.js`).
- **Roles**: solo el booleano `users.is_psychologist` y el superadmin por email (`server.js:716`). El mismo usuario puede ser psicólogo en una relación y paciente en otra.
- **Control de acceso**: solo en el backend, con la service key. El RLS es decorativo porque compara `auth.uid()` con `users.id`, que nunca coinciden. Cada ruta comprueba a mano; el helper es `isAuthorizedForUser` (`server.js:760`).
- **Agujeros de seguridad**: `/api/centers` (`server.js:19176-19370`) y `GET /api/templates` (`:19533`) no comparan el `psychologistId` recibido con el usuario autenticado.
- **"Centros"** (`center`, `care_relationships.center_id`, `sessions.percent_psych`, facturas `invoice_type='center'` con IRPF): modelan **a un autónomo que factura a una clínica**. Es justo la otra mitad de las liquidaciones de Business, y se aprovecha.
- **Facturación**:
  - Numeración por psicólogo (`allocateNextInvoiceNumber`, `server.js:9727`) con índice único `(psychologist_user_id, invoiceNumber)`.
  - Facturas rectificativas en serie R.
  - El PDF se genera desde HTML.
  - **No hay Verifactu** ni cobro al paciente (el payment link es un stub).
- **Planes** (`server.js:924-942`): starter 9,99 €, mainder 19,99 € y supermainder 29,99 €, limitados por número de pacientes, con 14 días de prueba. Plan de paciente premium a 4,99 €.
- **Captación**: no hay página pública, ni widget de reserva, ni directorio de pacientes. El CRM de `components/sales/*` es interno de mainds (B2B).
- **RGPD**:
  - Las notas clínicas se guardan en claro.
  - El log de auditoría solo va a consola/fichero.
  - `DELETE /api/gdpr/delete-my-data` borra en duro, en contra de la retención de 5 años de la Ley 41/2002.
  - Los términos aceptados solo se guardan en localStorage.
- **Frontend**:
  - Sin router ni Context. Todo el estado vive en `App.tsx`.
  - Todos los paneles reciben `psychologistId={currentUser.id}` (`App.tsx:1551-1563`).
  - `apiFetch` (`services/authService.ts:24-56`) centraliza las cabeceras.
- **Backend**:
  - Monolito `server.js` (~1 MB) con caché en memoria (`loadSupabaseCache`, `:2330`).
  - Tests con `node:test` (`backend/test/colaboradores.test.js`).

---

## 1. Decisiones de producto clave

### 1.1 Identidad: una persona = una cuenta; las clínicas son *espacios de trabajo*
- **Nunca habrá usuarios "derivados" de la clínica.** El psicólogo siempre tiene **su propia cuenta mainds** (su identidad, login y 2FA). La clínica lo invita por email y se crea una **membresía** (`org_members`) que lo une a esa organización con un rol.
- Cada cuenta tiene de 0 a N espacios de trabajo:
  - **Espacio personal** = mainds pro tal y como existe hoy (`organization_id IS NULL`).
  - **Espacio de cada clínica** = una organización.
- **Selector de espacio** al estilo Slack/Notion: solo aparece si el usuario tiene al menos una membresía. **Si no tiene membresías, la UI es exactamente la actual.**

Casos:

| Situación | Qué ve / puede hacer |
|---|---|
| Psicólogo solo autónomo (hoy) | Igual que ahora. Cero cambios. |
| Psicólogo que **solo** trabaja para una clínica (sin Pro) | Cuenta propia gratuita. Solo ve el espacio de la clínica. No puede crear pacientes personales (para eso ve un CTA "Activa mainds pro"). La licencia la paga la clínica. |
| Psicólogo con Pro **y** que trabaja en una clínica | Selector *Mi consulta* / *Clínica X*. Datos totalmente aislados. Paga su Pro; la clínica paga su licencia. |
| Psicólogo en **dos clínicas** con mainds | Dos membresías, cada clínica paga su licencia y los datos están aislados entre ellas. Vista "Mi agenda unificada" que muestra los huecos ocupados del resto de espacios como *"Ocupado"*, sin detalles, para evitar dobles reservas. |
| Psicólogo que deja la clínica | Pierde el acceso al espacio de la clínica; su cuenta y su espacio personal siguen intactos. Los pacientes de la clínica se quedan en la clínica. Traspaso de un paciente solo con **consentimiento firmado del paciente** (flujo "traspaso de historia"). |
| Paciente | Su cuenta de paciente ve "Clínica X · Psicóloga Y" con la marca de la clínica. Puede tener relaciones con clínicas y con psicólogos particulares a la vez (ya soportado: `care_relationships` es N:M). |

### 1.2 Propiedad de los datos (RGPD / Ley 41/2002)
- En el espacio de la clínica, **la clínica es responsable del tratamiento** y mainds es encargado: se firma un DPA mainds↔clínica en el alta, con click-wrap y versionado en BD.
- El psicólogo, contratado o autónomo, actúa por cuenta de la clínica.
- **Dos capas clínicas**:
  1. **Historia clínica** (de la clínica): la ve el equipo tratante y el director clínico.
  2. **Anotaciones subjetivas** (art. 18.3 Ley 41/2002): privadas del autor y nunca visibles para otros roles. Esto reutiliza `session_entry` / `non_session_entry` con un campo `visibility: 'clinical_record' | 'private_annotation'`.
- En el espacio personal nada cambia: el psicólogo sigue siendo el responsable.

### 1.3 Roles y permisos (presets + ajustes por miembro)

| Permiso | Titular | Gerente/Admin | Director clínico | Psicólogo | En prácticas | Recepción | Contable |
|---|---|---|---|---|---|---|---|
| Suscripción mainds, borrar organización, DPA | ✅ | — | — | — | — | — | — |
| Equipo, roles, comisiones, sedes y salas | ✅ | ✅ | — | — | — | — | — |
| Agenda de todos | ✅ | ✅ | ✅ | ver huecos | ver huecos | ✅ | — |
| Datos de contacto de todos los pacientes | ✅ | ✅ | ✅ | solo asignados | solo asignados | ✅ | — |
| Historia clínica | configurable* | — | ✅ (auditado) | sus pacientes | sus pacientes (revisa el supervisor) | ❌ | ❌ |
| Anotaciones subjetivas | solo el autor | | | | | | |
| Facturación de la clínica | ✅ | ✅ | — | las suyas | — | ✅ | solo lectura y exportación |
| Liquidaciones | ✅ | ✅ | — | la suya | la suya | — | lectura |
| Leads | ✅ | ✅ | ✅ | asignados | — | ✅ | — |
| Biblioteca y formación | gestiona | gestiona | gestiona | consume | consume | — | — |

\* Por defecto el titular **no ve** la historia clínica salvo que sea a la vez psicólogo/director. Hay un "acceso de emergencia" (*break‑the‑glass*) que exige motivo y queda auditado.

- Los permisos se implementan como una matriz pura: `backend/utils/orgPermissions.js` con `can(member, action, resource)`.
- `org_members.role` guarda el preset y `permissions_override jsonb` los ajustes por miembro.

### 1.4 Modelos de relación económica clínica ↔ psicólogo
Se configuran en cada membresía (`employment_type` + `billing_model`) y pueden variar por servicio u origen del paciente:

1. **Contratado (nómina)**:
   - La clínica factura al paciente con su serie.
   - No hay liquidación; solo un informe de productividad (sesiones, horas, ingresos generados) para la nómina o los incentivos.
2. **Autónomo, factura la clínica** (el modelo más habitual):
   - La clínica factura al paciente.
   - Cada mes mainds genera la **liquidación**: lo que corresponde al psicólogo según el % (la lógica actual de `percent_psych` y `default_psych_percent`).
   - El autónomo valida la liquidación y mainds genera **su factura a la clínica** en su espacio personal, si tiene Pro. Si no lo tiene, se genera como documento de factura con sus datos y su serie, firmado por él dentro del espacio de la clínica. Esto reutiliza las facturas `invoice_type='center'`, con el `center` vinculado a la organización por CIF.
3. **Autónomo, factura el psicólogo**: el psicólogo factura al paciente con su propia serie, y la clínica le factura cada mes su **comisión o canon**.
4. **Alquiler de despacho**:
   - La clínica cobra al psicólogo una cuota fija mensual o por hora de sala reservada.
   - La sala se reserva desde la agenda; la cuota la factura la clínica al psicólogo.

**Reglas de comisión** (`org_commission_rules`): porcentaje o importe fijo por *miembro × tipo de servicio × origen del paciente* (lead de la clínica vs. paciente propio del psicólogo), con vigencia en fechas.
- Ejemplo: 60 % para el psicólogo si el lead lo trae la clínica, 80 % si el paciente lo trae él.
- El % se **congela en cada sesión** al crearla (`sessions.percent_psych` ya existe), para que cambiar la regla no altere el histórico.

**Fiscalidad** (configurable por emisor; **validar con un asesor fiscal**):
- Sesiones al paciente: exentas de IVA (art. 20.1.3º LIVA). Es la nota que ya usa el código.
- Factura del autónomo a la clínica: retención de IRPF (15 %, o 7 % en los primeros años). La exención de IVA se mantiene si es asistencia sanitaria.
  - Corregir el valor por defecto actual (IVA 21 % en las facturas a centros, `BillingPanel.tsx:212`).
  - Corregir el pie que siempre dice "exentos de retención" (`server.js:12345`).
- Canon o alquiler de la clínica al psicólogo: IVA 21 %.

**Verifactu**: la obligación entra en vigor en 2027, así que es obligatorio para Pro **y** para Business. Se hace como un módulo común en la Fase 3.

### 1.5 Pricing (decisión)

| Plan | Precio | Incluye |
|---|---|---|
| **Business Essential** | **39 €/mes por clínica + 19 €/mes por profesional** | Equipo y roles, agenda compartida, sedes y salas, pacientes e historia clínica de la clínica, facturación de la clínica + Verifactu, liquidaciones, consentimientos de la clínica, auditoría |
| **Business Plus** | **79 €/mes por clínica + 25 €/mes por profesional** | Todo lo anterior + página pública y widget de reservas, bandeja de leads con asignación y atribución, biblioteca y formación con IA, cobro online (Stripe Connect), informes avanzados y multisede |

Condiciones:
- Pacientes **ilimitados** (sin `maxRelations`).
- Recepción, gerencia y contable: **licencias gratis e ilimitadas**. Solo pagan los roles clínicos.
- 14 días de prueba. Anual = 2 meses gratis.
- Plan Enterprise (más de 25 profesionales o multisede grande) bajo presupuesto.
- **Siempre paga la clínica.** Puede **repercutir el coste de la licencia** al autónomo como concepto en su liquidación (opción configurable).
- **Bucle de crecimiento**:
  - Todo psicólogo invitado por una clínica recibe **3 meses de mainds pro gratis** para su consulta privada.
  - Un Pro que trae a su clínica obtiene comisión o meses gratis, reutilizando el programa de colaboradores (`backend/utils/colaboradores.js`).
- Referencia: una clínica de 5 profesionales paga 134 €/mes en Essential o 204 €/mes en Plus, por debajo de Clinic Cloud o Docplanner por profesional, y coherente con el precio de mainder (19,99 €).

---

## 2. Arquitectura técnica (mismo repo e infraestructura, cero regresión)

### 2.1 Principio de no regresión
- `organization_id` es **nullable** en todas las tablas; `NULL` = espacio personal.
- Un usuario sin membresías → mismas consultas y mismos resultados. Se garantiza con tests "golden" sobre los endpoints principales antes y después del cambio.
- Todo lo nuevo va en módulos aparte: `backend/business/*.js`, montado desde `server.js` como `app.use('/api/org', ...)`, y `components/business/*`. El monolito no crece.
- Feature flag `BUSINESS_ENABLED` + lista de clínicas beta (design partners).

### 2.2 Modelo de datos nuevo (migraciones SQL en `backend/scripts/`)
- `organizations`: `id`, `name`, `slug`, `logo_url`, `settings jsonb`, `plan_id`, `stripe_customer_id`, `stripe_subscription_id`, `status`, `dpa_accepted_at/version/by`, `created_by`.
- `org_billing_entities`: `org_id`, `legal_name`, `cif`, `address`, `iban`, `invoice_series jsonb`, `invoice_start_numbers jsonb`, `verifactu_config`. Una clínica puede tener más de un CIF.
- `org_locations` (sedes) y `org_rooms` (`location_id`, `name`, `hourly_rate`).
- `org_members`: `org_id`, `user_id` (null hasta que acepta), `email`, `role`, `permissions_override`, `employment_type`, `billing_model`, `seat_billable`, `status` (invited/active/suspended/left), `invitation_token`, `joined_at`, `left_at`, `supervisor_member_id`.
- `org_commission_rules`: `org_id`, `member_id?`, `service_type?`, `lead_source?`, `psych_percent`, `fixed_fee`, `valid_from`, `valid_to`.
- `org_settlements`: `org_id`, `member_id`, `period`, `status` (draft → validated → invoiced → paid), `lines jsonb` (snapshot), `totals`, `psych_invoice_id`, `org_invoice_id`.
- `org_leads`: `org_id`, contacto, `source`, `utm`, `reason`, `modality`, `preferences`, `consent_at`, `status`, `assigned_member_id`, `care_relationship_id`.
- `access_audit`: `org_id?`, `actor_user_id`, `action`, `resource_type`, `resource_id`, `patient_user_id`, `justification`, `ip`, `at`. Se usa también en el espacio personal.
- `org_library_items`, `org_courses`, `org_course_modules`, `org_course_progress`.

Columnas nuevas, todas nullable:
- `organization_id` en `care_relationships`, `sessions`, `session_entry`, `non_session_entry`, `entries` (las del psicólogo), `invoices`, `bono`, `dispo`, `templates`, `signatures`, `psychologist_materials` y `center`. En `center` sirve para vincular el "centro" de un Pro con una organización real.
- `sessions.location_id`, `sessions.room_id`.
- `care_relationships.acquisition_source`, `care_relationships.lead_id`.
- `invoices.billing_entity_id`.
- `session_entry.visibility`.

Índices:
- Nuevo índice único parcial `(billing_entity_id, invoiceNumber) WHERE billing_entity_id IS NOT NULL`.
- El actual pasa a cubrir solo `billing_entity_id IS NULL`.

### 2.3 Contexto de espacio de trabajo
- **Backend**: middleware `resolveWorkspace` en `backend/business/workspace.js`, ejecutado después de `authenticateRequest` (`server.js:686`).
  - Lee la cabecera `X-Workspace-Id`. Si no viene, el espacio es el personal.
  - Valida la membresía y deja en `req.workspace = { type, orgId, member, can() }`.
  - Helper `scopeQuery(q, req.workspace)`:
    - Personal: añade `.is('organization_id', null)` a los filtros actuales.
    - Clínica: añade `.eq('organization_id', orgId)` + el filtro por permisos (p. ej. solo los pacientes asignados).
  - Los endpoints existentes se adaptan de forma incremental: primero sesiones, relaciones, facturas, entradas y disponibilidad. El filtro por `organization_id` también se aplica sobre la caché en memoria (`supabaseDbCache`), para que las filas de la clínica no aparezcan en la vista personal.
  - `isAuthorizedForUser` (`server.js:760`) se amplía: en una clínica, la membresía con permiso concede acceso (p. ej. recepción ve el contacto sin tener una relación de cuidado).
- **Frontend**:
  - Estado `activeWorkspace` en `App.tsx`.
  - `apiFetch` añade `X-Workspace-Id`.
  - Selector en `PsychologistSidebar.tsx`, visible solo con membresías.
  - Los paneles existentes (agenda, pacientes, sesiones, facturación, plantillas, materiales) se reutilizan recibiendo `workspace`. En el espacio de la clínica se añade la sección **Clínica**: Equipo, Agenda global, Sedes y salas, Liquidaciones, Leads, Biblioteca y formación, Informes y Ajustes.
- **Suscripción de la clínica**:
  - Stripe con precio base + precio por licencia (`quantity` = profesionales activos con `seat_billable`), sincronizado al alta y baja de miembros.
  - Se reutilizan el webhook (`server.js:6718`) y el cron `api/reconcile-subscriptions.js`.
  - En el espacio de la clínica, `checkPsychAccess` mira la suscripción de la organización y no la personal.

### 2.4 Seguridad y RGPD (transversal)
- Cerrar ya los agujeros de `/api/centers` y `/api/templates`.
- Cifrado de las notas clínicas a nivel de aplicación (AES‑256‑GCM, reutilizando el cifrado de los tokens OAuth, `server.js:522-540`) para `transcript`, `summary` y las anotaciones.
- `access_audit` en cada lectura de historia clínica. Pantalla de auditoría para el titular y el director clínico.
- 2FA obligatorio para los miembros de una organización.
- DPA y términos versionados **en BD** (hoy solo están en localStorage).
- Retención: sustituir el borrado duro por **bloqueo + borrado diferido a 5 años** para la historia clínica.
- Exportación por organización y flujo de baja de miembro: revocar, reasignar pacientes y conservar la autoría.
- Datos en la UE (Supabase en región EU).

---

## 3. Funcionalidades por área (qué construir)

1. **Equipo**: invitar por email (reutiliza el patrón de `/api/invitations`), roles, tipo de relación, % y reglas, supervisor, alta y baja. Al aceptar, si el psicólogo ya tenía un `center` con el CIF de la clínica, se vincula y sus facturas a ese centro pasan a ser las liquidaciones.
2. **Agenda clínica**: vista por profesional, sala y sede; reserva de sala sin conflictos; recepción agenda para cualquiera; disponibilidad (`dispo`) por espacio; agenda unificada del psicólogo entre espacios con bloques "Ocupado". Google Calendar por miembro, como hoy.
3. **Pacientes de la clínica**: ficha común, profesional asignado (o varios: terapia de pareja, interconsulta), derivación interna, historia clínica compartida frente a anotaciones privadas, consentimientos con plantillas de la clínica (`templates.organization_id`, ampliando el patrón `master`), bonos de la clínica.
4. **Facturación y liquidaciones**: emisores (CIF) con series propias, los 4 modelos económicos, liquidación mensual automática con validación por el psicólogo, generación de su factura a la clínica, rectificativas, exportación para la gestoría (CSV/A3/Holded), **Verifactu** (común con Pro) y cobro online al paciente con Stripe Connect (Plus).
5. **Captación de leads** (Plus):
   - Página pública de la clínica (`mainds.app/c/{slug}`) con su equipo y especialidades.
   - Widget de reserva embebible en su web.
   - Formulario de contacto, alta manual de llamadas y WhatsApp (Twilio ya integrado).
   - Bandeja de leads con estados (nuevo → contactado → primera cita → paciente / descartado).
   - Asignación manual, por especialidad o disponibilidad, o rotatoria.
   - Atribución de origen (`acquisition_source`), que alimenta las reglas de comisión.
   - Métricas de conversión por canal y por profesional.
   - La UI se inspira en `components/sales/*`.
   - Sinergia: la misma página o widget se ofrece después a los Pro como "perfil público y reservas".
6. **Conocimiento y formación** (Plus):
   - Biblioteca de la clínica: protocolos, materiales y plantillas (`psychologist_materials` / `templates` con `organization_id`).
   - Cursos de onboarding y formación continua con módulos, progreso y horas.
   - Registro de sesiones de supervisión.
   - Asistente IA (el Gemini actual) que responde sobre la biblioteca de la clínica, con la anonimización ya existente (`services/chatAnonymizer.ts`).
7. **Panel del dueño**: ingresos por profesional, sede y canal; ocupación de salas; tasa de no-show; pacientes activos; leads y conversión; liquidaciones pendientes.

---

## 4. Fases de desarrollo

| Fase | Duración aprox. | Contenido | Hito |
|---|---|---|---|
| **0. Cimientos** | 2–3 sem | Arreglar la autorización de centers/templates; `access_audit`; cifrado de notas; carpetas `backend/business` y `components/business`; harness de tests (`node --test`) + tests golden de no regresión; script `test` en `backend/package.json`; análisis de Verifactu | Pro más seguro, sin cambios visibles |
| **1. Núcleo multi-tenant** | 4–6 sem | Tablas de organización, miembros, roles e invitaciones; `resolveWorkspace` + `scopeQuery`; selector de espacio; suscripción de la clínica con licencias en Stripe; onboarding de la clínica + DPA | Una clínica puede darse de alta e invitar a su equipo |
| **2. Operativa clínica** | 4–5 sem | Agenda compartida, sedes y salas, pacientes de la clínica, asignación, recepción, historia clínica frente a anotaciones privadas, consentimientos de la clínica, agenda unificada entre espacios | **Beta con 3–5 clínicas piloto** |
| **3. Dinero** | 5–6 sem | Emisores y series, 4 modelos económicos, reglas de comisión, liquidaciones, factura del autónomo a la clínica, rectificativas, exportación para gestoría, **Verifactu (también para Pro)** | **Lanzamiento comercial de Business Essential** (~4 meses) |
| **4. Captación** | 4 sem | Página pública, widget de reservas, bandeja de leads, asignación, atribución → comisiones, Stripe Connect | Lanzamiento de Business Plus |
| **5. Conocimiento** | 3–4 sem | Biblioteca, cursos, supervisión, IA sobre la biblioteca | — |
| **6. Escala** | continuo | Informes avanzados, multisede grande/Enterprise, integraciones (Doctoralia, contabilidad), perfil público para Pro | — |

---

## 5. Archivos críticos (dónde se toca)
- `backend/server.js`:
  - montar `backend/business/*`
  - `authenticateRequest` (`:686`) y `isAuthorizedForUser` (`:760`)
  - planes (`:924-1101`)
  - numeración de facturas (`:9727`)
  - rutas de sesiones, relaciones y facturas (filtro con `scopeQuery`)
  - caché (`:2330`, `:2743-2990`)
  - webhook de Stripe (`:6718`)
- Nuevos ficheros:
  - `backend/business/{workspace,orgs,members,settlements,leads,library}.js`
  - `backend/utils/{orgPermissions,commissions}.js` con sus tests en `backend/test/`
- `App.tsx` (`activeWorkspace`), `services/authService.ts` (cabecera) y `components/PsychologistSidebar.tsx` (selector y sección Clínica).
- `components/business/*` (Equipo, Liquidaciones, Leads, Salas, Biblioteca, Panel del dueño).
- Paneles reutilizados con la prop `workspace`: `PsychologistSchedule.tsx`, `BillingPanel.tsx`, `BulkBillingPanel.tsx`, `PatientDetailModal.tsx`, `TemplatesPanel.tsx`, `PsychologistMaterialsPanel.tsx`.
- Migraciones nuevas en `backend/scripts/*.sql` y actualización de `SUPABASE_SCHEMA.md`.

## 6. Verificación
- Tests unitarios `node --test` para la matriz de permisos, el motor de comisiones y liquidaciones, y la numeración por emisor.
- **Tests golden de no regresión**: con un usuario Pro sin membresías, las respuestas de `/api/sessions`, `/api/relationships`, `/api/invoices`, `/api/centers` y `/api/templates` son idénticas antes y después. Se ejecutan sobre una rama de Supabase con datos semilla.
- Tests de aislamiento: un psicólogo en las clínicas A y B y en su espacio personal no ve en ningún espacio datos de los otros. Recepción no puede leer la historia clínica (403 + entrada de auditoría).
- E2E con Playwright: alta de clínica → invitar psicólogo → cita en sala → sesión → factura de la clínica → liquidación → factura del autónomo.
- Beta con clínicas piloto antes del lanzamiento comercial.

## 7. Siguiente paso tras aprobar este plan
1. Guardar este plan como `docs/business/MAINDS_BUSINESS_PLAN.md` en la rama `claude/stoic-archimedes-8f0e31`, hacer commit y push.
2. No se toca código de producto hasta que elijas arrancar la Fase 0. Recomendado: empezar por arreglar los agujeros de autorización, que afectan ya hoy a los usuarios Pro.
