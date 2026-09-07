// supabase-paginate.js — leer más de 1000 filas sin que te enteres tarde.
//
// PostgREST (la API REST de Supabase) tiene un tope duro de 1000 filas por
// respuesta y NO avisa: un `.limit(5000)` devuelve 1000 y ya. No hay error, no
// hay cabecera que chille, simplemente faltan filas. Es la misma clase de
// truncamiento silencioso que dejaba a 116 leads sin puntuar para siempre en
// api/lead-scoring.js: la consulta pedía todos los activos (1.116), recibía
// 1.000, y los 116 restantes no existían para el cron.
//
// Regla: cualquier lectura que PUEDA superar las 1000 filas pasa por aquí.
// Si estás seguro de que la tabla es pequeña (agent_config, subscriptions),
// no hace falta — pero "hoy es pequeña" no es lo mismo que "es pequeña", y
// product_events crece con cada evento de cada usuario.

const TAMANO_PAGINA = 1000;

/**
 * Recorre una consulta por páginas con .range() hasta agotarla.
 *
 * @param {() => object} construirConsulta  Función que devuelve una consulta
 *   NUEVA de supabase-js. Tiene que ser una función y no la consulta ya
 *   construida: los builders de PostgREST no se pueden reutilizar, una vez
 *   ejecutados no aceptan otro .range().
 * @param {object} [opts]
 * @param {number} [opts.maxFilas]  Tope de seguridad para no barrer una tabla
 *   entera por accidente. Al alcanzarlo devuelve lo leído y avisa en el log.
 * @returns {Promise<Array>}
 */
export async function traerTodo(construirConsulta, { maxFilas = 50000 } = {}) {
  const filas = [];

  for (let desde = 0; desde < maxFilas; desde += TAMANO_PAGINA) {
    const hasta = Math.min(desde + TAMANO_PAGINA, maxFilas) - 1;
    const { data, error } = await construirConsulta().range(desde, hasta);
    if (error) throw error;
    if (!data || data.length === 0) break;

    filas.push(...data);

    // Una página incompleta significa que no hay más. Es la única señal
    // fiable: PostgREST no dice cuántas quedan salvo que pidas el count.
    if (data.length < hasta - desde + 1) break;
  }

  if (filas.length >= maxFilas) {
    console.warn(`[paginate] se alcanzo el tope de ${maxFilas} filas — puede faltar informacion`);
  }

  return filas;
}
