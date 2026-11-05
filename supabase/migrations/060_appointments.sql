-- ============================================================
-- Migration 060: Appointments Table
--
-- Adds support for appointment booking through the Flow Builder
-- and CRM. Multi-tenant with account_id, linked to contacts,
-- conversations, and deals.
-- ============================================================

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  appointment_date DATE NOT NULL,
  appointment_time TEXT NOT NULL,
  appointment_type TEXT NOT NULL,
  location TEXT,
  additional_requirements TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices for CRM query speed and tenancy
CREATE INDEX IF NOT EXISTS idx_appointments_account ON appointments(account_id);
CREATE INDEX IF NOT EXISTS idx_appointments_contact ON appointments(contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(account_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_deal ON appointments(deal_id);

-- Enable updated_at trigger if set_updated_at function exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS set_appointments_updated_at ON appointments;
    CREATE TRIGGER set_appointments_updated_at
      BEFORE UPDATE ON appointments
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- Enable Row Level Security (RLS)
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointments_select ON appointments;
CREATE POLICY appointments_select ON appointments FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS appointments_insert ON appointments;
CREATE POLICY appointments_insert ON appointments FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS appointments_update ON appointments;
CREATE POLICY appointments_update ON appointments FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS appointments_delete ON appointments;
CREATE POLICY appointments_delete ON appointments FOR DELETE
  USING (is_account_member(account_id, 'agent'));

-- Grants
GRANT ALL ON appointments TO authenticated, service_role;
