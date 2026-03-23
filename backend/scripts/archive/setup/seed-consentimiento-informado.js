// Inserta la plantilla maestra "Consentimiento Informado" en Supabase
// Uso: node scripts/seed-consentimiento-informado.js

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configuradas en .env');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTO: Consentimiento Informado para Tratamiento Psicológico — España
// ─────────────────────────────────────────────────────────────────────────────
const CONTENT = `<!DOCTYPE html>
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
    .datos-box { border: 1px solid #ccc; border-radius: 6px; padding: 14px 18px; margin: 18px 0; background: #f9f9f9; }
    .datos-box p { margin: 4px 0; }
    .firma-section { margin-top: 60px; display: flex; justify-content: space-between; }
    .firma-block { width: 45%; }
    .firma-line { border-top: 1px solid #333; margin-top: 60px; padding-top: 6px; font-size: 12px; color: #444; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13px; }
    th { background: #0f3460; color: #fff; padding: 8px 10px; text-align: left; }
    td { border: 1px solid #ddd; padding: 7px 10px; vertical-align: top; }
    tr:nth-child(even) td { background: #f5f5f5; }
    .page-break { page-break-after: always; margin: 0; }
    .highlight { background: #e8f4fd; border-radius: 4px; padding: 2px 5px; }
    blockquote { border-left: 3px solid #0f3460; margin: 12px 20px; padding: 8px 14px; color: #333; font-style: italic; background: #f0f4ff; border-radius: 0 6px 6px 0; }
    .numero { display: inline-block; background: #0f3460; color: white; border-radius: 50%; width: 22px; height: 22px; text-align: center; line-height: 22px; font-size: 12px; font-weight: bold; margin-right: 6px; flex-shrink: 0; }
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

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<h2>SECCIÓN 1. IDENTIFICACIÓN DE LAS PARTES</h2>

<h3>1.1. Datos del profesional o centro</h3>
<div class="datos-box">
  <p><strong>Nombre del profesional / razón social:</strong> ___________________________________</p>
  <p><strong>Número de colegiado/a:</strong> ___________________________________</p>
  <p><strong>Colegio Oficial de Psicólogos:</strong> ___________________________________</p>
  <p><strong>Especialidad:</strong> Psicología Clínica / Psicología General Sanitaria / Psicología (máster habilitante)</p>
  <p><strong>Dirección del centro:</strong> ___________________________________</p>
  <p><strong>Teléfono de contacto:</strong> ___________________________________</p>
  <p><strong>Correo electrónico:</strong> ___________________________________</p>
  <p><strong>Responsable de protección de datos:</strong> ___________________________________</p>
</div>

<h3>1.2. Datos del paciente / consultante</h3>
<div class="datos-box">
  <p><strong>Nombre y apellidos:</strong> ___________________________________</p>
  <p><strong>Fecha de nacimiento:</strong> ___________________________________</p>
  <p><strong>DNI / NIE / Pasaporte:</strong> ___________________________________</p>
  <p><strong>Dirección:</strong> ___________________________________</p>
  <p><strong>Teléfono:</strong> ___________________________________</p>
  <p><strong>Correo electrónico:</strong> ___________________________________</p>
  <p><strong>En caso de menor de edad o persona con capacidad legalmente modificada, representante legal:</strong><br>
    Nombre: ___________________________________ DNI: ___________________</p>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<h2>SECCIÓN 2. INFORMACIÓN GENERAL SOBRE EL TRATAMIENTO PSICOLÓGICO</h2>

<h3>2.1. ¿Qué es la psicoterapia?</h3>
<p>La psicoterapia es un proceso de tratamiento psicológico basado en la relación entre un profesional especializado y una persona (o grupo) que experimenta algún tipo de dificultad en su vida emocional, cognitiva, conductual o relacional. A diferencia de la medicación psiquiátrica, que actúa sobre los sustratos biológicos de la mente, la psicoterapia trabaja mediante el diálogo, la reflexión, la comprensión y el cambio de patrones de pensamiento, emoción y comportamiento que generan malestar o impiden el funcionamiento adaptativo.</p>

<p>La psicoterapia no es una conversación informal, ni un consejo de amistad, ni una actividad de crecimiento personal sin fundamentación científica. Se trata de una intervención profesional regulada, respaldada por décadas de investigación empírica, que requiere formación universitaria específica (grado o licenciatura en Psicología), posgrado habilitante, y en muchos casos formación especializada acreditada por el Consejo General de la Psicología de España o por colegios oficiales autonómicos.</p>

<p>Existen múltiples modalidades de intervención psicológica reconocidas por la comunidad científica internacional: la terapia cognitivo-conductual (TCC), la terapia de aceptación y compromiso (ACT), la terapia dialéctico-conductual (DBT), la terapia centrada en la persona, la psicoterapia psicodinámica, la terapia sistémica, la EMDR (desensibilización y reprocesamiento por movimientos oculares), la terapia de mentalización, la terapia narrativa, entre otras. El profesional que le atiende le explicará la orientación terapéutica que utiliza y por qué la considera adecuada para su caso.</p>

<h3>2.2. Ámbito de aplicación y límites de la psicoterapia</h3>
<p>La psicoterapia es eficaz para una amplia variedad de problemas y trastornos: ansiedad, depresión, trastorno obsesivo-compulsivo, estrés post-traumático, fobias específicas, problemas de pareja y familia, dificultades en las relaciones interpersonales, trastornos de la conducta alimentaria, adicciones, crisis vitales, duelo, baja autoestima, dificultades en el control emocional, trastornos de personalidad, problemas de sueño, y muchos otros.</p>

<p>Sin embargo, la psicoterapia tiene límites que es importante conocer:</p>
<ul>
  <li>No sustituye al tratamiento médico o psiquiátrico cuando este es necesario. En casos en que la sintomatología requiera evaluación médica o tratamiento farmacológico, el psicólogo derivará al profesional sanitario correspondiente o trabajará de manera coordinada con él/ella.</li>
  <li>El psicólogo no puede garantizar resultados específicos. Los resultados dependen de múltiples factores: la naturaleza del problema, las características individuales del paciente, la motivación y compromiso con el proceso, los recursos externos disponibles, y la calidad de la relación terapéutica.</li>
  <li>La psicoterapia no es un proceso lineal. Es esperable que haya periodos de avance, estancamiento y, en ocasiones, momentos de mayor incomodidad o malestar antes de producirse una mejoría sostenida. Esto no es necesariamente señal de que el tratamiento no funciona.</li>
  <li>El psicólogo actúa dentro de su ámbito de competencia. Si su problema requiere una especialización que el profesional no posee, le informará y derivará en consecuencia.</li>
</ul>

<h3>2.3. Modalidades de atención disponibles</h3>
<p>El tratamiento puede realizarse en las siguientes modalidades, según lo acordado entre el profesional y el paciente:</p>
<ul>
  <li><strong>Sesión individual presencial:</strong> El paciente acude en persona al centro o consulta.</li>
  <li><strong>Sesión individual online/telemática:</strong> La sesión se realiza por videoconferencia mediante plataformas que garantizan la privacidad y confidencialidad de la comunicación.</li>
  <li><strong>Terapia de pareja:</strong> Ambos miembros de la pareja participan conjuntamente, pudiendo combinarse con sesiones individuales.</li>
  <li><strong>Terapia familiar:</strong> Varios miembros del sistema familiar participan en el proceso, con el objetivo de mejorar la dinámica relacional del conjunto.</li>
  <li><strong>Terapia de grupo:</strong> Un pequeño grupo de personas con problemáticas similares trabajan juntas bajo la dirección del terapeuta.</li>
</ul>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<h2>SECCIÓN 3. EVALUACIÓN INICIAL Y PLAN DE TRATAMIENTO</h2>

<h3>3.1. Fase de evaluación</h3>
<p>Antes de comenzar el tratamiento propiamente dicho, es habitual realizar una fase de evaluación que puede durar entre una y cuatro sesiones, dependiendo de la complejidad del caso. Durante esta fase, el psicólogo recopilará información detallada sobre su historia clínica, su historia vital, su situación actual y sus objetivos terapéuticos. Podrá utilizarse la entrevista clínica estructurada o semiestructurada, cuestionarios estandarizados, pruebas psicométricas validadas, y otros instrumentos de evaluación.</p>

<p>El objetivo de la evaluación es obtener una comprensión lo más completa posible de su situación para poder diseñar un plan de tratamiento individualizado, establecer hipótesis diagnósticas cuando proceda, y fijar unas metas terapéuticas realistas y mensurables.</p>

<h3>3.2. Formulación del caso y diagnóstico</h3>
<p>El psicólogo elaborará, en base a la evaluación realizada, una formulación del caso clínico que integra la información recopilada dentro de un marco conceptual coherente con su orientación terapéutica. Esta formulación explica de manera hipotética cuáles son los factores que han contribuido a desarrollar el problema, cuáles lo mantienen en la actualidad y cuáles sería necesario modificar.</p>

<p>Si procede, el psicólogo podrá emitir un diagnóstico de acuerdo con los sistemas de clasificación internacionales vigentes (DSM-5-TR o CIE-11). Usted tiene derecho a conocer dicho diagnóstico y a recibir una explicación comprensible del mismo. El diagnóstico es una herramienta de comunicación y orientación del tratamiento, no una etiqueta definitoria de su identidad.</p>

<h3>3.3. Objetivos terapéuticos</h3>
<p>Los objetivos del tratamiento se establecerán de forma colaborativa entre usted y su psicólogo/a. Estos objetivos serán:</p>
<ul>
  <li><strong>Específicos:</strong> Claros y concretos, no vagos ni ambiguos.</li>
  <li><strong>Medibles:</strong> De manera que sea posible evaluar el progreso durante el proceso.</li>
  <li><strong>Alcanzables:</strong> Realistas dado el punto de partida y los recursos disponibles.</li>
  <li><strong>Relevantes:</strong> Significativos para usted y acordes a sus valores y necesidades.</li>
  <li><strong>Temporalmente delimitados:</strong> Con una estimación razonable del tiempo necesario.</li>
</ul>
<p>Los objetivos podrán revisarse y modificarse a lo largo del tratamiento a medida que se produzcan cambios o nuevas informaciones.</p>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<h2>SECCIÓN 4. ESTRUCTURA DEL PROCESO TERAPÉUTICO</h2>

<h3>4.1. Frecuencia y duración de las sesiones</h3>
<p>Las sesiones tienen una duración estándar de <strong>50 minutos</strong> (hora terapéutica), aunque en algunos casos específicos —evaluación inicial, sesiones de pareja o familia, psicoeducación intensiva— pueden tener una duración diferente pactada previamente.</p>

<p>La frecuencia habitual es de una sesión por semana, especialmente en las fases iniciales del tratamiento. En fases más avanzadas, y según evolución, la frecuencia puede reducirse a quincenal o mensual. En situaciones de crisis aguda puede ser necesario aumentar transitoriamente la frecuencia.</p>

<h3>4.2. Estimación de la duración total del tratamiento</h3>
<p>La duración global del proceso terapéutico varía considerablemente según el tipo y severidad del problema, la historia clínica previa, los objetivos establecidos y el ritmo de cambio individual. A modo orientativo:</p>
<table>
  <tr><th>Tipo de intervención</th><th>Estimación orientativa</th></tr>
  <tr><td>Intervención breve (problema focal)</td><td>8 – 16 sesiones</td></tr>
  <tr><td>Tratamiento estándar (trastorno de ansiedad, depresión leve-moderada)</td><td>16 – 30 sesiones</td></tr>
  <tr><td>Tratamiento de media duración (trauma, duelo complejo, trastorno de personalidad)</td><td>30 – 60 sesiones</td></tr>
  <tr><td>Tratamiento de larga duración (patología grave, trabajo de desarrollo personal profundo)</td><td>Más de 60 sesiones</td></tr>
</table>
<p>Estas cifras son meramente orientativas. El psicólogo realizará revisiones periódicas del proceso para evaluar el progreso y ajustar la planificación.</p>

<h3>4.3. Fases del tratamiento</h3>
<p>El proceso terapéutico generalmente atraviesa las siguientes fases, aunque no de manera estrictamente lineal:</p>
<ol>
  <li><strong>Fase de acogida y alianza terapéutica:</strong> Construcción de la relación terapéutica, recogida de información y establecimiento de un vínculo de confianza.</li>
  <li><strong>Fase de evaluación y formulación:</strong> Comprensión profunda del problema y elaboración del plan de tratamiento.</li>
  <li><strong>Fase de intervención:</strong> Trabajo activo sobre los objetivos terapéuticos mediante las técnicas y estrategias propias de la orientación del terapeuta.</li>
  <li><strong>Fase de consolidación:</strong> Integración de los cambios conseguidos, generalización a la vida cotidiana y prevención de recaídas.</li>
  <li><strong>Fase de cierre:</strong> Evaluación de resultados, preparación del alta y establecimiento de un plan de seguimiento si se considera necesario.</li>
</ol>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<h2>SECCIÓN 5. TÉCNICAS Y PROCEDIMIENTOS TERAPÉUTICOS</h2>

<h3>5.1. Descripción de las técnicas utilizadas</h3>
<p>En función de la orientación terapéutica del profesional y de las necesidades específicas del paciente, podrán utilizarse diversas técnicas y procedimientos, entre los que se incluyen:</p>

<h3>5.1.1. Técnicas cognitivas</h3>
<p>Orientadas a identificar y modificar pensamientos, creencias y esquemas cognitivos disfuncionales que contribuyen al malestar emocional. Incluyen el registro de pensamientos automáticos, la reestructuración cognitiva, el cuestionamiento socrático, la identificación de sesgos cognitivos, la técnica del continuo cognitivo, el análisis coste-beneficio de creencias, la defusión cognitiva (en contextos de ACT), entre otras.</p>

<h3>5.1.2. Técnicas conductuales</h3>
<p>Orientadas a modificar patrones de comportamiento mediante el aprendizaje y la práctica. Incluyen la activación conductual, la exposición gradual y en vivo, la desensibilización sistemática, la prevención de respuesta, el entrenamiento en habilidades sociales, el ensayo conductual, el reforzamiento diferencial, la economía de fichas (en contextos específicos), entre otras.</p>

<h3>5.1.3. Técnicas de regulación emocional</h3>
<p>Orientadas a mejorar la capacidad de identificar, comprender, tolerar y modular las emociones. Incluyen técnicas de atención plena (mindfulness), técnicas de relajación (respiración diafragmática, relajación muscular progresiva, relajación aplicada), técnicas de tolerancia al malestar, el entrenamiento en regulación emocional del modelo DBT, entre otras.</p>

<h3>5.1.4. Técnicas basadas en trauma</h3>
<p>Cuando se trabajan experiencias traumáticas o adversidades vitales significativas, pueden utilizarse técnicas específicas como el EMDR (Eye Movement Desensitization and Reprocessing), la terapia de exposición prolongada, el procesamiento cognitivo del trauma, la terapia narrativa del trauma, trabajo con partes (IFS o EMDR con partes), terapia sensoriomotriz, entre otras. El uso de estas técnicas requiere una formación específica y será previamente explicado y consentido.</p>

<h3>5.1.5. Técnicas sistémicas y relacionales</h3>
<p>En modalidades de pareja o familia, pueden utilizarse técnicas propias de la terapia sistémica: escultura familiar, reencuadre, paradojas terapéuticas, prescripción de rituales, genogramas, externalización del problema (enfoque narrativo), entre otras.</p>

<h3>5.1.6. Psicoeducación</h3>
<p>Un componente frecuente en muchos tratamientos psicológicos es la psicoeducación: proporcionar al paciente información científicamente fundamentada sobre su problema, sus mecanismos de mantenimiento, la racionalidad del tratamiento y las herramientas disponibles. La psicoeducación potencia la autonomía del paciente y mejora la adherencia al tratamiento.</p>

<h3>5.2. Tareas entre sesiones</h3>
<p>Es habitual que el psicólogo proponga actividades o ejercicios para realizar entre sesiones. Estas tareas tienen como objetivo generalizar el aprendizaje de la consulta a los contextos naturales de la vida del paciente y acelerar el proceso de cambio. No son obligatorias en sentido estricto, pero su realización se ha asociado consistentemente a mejores resultados terapéuticos. Se le alienta a realizarlas y a comunicar al psicólogo cualquier dificultad que haya encontrado en su ejecución.</p>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<h2>SECCIÓN 6. BENEFICIOS, RIESGOS Y ALTERNATIVAS</h2>

<h3>6.1. Beneficios esperados</h3>
<p>La evidencia científica acumulada durante décadas indica que la psicoterapia es eficaz para una amplia gama de problemas emocionales y conductuales. Los beneficios que puede esperar de un proceso psicoterapéutico exitoso incluyen:</p>
<ul>
  <li>Reducción o eliminación de la sintomatología que motiva la consulta.</li>
  <li>Mejora del estado de ánimo y mayor bienestar emocional general.</li>
  <li>Mayor autoconocimiento y comprensión de los propios patrones relacionales y emocionales.</li>
  <li>Desarrollo de estrategias de afrontamiento más adaptativas ante el estrés y la adversidad.</li>
  <li>Mejora de las relaciones interpersonales y de las habilidades de comunicación.</li>
  <li>Recuperación o fortalecimiento de la autoestima y la autoeficacia percibida.</li>
  <li>Mayor sentido de control sobre la propia vida y las propias decisiones.</li>
  <li>Prevención de recaídas y mayor resiliencia ante futuros retos vitales.</li>
</ul>

<h3>6.2. Riesgos y efectos secundarios del tratamiento psicológico</h3>
<p>Como cualquier intervención sanitaria, la psicoterapia puede conllevar efectos indeseados o riesgos que es importante conocer:</p>
<ul>
  <li><strong>Malestar emocional durante el proceso:</strong> Explorar experiencias dolorosas, conflictos no resueltos o patrones relacionales disfuncionales puede generar incomodidad, tristeza, ansiedad o irritabilidad, especialmente en las fases iniciales o al abordar material conflictivo. Este malestar es transitorio y esperable en un proceso de cambio profundo.</li>
  <li><strong>Empeoramiento transitorio:</strong> En algunos casos, la activación de material conflictivo puede producir un incremento temporal de la sintomatología ("getting worse before getting better"). Esto no significa que el tratamiento sea inadecuado, aunque debe comunicarse al terapeuta para evaluar el manejo de este período.</li>
  <li><strong>Cambios relacionales:</strong> El crecimiento personal puede implicar cambios en las relaciones existentes, que en algunos casos pueden vivirse como perturbadores o requieren un período de adaptación por parte de las personas del entorno.</li>
  <li><strong>Dependencia terapéutica:</strong> Existe el riesgo de desarrollar una dependencia excesiva de la figura del terapeuta. El profesional trabajará activamente para fomentar la autonomía del paciente y evitar este riesgo.</li>
  <li><strong>Ausencia de resultados:</strong> No todos los tratamientos son igualmente efectivos para todas las personas. Si transcurrido un tiempo razonable no se observa mejoría, el psicólogo propondrá revisar el enfoque, derivar a otro profesional o considerar la combinación con otros tratamientos.</li>
</ul>

<h3>6.3. Alternativas al tratamiento propuesto</h3>
<p>El tratamiento psicológico no es la única opción disponible. Otras alternativas que pueden resultar adecuadas, solas o en combinación, incluyen:</p>
<ul>
  <li>Tratamiento farmacológico prescrito por un médico psiquiatra o de atención primaria.</li>
  <li>Hospitalización parcial o completa en unidades de salud mental (en casos de elevada gravedad).</li>
  <li>Programas de intervención grupal psicoeducativa (grupos de salud mental en centros públicos).</li>
  <li>Aplicaciones y plataformas digitales de salud mental con evidencia científica (como complemento, no sustitución).</li>
  <li>Grupos de apoyo mutuo o asociaciones de pacientes.</li>
  <li>No tratamiento activo (seguimiento o lista de espera), en casos de sintomatología leve que pueda resolverse espontáneamente.</li>
</ul>
<p>El psicólogo le informará sobre las alternativas que considera más adecuadas para su caso y responderá a cualquier pregunta al respecto.</p>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<h2>SECCIÓN 7. CONFIDENCIALIDAD Y PROTECCIÓN DE DATOS</h2>

<h3>7.1. El secreto profesional</h3>
<p>El psicólogo/a está sujeto al deber de secreto profesional establecido en el artículo 40 del Código Deontológico del Psicólogo (Consejo General de la Psicología, 2010) y en la Ley Orgánica 1/1982 de Protección Civil del Honor, la Intimidad Personal y Familiar. Todo lo que usted comparta en el contexto de la relación terapéutica tiene carácter estrictamente confidencial y no será revelado a terceros sin su consentimiento expreso.</p>

<p>El secreto profesional se extiende tanto al contenido de las sesiones como a la mera existencia de la relación terapéutica. Por tanto, el psicólogo no confirmará ni negará si usted es o ha sido su paciente salvo que usted lo autorice expresamente.</p>

<h3>7.2. Excepciones a la confidencialidad</h3>
<p>Existen situaciones en las que el psicólogo está <strong>legalmente obligado</strong> o <strong>éticamente autorizado</strong> a romper la confidencialidad, aun sin el consentimiento del paciente:</p>
<ol>
  <li><strong>Riesgo grave e inminente para la vida del paciente:</strong> Cuando exista un riesgo real, serio e inmediato de que el paciente se cause daño a sí mismo (ideación suicida activa con plan y medios), el psicólogo podrá tomar las medidas necesarias para proteger su vida, incluyendo la comunicación a familiares o la derivación urgente a servicios de emergencia. En la medida de lo posible, intentará informarle previamente de esta decisión.</li>
  <li><strong>Riesgo grave para la vida de terceros:</strong> Cuando el paciente comunique una intención seria y específica de causar daño grave a una tercera persona identificable, el psicólogo podrá adoptar las medidas necesarias para proteger a esa persona, incluida la notificación a las autoridades competentes.</li>
  <li><strong>Obligación legal de denuncia o declaración en procedimientos judiciales:</strong> El psicólogo podrá estar obligado a revelar información en el marco de procedimientos judiciales cuando así lo requiera una orden judicial firme. En estos casos, revelará únicamente la información estrictamente necesaria.</li>
  <li><strong>Menores de edad y situaciones de abuso:</strong> Si en el transcurso del tratamiento se detecta o se comunica el abuso, maltrato o negligencia hacia un menor u otra persona vulnerable, el psicólogo tiene la obligación ética y legal de notificarlo a los organismos de protección correspondientes.</li>
  <li><strong>Supervisión clínica:</strong> El psicólogo puede consultar casos de forma anonimizada con supervisores clínicos o equipos de trabajo, como parte del proceso de garantía de calidad de la atención. En estos casos, su identidad permanece protegida.</li>
</ol>
<p>El psicólogo se esforzará siempre por informarle antes de cualquier ruptura de la confidencialidad, salvo que ello ponga en riesgo la situación que la motiva.</p>

<h3>7.3. Grabación y registro de sesiones</h3>
<p>Las sesiones no serán grabadas en audio ni en vídeo salvo que ambas partes lo acuerden expresamente y por escrito con anterioridad. Si se realiza dicha grabación, el paciente tiene derecho a solicitar su destrucción en cualquier momento. Las grabaciones se utilizarán únicamente con fines de supervisión clínica o formación, siempre con datos anonimizados.</p>

<h3>7.4. Tratamiento de datos personales (RGPD / LOPDGDD)</h3>
<p>De conformidad con lo dispuesto en el Reglamento (UE) 2016/679 General de Protección de Datos (RGPD) y en la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y Garantía de los Derechos Digitales (LOPDGDD), le informamos de lo siguiente:</p>

<table>
  <tr><th>Elemento</th><th>Información</th></tr>
  <tr><td><strong>Responsable del tratamiento</strong></td><td>El profesional o entidad identificada en la Sección 1</td></tr>
  <tr><td><strong>Finalidad del tratamiento</strong></td><td>Prestación de servicios de atención psicológica, gestión administrativa de la consulta, elaboración de informes clínicos si se solicitan, facturación</td></tr>
  <tr><td><strong>Base jurídica</strong></td><td>Art. 6.1.b) RGPD (ejecución de un contrato de prestación de servicios); Art. 9.2.h) RGPD (prestación de asistencia sanitaria); Art. 6.1.c) RGPD (cumplimiento de obligaciones legales)</td></tr>
  <tr><td><strong>Categorías de datos tratados</strong></td><td>Datos identificativos (nombre, DNI, dirección, teléfono, email), datos de salud (historia clínica, diagnóstico, notas de sesión), datos socioeconómicos cuando sean relevantes, datos de facturación</td></tr>
  <tr><td><strong>Plazo de conservación</strong></td><td>Los datos clínicos se conservarán durante el tiempo mínimo exigido por la legislación aplicable: 5 años desde la última asistencia (Ley 41/2002), o el plazo mayor que establezca la normativa autonómica de historia clínica aplicable. Los datos de facturación, 5 años (Ley 58/2003 General Tributaria)</td></tr>
  <tr><td><strong>Destinatarios</strong></td><td>No se cederán datos a terceros salvo obligación legal. En caso de colaborar con otros profesionales sanitarios o supervisores, se hará de forma anonimizada para garantizar la confidencialidad</td></tr>
  <tr><td><strong>Transferencias internacionales</strong></td><td>No se realizan transferencias a terceros países, salvo que se utilicen herramientas tecnológicas con servidores fuera del EEE, en cuyo caso se informará específicamente y se garantizarán las salvaguardas adecuadas (cláusulas contractuales tipo de la CE)</td></tr>
</table>

<h3>7.4.1. Derechos del interesado en materia de protección de datos</h3>
<p>Usted tiene derecho a ejercer los siguientes derechos sobre sus datos personales, dirigiéndose por escrito al responsable del tratamiento (ver datos de contacto en Sección 1), aportando copia de su documento de identidad:</p>
<ul>
  <li><strong>Derecho de acceso:</strong> Conocer qué datos suyos están siendo tratados y recibir una copia de los mismos.</li>
  <li><strong>Derecho de rectificación:</strong> Solicitar la corrección de datos inexactos o incompletos.</li>
  <li><strong>Derecho de supresión ("derecho al olvido"):</strong> Solicitar la eliminación de sus datos cuando ya no sean necesarios para los fines para los que fueron recogidos, salvo que exista una obligación legal de conservación.</li>
  <li><strong>Derecho de limitación del tratamiento:</strong> Solicitar que el tratamiento de sus datos quede restringido a su mera conservación en determinadas situaciones.</li>
  <li><strong>Derecho de portabilidad:</strong> Recibir sus datos en un formato estructurado, de uso común y lectura mecánica, cuando el tratamiento se base en el consentimiento y se realice por medios automatizados.</li>
  <li><strong>Derecho de oposición:</strong> Oponerse al tratamiento de sus datos en determinadas circunstancias.</li>
  <li><strong>Derechos frente a decisiones automatizadas:</strong> No ser objeto de decisiones basadas exclusivamente en el tratamiento automatizado de sus datos que produzcan efectos jurídicos significativos.</li>
</ul>
<p>Si considera que el tratamiento de sus datos vulnera la normativa vigente, tiene derecho a presentar una reclamación ante la <strong>Agencia Española de Protección de Datos (AEPD)</strong> — www.aepd.es.</p>

<h3>7.5. Historia clínica y documentación</h3>
<p>El psicólogo mantendrá una historia clínica escrita de cada paciente que incluirá, como mínimo: datos de identificación, motivo de consulta, historia del problema y evaluación, diagnóstico (si procede), plan de tratamiento y objetivos, notas de evolución de las sesiones, y alta o cierre. Esta historia clínica es propiedad del paciente, aunque el profesional la custodie. Usted tiene derecho a acceder a ella y a solicitar copia de la misma, en los términos establecidos por la Ley 41/2002 y por la normativa autonómica aplicable.</p>

<p>La historia clínica se conservará de forma segura, con acceso restringido y medidas técnicas y organizativas adecuadas para garantizar su confidencialidad e integridad. En el caso de que se utilicen plataformas informáticas o aplicaciones de gestión, dichas herramientas cumplirán con lo establecido en el RGPD y la LOPDGDD.</p>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<h2>SECCIÓN 8. HONORARIOS, FORMA DE PAGO Y CANCELACIÓN</h2>

<h3>8.1. Honorarios</h3>
<p>El coste de cada sesión es de <strong>_____ €</strong> por sesión individual de 50 minutos. En caso de sesiones de pareja, familia, evaluación o sesiones de mayor duración, el precio pactado es de <strong>_____ €</strong>. Los honorarios están sujetos al IVA aplicable según la normativa fiscal vigente en el momento de la prestación del servicio.</p>

<p>El profesional respeta las tarifas mínimas orientativas establecidas, en su caso, por el Colegio Oficial de Psicólogos de su demarcación, aunque los honorarios finales son pactados libremente entre las partes.</p>

<h3>8.2. Forma de pago</h3>
<p>El pago se realizará al término de cada sesión o en la forma acordada entre las partes (transferencia bancaria, domiciliación, pago mensual, etc.). El profesional emitirá factura o recibo a solicitación del paciente. En caso de financiación a través de aseguradora, mutua o empresa, se indicarán los procedimientos específicos de facturación.</p>

<h3>8.3. Política de cancelación y ausencias</h3>
<p>Para garantizar la calidad del servicio y respetar el tiempo de todos los pacientes, se establece la siguiente política de cancelación:</p>
<ul>
  <li>La cancelación o modificación de una cita debe comunicarse con un mínimo de <strong>24 horas de antelación</strong> antes de la hora de inicio de la sesión. Las cancelaciones realizadas dentro de ese plazo podrán ser facturadas en su totalidad o parcialmente, salvo causa de fuerza mayor debidamente justificada.</li>
  <li>En caso de ausencia sin previo aviso ("no-show"), la sesión se considerará realizada a todos los efectos y podrá ser facturada en su totalidad.</li>
  <li>Ante causas de fuerza mayor o emergencia imprevisible, se valorará cada caso de manera individual.</li>
  <li>El profesional comunicará con la máxima antelación posible cualquier modificación en su agenda, reorganizando las sesiones afectadas sin coste adicional para el paciente.</li>
</ul>

<h3>8.4. Situaciones de precariedad económica</h3>
<p>Si su situación económica se viese comprometida durante el proceso terapéutico, le invitamos a comunicarlo al profesional. En la medida de lo posible, se explorarán opciones como la reducción temporal de frecuencia, acuerdos de pago diferido o derivación a recursos públicos o entidades sin ánimo de lucro que puedan ofrecer atención psicológica a un coste reducido o gratuito.</p>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<h2>SECCIÓN 9. DERECHOS DEL PACIENTE</h2>

<h3>9.1. Derechos recogidos en la Ley 41/2002 de Autonomía del Paciente</h3>
<p>Como paciente de servicios de atención psicológica en España, usted tiene los siguientes derechos, recogidos en la Ley 41/2002, de 14 de noviembre, básica reguladora de la autonomía del paciente y de derechos y obligaciones en materia de información y documentación clínica:</p>
<ul>
  <li><strong>Derecho a la información asistencial:</strong> Tiene derecho a recibir información sobre su estado de salud psicológica, el proceso de evaluación, el diagnóstico, el tratamiento propuesto, sus alternativas y los riesgos e incertidumbres que conlleva. Esta información debe ser comprensible, adecuada a sus características personales y suficiente para que pueda tomar decisiones informadas.</li>
  <li><strong>Derecho a la toma de decisiones:</strong> Tiene derecho a participar activamente en todas las decisiones relativas a su tratamiento y a rechazar las intervenciones propuestas, siendo informado de las consecuencias de tal decisión.</li>
  <li><strong>Derecho a la intimidad:</strong> Tiene derecho a que se respete el carácter confidencial de los datos referentes a su estado de salud.</li>
  <li><strong>Derecho al acceso a la historia clínica:</strong> Tiene derecho a acceder a la documentación de su historia clínica y a obtener copia de los datos que figuren en ella, en los términos establecidos por la legislación vigente.</li>
  <li><strong>Derecho a solicitar el alta voluntaria:</strong> Tiene derecho a abandonar el tratamiento en cualquier momento, sin necesidad de justificación, asumiendo la responsabilidad de su decisión.</li>
</ul>

<h3>9.2. Derechos específicos del proceso terapéutico</h3>
<ul>
  <li>Ser tratado con respeto, dignidad y sin discriminación por razón de sexo, orientación sexual, identidad de género, etnia, religión, discapacidad, situación socioeconómica u otras circunstancias personales.</li>
  <li>Recibir una atención psicológica de calidad, basada en la evidencia científica y guiada por los principios del Código Deontológico del Psicólogo.</li>
  <li>Conocer la formación, titulación y número de colegiado del profesional que le atiende.</li>
  <li>Cambiar de terapeuta o buscar una segunda opinión en cualquier momento del proceso, sin que ello suponga ninguna consecuencia negativa.</li>
  <li>Ser derivado a otro profesional o a recursos más adecuados si el psicólogo considera que su caso requiere una atención especializada fuera de su ámbito de competencia.</li>
  <li>Presentar una queja o reclamación ante el Colegio Oficial de Psicólogos de su comunidad autónoma si considera que sus derechos han sido vulnerados.</li>
</ul>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<h2>SECCIÓN 10. MENORES DE EDAD Y PERSONAS CON CAPACIDAD LEGALMENTE MODIFICADA</h2>

<h3>10.1. Atención a menores</h3>
<p>Cuando el paciente sea menor de 16 años, el consentimiento deberá ser otorgado por sus representantes legales (padres o tutores legales). Si el paciente es mayor de 16 años y menor de 18, se considerará su capacidad para consentir según lo establecido en la Ley 41/2002 y la legislación autonómica aplicable: los menores de 16 o más años que puedan comprender el alcance y las consecuencias de la intervención podrán otorgar su consentimiento, aunque se procurará implicar a los representantes legales siempre que sea posible y beneficioso para el menor.</p>

<p>En cualquier caso, el interés superior del menor prevalecerá sobre cualquier otra consideración. Si en el transcurso del tratamiento de un menor se detecta una situación de riesgo o desprotección, el profesional actuará conforme a los protocolos de protección de la infancia vigentes.</p>

<h3>10.2. Divorcios, separaciones y custodia compartida</h3>
<p>Cuando los progenitores de un menor paciente estén separados o divorciados, la atención psicológica del menor es una decisión que corresponde al ejercicio conjunto de la patria potestad (salvo que medie resolución judicial en contrario). El psicólogo requerirá, en caso de discrepancia entre los progenitores respecto al tratamiento, la correspondiente resolución judicial. En caso de conflicto de lealtades o utilización del menor como instrumento en disputas entre progenitores, el psicólogo tomará las medidas necesarias para proteger el bienestar del menor, incluida la suspensión cautelar del tratamiento.</p>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<h2>SECCIÓN 11. SITUACIONES DE CRISIS Y CONDUCTAS DE RIESGO</h2>

<h3>11.1. Ideación suicida o de autolesión</h3>
<p>Si en algún momento del proceso terapéutico usted experimenta pensamientos de hacerse daño o de quitarse la vida, es muy importante que lo comunique a su psicólogo/a sin demora. El psicólogo realizará una evaluación del riesgo y trabajará con usted para establecer un plan de seguridad que incluya estrategias de afrontamiento, personas de confianza a contactar y recursos de emergencia disponibles.</p>

<p>En caso de riesgo inmediato y grave, el psicólogo podrá contactar con los servicios de emergencias (112) o con los familiares del paciente para garantizar su seguridad. Le informará de esta posibilidad con anterioridad para que pueda planificarse conjuntamente.</p>

<p><strong>Recursos de crisis disponibles en España:</strong></p>
<ul>
  <li><strong>Teléfono de la Esperanza:</strong> 717 003 717 (atención 24 h)</li>
  <li><strong>Línea de atención a conducta suicida:</strong> 024 (Ministerio de Sanidad)</li>
  <li><strong>Urgencias generales:</strong> 112</li>
  <li><strong>Urgencias hospitalarias de salud mental:</strong> Acudir al hospital de referencia de su zona.</li>
</ul>

<h3>11.2. Consumo de sustancias</h3>
<p>Si el motivo de consulta incluye o está relacionado con el consumo de alcohol u otras sustancias, el psicólogo podrá establecer coordinación con Unidades de Conductas Adictivas (UCA) u otros recursos especializados, siempre con su conocimiento y consentimiento. El consumo activo de sustancias en el momento de la sesión puede comprometer la eficacia del trabajo terapéutico; en tales situaciones el psicólogo se reserva el derecho de suspender la sesión.</p>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<h2>SECCIÓN 12. FINALIZACIÓN DEL TRATAMIENTO</h2>

<h3>12.1. Alta terapéutica</h3>
<p>El tratamiento finalizará cuando se hayan alcanzado los objetivos terapéuticos establecidos, cuando el paciente decida interrumpirlo o cuando el psicólogo considere que ha llegado a los límites de su competencia o de lo que puede ofrecer al paciente en ese momento. Idealmente, la finalización del tratamiento es un proceso planificado que incluye una revisión de los avances conseguidos, una consolidación de los cambios, y el establecimiento de un plan de seguimiento o autoayuda.</p>

<h3>12.2. Derecho a interrumpir el tratamiento</h3>
<p>Usted puede interrumpir el tratamiento en cualquier momento sin necesidad de justificación y sin consecuencias negativas. El psicólogo le informará de las implicaciones clínicas de la interrupción desde su punto de vista profesional, pero respetará en todo caso su autonomía. Le pedirá únicamente que, si decide interrumpir, lo comunique antes de la siguiente sesión programada, para poder hacer una última sesión de cierre si usted lo desea.</p>

<h3>12.3. Derivación a otros profesionales</h3>
<p>Si en algún momento el psicólogo considera que su situación requiere atención de otro profesional (psiquiatra, médico de familia, trabajador social, neurólogo, logopeda, neuropsicólogo, etc.) o que usted se beneficiaría de recursos adicionales, le informará de ello y le facilitará la derivación o coordinación necesaria, siempre con su consentimiento.</p>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<h2>SECCIÓN 13. MARCO NORMATIVO Y DEONTOLÓGICO</h2>

<h3>13.1. Normativa aplicable</h3>
<p>El ejercicio de la psicología como profesión sanitaria está regulado en España por el siguiente marco normativo, entre otras disposiciones:</p>
<ul>
  <li>Ley 44/2003, de 21 de noviembre, de Ordenación de las Profesiones Sanitarias.</li>
  <li>Real Decreto 1030/2006, de 15 de septiembre, por el que se establece la cartera de servicios comunes del Sistema Nacional de Salud.</li>
  <li>Ley 41/2002, de 14 de noviembre, básica reguladora de la autonomía del paciente.</li>
  <li>Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD).</li>
  <li>Reglamento (UE) 2016/679 del Parlamento Europeo y del Consejo de 27 de abril de 2016 (RGPD).</li>
  <li>Código Deontológico del Psicólogo (Consejo General de la Psicología de España, 2010).</li>
  <li>Ley 14/1986, de 25 de abril, General de Sanidad.</li>
  <li>Legislación autonómica de historia clínica aplicable en la comunidad autónoma correspondiente.</li>
  <li>Ley 33/2011, de 4 de octubre, General de Salud Pública.</li>
</ul>

<h3>13.2. Colegiación obligatoria</h3>
<p>El ejercicio de la psicología como profesión sanitaria en España requiere la colegiación en el Colegio Oficial de Psicólogos de la demarcación correspondiente. El psicólogo que le atiende está colegiado y somete su ejercicio profesional a los principios del Código Deontológico y a la supervisión deontológica del Colegio. Cualquier queja o denuncia relacionada con el ejercicio profesional deberá dirigirse al Colegio Oficial de Psicólogos correspondiente.</p>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<h2>SECCIÓN 14. PREGUNTAS FRECUENTES</h2>

<h3>¿La información que comparta en sesión puede usarse en mi contra en un juicio?</h3>
<p>En general, no. El psicólogo está sujeto al secreto profesional y no puede revelar el contenido de las sesiones sin su consentimiento, salvo en las excepciones indicadas en la Sección 7.2. Si un juez emite una orden de comparecencia, el psicólogo solo revelará la información estrictamente necesaria y puede alegar su deber de secreto profesional.</p>

<h3>¿Puedo hablar con mi psicólogo/a fuera de sesión si tengo una crisis?</h3>
<p>Depende de los acuerdos establecidos con su profesional. En situaciones de riesgo vital, el recurso principal son los servicios de emergencias (112) o la línea 024. Consulte con su psicólogo/a al inicio del tratamiento cuál es el protocolo específico en su caso.</p>

<h3>¿Qué ocurre si mi psicólogo/a se pone enfermo o tiene que irse?</h3>
<p>El psicólogo tiene el deber ético de garantizar la continuidad de su atención en caso de ausencia prolongada o finalización del ejercicio profesional, facilitando la derivación a otro profesional y entregando un informe de continuidad si fuera necesario.</p>

<h3>¿Puedo ver a otro psicólogo al mismo tiempo?</h3>
<p>En general, se desaconseja seguir dos procesos psicoterapéuticos simultáneos con diferentes terapeutas, ya que puede generar confusión, mensajes contradictorios y comprometer la eficacia de ambas intervenciones. Si usted está recibiendo atención de otro psicólogo, es fundamental comunicárselo a su terapeuta. Sí puede combinarse la psicoterapia con el seguimiento psiquiátrico o médico.</p>

<h3>¿La psicoterapia es adecuada para mí si tomo medicación?</h3>
<p>Sí, en la mayoría de los casos. La psicoterapia y el tratamiento farmacológico no son excluyentes, sino complementarios. La combinación de ambos ha demostrado ser más eficaz que cada uno por separado en múltiples trastornos. Su psicólogo coordinará con su médico o psiquiatra cuando sea necesario.</p>

<h3>¿Qué hago si no me siento cómodo/a con mi terapeuta?</h3>
<p>La calidad de la relación terapéutica (alianza terapéutica) es uno de los predictores más potentes del resultado del tratamiento. Si no se siente cómodo/a, tiene derecho a comunicárselo a su terapeuta (quien trabajará con ello en el contexto terapéutico) o a buscar otro profesional. No hay obligación de continuar con un terapeuta con quien no se establezca una buena conexión.</p>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<h2>SECCIÓN 15. DECLARACIONES Y CONSENTIMIENTO</h2>

<p>Antes de firmar este documento, le rogamos que confirme los siguientes extremos marcando cada casilla:</p>

<div>
  <div class="check-item">He leído y comprendido toda la información contenida en este documento.</div>
  <div class="check-item">He tenido la oportunidad de formular preguntas al profesional y estas han sido respondidas satisfactoriamente.</div>
  <div class="check-item">He sido informado/a de los objetivos del tratamiento, las técnicas que se utilizarán, la duración estimada, los beneficios esperados y los posibles riesgos.</div>
  <div class="check-item">He sido informado/a de las excepciones a la confidencialidad y las entiendo.</div>
  <div class="check-item">He sido informado/a del tratamiento de mis datos personales conforme al RGPD y la LOPDGDD y acepto dicho tratamiento para las finalidades descritas.</div>
  <div class="check-item">Soy consciente de que puedo revocar este consentimiento en cualquier momento, sin perjuicio para mí, comunicándolo al profesional.</div>
  <div class="check-item">Consiento libremente comenzar el proceso de evaluación y tratamiento psicológico.</div>
</div>

<br/>
<p>En _________________, a ______ de ______________________ de __________.</p>

<div class="firma-section">
  <div class="firma-block">
    <div class="firma-line">
      Firma del paciente o representante legal<br/>
      Nombre: ___________________________<br/>
      DNI: ___________________________
    </div>
  </div>
  <div class="firma-block">
    <div class="firma-line">
      Firma del profesional<br/>
      Nombre: ___________________________<br/>
      Nº colegiado: ___________________________
    </div>
  </div>
</div>

<br/><br/>
<div class="aviso">
  <strong>NOTA:</strong> Este documento se entregará en dos ejemplares, quedando uno en poder del paciente y otro en la historia clínica del profesional. En caso de tratamiento online, se guardará copia digital firmada electrónicamente o mediante la plataforma de gestión habilitada al efecto.
</div>

</body>
</html>`;

