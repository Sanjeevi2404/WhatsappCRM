-- ============================================================
-- Migration 062: Make appointment date/time optional for lead capture forms
-- ============================================================

ALTER TABLE appointments ALTER COLUMN appointment_date DROP NOT NULL;
ALTER TABLE appointments ALTER COLUMN appointment_time DROP NOT NULL;
ALTER TABLE appointments ALTER COLUMN appointment_type DROP NOT NULL;
ALTER TABLE appointments ALTER COLUMN appointment_type SET DEFAULT 'RO Enquiry';
