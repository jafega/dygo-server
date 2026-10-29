# Verifactu en mainds — análisis (Fase 0.7)

> **Resumen:** mainds factura (Pro y Business), así que es un **SIF** (Sistema Informático de Facturación) sujeto al RD 1007/2023 y a la Orden HAC/1177/2024. En Business (Fase 3) se construye la base técnica: registro, huella encadenada, QR e inmutabilidad. El **envío a la AEAT** y la **declaración responsable** del fabricante quedan para una sesión propia, que también cubrirá Pro.

## Plazos (comprobar antes de planificar)
- Tras los aplazamientos, la obligación es desde el **1 de enero de 2027** para las sociedades (contribuyentes del IS) y desde el **1 de julio de 2027** para el resto, incluidos los autónomos (los usuarios de mainds pro).
- El software tiene que estar adaptado antes de esas fechas. Como fabricante del SIF, mainds debe emitir su **declaración responsable**.

## Qué exige la norma a cada factura
1. **Registro de facturación de alta** (y de anulación), generado en el momento de expedir la factura.
2. **Huella (hash) SHA-256 encadenada** con el registro anterior **del mismo obligado tributario (NIF emisor)**. Se calcula sobre esta concatenación, en este orden:
   `IDEmisorFactura=…&NumSerieFactura=…&FechaExpedicionFactura=dd-mm-aaaa&TipoFactura=F1|F2|R1…R5&CuotaTotal=…&ImporteTotal=…&Huella=<huella anterior o vacío>&FechaHoraHusoGenRegistro=aaaa-mm-ddThh:mm:ss+hh:mm`
   La salida es hexadecimal en mayúsculas, de 64 caracteres. Los importes van sin ceros a la derecha superfluos, con punto decimal.
3. **QR tributario** en la factura (ISO/IEC 18004, nivel de corrección M, de 30×30 a 40×40 mm) con la URL de cotejo:
   - Producción: `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=…&numserie=…&fecha=dd-mm-aaaa&importe=…`
   - Pruebas: `https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?…`
   - En modo "no verifactu" el endpoint es `ValidarQRNoVerifactu`.
4. **Inmutabilidad y trazabilidad:** una factura emitida no se modifica. Se corrige con una rectificativa (R1–R5) o con un registro de anulación. Además se guarda un **registro de eventos** del sistema.
5. **Modalidad:**
   - **VERI\*FACTU**: envío automático de cada registro a la AEAT. Exime de conservar los registros firmados y permite imprimir la leyenda "VERI\*FACTU".
   - **No verifactu**: firma XAdES de cada registro y conservación íntegra, sin envío.

## Qué hace mainds hoy
- Pro numera por psicólogo (`allocateNextInvoiceNumber`, `server.js` ~9727), tiene rectificativas en serie R y genera el PDF desde HTML.
- **No hay huella, ni QR, ni registro de eventos, ni envío.** Las facturas en borrador sí se pueden editar, pero las emitidas no deberían poder modificarse.

## Plan
| Pieza | Dónde | Cuándo |
|---|---|---|
| Tabla de solo inserción `verifactu_records` (registro, huella, encadenamiento por NIF, estado `pending_submission`) | `business-004-money.sql` | Fase 3 |
| `backend/business/verifactu.js`: huella oficial (con test contra el vector publicado por la AEAT), encadenado, URL e imagen del QR (`qrcode`) | Business | Fase 3 |
| Inmutabilidad de las facturas emitidas de clínica (`PATCH` → `409`) y rectificativa R4 | Business | Fase 3 |
| **No** imprimir la leyenda "VERI\*FACTU" mientras no haya envío real | Business | Fase 3 |
| Envío SOAP a la AEAT con certificado (`RegFactuSistemaFacturacion`), reintentos y control de flujo (60 s entre envíos), registro de eventos y anulaciones | Común | **Sesión propia** |
| Aplicarlo a las facturas de **Pro** (`invoices`), migrando la numeración actual | Pro | **Sesión propia, antes de julio de 2027** |
| Declaración responsable del SIF (TOOMUCHDRAMA, S.L.) | Legal | Antes de comercializar la facturación |

## Riesgos y decisiones
- La huella tiene que coincidir **byte a byte** con la especificación (formato de fechas, importes y orden de los campos). No se da por buena hasta que pase el test con el ejemplo oficial.
- El encadenamiento es **por NIF emisor**, no por usuario ni por organización: una clínica con dos CIF tiene dos cadenas.
- Concurrencia: el siguiente registro necesita la huella del anterior, así que la emisión se serializa por emisor (índice único y reintento, o bloqueo en BD).
- Hacen falta un certificado de sello de la empresa y su custodia (secreto del entorno) para el envío. Fuera del repo.
