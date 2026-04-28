-- Kylia Performance by Kynovia
-- Adds the onboarding RPC used by the app to create the first organization,
-- first team, team membership, and first cycle for a newly authenticated user.

CREATE OR REPLACE FUNCTION public.create_initial_workspace(
  org_name TEXT,
  org_slug TEXT,
  org_sector TEXT,
  first_team_name TEXT,
  first_team_description TEXT DEFAULT ''
)
RETURNS UUID AS $$
DECLARE
  new_org_id UUID;
  new_team_id UUID;
  current_profile_id UUID;
BEGIN
  current_profile_id := auth.uid();

  IF current_profile_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = current_profile_id AND organization_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Usuário já está vinculado a uma organização.';
  END IF;

  INSERT INTO public.organizations (name, slug, sector, plan, max_users)
  VALUES (org_name, org_slug, COALESCE(NULLIF(org_sector, ''), 'Business performance'), 'starter', 10)
  RETURNING id INTO new_org_id;

  INSERT INTO public.profiles (id, organization_id, full_name, role)
  VALUES (current_profile_id, new_org_id, '', 'admin')
  ON CONFLICT (id) DO UPDATE
  SET organization_id = new_org_id,
      role = 'admin',
      updated_at = NOW();

  INSERT INTO public.teams (organization_id, name, description, color, lead_id)
  VALUES (
    new_org_id,
    COALESCE(NULLIF(first_team_name, ''), 'Leadership'),
    first_team_description,
    '#7EBF8E',
    current_profile_id
  )
  RETURNING id INTO new_team_id;

  INSERT INTO public.team_members (team_id, profile_id)
  VALUES (new_team_id, current_profile_id)
  ON CONFLICT (team_id, profile_id) DO NOTHING;

  INSERT INTO public.cycles (
    organization_id, name, type, start_date, end_date, is_active, created_by
  )
  VALUES (
    new_org_id,
    'First cycle',
    'quarterly',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '3 months',
    TRUE,
    current_profile_id
  );

  RETURN new_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_initial_workspace(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

DROP POLICY IF EXISTS "Usuário vê membros dos times da sua organização" ON public.team_members;

CREATE POLICY "Usuário vê membros dos times da sua organização"
  ON public.team_members FOR SELECT
  USING (
    team_id IN (
      SELECT id FROM public.teams WHERE organization_id = public.current_user_org_id()
    )
  );
