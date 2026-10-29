# Contrato de encargo del tratamiento (DPA) — mainds business

> ⚠️ **BORRADOR v1 (`v1-borrador`) — pendiente de revisión por un abogado.** Es un requisito antes de activar mainds business en producción con datos reales (backlog §3). Cuando esté revisado, se publica con una versión nueva (`BUSINESS_DPA_VERSION`) y el titular tendrá que aceptarlo de nuevo.

**Partes**
- **Responsable del tratamiento:** la clínica que da de alta su organización en mainds business, representada por su titular.
- **Encargado del tratamiento:** TOOMUCHDRAMA, S.L. (mainds).

Se celebra conforme al art. 28 del RGPD y al art. 33 de la LOPDGDD.

## 1. Objeto
mainds presta a la clínica un software de gestión clínica en la nube: agenda, pacientes, historia clínica, facturación, comunicaciones y formación. Para ello trata datos personales por cuenta de la clínica, **solo para prestar el servicio** y siguiendo sus instrucciones documentadas.

## 2. Datos y personas afectadas
- **Pacientes y personas que solicitan cita:**
  - datos identificativos y de contacto;
  - datos de salud (historia clínica, notas, consentimientos);
  - datos económicos (facturas, cobros).
- **Profesionales y personal de la clínica:** identificativos, de contacto y económicos (liquidaciones).

## 3. Obligaciones de mainds
1. Tratar los datos solo según las instrucciones de la clínica. No los usará para fines propios.
2. **Confidencialidad:** el personal de mainds con acceso está obligado a guardar secreto. Por diseño, ese personal no accede a la historia clínica: el contenido clínico se guarda cifrado y el soporte técnico no tiene acceso a datos clínicos.
3. **Medidas de seguridad (art. 32 RGPD):**
   - cifrado en tránsito (TLS) y cifrado de aplicación del contenido clínico (AES-256-GCM);
   - control de acceso por roles;
   - registro de auditoría de los accesos a la historia clínica;
   - acceso de emergencia justificado y registrado;
   - copias de seguridad;
   - alojamiento en la Unión Europea.
4. **Subencargados:**
   - proveedor de base de datos y alojamiento (Supabase, región UE; Vercel);
   - envío de email (Resend);
   - pagos de la suscripción (Stripe);
   - IA (Google, solo con datos anonimizados).

   Se informará a la clínica de cualquier cambio de subencargado, y la clínica podrá oponerse.
5. **Ayudar a la clínica** a atender los derechos de los interesados (acceso, rectificación, supresión, limitación, portabilidad, oposición) y en las evaluaciones de impacto.
6. **Notificar las brechas de seguridad** a la clínica sin dilación indebida y, en todo caso, en menos de 48 horas desde que se conozcan.
7. **Al terminar el servicio:** devolver los datos a la clínica en un formato estructurado y suprimirlos después. Se exceptúan los datos que deban conservarse por obligación legal, que quedarán bloqueados. La historia clínica se conserva al menos 5 años desde el alta de cada proceso asistencial (art. 17 de la Ley 41/2002).

## 4. Obligaciones de la clínica
- Disponer de una base jurídica para tratar los datos de sus pacientes y darles la información del art. 13 RGPD.
- Dar de alta y de baja a su personal y asignarle roles con el mínimo privilegio necesario.
- Custodiar las credenciales de acceso.

## 5. Profesionales de la clínica
Los profesionales, sean contratados o autónomos, acceden a los datos de la clínica **por cuenta de la clínica**. Al darse de baja pierden el acceso, y los pacientes y la historia clínica siguen en la clínica. Las anotaciones subjetivas de cada profesional (art. 18.3 Ley 41/2002) solo son visibles para su autor.

## 6. Duración
Mientras la clínica tenga una organización activa en mainds business.

---
*Versión `v1-borrador` · Aceptación electrónica por el titular al crear la clínica. Queda registrada con fecha, versión, usuario e IP (`organizations.dpa_*` y `access_audit`).*