// ─────────────────────────────────────────────────────────────────────────────

async function seedConsentimientoInformado() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  console.log('🔍 Comprobando si ya existe la plantilla "Consentimiento Informado"...');

  // Check for existing master template with same title hint
  const { data: existing, error: checkErr } = await supabase
    .from('templates')
    .select('id, psych_user_id')
    .eq('master', true)
    .ilike('content', '%consentimiento informado%')
    .limit(1);

  if (checkErr) {
    console.error('❌ Error al comprobar duplicados:', checkErr.message);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    console.log(`⚠️  Ya existe una plantilla maestra de consentimiento informado (id=${existing[0].id}). Abortando para no duplicar.`);
    process.exit(0);
  }

  console.log('📝 Insertando plantilla "Consentimiento Informado"...');

  const { data, error } = await supabase
    .from('templates')
    .insert({
      content: CONTENT,
      psych_user_id: null,   // plantilla maestra del sistema — no pertenece a ningún psicólogo
      master: true
    })
    .select()
    .single();

  if (error) {
    // Si psych_user_id tiene FK NOT NULL, reintentamos con 'system'
    if (error.code === '23502' || error.message?.includes('null')) {
      console.log('⚠️  psych_user_id no admite null, reintentando con valor "system"...');
      const { data: data2, error: error2 } = await supabase
        .from('templates')
        .insert({
          content: CONTENT,
          psych_user_id: 'system',
          master: true
        })
        .select()
        .single();

      if (error2) {
        console.error('❌ Error al insertar (segundo intento):', error2.message);
        process.exit(1);
      }

      console.log(`✅ Plantilla creada con éxito (id=${data2.id}, psych_user_id=system, master=true)`);
      return;
    }

    console.error('❌ Error al insertar:', error.message);
    process.exit(1);
  }

  console.log(`✅ Plantilla "Consentimiento Informado" creada con éxito (id=${data.id}, master=true)`);
}

seedConsentimientoInformado();
