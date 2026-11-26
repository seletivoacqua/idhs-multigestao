/*
  # Add scheduled value to invoices (AGENDADO status)

  1. Modified Tables
    - `invoices`: adds `scheduled_value` (numeric, nullable) — the scheduled payment
      amount for invoices whose payment_status is 'AGENDADO'.

  2. Notes
    - Column is optional (NULL) and only used when status is AGENDADO.
    - No data is modified or removed; existing rows keep scheduled_value = NULL.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'scheduled_value'
  ) THEN
    ALTER TABLE invoices ADD COLUMN scheduled_value numeric;
  END IF;
END $$;

COMMENT ON COLUMN invoices.scheduled_value IS 'Valor agendado de pagamento quando status é AGENDADO';
