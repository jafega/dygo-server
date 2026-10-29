# mainds business visto por la titular de un centro

> Recorrido real por la aplicación en el papel de **Olga, titular de un centro de psicología que además pasa consulta** y se ocupa de casi todo: agenda, cobros, equipo y papeleo. Desde la creación de la clínica hasta facturar y liquidar.
>
> - Capturas: `node e2e/business/explore-owner.mjs`, guardadas en `e2e/.shots/explore-*`.
> - Fecha: octubre de 2026.
> - Después de la crítica viene la parte de PO: prioridades, implicaciones para el resto del producto y qué se ha desarrollado.

## 1. Crítica (como titular)

### Lo que funciona bien
- **Alta de la clínica**: rápida y clara. Los planes y lo que incluye cada uno se ven sin salir del formulario. La casilla "Yo también atiendo pacientes" y el DPA dan confianza.
- **Separación de espacios**: el selector *Mi consulta / Centro* se entiende. Las franjas rayadas de "ocupado en otro espacio" evitan las dobles reservas de verdad.
- **Agenda**:
  - el control de salas y de conflictos funciona;
  - el detalle de una cita permite cerrarla (realizada, no presentado, cancelada) en un clic.
- **Historia clínica**:
  - la diferencia entre historia de la clínica y anotaciones privadas está muy bien explicada en pantalla;
  - las notas inmutables dan tranquilidad legal.
- **Dinero**: borrador, emisión, Verifactu y rectificativas tienen todo lo que pediría mi gestoría.

### Lo que me frena en el día a día

| # | Problema | Por qué duele | Gravedad |
|---|---|---|---|
| 1 | **El "Inicio" es un segundo menú.** Repite los mismos 13 botones de la barra lateral. | Abro la app a las 8:55 y no veo qué tengo hoy, qué está pendiente ni qué falta por configurar. mainds pro sí tiene "Primeros pasos" y acciones rápidas: parece otro producto. | Alta |
| 2 | **No hay tarifas.** Cada cita se crea con el precio vacío. | Si nadie lo rellena, la cita se marca como realizada y al facturar sale "Alguna cita no tiene precio". Se descubre a fin de mes. | Alta |
| 3 | **No puedo dar de alta a un paciente desde la cita.** | El caso más habitual es una llamada de una persona nueva. Hoy son ocho pasos: cerrar el modal, ir a Pacientes, crearla, volver a Agenda y abrir otra vez "Nueva cita". | Alta |
| 4 | **No hay citas periódicas.** | La terapia es semanal. Crear 12 citas una a una no es viable. | Alta |
| 5 | **El detalle de la cita es un callejón sin salida.** | Tras la sesión quiero ir a la nota, a la ficha o a facturar. Son tres secciones distintas y en todas hay que volver a buscar al paciente. | Media |
| 6 | **Facturar es paciente a paciente.** No hay "facturar todo lo pendiente del mes". | Con 5 profesionales son unas 150 facturas al mes. mainds pro ya tiene facturación masiva: el centro no puede ser peor que la consulta. | Alta |
| 7 | **Nadie cierra las citas pasadas.** Se quedan como "Programada" para siempre. | No cuentan como producción en el panel ni se pueden facturar. Nada avisa de ello. | Alta |
| 8 | **El menú es largo.** 14 entradas sin agrupar; *Suscripción* y *Ajustes* quedan bajo el pliegue. | Además hay dos botones para lo mismo ("Mi consulta" en el selector y "Volver a mi consulta"). | Media |
| 9 | **En el móvil la agenda es una tabla de 7 columnas** con scroll horizontal. | Entre sesiones miro la agenda en el móvil y no se lee. | Media |
| 10 | **Escape no cierra los modales.** | Pequeño, pero se nota a cada momento. | Baja |
| 11 | **Al crear un paciente queda "Sin asignar todavía"** aunque yo sea la única profesional. | Luego no aparece en mis citas hasta que lo asigno. | Media |
| 12 | **La ficha del paciente no muestra sus citas.** | No sé cuándo vino por última vez ni cuándo vuelve. | Media |
| 13 | **No hay recordatorios a pacientes.** | El no-show es el agujero económico número uno de un centro. | Alta (Fase 7) |
| 14 | **El paciente no ve la clínica en su app.** Sigue viendo solo a la psicóloga. | | Media (Fase 7) |

