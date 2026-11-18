-- ============================================================
-- Migration 064: Increase auto_reply_max_per_conversation limit to 100
--
-- Allows accounts to configure up to 100 AI auto-replies per
-- conversation rather than the restrictive 20-reply cap.
-- ============================================================

ALTER TABLE ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_auto_reply_max_per_conversation_check;

ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_auto_reply_max_per_conversation_check
  CHECK (auto_reply_max_per_conversation BETWEEN 1 AND 100);
