import React, { useState } from 'react';
import { ScrollText, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';

interface TermsAndConditionsModalProps {
    onAccept: () => void;
    onDecline: () => void;
}

const TERMS_LAST_UPDATED = '1 de enero de 2025';
const TERMS_VERSION = '3.2';

export const TERMS_ACCEPTED_KEY = 'mainds_terms_accepted_v3';

const TermsAndConditionsModal: React.FC<TermsAndConditionsModalProps> = ({ onAccept, onDecline }) => {
    const [checked, setChecked] = useState(false);
    const [showFullTerms, setShowFullTerms] = useState(false);

    const handleAccept = () => {
        if (!checked) return;
        localStorage.setItem(TERMS_ACCEPTED_KEY, JSON.stringify({ accepted: true, timestamp: Date.now(), version: TERMS_VERSION }));
        onAccept();
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="bg-indigo-700 text-white px-6 py-4 flex items-center gap-3 shrink-0">
                    <ScrollText size={24} className="shrink-0" />
                    <div className="flex-1">
                        <h2 className="text-lg font-bold leading-tight">Términos y Condiciones de Uso</h2>
                        <p className="text-indigo-200 text-xs mt-0.5">Versión {TERMS_VERSION} · Última actualización: {TERMS_LAST_UPDATED}</p>
                    </div>
                </div>

                {/* Accept section */}
                <div className="px-8 py-6 shrink-0 space-y-4">
                    <p className="text-sm text-slate-600 leading-relaxed">
                        Para acceder a mainds necesitas aceptar los Términos y Condiciones de Uso de <strong>TOOMUCHDRAMA, S.L.</strong> (versión {TERMS_VERSION}, en vigor desde {TERMS_LAST_UPDATED}).
                    </p>

                    <button
                        onClick={() => setShowFullTerms(v => !v)}
                        className="flex items-center gap-1.5 text-indigo-600 text-sm font-medium hover:text-indigo-800 transition-colors"
                    >
                        {showFullTerms ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        {showFullTerms ? 'Ocultar términos completos' : 'Leer los Términos y Condiciones completos'}
                    </button>
                </div>

                {/* Collapsible full terms */}
                {showFullTerms && (
                    <div className="flex-1 overflow-y-auto px-8 pb-6 text-sm text-slate-700 leading-relaxed space-y-6 border-t border-slate-100">
                    {/* Identidad del prestador */}
                    <section>
                        <h3 className="text-base font-bold text-slate-900 mb-2 uppercase tracking-wide border-b pb-1">PREÁMBULO E IDENTIFICACIÓN DEL TITULAR</h3>
                        <p>
                            Los presentes Términos y Condiciones Generales de Uso (en adelante, «<strong>Términos</strong>») constituyen un contrato legalmente vinculante entre usted, en calidad de usuario final (en adelante, «<strong>Usuario</strong>»), y <strong>TOOMUCHDRAMA, S.L.</strong>, sociedad de responsabilidad limitada constituida conforme a la legislación española, con número de identificación fiscal (NIF) pendiente de asignación definitiva por el Registro Mercantil, domicilio social a efectos de notificaciones en España, inscrita en el Registro Mercantil (en adelante, «<strong>la Empresa</strong>», «<strong>Toomuchdrama</strong>» o «<strong>nosotros</strong>»).
                        </p>
                        <p className="mt-2">
                            La Empresa es titular y operadora de la plataforma de software como servicio denominada <strong>mainds</strong> (anteriormente conocida como «mainds»), accesible a través de los dominios, subdominios y aplicaciones móviles que la Empresa designe en cada momento (en adelante, la «<strong>Plataforma</strong>»).
                        </p>
                        <p className="mt-2">
                            AL ACCEDER, REGISTRARSE, INSTALAR O UTILIZAR LA PLATAFORMA EN CUALQUIER FORMA, EL USUARIO MANIFIESTA HABER LEÍDO, COMPRENDIDO Y ACEPTADO ÍNTEGRAMENTE ESTOS TÉRMINOS, ASÍ COMO LA POLÍTICA DE PRIVACIDAD, LA POLÍTICA DE COOKIES Y CUALQUIER OTRO DOCUMENTO INCORPORADO POR REFERENCIA. SI NO ACEPTA ESTOS TÉRMINOS EN SU TOTALIDAD, DEBE ABSTENERSE INMEDIATAMENTE DE USAR LA PLATAFORMA.
                        </p>
                    </section>

                    {/* Objeto */}
                    <section>
                        <h3 className="text-base font-bold text-slate-900 mb-2 uppercase tracking-wide border-b pb-1">ARTÍCULO 1. OBJETO Y DESCRIPCIÓN DEL SERVICIO</h3>
                        <p>
                            1.1. La Plataforma mainds es un sistema de gestión clínica, terapéutica y de bienestar personal dirigido a profesionales de la salud mental (en adelante, «<strong>Profesionales</strong>»), en particular psicólogos, psiquiatras, terapeutas y coaches acreditados, y a sus pacientes y usuarios finales (en adelante, «<strong>Pacientes</strong>»). La Plataforma facilita, entre otras funcionalidades: gestión de agenda y citas, notas clínicas, comunicación cifrada entre Profesional y Paciente, facturación, registro de sesiones, análisis de progreso mediante inteligencia artificial, almacenamiento de documentos, y cualesquiera otras funcionalidades que la Empresa incorpore o retire a su entera discreción, sin obligación de notificación previa al Usuario salvo cuando la ley así lo exija expresamente.
                        </p>
                        <p className="mt-2">
                            1.2. La Plataforma es una <strong>herramienta tecnológica auxiliar</strong>. No constituye un servicio sanitario, no equivale a una consulta médica o psicológica, y no sustituye el criterio profesional del Profesional ni el tratamiento médico. La Empresa no es un prestador de servicios sanitarios ni un establecimiento sanitario en el sentido de la Ley 41/2002, de 14 de noviembre, básica reguladora de la autonomía del paciente.
                        </p>
                        <p className="mt-2">
                            1.3. Toda interacción entre Profesionales y Pacientes a través de la Plataforma se produce de forma directa e independiente. La Empresa actúa exclusivamente como <strong>prestador tecnológico intermediario</strong> y no es parte en la relación terapéutica ni en ningún acuerdo económico entre Profesional y Paciente.
                        </p>
                    </section>

                    {/* Capacidad */}
                    <section>
                        <h3 className="text-base font-bold text-slate-900 mb-2 uppercase tracking-wide border-b pb-1">ARTÍCULO 2. CAPACIDAD LEGAL Y CONDICIONES DE ACCESO</h3>
                        <p>
                            2.1. Para registrarse y utilizar la Plataforma, el Usuario debe tener al menos <strong>18 años cumplidos</strong> o la mayoría de edad legal vigente en su jurisdicción. Los menores de 18 años solo podrán acceder a la Plataforma con el consentimiento expreso, escrito y verificable de su representante legal, quien asumirá plena responsabilidad por el uso efectuado.
                        </p>
                        <p className="mt-2">
                            2.2. Los Profesionales que se registren en la Plataforma declaran y garantizan, bajo su exclusiva responsabilidad, que: (i) están en posesión del título universitario habilitante para el ejercicio de las profesiones sanitarias que correspondan; (ii) disponen del número de colegiación vigente en el Colegio Oficial competente de su comunidad autónoma o país; (iii) han obtenido todas las licencias, permisos y autorizaciones necesarios para el ejercicio de su actividad profesional; y (iv) cumplen con la normativa deontológica y profesional aplicable.
                        </p>
                        <p className="mt-2">
                            2.3. La Empresa se reserva el derecho de verificar en cualquier momento la identidad del Usuario y la veracidad de los datos aportados, así como de suspender o cancelar cualquier cuenta en caso de detectar información falsa, incompleta o engañosa, sin derecho a indemnización de ningún tipo por parte del Usuario afectado.
                        </p>
                        <p className="mt-2">
                            2.4. El acceso a la Plataforma requiere que el Usuario disponga de los recursos técnicos necesarios (dispositivo compatible, conexión a internet, navegador actualizado). La Empresa no garantiza la disponibilidad ni el correcto funcionamiento de la Plataforma en todas las configuraciones de hardware, software o conexión.
                        </p>
                    </section>

                    {/* Registro y seguridad */}
                    <section>
                        <h3 className="text-base font-bold text-slate-900 mb-2 uppercase tracking-wide border-b pb-1">ARTÍCULO 3. REGISTRO DE CUENTA, CREDENCIALES Y SEGURIDAD</h3>
                        <p>
                            3.1. El registro se efectúa mediante autenticación federada a través de proveedores de identidad de terceros (entre ellos, Google Inc. y cualquier otro proveedor que la Empresa incorpore). El Usuario acepta los términos del proveedor de identidad seleccionado, siendo la Empresa ajena a la relación entre el Usuario y dichos proveedores.
                        </p>
                        <p className="mt-2">
                            3.2. El Usuario es el <strong>único y exclusivo responsable</strong> de la confidencialidad y uso de sus credenciales de acceso. Cualquier uso de la Plataforma mediante las credenciales del Usuario se presumirá realizado por él mismo. El Usuario se obliga a notificar a la Empresa de forma inmediata cualquier acceso no autorizado del que tenga conocimiento, a la dirección de correo electrónico oficial de la Empresa. La Empresa no responderá de ningún daño o perjuicio derivado del uso no autorizado de credenciales que no haya sido comunicado oportunamente.
                        </p>
                        <p className="mt-2">
                            3.3. El Usuario autoriza expresamente a la Empresa a comunicarse con él a través del correo electrónico y demás datos de contacto proporcionados al registrarse, incluyendo envío de comunicaciones de servicio, actualizaciones de estas condiciones, avisos de facturación y, en su caso, comunicaciones comerciales según la normativa aplicable.
                        </p>
                    </section>

                    {/* Precios y facturación — cláusula clave */}
                    <section>
                        <h3 className="text-base font-bold text-slate-900 mb-2 uppercase tracking-wide border-b pb-1">ARTÍCULO 4. PRECIOS, TARIFAS, FACTURACIÓN Y MODIFICACIÓN UNILATERAL DEL PRECIO</h3>
                        <p>
                            4.1. <strong>Derecho de modificación unilateral de precios.</strong> La Empresa se reserva el derecho de modificar, revisar, actualizar, incrementar, reducir o reestablecer los precios, tarifas, tasas de uso, cargos por exceso, comisiones y cualesquiera otros importes económicos asociados al uso de la Plataforma (<strong>incluidos los planes actualmente vigentes</strong>), en cualquier momento y por cualquier motivo, a su entera y exclusiva discreción, sin necesidad de causa justificada. La Empresa notificará al Usuario los cambios de precio con una antelación mínima de <strong>treinta (30) días naturales</strong> mediante comunicación al correo electrónico registrado y/o mediante aviso destacado en la Plataforma. Si el Usuario continúa usando la Plataforma tras la entrada en vigor del nuevo precio, se entenderá que ha aceptado dicho cambio. Si el Usuario no acepta el nuevo precio, deberá cancelar su suscripción antes de la fecha de entrada en vigor.
                        </p>
                        <p className="mt-2">
                            4.2. <strong>Precios sin IVA.</strong> Salvo que se indique expresamente lo contrario, todos los precios publicados en la Plataforma son precios netos que no incluyen el Impuesto sobre el Valor Añadido (IVA), otros impuestos indirectos equivalentes, ni cualesquiera tasas, aranceles o gravámenes locales o nacionales aplicables, que correrán siempre a cargo del Usuario.
                        </p>
                        <p className="mt-2">
                            4.3. <strong>Carácter prepagado y no reembolsable.</strong> Las suscripciones, créditos, licencias de uso y demás servicios de pago son de carácter prepagado. Salvo obligación legal expresa en contrario, <strong>ningún importe abonado será objeto de devolución</strong>, ni total ni parcial, con independencia de que el Usuario no haya hecho uso del servicio durante el período correspondiente, haya cancelado su cuenta, haya incurrido en incumplimiento de estos Términos, o por cualquier otra causa. La Empresa no realiza prorrateos de las cuotas de suscripción salvo que así lo establezca expresamente en la descripción del plan.
                        </p>
                        <p className="mt-2">
                            4.4. <strong>Períodos de prueba.</strong> Los períodos de prueba gratuita o con descuento que la Empresa decida ofrecer tienen una duración, condiciones y alcance funcional determinados unilateralmente por la Empresa, que podrá modificar, reducir, cancelar o no renovar dichos períodos en cualquier momento sin previo aviso. Una vez finalizado el período de prueba, el acceso a determinadas funcionalidades quedará automáticamente suspendido hasta que el Usuario contrate el plan de pago correspondiente. La utilización del período de prueba no genera ningún derecho adquirido sobre ninguna tarifa o condición.
                        </p>
                        <p className="mt-2">
                            4.5. <strong>Impago y suspensión.</strong> El incumplimiento de las obligaciones de pago en los plazos acordados facultará a la Empresa para, sin perjuicio del resto de acciones legales, suspender o cancelar el acceso del Usuario a la Plataforma de forma inmediata y sin necesidad de comunicación previa, sin que ello genere responsabilidad alguna para la Empresa. Los datos del Usuario podrán conservarse o eliminarse según la política de retención de datos vigente.
                        </p>
                        <p className="mt-2">
                            4.6. <strong>Cambios de plan.</strong> Los cambios de plan de suscripción (ascensos o descensos) podrán generar cargos inmediatos o créditos parciales según las reglas de cada ciclo de facturación, conforme a lo establecido en la página de precios de la Plataforma vigente en el momento del cambio.
                        </p>
                        <p className="mt-2">
                            4.7. <strong>Procesamiento de pagos.</strong> El procesamiento de pagos se realiza a través de proveedores de servicios de pago de terceros (entre ellos, Stripe, Inc. o equivalentes). El Usuario acepta, asimismo, las condiciones del proveedor de pagos seleccionado. La Empresa no almacena datos de tarjeta de crédito o débito del Usuario en sus propios sistemas. La información financiera del Usuario está sujeta a la política de privacidad del proveedor de pagos.
                        </p>
                    </section>

                    {/* Propiedad intelectual */}
                    <section>
                        <h3 className="text-base font-bold text-slate-900 mb-2 uppercase tracking-wide border-b pb-1">ARTÍCULO 5. PROPIEDAD INTELECTUAL E INDUSTRIAL</h3>
                        <p>
                            5.1. La Plataforma, incluyendo —sin carácter limitativo— su código fuente, código objeto, algoritmos de inteligencia artificial, modelos de lenguaje propios, interfaces de usuario, diseño gráfico, logotipos, marcas, denominaciones comerciales, textos, imágenes, audiovisuales, bases de datos y cualesquiera otros contenidos y elementos que la componen, son propiedad exclusiva de la Empresa o de sus licenciantes, y están protegidos por las leyes españolas e internacionales sobre propiedad intelectual e industrial (entre otras, el Real Decreto Legislativo 1/1996 —Ley de Propiedad Intelectual— y la Ley 17/2001 —Ley de Marcas—), así como por los convenios internacionales aplicables.
                        </p>
                        <p className="mt-2">
                            5.2. La Empresa concede al Usuario una licencia de uso <strong>limitada, no exclusiva, no transferible, no sublicenciable y revocable</strong> para acceder y utilizar la Plataforma exclusivamente para los fines previstos en estos Términos y durante la vigencia de su suscripción. Esta licencia no implica ninguna cesión de derechos de propiedad intelectual o industrial al Usuario.
                        </p>
                        <p className="mt-2">
                            5.3. Queda expresamente prohibida cualquier: (i) reproducción, distribución, comunicación pública, transformación o puesta a disposición de los contenidos de la Plataforma sin autorización expresa y escrita de la Empresa; (ii) ingeniería inversa, descompilación, desensamblaje o cualquier intento de obtener el código fuente de la Plataforma; (iii) uso de sistemas automatizados (scraping, crawling, bots, etc.) para acceder o extraer datos de la Plataforma; (iv) comercialización de los derechos de acceso o de cualquier funcionalidad de la Plataforma.
                        </p>
                        <p className="mt-2">
                            5.4. <strong>Contenidos del Usuario.</strong> Los datos, textos, notas, documentos e información que el Usuario cargue o genere en la Plataforma (en adelante, «Contenido del Usuario») son propiedad del Usuario o del Profesional correspondiente, según corresponda. El Usuario concede a la Empresa una licencia mundial, no exclusiva, libre de royalties, para almacenar, procesar, analizar y reproducir dicho Contenido exclusivamente con el fin de: (i) prestar el servicio contratado; (ii) mejorar y desarrollar los modelos de inteligencia artificial y algoritmos de la Plataforma, en forma anonimizada y agregada; y (iii) cumplir con obligaciones legales. Esta licencia subsistirá durante el tiempo necesario para la eliminación efectiva del Contenido del Usuario conforme a la política de retención de datos.
                        </p>
                    </section>

                    {/* Datos personales y confidencialidad */}
                    <section>
                        <h3 className="text-base font-bold text-slate-900 mb-2 uppercase tracking-wide border-b pb-1">ARTÍCULO 6. PROTECCIÓN DE DATOS PERSONALES Y CONFIDENCIALIDAD</h3>
                        <p>
                            6.1. El tratamiento de datos personales por parte de la Empresa se rige por la Política de Privacidad publicada en la Plataforma, la cual forma parte integrante de estos Términos mediante referencia expresa. El tratamiento se realiza conforme al Reglamento (UE) 2016/679 del Parlamento Europeo y del Consejo, de 27 de abril de 2016, relativo a la protección de las personas físicas en lo que respecta al tratamiento de datos personales (RGPD/GDPR) y la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD).
                        </p>
                        <p className="mt-2">
                            6.2. En el contexto de la prestación de servicios a Profesionales, la Empresa podrá actuar como <strong>encargada del tratamiento</strong> respecto de los datos de pacientes que los Profesionales introduzcan en la Plataforma, en los términos del Artículo 28 del RGPD. El Profesional, en calidad de responsable del tratamiento, es el único responsable de obtener el consentimiento informado de sus pacientes, de cumplir con las obligaciones del responsable del tratamiento, y de garantizar la adecuada base jurídica para el tratamiento de datos de salud de carácter especialmente sensible.
                        </p>
                        <p className="mt-2">
                            6.3. La Empresa implementa medidas técnicas y organizativas de seguridad adecuadas al estado de la técnica y al riesgo del tratamiento, incluyendo cifrado en tránsito (TLS) y en reposo, controles de acceso basados en roles, y procedimientos de respuesta ante incidentes de seguridad. No obstante, <strong>ningún sistema de seguridad es inexpugnable</strong>, y la Empresa no garantiza la seguridad absoluta frente a todos los ataques o incidentes posibles. La Empresa no se responsabiliza de incidentes de seguridad causados por vulnerabilidades de terceros (proveedores de infraestructura cloud, proveedores de identidad, etc.) ni de acciones maliciosas de terceros sobre las que no tenga control.
                        </p>
                        <p className="mt-2">
                            6.4. Los datos de salud introducidos en la Plataforma son datos de categoría especial en virtud del Artículo 9 del RGPD. El Profesional asume la plena y exclusiva responsabilidad de su correcto manejo, incluyendo la obligación de conservación en el historial clínico según la Ley 41/2002 y la normativa autonómica aplicable. La Empresa no asesora jurídicamente al Profesional respecto de sus obligaciones de historial clínico.
                        </p>
                        <p className="mt-2">
                            6.5. <strong>Transferencias internacionales.</strong> El Usuario reconoce que sus datos personales podrán ser transferidos y procesados en servidores ubicados fuera del Espacio Económico Europeo (EEE). Dichas transferencias se realizarán con arreglo a las garantías adecuadas exigidas por el RGPD (entre otros, cláusulas contractuales tipo aprobadas por la Comisión Europea o decisiones de adecuación).
                        </p>
                        <p className="mt-2">
                            6.6. <strong>Retención y eliminación.</strong> El Usuario puede solicitar la eliminación de su cuenta y datos personales en los términos previstos en la Política de Privacidad. La eliminación efectiva de todos los datos puede requerir hasta <strong>noventa (90) días naturales</strong>. La Empresa podrá conservar ciertos datos durante el período legalmente obligatorio o para la resolución de disputas pendientes.
                        </p>
                    </section>

                    {/* Limitación de responsabilidad — cláusula clave */}
                    <section>
                        <h3 className="text-base font-bold text-slate-900 mb-2 uppercase tracking-wide border-b pb-1">ARTÍCULO 7. EXCLUSIÓN Y LIMITACIÓN DE RESPONSABILIDAD</h3>
                        <p>
                            7.1. <strong>Exclusión de garantías.</strong> LA PLATAFORMA SE PROPORCIONA «TAL CUAL» (AS IS) Y «SEGÚN DISPONIBILIDAD» (AS AVAILABLE). EN LA MÁXIMA EXTENSIÓN PERMITIDA POR LA LEY APLICABLE, LA EMPRESA EXCLUYE EXPRESAMENTE TODAS LAS GARANTÍAS, REPRESENTACIONES Y CONDICIONES, YA SEAN EXPRESAS, IMPLÍCITAS, LEGALES O DE CUALQUIER OTRO TIPO, INCLUYENDO —SIN CARÁCTER LIMITATIVO— LAS GARANTÍAS IMPLÍCITAS DE COMERCIABILIDAD, IDONEIDAD PARA UN FIN DETERMINADO, TÍTULO, NO INFRACCIÓN, EXACTITUD, FIABILIDAD, INTEGRIDAD Y CONTINUIDAD DEL SERVICIO.
                        </p>
                        <p className="mt-2">
                            7.2. <strong>Disponibilidad del servicio.</strong> La Empresa no garantiza que la Plataforma esté disponible de forma ininterrumpida, sin errores ni retrasos en todo momento. La Empresa podrá suspender, interrumpir o modificar la Plataforma, total o parcialmente, en cualquier momento y por cualquier motivo, incluyendo —sin carácter limitativo— por razones de mantenimiento, actualización, mejora, razones técnicas, causas de fuerza mayor o decisión empresarial, sin que ello genere derecho a compensación o indemnización alguna para el Usuario, salvo obligación legal expresa en contrario.
                        </p>
                        <p className="mt-2">
                            7.3. <strong>Límite máximo de responsabilidad.</strong> EN NINGÚN CASO LA RESPONSABILIDAD TOTAL ACUMULADA DE LA EMPRESA FRENTE AL USUARIO POR TODOS LOS CONCEPTOS —YA SEA POR RESPONSABILIDAD CONTRACTUAL, EXTRACONTRACTUAL, OBJETIVA O CUALQUIER OTRA TEORÍA JURÍDICA— SUPERARÁ EL IMPORTE EFECTIVAMENTE ABONADO POR EL USUARIO A LA EMPRESA EN LOS DOCE (12) MESES ANTERIORES AL EVENTO QUE ORIGINA LA RECLAMACIÓN, O LA CANTIDAD DE CIEN EUROS (100 €), LO QUE SEA MENOR.
                        </p>
                        <p className="mt-2">
                            7.4. <strong>Daños excluidos.</strong> EN NINGÚN CASO LA EMPRESA SERÁ RESPONSABLE POR: (i) DAÑOS INDIRECTOS, INCIDENTALES, ESPECIALES, PUNITIVOS, EJEMPLARES O CONSECUENTES DE CUALQUIER TIPO; (ii) PÉRDIDA DE BENEFICIOS, INGRESOS, CLIENTES, REPUTACIÓN O DATOS; (iii) COSTE DE SERVICIOS SUSTITUTIVOS; (iv) DAÑOS CORPORALES O PSICOLÓGICOS DERIVADOS DEL USO O LA IMPOSIBILIDAD DE USO DE LA PLATAFORMA; O (v) CUALQUIER PÉRDIDA O DAÑO QUE NO FUERA RAZONABLEMENTE PREVISIBLE EN EL MOMENTO DE LA CELEBRACIÓN DE ESTE CONTRATO; INCLUSO SI LA EMPRESA HABÍA SIDO INFORMADA DE LA POSIBILIDAD DE TALES DAÑOS.
                        </p>
                        <p className="mt-2">
                            7.5. <strong>Responsabilidad por datos clínicos.</strong> La Empresa no asume ninguna responsabilidad por la <strong>exactitud, integridad, adecuación o actualidad</strong> de los datos clínicos, diagnósticos, tratamientos, recomendaciones o cualquier otro contenido introducido por los Profesionales o los Pacientes en la Plataforma. El Profesional es el único responsable del contenido clínico y de las decisiones terapéuticas adoptadas.
                        </p>
                        <p className="mt-2">
                            7.6. <strong>Inteligencia artificial.</strong> Las funcionalidades de inteligencia artificial (IA) de la Plataforma, incluyendo —sin carácter limitativo— análisis de texto, resúmenes, sugerencias e informes automatizados, tienen carácter meramente orientativo e informativo y NO CONSTITUYEN DI AGNOSTICO MÉDICO, CONSEJO TERAPÉUTICO, PRESCRIPCIÓN NI TRATAMIENTO. La Empresa no garantiza la exactitud, pertinencia ni ausencia de errores de los resultados generados por los modelos de IA. El uso de dichas funcionalidades es responsabilidad exclusiva del Usuario.
                        </p>
                        <p className="mt-2">
                            7.7. <strong>Plataformas de terceros.</strong> La Empresa no se responsabiliza del funcionamiento, disponibilidad, términos o políticas de privacidad de servicios de terceros integrados en la Plataforma (tales como Google Calendar, proveedores de videollamada, procesadores de pago, proveedores de IA, etc.).
                        </p>
                        <p className="mt-2">
                            7.8. Algunas jurisdicciones no permiten la exclusión de determinadas garantías o la limitación de responsabilidad por ciertos tipos de daños. En dichas jurisdicciones, la responsabilidad de la Empresa quedará limitada en la máxima extensión permitida por la ley aplicable.
                        </p>
                    </section>

                    {/* Obligaciones del usuario */}
                    <section>
                        <h3 className="text-base font-bold text-slate-900 mb-2 uppercase tracking-wide border-b pb-1">ARTÍCULO 8. OBLIGACIONES Y CONDUCTA DEL USUARIO. USOS PROHIBIDOS</h3>
                        <p>
                            8.1. El Usuario se compromete a utilizar la Plataforma de conformidad con la ley, con estos Términos, con las instrucciones de la Empresa y con los usos generalmente aceptados del sector sanitario y de las tecnologías de la información.
                        </p>
                        <p className="mt-2">8.2. Queda expresamente prohibido:</p>
                        <ul className="list-disc ml-6 mt-1 space-y-1">
                            <li>Utilizar la Plataforma para cualquier finalidad ilícita, fraudulenta, dañina o contraria a la buena fe.</li>
                            <li>Suplantar la identidad de otro usuario, profesional o entidad.</li>
                            <li>Introducir o difundir virus, malware, código dañino o cualquier elemento tecnológico perjudicial.</li>
                            <li>Realizar ingeniería inversa, descompilar o intentar extraer el código fuente de la Plataforma.</li>
                            <li>Realizar pruebas de penetración, ataques de denegación de servicio o cualquier acción que pueda dañar, sobrecargar o deteriorar la Plataforma o sus infraestructuras.</li>
                            <li>Acceder a cuentas, datos o sistemas de otros usuarios sin autorización.</li>
                            <li>Vender, sublicenciar, arrendar o transferir los derechos de acceso a la Plataforma a terceros.</li>
                            <li>Automatizar el acceso a la Plataforma mediante bots, scrapers u otros medios técnicos no autorizados.</li>
                            <li>Difundir a través de la Plataforma contenido ilícito, difamatorio, discriminatorio, obsceno, violento, que infrinja derechos de terceros o que sea contrario al orden público.</li>
                            <li>Utilizar la Plataforma para ejercer actividades profesionales sin las titulaciones y habilitaciones legalmente exigibles.</li>
                            <li>Usar la Plataforma para ofrecer o gestionar tratamientos o intervenciones sanitarias que requieran presencialidad física o que estén fuera del ámbito de actuación habilitado por la ley para la telemedicina.</li>
                        </ul>
                        <p className="mt-2">
                            8.3. El incumplimiento de cualquiera de las obligaciones establecidas en este artículo facultará a la Empresa para suspender o cancelar inmediatamente el acceso del Usuario, sin previo aviso ni derecho a reembolso, y para ejercer todas las acciones legales que correspondan.
                        </p>
                    </section>

                    {/* Modificación de Términos */}
                    <section>
                        <h3 className="text-base font-bold text-slate-900 mb-2 uppercase tracking-wide border-b pb-1">ARTÍCULO 9. MODIFICACIÓN DE LOS TÉRMINOS Y DE LA PLATAFORMA</h3>
                        <p>
                            9.1. La Empresa se reserva el derecho de modificar estos Términos en cualquier momento, a su entera discreción. La versión actualizada de los Términos será publicada en la Plataforma indicando la fecha de la última actualización. La Empresa notificará al Usuario las modificaciones sustanciales mediante correo electrónico o mediante aviso destacado en la Plataforma con una antelación razonable. El uso continuado de la Plataforma tras la entrada en vigor de los nuevos Términos implicará su aceptación. Si el Usuario no estuviera de acuerdo con los nuevos Términos, deberá cesar en el uso de la Plataforma y cancelar su cuenta.
                        </p>
                        <p className="mt-2">
                            9.2. La Empresa podrá modificar, ampliar, reducir, discontinuar o reemplazar cualquier funcionalidad, contenido, aspecto visual o tecnología de la Plataforma, en cualquier momento y sin previo aviso, incluyendo la adición o eliminación de integraciones con servicios de terceros, sin que ello constituya causa de resolución ni de responsabilidad.
                        </p>
                    </section>

                    {/* Cancelación y terminación */}
                    <section>
                        <h3 className="text-base font-bold text-slate-900 mb-2 uppercase tracking-wide border-b pb-1">ARTÍCULO 10. DURACIÓN, CANCELACIÓN Y TERMINACIÓN</h3>
                        <p>
                            10.1. Estos Términos entran en vigor desde el momento del registro del Usuario y permanecen vigentes indefinidamente mientras el Usuario mantenga activa su cuenta o utilice la Plataforma.
                        </p>
                        <p className="mt-2">
                            10.2. El Usuario podrá cancelar su cuenta en cualquier momento desde los ajustes de la Plataforma o mediante comunicación escrita a la Empresa. La cancelación no dará derecho a reembolso de ningún importe ya abonado.
                        </p>
                        <p className="mt-2">
                            10.3. La Empresa podrá resolver estos Términos y cancelar la cuenta del Usuario, en cualquier momento y por cualquier causa, con o sin previo aviso, incluyendo —sin carácter limitativo— por incumplimiento de cualquier apartado de estos Términos, impago, inactividad prolongada, o por decisión empresarial estratégica (incluyendo el cese de la actividad o la venta de la empresa o de la Plataforma). En caso de cancelación por incumplimiento, la Empresa no tendrá obligación de reembolso.
                        </p>
                        <p className="mt-2">
                            10.4. Tras la cancelación o resolución de la cuenta, el acceso del Usuario a la Plataforma y a todos sus datos será suspendido de forma inmediata. Los datos del Usuario podrán ser eliminados según la política de retención vigente; se recomienda al Usuario que exporte sus datos antes de la cancelación.
                        </p>
                        <p className="mt-2">
                            10.5. Las estipulaciones de estos Términos relativas a propiedad intelectual, limitación de responsabilidad, indemnizaciones, protección de datos, confidencialidad, jurisdicción y ley aplicable sobrevivirán a la terminación de la relación contractual.
                        </p>
                    </section>

                    {/* Indemnización */}
                    <section>
                        <h3 className="text-base font-bold text-slate-900 mb-2 uppercase tracking-wide border-b pb-1">ARTÍCULO 11. INDEMNIZACIÓN</h3>
                        <p>
                            11.1. El Usuario se obliga a indemnizar, defender y mantener indemne a la Empresa, sus socios, administradores, directivos, empleados, agentes, proveedores y licenciantes frente a cualesquiera reclamaciones, responsabilidades, daños, pérdidas, costas y gastos (incluidos honorarios de abogados) que surjan de o en relación con: (i) el uso de la Plataforma por parte del Usuario; (ii) la violación de estos Términos; (iii) la infracción de derechos de terceros (incluidos derechos de propiedad intelectual, privacidad o derechos de imagen); (iv) el incumplimiento de la normativa sanitaria, deontológica o profesional aplicable al Profesional; o (v) cualquier actuación negligente o dolosa del Usuario.
                        </p>
                    </section>

                    {/* Confidencialidad */}
                    <section>
                        <h3 className="text-base font-bold text-slate-900 mb-2 uppercase tracking-wide border-b pb-1">ARTÍCULO 12. CONFIDENCIALIDAD</h3>
                        <p>
                            12.1. Toda información no pública que el Usuario reciba sobre la Empresa, la Plataforma y sus funcionalidades, incluyendo —sin carácter limitativo— información sobre funcionalidades en desarrollo, modelos de negocio, precios internos, estructura tecnológica o datos de otros usuarios (en adelante, «Información Confidencial»), deberá tratarse con la máxima discreción.
                        </p>
                        <p className="mt-2">
                            12.2. El Usuario se compromete a no divulgar, reproducir ni utilizar la Información Confidencial para fines distintos al uso de la Plataforma, ni durante la vigencia de estos Términos ni con posterioridad a su terminación. La obligación de confidencialidad subsistirá durante un período de cinco (5) años desde la terminación de la relación contractual.
                        </p>
                    </section>

                    {/* Ley aplicable y jurisdicción */}
                    <section>
                        <h3 className="text-base font-bold text-slate-900 mb-2 uppercase tracking-wide border-b pb-1">ARTÍCULO 13. LEY APLICABLE, JURISDICCIÓN Y RESOLUCIÓN DE DISPUTAS</h3>
                        <p>
                            13.1. Estos Términos se rigen e interpretan de conformidad con la legislación española. Quedan excluidas las normas de conflicto de leyes.
                        </p>
                        <p className="mt-2">
                            13.2. Para la resolución de cualquier controversia derivada de o relacionada con estos Términos o con el uso de la Plataforma, las partes se someten a la jurisdicción exclusiva de los Juzgados y Tribunales de la ciudad de <strong>Madrid</strong>, con renuncia expresa a cualquier otro fuero que pudiera corresponderles, salvo que la ley aplicable obligue a un fuero distinto en favor del consumidor.
                        </p>
                        <p className="mt-2">
                            13.3. Con carácter previo a la interposición de cualquier acción judicial, las partes acuerdan intentar una negociación amistosa durante un período de treinta (30) días naturales desde la comunicación fehaciente de la disputa. Si la negociación no prosperase, las partes quedan libres para acudir a los Tribunales.
                        </p>
                        <p className="mt-2">
                            13.4. Para reclamaciones de consumidores dentro de la UE, la Comisión Europea ofrece una plataforma de resolución en línea de litigios (ODR), disponible en: <span className="font-mono text-xs">https://ec.europa.eu/consumers/odr</span>. La Empresa no está obligada a participar en procedimientos alternativos de resolución de disputas salvo cuando la ley así lo establezca.
                        </p>
                    </section>

                    {/* Divisibilidad */}
                    <section>
                        <h3 className="text-base font-bold text-slate-900 mb-2 uppercase tracking-wide border-b pb-1">ARTÍCULO 14. DISPOSICIONES GENERALES</h3>
                        <p>
                            14.1. <strong>Divisibilidad.</strong> Si alguna cláusula de estos Términos fuera declarada nula o inaplicable por resolución judicial firme, dicha cláusula se entenderá sustituida por otra que recoja la intención de las partes en la máxima extensión posible, siendo el resto de los Términos plenamente válido y eficaz.
                        </p>
                        <p className="mt-2">
                            14.2. <strong>Renuncia.</strong> La omisión por parte de la Empresa de ejercitar cualquier derecho o acción previsto en estos Términos no implicará renuncia a dicho derecho o acción.
                        </p>
                        <p className="mt-2">
                            14.3. <strong>Acuerdo íntegro.</strong> Estos Términos, junto con la Política de Privacidad, la Política de Cookies y cualesquiera otros documentos incorporados por referencia, constituyen el acuerdo íntegro entre las partes respecto al objeto de los mismos, y sustituyen a cualquier negociación, declaración o acuerdo previo, oral o escrito.
                        </p>
                        <p className="mt-2">
                            14.4. <strong>Cesión.</strong> La Empresa podrá ceder, transferir o subcontratar libremente sus derechos y obligaciones derivados de estos Términos a cualquier entidad, incluyendo en el marco de una fusión, adquisición, reorganización o venta de activos, sin necesidad de consentimiento previo del Usuario. El Usuario no podrá ceder ni transferir estos Términos ni ninguno de los derechos u obligaciones derivados de ellos sin el consentimiento previo y escrito de la Empresa.
                        </p>
                        <p className="mt-2">
                            14.5. <strong>Encabezados.</strong> Los encabezados de los artículos se incluyen únicamente con fines de referencia y no tendrán efecto interpretativo.
                        </p>
                        <p className="mt-2">
                            14.6. <strong>Idioma.</strong> La versión en español de estos Términos es la versión oficial y controlante. Cualquier traducción se facilita únicamente por conveniencia y no tendrá efecto jurídico vinculante en caso de discrepancia.
                        </p>
                        <p className="mt-2">
                            14.7. <strong>Comunicaciones.</strong> Toda comunicación del Usuario a la Empresa deberá realizarse por escrito, a la dirección de correo electrónico oficial publicada en la Plataforma o mediante el sistema de gestión de incidencias habilitado al efecto. Las comunicaciones de la Empresa al Usuario se realizarán a la dirección de correo electrónico registrada.
                        </p>
                    </section>

                    {/* Cláusula final */}
                    <section className="border-t pt-4 text-xs text-slate-500">
                        <p className="mt-1 italic">
                            © {new Date().getFullYear()} TOOMUCHDRAMA, S.L. Todos los derechos reservados. | Versión {TERMS_VERSION} | {TERMS_LAST_UPDATED}
                        </p>
                    </section>
                </div>
                )}

                {/* Footer */}
                <div className="px-6 py-4 border-t bg-slate-50 shrink-0 space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => setChecked(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 accent-indigo-600 shrink-0"
                        />
                        <span className="text-xs text-slate-700 leading-relaxed">
                            He leído y acepto los <strong>Términos y Condiciones de Uso</strong> de mainds, operado por <strong>TOOMUCHDRAMA, S.L.</strong>, en su versión {TERMS_VERSION} de fecha {TERMS_LAST_UPDATED}. Acepto que dicha aceptación tiene plena validez jurídica.
                        </span>
                    </label>

                    <div className="flex gap-3">
                        <button
                            onClick={onDecline}
                            className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-colors"
                        >
                            No acepto — Salir
                        </button>
                        <button
                            onClick={handleAccept}
                            disabled={!checked}
                            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <CheckCircle2 size={16} />
                            Acepto los Términos
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TermsAndConditionsModal;