## 2. Decisiones de producto (PO)

### Principios
1. **Consistencia con mainds pro.** Inicio con "Primeros pasos" y el día; facturación en lote. Quien pasa de una consulta a un centro no debe reaprender nada.
2. **El flujo de la sesión manda:** agendar → atender → nota → cerrar → facturar → liquidar. Cada pantalla debe ofrecer el paso siguiente.
3. **Los pendientes no se pueden esconder.** Lo que bloquea dinero (citas sin cerrar, sin precio o sin facturar) aparece en Inicio.
4. **Sin romper nada:**
   - Las reglas de oro se mantienen: Business no escribe en tablas de Pro y los permisos salen de `orgPermissions.js`.
   - La migración nueva es aditiva e idempotente.
   - Todos los endpoints nuevos respetan los mismos permisos que los existentes.

### Implicaciones en el resto del producto
- **Precio de la cita.** Pasa a resolverse en el servidor: el precio indicado, si no el del paciente, si no la tarifa del servicio.
  - Corto plazo: deja de haber citas sin precio.
  - Medio plazo: la comisión, que ya se congela en la cita, se calcula siempre sobre un importe.
  - Largo plazo: las tarifas son la base del cobro online (Stripe Connect) y de la reserva directa desde el widget.
- **Series de citas** (`series_id`):
  - Cancelar "esta y las siguientes" no toca citas pasadas ni facturadas.
  - Los conflictos de cada repetición se informan y se saltan, nunca se fuerzan.
  - Sienta la base de los recordatorios (Fase 7).
- **Facturación en lote.**
  - Reutiliza el mismo creador de borradores que la factura individual (mismo IVA, NIF, F1/F2 y Verifactu al emitir).
  - Solo emite factura la clínica (`billing.manage`). Los autónomos que facturan ellos mismos siguen factura a factura.
  - Igual que en Pro, se generan **borradores**. Se revisan y se emiten de una vez.
- **Inicio.**
  - Un solo endpoint de resumen (`/home`) filtrado por permisos: recepción no ve dinero y un psicólogo ve solo lo suyo.
  - Es la puerta de entrada y no puede cargar cinco paneles.
- **Navegación entre secciones:** `ClinicContext.open(sección, parámetros)` sustituye a "ve a otra sección y busca". Encaja con la navegación por estado de `App.tsx`, sin router.

### Priorización

| Prioridad | Mejora | Problemas que resuelve |
|---|---|---|
| P1 | Inicio "Hoy": mi día, la clínica hoy, pendientes que bloquean dinero y primeros pasos | 1, 7 |
| P1 | Tarifas por servicio + precio por paciente + precio resuelto en servidor | 2 |
| P1 | Alta rápida de paciente desde la cita + profesional por defecto | 3, 11 |
| P1 | Citas periódicas (semanal o quincenal) y cancelar "esta y las siguientes" | 4 |
| P1 | Facturar en lote lo pendiente y emitir los borradores de una vez | 6 |
| P1 | Cerrar en bloque las citas pasadas | 7 |
| P2 | Detalle de cita con los pasos siguientes (ficha, nota, facturar) | 5 |
| P2 | Pestaña "Citas" en la ficha del paciente + "Nueva cita" desde la ficha | 12 |
| P2 | Menú agrupado, sin botón duplicado; vista de día en móvil; Escape | 8, 9, 10 |
| Fase 7 | Recordatorios por email y SMS con consentimiento; el paciente ve la clínica; precio por profesional | 13, 14 |

**Todo P1 y P2 está desarrollado en esta fase (Fase 6).** Los detalles técnicos y los criterios de aceptación están en [`BACKLOG.md`](BACKLOG.md#fase-6--operativa-diaria-feedback-de-la-titular).
