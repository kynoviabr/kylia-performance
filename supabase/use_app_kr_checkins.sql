-- Kylia Performance by Kynovia
-- The app now writes rich KR check-ins itself, including comments, confidence, and blockers.
-- Run once to avoid duplicate kr_updates from the legacy database trigger.

DROP TRIGGER IF EXISTS trg_auto_log_kr_update ON public.key_results;
DROP FUNCTION IF EXISTS public.auto_log_kr_update();
