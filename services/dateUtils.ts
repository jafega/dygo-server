// Utilidades para formatear fechas y horas en formato europeo

/**
 * Formatea una fecha en formato DD/MM/YYYY
 */
export const formatDate = (date: Date | string | number): string => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Formatea una hora en formato 24h (HH:MM)
 */
export const formatTime = (date: Date | string | number): string => {
  const d = new Date(date);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

/**
 * Formatea fecha con nombre del mes (ej: "17 de enero de 2026")
 */
export const formatDateLong = (date: Date | string | number): string => {
  const d = new Date(date);
  return d.toLocaleDateString('es-ES', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
};

/**
 * Formatea fecha con día de la semana (ej: "viernes, 17 de enero")
 */
export const formatDateWithWeekday = (date: Date | string | number): string => {
  const d = new Date(date);
  return d.toLocaleDateString('es-ES', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long' 
  });
};

/**
 * Formatea fecha y hora completa (DD/MM/YYYY HH:MM)
 */
export const formatDateTime = (date: Date | string | number): string => {
  return `${formatDate(date)} ${formatTime(date)}`;
};

/**
 * Obtiene solo el mes y año (ej: "enero 2026")
 */
export const formatMonthYear = (date: Date | string | number): string => {
  const d = new Date(date);
  return d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
};
