-- Verificar estructura de las tablas sessions e invoices
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name IN ('sessions', 'invoices')
ORDER BY table_name, ordinal_position;

-- Verificar si existen datos en sessions
SELECT COUNT(*) as session_count FROM sessions;

-- Verificar si existen datos en invoices
SELECT COUNT(*) as invoice_count FROM invoices;

-- Ver algunos registros de ejemplo si existen
SELECT * FROM sessions LIMIT 3;
SELECT * FROM invoices LIMIT 3;
