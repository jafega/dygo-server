// Actualiza la plantilla maestra "Consentimiento Informado":
// - Añade template_name = 'Consentimiento Informado'
// - Elimina todos los campos con ___ (datos que había que rellenar a mano)
// - El documento queda redactado en 3ª persona: "el/la paciente" / "el/la profesional"
// Uso: node scripts/update-consentimiento-informado.js

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridos en .env');
  process.exit(1);
}

// ─── Contenido actualizado (sin campos en blanco) ──────────────────────────
const NEW_CONTENT = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Consentimiento Informado para Tratamiento Psicológico</title>
  <style>
    body { font-family: 'Georgia', serif; font-size: 14px; line-height: 1.8; color: #1a1a2e; max-width: 820px; margin: 0 auto; padding: 32px 24px; }
    h1 { font-size: 22px; text-align: center; font-weight: bold; margin-bottom: 6px; color: #0f3460; border-bottom: 3px solid #0f3460; padding-bottom: 10px; }
    h2 { font-size: 16px; font-weight: bold; margin-top: 30px; margin-bottom: 8px; color: #0f3460; border-left: 4px solid #e94560; padding-left: 10px; }
    h3 { font-size: 14px; font-weight: bold; margin-top: 18px; margin-bottom: 6px; color: #16213e; }
    p { margin: 0 0 10px 0; text-align: justify; }
    ul, ol { margin: 8px 0 12px 20px; }
    li { margin-bottom: 5px; }
    .subtitle { text-align: center; font-size: 13px; color: #555; margin-bottom: 24px; }
    .aviso { background: #fff8e1; border: 1px solid #f9a825; border-radius: 6px; padding: 12px 16px; margin: 18px 0; font-size: 13px; }
    .info-box { border: 1px solid #c7d7f0; border-radius: 6px; padding: 14px 18px; margin: 18px 0; background: #f0f4ff; }
    .firma-section { margin-top: 60px; display: flex; justify-content: space-between; }
    .firma-block { width: 45%; }
    .firma-line { border-top: 1px solid #333; margin-top: 60px; padding-top: 6px; font-size: 12px; color: #444; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13px; }
    th { background: #0f3460; color: #fff; padding: 8px 10px; text-align: left; }
    td { border: 1px solid #ddd; padding: 7px 10px; vertical-align: top; }
    tr:nth-child(even) td { background: #f5f5f5; }
    blockquote { border-left: 3px solid #0f3460; margin: 12px 20px; padding: 8px 14px; color: #333; font-style: italic; background: #f0f4ff; border-radius: 0 6px 6px 0; }
    .check-item { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 7px; }
    .check-item::before { content: "☐"; font-size: 16px; flex-shrink: 0; margin-top: 1px; }
  </style>
</head>
<body>

<h1>CONSENTIMIENTO INFORMADO PARA TRATAMIENTO PSICOLÓGICO</h1>
<p class="subtitle">Documento de información y consentimiento — Sesión individual, de pareja o familiar<br>
Elaborado conforme a la Ley 41/2002 de Autonomía del Paciente, el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 de Protección de Datos Personales (LOPDGDD)</p>

<div class="aviso">
  <strong>AVISO IMPORTANTE:</strong> Lea detenidamente este documento en su totalidad antes de firmarlo. Tiene derecho a solicitar aclaraciones sobre cualquier apartado antes de otorgar su consentimiento. Puede revocar este consentimiento en cualquier momento, sin necesidad de justificación, sin que ello suponga ningún perjuicio para usted.
</div>

<h2>SECCIÓN 1. IDENTIFICACIÓN DE LAS PARTES</h2>

<h3>1.1. El/la profesional</h3>
<div class="info-box">
  <p>La atención psicológica recogida en este documento es prestada por el/la profesional de la psicología responsable del proceso terapéutico, colegiado/a en el Colegio Oficial de Psicólogos de su demarcación territorial. Sus datos identificativos completos (nombre, número de colegiado/a, especialidad, dirección de consulta o centro, teléfono y correo electrónico) le han sido o le serán facilitados en el momento del primer contacto, y están disponibles en cualquier momento a petición del/la paciente.</p>
  <p>El/la responsable del tratamiento de datos personales es el/la propio/a profesional o la entidad jurídica titular del centro en el que ejerce, y puede contactarse a través de los canales de comunicación habituales de la consulta.</p>
</div>

<h3>1.2. El/la paciente</h3>
<div class="info-box">
  <p>Este documento va dirigido a la persona que solicita atención psicológica y que, mediante la firma de este consentimiento, inicia o continúa un proceso terapéutico con el/la profesional indicado/a. A lo largo de este documento, dicha persona será referida como <strong>el/la paciente</strong>.</p>
  <p>Si el/la paciente fuera menor de edad o tuviese la capacidad legalmente modificada, las obligaciones y derechos recogidos en este documento corresponden igualmente a su representante legal, quien deberá otorgar el consentimiento en su nombre.</p>
</div>

<h2>SECCIÓN 2. INFORMACIÓN GENERAL SOBRE EL TRATAMIENTO PSICOLÓGICO</h2>

<h3>2.1. ¿Qué es la psicoterapia?</h3>
<p>La psicoterapia es un proceso de tratamiento psicológico basado en la relación entre un profesional especializado y una persona (o grupo) que experimenta algún tipo de dificultad en su vida emocional, cognitiva, conductual o relacional. A diferencia de la medicación psiquiátrica, que actúa sobre los sustratos biológicos de la mente, la psicoterapia trabaja mediante el diálogo, la reflexión, la comprensión y el cambio de patrones de pensamiento, emoción y comportamiento que generan malestar o impiden el funcionamiento adaptativo.</p>

<p>La psicoterapia no es una conversación informal, ni un consejo de amistad, ni una actividad de crecimiento personal sin fundamentación científica. Se trata de una intervención profesional regulada, respaldada por décadas de investigación empírica, que requiere formación universitaria específica (grado o licenciatura en Psicología), posgrado habilitante, y en muchos casos formación especializada acreditada por el Consejo General de la Psicología de España o por colegios oficiales autonómicos.</p>

<p>Existen múltiples modalidades de intervención psicológica reconocidas por la comunidad científica internacional: la terapia cognitivo-conductual (TCC), la terapia de aceptación y compromiso (ACT), la terapia dialéctico-conductual (DBT), la terapia centrada en la persona, la psicoterapia psicodinámica, la terapia sistémica, la EMDR (desensibilización y reprocesamiento por movimientos oculares), la terapia de mentalización, la terapia narrativa, entre otras. El/la profesional que atiende al/la paciente le explicará la orientación terapéutica que utiliza y por qué la considera adecuada para su caso.</p>

<h3>2.2. Ámbito de aplicación y límites de la psicoterapia</h3>
<p>La psicoterapia es eficaz para una amplia variedad de problemas y trastornos: ansiedad, depresión, trastorno obsesivo-compulsivo, estrés post-traumático, fobias específicas, problemas de pareja y familia, dificultades en las relaciones interpersonales, trastornos de la conducta alimentaria, adicciones, crisis vitales, duelo, baja autoestima, dificultades en el control emocional, trastornos de personalidad, problemas de sueño, y muchos otros.</p>

<p>Sin embargo, la psicoterapia tiene límites que es importante conocer:</p>
<ul>
  <li>No sustituye al tratamiento médico o psiquiátrico cuando este es necesario. En casos en que la sintomatología requiera evaluación médica o tratamiento farmacológico, el/la profesional derivará al profesional sanitario correspondiente o trabajará de manera coordinada con él/ella.</li>
  <li>El/la profesional no puede garantizar resultados específicos. Los resultados dependen de múltiples factores: la naturaleza del problema, las características individuales del/la paciente, la motivación y compromiso con el proceso, los recursos externos disponibles, y la calidad de la relación terapéutica.</li>
  <li>La psicoterapia no es un proceso lineal. Es esperable que haya periodos de avance, estancamiento y, en ocasiones, momentos de mayor incomodidad o malestar antes de producirse una mejoría sostenida.</li>
  <li>El/la profesional actúa dentro de su ámbito de competencia. Si el problema del/la paciente requiere una especialización que no posee, le informará y derivará en consecuencia.</li>
</ul>

<h3>2.3. Modalidades de atención disponibles</h3>
<p>El tratamiento puede realizarse en las siguientes modalidades, según lo acordado entre el/la profesional y el/la paciente:</p>
<ul>
  <li><strong>Sesión individual presencial:</strong> El/la paciente acude en persona al centro o consulta.</li>
  <li><strong>Sesión individual online/telemática:</strong> La sesión se realiza por videoconferencia mediante plataformas que garantizan la privacidad y confidencialidad de la comunicación.</li>
  <li><strong>Terapia de pareja:</strong> Ambos miembros de la pareja participan conjuntamente, pudiendo combinarse con sesiones individuales.</li>
  <li><strong>Terapia familiar:</strong> Varios miembros del sistema familiar participan en el proceso, con el objetivo de mejorar la dinámica relacional del conjunto.</li>
  <li><strong>Terapia de grupo:</strong> Un pequeño grupo de personas con problemáticas similares trabajan juntas bajo la dirección del/la terapeuta.</li>
</ul>

<h2>SECCIÓN 3. EVALUACIÓN INICIAL Y PLAN DE TRATAMIENTO</h2>

<h3>3.1. Fase de evaluación</h3>
<p>Antes de comenzar el tratamiento propiamente dicho, es habitual realizar una fase de evaluación que puede durar entre una y cuatro sesiones, dependiendo de la complejidad del caso. Durante esta fase, el/la profesional recopilará información detallada sobre la historia clínica, la historia vital, la situación actual y los objetivos terapéuticos del/la paciente. Podrá utilizarse la entrevista clínica estructurada o semiestructurada, cuestionarios estandarizados, pruebas psicométricas validadas, y otros instrumentos de evaluación.</p>

<h3>3.2. Formulación del caso y diagnóstico</h3>
<p>El/la profesional elaborará, en base a la evaluación realizada, una formulación del caso clínico que integra la información recopilada dentro de un marco conceptual coherente con su orientación terapéutica. Si procede, podrá emitir un diagnóstico de acuerdo con los sistemas de clasificación internacionales vigentes (DSM-5-TR o CIE-11). El/la paciente tiene derecho a conocer dicho diagnóstico y a recibir una explicación comprensible del mismo.</p>

<h3>3.3. Objetivos terapéuticos</h3>
<p>Los objetivos del tratamiento se establecerán de forma colaborativa entre el/la paciente y el/la profesional. Estos objetivos serán específicos, medibles, alcanzables, relevantes y temporalmente delimitados. Podrán revisarse y modificarse a lo largo del tratamiento a medida que se produzcan cambios o nuevas informaciones.</p>

<h2>SECCIÓN 4. ESTRUCTURA DEL PROCESO TERAPÉUTICO</h2>

<h3>4.1. Frecuencia y duración de las sesiones</h3>
<p>Las sesiones tienen una duración estándar de <strong>50 minutos</strong> (hora terapéutica), aunque en algunos casos específicos —evaluación inicial, sesiones de pareja o familia, psicoeducación intensiva— pueden tener una duración diferente pactada previamente. La frecuencia habitual es de una sesión por semana, especialmente en las fases iniciales del tratamiento.</p>

<h3>4.2. Estimación de la duración total del tratamiento</h3>
<table>
  <tr><th>Tipo de intervención</th><th>Estimación orientativa</th></tr>
  <tr><td>Intervención breve (problema focal)</td><td>8 – 16 sesiones</td></tr>
  <tr><td>Tratamiento estándar (ansiedad, depresión leve-moderada)</td><td>16 – 30 sesiones</td></tr>
  <tr><td>Tratamiento de media duración (trauma, duelo, trastorno de personalidad)</td><td>30 – 60 sesiones</td></tr>
  <tr><td>Tratamiento de larga duración (patología grave, trabajo profundo)</td><td>Más de 60 sesiones</td></tr>
</table>

<h3>4.3. Fases del tratamiento</h3>
<ol>
  <li><strong>Fase de acogida y alianza terapéutica:</strong> Construcción de la relación terapéutica y recogida de información.</li>
  <li><strong>Fase de evaluación y formulación:</strong> Comprensión profunda del problema y elaboración del plan de tratamiento.</li>
  <li><strong>Fase de intervención:</strong> Trabajo activo sobre los objetivos mediante las técnicas propias de la orientación del/la terapeuta.</li>
  <li><strong>Fase de consolidación:</strong> Integración de los cambios y prevención de recaídas.</li>
  <li><strong>Fase de cierre:</strong> Evaluación de resultados, preparación del alta y seguimiento si procede.</li>
</ol>

<h2>SECCIÓN 5. TÉCNICAS Y PROCEDIMIENTOS TERAPÉUTICOS</h2>

<h3>5.1. Técnicas cognitivas</h3>
<p>Orientadas a identificar y modificar pensamientos, creencias y esquemas cognitivos disfuncionales. Incluyen el registro de pensamientos automáticos, la reestructuración cognitiva, el cuestionamiento socrático, la identificación de sesgos cognitivos, la defusión cognitiva (ACT), entre otras.</p>

<h3>5.2. Técnicas conductuales</h3>
<p>Orientadas a modificar patrones de comportamiento mediante el aprendizaje y la práctica. Incluyen la activación conductual, la exposición gradual y en vivo, la desensibilización sistemática, la prevención de respuesta, el entrenamiento en habilidades sociales, el ensayo conductual, entre otras.</p>

<h3>5.3. Técnicas de regulación emocional</h3>
<p>Orientadas a mejorar la capacidad de identificar, comprender, tolerar y modular las emociones. Incluyen técnicas de atención plena (mindfulness), técnicas de relajación (respiración diafragmática, relajación muscular progresiva), técnicas de tolerancia al malestar y entrenamiento en regulación emocional del modelo DBT.</p>

<h3>5.4. Técnicas basadas en trauma</h3>
<p>Cuando se trabajan experiencias traumáticas, pueden utilizarse técnicas específicas como el EMDR, la terapia de exposición prolongada, el procesamiento cognitivo del trauma, la terapia narrativa del trauma o terapia sensoriomotriz. El uso de estas técnicas requiere formación específica y será previamente explicado y consentido.</p>

<h3>5.5. Técnicas sistémicas y relacionales</h3>
<p>En modalidades de pareja o familia pueden utilizarse técnicas propias de la terapia sistémica: escultura familiar, reencuadre, paradojas terapéuticas, prescripción de rituales, genogramas, externalización del problema (enfoque narrativo), entre otras.</p>

<h3>5.6. Tareas entre sesiones</h3>
<p>Es habitual que el/la profesional proponga actividades o ejercicios para realizar entre sesiones. Estas tareas tienen como objetivo generalizar el aprendizaje terapéutico a los contextos naturales de la vida del/la paciente y acelerar el proceso de cambio. Su realización se ha asociado consistentemente a mejores resultados terapéuticos.</p>

<h2>SECCIÓN 6. BENEFICIOS, RIESGOS Y ALTERNATIVAS</h2>

<h3>6.1. Beneficios esperados</h3>
<ul>
  <li>Reducción o eliminación de la sintomatología que motiva la consulta.</li>
  <li>Mejora del estado de ánimo y mayor bienestar emocional general.</li>
  <li>Mayor autoconocimiento y comprensión de los propios patrones relacionales y emocionales.</li>
  <li>Desarrollo de estrategias de afrontamiento más adaptativas ante el estrés y la adversidad.</li>
  <li>Mejora de las relaciones interpersonales y de las habilidades de comunicación.</li>
  <li>Recuperación o fortalecimiento de la autoestima y la autoeficacia percibida.</li>
  <li>Prevención de recaídas y mayor resiliencia ante futuros retos vitales.</li>
</ul>

<h3>6.2. Riesgos y efectos secundarios</h3>
<ul>
  <li><strong>Malestar emocional durante el proceso:</strong> Explorar experiencias dolorosas puede generar incomodidad, tristeza o ansiedad, especialmente en las fases iniciales. Este malestar es transitorio y esperable.</li>
  <li><strong>Empeoramiento transitorio:</strong> En algunos casos puede producirse un incremento temporal de la sintomatología. Esto debe comunicarse al/la terapeuta para evaluar su manejo.</li>
  <li><strong>Cambios relacionales:</strong> El crecimiento personal puede implicar cambios en las relaciones existentes que requieran un período de adaptación.</li>
  <li><strong>Ausencia de resultados:</strong> Si transcurrido un tiempo razonable no se observa mejoría, el/la profesional propondrá revisar el enfoque, derivar o combinar tratamientos.</li>
</ul>

<h3>6.3. Alternativas al tratamiento propuesto</h3>
<ul>
  <li>Tratamiento farmacológico prescrito por médico psiquiatra o de atención primaria.</li>
  <li>Hospitalización parcial o completa en unidades de salud mental (casos de elevada gravedad).</li>
  <li>Programas de intervención grupal psicoeducativa en centros públicos.</li>
  <li>Grupos de apoyo mutuo o asociaciones de pacientes.</li>
  <li>No tratamiento activo (seguimiento o lista de espera), en casos de sintomatología leve.</li>
</ul>

<h2>SECCIÓN 7. CONFIDENCIALIDAD Y PROTECCIÓN DE DATOS</h2>

<h3>7.1. El secreto profesional</h3>
<p>El/la profesional está sujeto/a al deber de secreto profesional establecido en el artículo 40 del Código Deontológico del Psicólogo y en la Ley Orgánica 1/1982. Todo lo que el/la paciente comparta en el contexto de la relación terapéutica tiene carácter estrictamente confidencial y no será revelado a terceros sin su consentimiento expreso. El secreto se extiende tanto al contenido de las sesiones como a la mera existencia de la relación terapéutica.</p>

<h3>7.2. Excepciones a la confidencialidad</h3>
<ol>
  <li><strong>Riesgo grave e inminente para la vida del/la paciente:</strong> Cuando exista riesgo real, serio e inmediato de autolesión (ideación suicida activa con plan y medios), el/la profesional podrá tomar las medidas necesarias para proteger su vida, incluyendo comunicación a familiares o derivación urgente.</li>
  <li><strong>Riesgo grave para la vida de terceros:</strong> Cuando el/la paciente comunique intención seria y específica de causar daño grave a una tercera persona identificable.</li>
  <li><strong>Obligación legal de declaración en procedimientos judiciales:</strong> Ante orden judicial firme, el/la profesional revelará únicamente la información estrictamente necesaria.</li>
  <li><strong>Menores de edad y situaciones de abuso:</strong> Si se detecta o comunica abuso, maltrato o negligencia hacia un menor u otra persona vulnerable, el/la profesional notificará a los organismos de protección correspondientes.</li>
  <li><strong>Supervisión clínica:</strong> El/la profesional puede consultar casos de forma anonimizada con supervisores clínicos, garantizando la protección de la identidad del/la paciente.</li>
</ol>

<h3>7.3. Grabación de sesiones</h3>
<p>Las sesiones no serán grabadas salvo acuerdo expreso y escrito previo entre las partes. En tal caso, el/la paciente puede solicitar su destrucción en cualquier momento. Las grabaciones se utilizarán únicamente con fines de supervisión clínica o formación, siempre con datos anonimizados.</p>

<h3>7.4. Tratamiento de datos personales (RGPD / LOPDGDD)</h3>
<table>
  <tr><th>Elemento</th><th>Información</th></tr>
  <tr><td><strong>Responsable del tratamiento</strong></td><td>El/la profesional o entidad titular de la consulta o centro</td></tr>
  <tr><td><strong>Finalidad</strong></td><td>Prestación de servicios de atención psicológica, gestión administrativa, elaboración de informes clínicos, facturación</td></tr>
  <tr><td><strong>Base jurídica</strong></td><td>Art. 6.1.b) RGPD (ejecución de contrato); Art. 9.2.h) RGPD (asistencia sanitaria); Art. 6.1.c) RGPD (obligaciones legales)</td></tr>
  <tr><td><strong>Categorías de datos</strong></td><td>Datos identificativos, datos de salud (historia clínica, diagnóstico, notas de sesión), datos de facturación</td></tr>
  <tr><td><strong>Plazo de conservación</strong></td><td>Mínimo 5 años desde la última asistencia (Ley 41/2002), o el plazo mayor que establezca la normativa autonómica aplicable</td></tr>
  <tr><td><strong>Destinatarios</strong></td><td>No se ceden datos a terceros salvo obligación legal o supervisión anonimizada</td></tr>
</table>

<p>El/la paciente tiene derecho a ejercer los derechos de acceso, rectificación, supresión, limitación, portabilidad y oposición sobre sus datos, dirigiéndose por escrito al/la responsable del tratamiento. También puede presentar reclamación ante la <strong>Agencia Española de Protección de Datos (AEPD)</strong> — www.aepd.es.</p>

<h3>7.5. Historia clínica</h3>
<p>El/la profesional mantendrá una historia clínica escrita que incluirá datos de identificación, motivo de consulta, evaluación, diagnóstico (si procede), plan de tratamiento, notas de evolución y alta o cierre. El/la paciente tiene derecho a acceder a ella y a solicitar copia en los términos establecidos por la Ley 41/2002 y la normativa autonómica aplicable.</p>

<h2>SECCIÓN 8. HONORARIOS, FORMA DE PAGO Y CANCELACIÓN</h2>

<h3>8.1. Honorarios</h3>
<p>El coste de cada sesión es el precio acordado entre ambas partes en el momento de iniciar el proceso terapéutico. Dicho precio puede variar en función de la modalidad de sesión (individual, pareja, familia, evaluación) y será comunicado al/la paciente de forma clara antes del inicio del tratamiento. Los honorarios están sujetos al IVA aplicable según la normativa fiscal vigente.</p>

<h3>8.2. Forma de pago</h3>
<p>El pago se realizará al término de cada sesión o en la forma acordada entre las partes. El/la profesional emitirá factura o recibo a solicitud del/la paciente.</p>

<h3>8.3. Política de cancelación y ausencias</h3>
<ul>
  <li>La cancelación o modificación de una cita debe comunicarse con un mínimo de <strong>24 horas de antelación</strong>. Las cancelaciones dentro de ese plazo podrán ser facturadas en su totalidad o parcialmente, salvo causa de fuerza mayor justificada.</li>
  <li>En caso de ausencia sin previo aviso ("no-show"), la sesión podrá ser facturada en su totalidad.</li>
  <li>El/la profesional comunicará con la máxima antelación posible cualquier modificación en su agenda, reorganizando las sesiones sin coste adicional para el/la paciente.</li>
</ul>

<h3>8.4. Precariedad económica</h3>
<p>Si la situación económica del/la paciente se viese comprometida durante el proceso, se invita a comunicarlo al/la profesional para explorar opciones como la reducción temporal de frecuencia, acuerdos de pago diferido o derivación a recursos públicos o entidades sin ánimo de lucro.</p>

<h2>SECCIÓN 9. DERECHOS DEL/LA PACIENTE</h2>

<h3>9.1. Derechos recogidos en la Ley 41/2002</h3>
<ul>
  <li><strong>Derecho a la información asistencial:</strong> Conocer su estado de salud psicológica, el diagnóstico, el tratamiento propuesto, sus alternativas y los riesgos que conlleva.</li>
  <li><strong>Derecho a la toma de decisiones:</strong> Participar activamente en todas las decisiones relativas a su tratamiento y rechazar las intervenciones propuestas.</li>
  <li><strong>Derecho a la intimidad:</strong> Que se respete el carácter confidencial de los datos referentes a su estado de salud.</li>
  <li><strong>Derecho al acceso a la historia clínica:</strong> Acceder a la documentación de su historia clínica y obtener copia de los datos que figuren en ella.</li>
  <li><strong>Derecho al alta voluntaria:</strong> Abandonar el tratamiento en cualquier momento, sin necesidad de justificación.</li>
</ul>

<h3>9.2. Derechos específicos del proceso terapéutico</h3>
<ul>
  <li>Ser tratado/a con respeto, dignidad y sin discriminación.</li>
  <li>Recibir atención psicológica de calidad, basada en la evidencia científica.</li>
  <li>Conocer la formación, titulación y número de colegiado/a del/la profesional.</li>
  <li>Cambiar de terapeuta o buscar una segunda opinión en cualquier momento.</li>
  <li>Presentar una queja o reclamación ante el Colegio Oficial de Psicólogos de su comunidad autónoma.</li>
</ul>

<h2>SECCIÓN 10. MENORES DE EDAD Y PERSONAS CON CAPACIDAD LEGALMENTE MODIFICADA</h2>

<p>Cuando el/la paciente sea menor de 16 años, el consentimiento deberá ser otorgado por sus representantes legales. Si tiene 16 o más años, se considerará su capacidad para consentir según lo establecido en la Ley 41/2002. En todo caso, el interés superior del/la menor prevalecerá sobre cualquier otra consideración. La atención psicológica de un menor de edad cuyos progenitores estén separados o divorciados corresponde al ejercicio conjunto de la patria potestad, salvo resolución judicial en contrario.</p>

<h2>SECCIÓN 11. SITUACIONES DE CRISIS Y CONDUCTAS DE RIESGO</h2>

<h3>11.1. Ideación suicida o de autolesión</h3>
<p>Si el/la paciente experimenta pensamientos de hacerse daño o de quitarse la vida, es fundamental que lo comunique al/la profesional sin demora. El/la profesional realizará una evaluación del riesgo y trabajará con el/la paciente para establecer un plan de seguridad.</p>

<p><strong>Recursos de crisis disponibles en España:</strong></p>
<ul>
  <li><strong>Teléfono de la Esperanza:</strong> 717 003 717 (atención 24 h)</li>
  <li><strong>Línea de atención a conducta suicida:</strong> 024 (Ministerio de Sanidad)</li>
  <li><strong>Urgencias generales:</strong> 112</li>
  <li><strong>Urgencias hospitalarias de salud mental:</strong> Hospital de referencia de la zona.</li>
</ul>

<h3>11.2. Consumo de sustancias</h3>
<p>Si el motivo de consulta incluye o está relacionado con el consumo de alcohol u otras sustancias, el/la profesional podrá establecer coordinación con Unidades de Conductas Adictivas (UCA) u otros recursos especializados. El consumo activo de sustancias en el momento de la sesión puede comprometer la eficacia del trabajo terapéutico.</p>

<h2>SECCIÓN 12. FINALIZACIÓN DEL TRATAMIENTO</h2>

<p>El tratamiento finalizará cuando se hayan alcanzado los objetivos terapéuticos, cuando el/la paciente decida interrumpirlo o cuando el/la profesional considere que ha llegado a los límites de lo que puede ofrecer. El/la paciente puede interrumpir el tratamiento en cualquier momento sin necesidad de justificación. Se recomienda comunicarlo antes de la siguiente sesión para poder realizar una sesión de cierre si así se desea.</p>

<p>Si en algún momento el/la profesional considera que la situación del/la paciente requiere atención de otro especialista, le informará de ello y facilitará la derivación o coordinación necesaria, siempre con el consentimiento del/la paciente.</p>

<h2>SECCIÓN 13. MARCO NORMATIVO Y DEONTOLÓGICO</h2>

<p>El ejercicio de la psicología como profesión sanitaria en España está regulado, entre otras, por las siguientes disposiciones:</p>
<ul>
  <li>Ley 44/2003, de 21 de noviembre, de Ordenación de las Profesiones Sanitarias.</li>
  <li>Ley 41/2002, de 14 de noviembre, básica reguladora de la autonomía del paciente.</li>
  <li>Ley Orgánica 3/2018 (LOPDGDD) y Reglamento (UE) 2016/679 (RGPD).</li>
  <li>Código Deontológico del Psicólogo (Consejo General de la Psicología de España, 2010).</li>
  <li>Ley 14/1986, de 25 de abril, General de Sanidad.</li>
  <li>Legislación autonómica de historia clínica aplicable.</li>
</ul>

<p>El/la profesional está colegiado/a y somete su ejercicio a los principios del Código Deontológico y a la supervisión del Colegio Oficial de Psicólogos correspondiente.</p>

<h2>SECCIÓN 14. PREGUNTAS FRECUENTES</h2>

<h3>¿La información compartida en sesión puede usarse en un juicio?</h3>
<p>En general, no. El/la profesional está sujeto/a al secreto profesional y no puede revelar el contenido de las sesiones sin el consentimiento del/la paciente, salvo las excepciones indicadas en la Sección 7.2.</p>

<h3>¿Puede el/la paciente hablar con el/la profesional fuera de sesión si tiene una crisis?</h3>
<p>Depende de los acuerdos establecidos. En situaciones de riesgo vital, el recurso principal son los servicios de emergencias (112) o la línea 024. El/la paciente debe consultar este protocolo con su profesional al inicio del tratamiento.</p>

<h3>¿Qué ocurre si el/la profesional se pone enfermo/a o tiene que dejar de ejercer?</h3>
<p>El/la profesional tiene el deber ético de garantizar la continuidad de la atención, facilitando la derivación a otro/a profesional y entregando un informe de continuidad si fuera necesario.</p>

<h3>¿Puede el/la paciente ver a otro/a psicólogo/a al mismo tiempo?</h3>
<p>Se desaconseja seguir dos procesos psicoterapéuticos simultáneos, ya que puede generar confusión y mensajes contradictorios. La psicoterapia sí puede combinarse con el seguimiento psiquiátrico o médico.</p>

<h3>¿La psicoterapia es adecuada si el/la paciente toma medicación?</h3>
<p>Sí. La psicoterapia y el tratamiento farmacológico son complementarios. La combinación de ambos ha demostrado ser más eficaz que cada uno por separado en múltiples trastornos. El/la profesional coordinará con el médico o psiquiatra cuando sea necesario.</p>

<h2>SECCIÓN 15. DECLARACIONES Y CONSENTIMIENTO</h2>

<p>Antes de firmar este documento, el/la paciente confirma los siguientes extremos:</p>

<div>
  <div class="check-item">He leído y comprendido toda la información contenida en este documento.</div>
  <div class="check-item">He tenido la oportunidad de formular preguntas al/la profesional y estas han sido respondidas satisfactoriamente.</div>
  <div class="check-item">He sido informado/a de los objetivos del tratamiento, las técnicas que se utilizarán, la duración estimada, los beneficios esperados y los posibles riesgos.</div>
  <div class="check-item">He sido informado/a de las excepciones a la confidencialidad y las entiendo.</div>
  <div class="check-item">Acepto el tratamiento de mis datos personales conforme al RGPD y la LOPDGDD para las finalidades descritas en este documento.</div>
  <div class="check-item">Soy consciente de que puedo revocar este consentimiento en cualquier momento, sin perjuicio para mí, comunicándolo al/la profesional.</div>
  <div class="check-item">Consiento libremente comenzar el proceso de evaluación y tratamiento psicológico.</div>
</div>

<br/>

<div class="firma-section">
  <div class="firma-block">
    <div class="firma-line">
      Firma del/la paciente o representante legal
    </div>
  </div>
  <div class="firma-block">
    <div class="firma-line">
      Firma del/la profesional
    </div>
  </div>
</div>

<br/><br/>
<div class="aviso">
  <strong>NOTA:</strong> Este documento se entregará en dos ejemplares, quedando uno en poder del/la paciente y otro en la historia clínica del/la profesional. En caso de tratamiento online, se guardará copia digital firmada mediante la plataforma de gestión habilitada al efecto.
</div>

</body>
</html>`;

// ─────────────────────────────────────────────────────────────────────────────

async function updateConsentimiento() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  console.log('🔍 Buscando plantilla maestra de consentimiento informado...');

  const { data: existing, error: findErr } = await supabase
    .from('templates')
    .select('id, template_name')
    .eq('master', true)
    .ilike('content', '%consentimiento informado%')
    .limit(1);

  if (findErr) {
    console.error('❌ Error al buscar plantilla:', findErr.message);
    process.exit(1);
  }

  let targetId;
  if (existing && existing.length > 0) {
    targetId = existing[0].id;
    console.log(`✅ Plantilla encontrada (id=${targetId}), actualizando...`);
  } else {
    // Fallback: try to update id=1
    targetId = 1;
    console.log('⚠️  No se encontró por contenido, intentando id=1...');
  }

  const { data, error } = await supabase
    .from('templates')
    .update({ content: NEW_CONTENT, template_name: 'Consentimiento Informado' })
    .eq('id', targetId)
    .select('id, template_name')
    .single();

  if (error) {
    console.error('❌ Error al actualizar:', error.message);
    process.exit(1);
  }

  console.log(`✅ Plantilla actualizada: id=${data.id}, template_name="${data.template_name}"`);
  console.log('   → Sin campos en blanco: el documento ahora se refiere genéricamente a "el/la paciente" y "el/la profesional"');
}

updateConsentimiento();
