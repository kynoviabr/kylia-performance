-- Kylia Performance by Kynovia
-- Allow authenticated organization members to create Key Results for objectives in their own organization.
-- Run this in Supabase SQL Editor if creating a KR returns an RLS/policy error.

DROP POLICY IF EXISTS "Membros podem criar KRs da sua organização" ON public.key_results;

CREATE POLICY "Membros podem criar KRs da sua organização"
  ON public.key_results FOR INSERT
  WITH CHECK (
    objective_id IN (
      SELECT id FROM public.objectives WHERE organization_id = public.current_user_org_id()
    )
  );
