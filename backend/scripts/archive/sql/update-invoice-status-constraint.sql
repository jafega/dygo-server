-- Script para actualizar el constraint de status en la tabla invoices
-- Ejecutar este script en Supabase SQL Editor

-- 1. Eliminar el constraint existente si existe
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;

-- 2. Agregar el nuevo constraint con el estado 'draft'
ALTER TABLE public.invoices 
ADD CONSTRAINT invoices_status_check 
CHECK (status = ANY (ARRAY['draft'::text, 'pending'::text, 'paid'::text, 'overdue'::text, 'cancelled'::text]));

-- 3. Verificar que el constraint se aplicó correctamente
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'public.invoices'::regclass 
AND conname = 'invoices_status_check';

-- 4. (Opcional) Ver todas las facturas actuales y sus estados
SELECT id, status, 
  data->>'invoiceNumber' as invoice_number,
  data->>'patientName' as patient_name,
  amount, tax, total
FROM public.invoices
ORDER BY created_at DESC
LIMIT 10;
