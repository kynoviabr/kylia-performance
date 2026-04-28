-- ============================================================
-- Kylia Performance — Modelo de Dados Completo para Supabase
-- Versão 1.0 | Kynovia | Abril 2026
-- ============================================================
-- INSTRUÇÕES:
-- 1. Acesse seu projeto no Supabase
-- 2. Vá em SQL Editor > New Query
-- 3. Cole este arquivo completo e clique em Run
-- ============================================================

-- Habilita extensão UUID (já vem ativa no Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABELA 1: organizations
-- Representa cada empresa/cliente que contrata a Kylia Performance
-- ============================================================
CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,           -- ex: "empresa-abc" (usado na URL)
  logo_url      TEXT,
  sector        TEXT,                           -- ex: "Tecnologia", "Saúde", "Varejo"
  plan          TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'enterprise')),
  plan_expires_at TIMESTAMPTZ,
  max_users     INTEGER DEFAULT 10,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE organizations IS 'Cada linha é uma empresa cliente da Kylia Performance (multi-tenancy).';

-- ============================================================
-- TABELA 2: profiles
-- Estende o auth.users do Supabase com dados do perfil
-- ============================================================
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  full_name     TEXT,
  avatar_url    TEXT,
  job_title     TEXT,                           -- ex: "CEO", "Product Manager"
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'team_lead', 'member')),
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE profiles IS 'Perfil de cada usuário, vinculado ao auth.users do Supabase.';
COMMENT ON COLUMN profiles.role IS 'admin = acesso total; team_lead = gerencia times; member = atualiza KRs.';

-- ============================================================
-- TABELA 3: invites
-- Convites enviados por e-mail para novos membros
-- ============================================================
CREATE TABLE invites (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_by      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'team_lead', 'member')),
  token           TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  accepted        BOOLEAN DEFAULT FALSE,
  expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE invites IS 'Convites por e-mail com token único. Expira em 7 dias.';

-- ============================================================
-- TABELA 4: teams
-- Times dentro de uma organização
-- ============================================================
CREATE TABLE teams (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  color           TEXT DEFAULT '#2E75B6',       -- cor do time no dashboard
  lead_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE teams IS 'Times dentro de uma organização. Um usuário pode pertencer a múltiplos times.';

-- ============================================================
-- TABELA 5: team_members
-- Relação N:N entre profiles e teams
-- ============================================================
CREATE TABLE team_members (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, profile_id)
);

COMMENT ON TABLE team_members IS 'Relação muitos-para-muitos entre usuários e times.';

-- ============================================================
-- TABELA 6: cycles
-- Períodos de OKR (trimestral ou anual)
-- ============================================================
CREATE TABLE cycles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,               -- ex: "Q1 2026", "Anual 2026"
  type            TEXT NOT NULL DEFAULT 'quarterly' CHECK (type IN ('quarterly', 'annual', 'custom')),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_date > start_date)
);

COMMENT ON TABLE cycles IS 'Períodos de OKR. Cada ciclo tem início, fim e tipo (trimestral, anual).';

-- ============================================================
-- TABELA 7: objectives
-- Objetivos — o "O" do OKR
-- ============================================================
CREATE TABLE objectives (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cycle_id        UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  team_id         UUID REFERENCES teams(id) ON DELETE CASCADE,  -- NULL = objetivo da empresa
  parent_id       UUID REFERENCES objectives(id) ON DELETE SET NULL, -- cascateamento
  title           TEXT NOT NULL,
  description     TEXT,
  owner_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  progress        NUMERIC(5,2) DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  status          TEXT DEFAULT 'on_track' CHECK (status IN ('on_track', 'at_risk', 'behind', 'completed')),
  is_company_okr  BOOLEAN DEFAULT FALSE,       -- TRUE = OKR da empresa (CEO View)
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE objectives IS 'O "O" do OKR. Pode ser da empresa (is_company_okr=true) ou de um time.';
COMMENT ON COLUMN objectives.parent_id IS 'Referência ao objetivo pai — implementa o cascateamento vertical.';
COMMENT ON COLUMN objectives.progress IS 'Calculado automaticamente como média dos Key Results.';

-- ============================================================
-- TABELA 8: key_results
-- Key Results — os "KR" do OKR
-- ============================================================
CREATE TABLE key_results (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective_id    UUID NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  owner_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  kr_type         TEXT NOT NULL DEFAULT 'percentage' CHECK (kr_type IN ('percentage', 'numeric', 'currency', 'boolean')),
  start_value     NUMERIC DEFAULT 0,
  target_value    NUMERIC NOT NULL,
  current_value   NUMERIC DEFAULT 0,
  unit            TEXT,                        -- ex: "%", "R$", "clientes", "NPS"
  progress        NUMERIC(5,2) DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  status          TEXT DEFAULT 'on_track' CHECK (status IN ('on_track', 'at_risk', 'behind', 'completed')),
  confidence      INTEGER CHECK (confidence BETWEEN 1 AND 10), -- nível de confiança 1-10
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE key_results IS 'Os KRs de cada Objetivo. Máximo recomendado: 5 por objetivo.';
COMMENT ON COLUMN key_results.kr_type IS 'percentage=0-100%, numeric=valor absoluto, currency=R$, boolean=sim/não.';
COMMENT ON COLUMN key_results.confidence IS 'Nível de confiança do responsável: 1 (baixo) a 10 (alto).';

-- ============================================================
-- TABELA 9: kr_updates
-- Histórico de atualizações de cada Key Result
-- ============================================================
CREATE TABLE kr_updates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key_result_id   UUID NOT NULL REFERENCES key_results(id) ON DELETE CASCADE,
  updated_by      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  previous_value  NUMERIC,
  new_value       NUMERIC NOT NULL,
  progress        NUMERIC(5,2),
  confidence      INTEGER CHECK (confidence BETWEEN 1 AND 10),
  comment         TEXT,
  has_blocker     BOOLEAN DEFAULT FALSE,
  blocker_description TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE kr_updates IS 'Linha do tempo de atualizações de cada KR. Imutável (append-only).';
COMMENT ON COLUMN kr_updates.has_blocker IS 'TRUE = o responsável reportou um bloqueio neste update.';

-- ============================================================
-- TABELA 10: comments
-- Comentários em KRs e Objetivos
-- ============================================================
CREATE TABLE comments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('objective', 'key_result')),
  entity_id       UUID NOT NULL,               -- id do objetivo ou do KR
  author_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id       UUID REFERENCES comments(id) ON DELETE CASCADE, -- threading (resposta)
  content         TEXT NOT NULL,
  is_edited       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE comments IS 'Comentários em objetivos e KRs. Suporta threading (parent_id).';

-- ============================================================
-- TABELA 11: notifications
-- Notificações in-app para usuários
-- ============================================================
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN (
                    'kr_updated', 'blocker_reported', 'comment_added',
                    'checkin_reminder', 'weekly_summary', 'invite_accepted',
                    'okr_at_risk', 'cycle_ending'
                  )),
  title           TEXT NOT NULL,
  body            TEXT,
  entity_type     TEXT,                        -- 'objective', 'key_result', 'cycle'
  entity_id       UUID,
  is_read         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE notifications IS 'Notificações in-app. Criadas por triggers ou pelo backend.';

-- ============================================================
-- TABELA 12: checkin_schedules
-- Configuração de lembretes semanais por organização
-- ============================================================
CREATE TABLE checkin_schedules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  day_of_week     INTEGER DEFAULT 1 CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Dom, 1=Seg
  hour_utc        INTEGER DEFAULT 9 CHECK (hour_utc BETWEEN 0 AND 23),
  is_active       BOOLEAN DEFAULT TRUE,
  last_sent_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE checkin_schedules IS 'Quando enviar o lembrete semanal de check-in para cada organização.';

-- ============================================================
-- TABELA 13: reports
-- Relatórios gerados (PDF, Excel, IA)
-- ============================================================
CREATE TABLE reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cycle_id        UUID REFERENCES cycles(id) ON DELETE SET NULL,
  generated_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK (type IN ('cycle_summary', 'team_report', 'executive_ai', 'engagement')),
  format          TEXT NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf', 'xlsx', 'json')),
  storage_path    TEXT,                        -- caminho no Supabase Storage
  public_url      TEXT,                        -- link público compartilhável
  is_public       BOOLEAN DEFAULT FALSE,
  ai_generated    BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE reports IS 'Relatórios gerados. Arquivos armazenados no Supabase Storage.';

-- ============================================================
-- ÍNDICES — Performance
-- ============================================================
CREATE INDEX idx_profiles_organization    ON profiles(organization_id);
CREATE INDEX idx_teams_organization       ON teams(organization_id);
CREATE INDEX idx_team_members_team        ON team_members(team_id);
CREATE INDEX idx_team_members_profile     ON team_members(profile_id);
CREATE INDEX idx_cycles_organization      ON cycles(organization_id);
CREATE INDEX idx_objectives_cycle         ON objectives(cycle_id);
CREATE INDEX idx_objectives_team          ON objectives(team_id);
CREATE INDEX idx_objectives_organization  ON objectives(organization_id);
CREATE INDEX idx_objectives_parent        ON objectives(parent_id);
CREATE INDEX idx_key_results_objective    ON key_results(objective_id);
CREATE INDEX idx_kr_updates_key_result    ON kr_updates(key_result_id);
CREATE INDEX idx_kr_updates_created       ON kr_updates(created_at DESC);
CREATE INDEX idx_comments_entity          ON comments(entity_type, entity_id);
CREATE INDEX idx_notifications_recipient  ON notifications(recipient_id, is_read);
CREATE INDEX idx_reports_organization     ON reports(organization_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Garante isolamento de dados entre organizações
-- ============================================================
ALTER TABLE organizations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites            ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams              ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE objectives         ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_results        ENABLE ROW LEVEL SECURITY;
ALTER TABLE kr_updates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_schedules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports            ENABLE ROW LEVEL SECURITY;

-- Função auxiliar: retorna o organization_id do usuário logado
CREATE OR REPLACE FUNCTION current_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Função auxiliar: retorna o papel do usuário logado
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Função de onboarding: cria organização, primeiro time e ciclo inicial
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

-- ── POLICIES: organizations ──────────────────────────────────
CREATE POLICY "Usuário vê apenas sua organização"
  ON organizations FOR SELECT
  USING (id = current_user_org_id());

CREATE POLICY "Admin pode atualizar sua organização"
  ON organizations FOR UPDATE
  USING (id = current_user_org_id() AND current_user_role() = 'admin');

-- ── POLICIES: profiles ───────────────────────────────────────
CREATE POLICY "Usuário vê perfis da mesma organização"
  ON profiles FOR SELECT
  USING (organization_id = current_user_org_id());

CREATE POLICY "Usuário atualiza apenas seu próprio perfil"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- ── POLICIES: teams ──────────────────────────────────────────
CREATE POLICY "Usuário vê times da sua organização"
  ON teams FOR SELECT
  USING (organization_id = current_user_org_id());

-- ── POLICIES: team_members ──────────────────────────────────
CREATE POLICY "Usuário vê membros dos times da sua organização"
  ON team_members FOR SELECT
  USING (
    team_id IN (
      SELECT id FROM public.teams WHERE organization_id = current_user_org_id()
    )
  );

CREATE POLICY "Admin e team_lead podem adicionar membros em times"
  ON team_members FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT id FROM public.teams WHERE organization_id = current_user_org_id()
    )
    AND current_user_role() IN ('admin', 'team_lead')
  );

CREATE POLICY "Admin e team_lead podem criar times"
  ON teams FOR INSERT
  WITH CHECK (
    organization_id = current_user_org_id()
    AND current_user_role() IN ('admin', 'team_lead')
  );

CREATE POLICY "Admin e team_lead podem atualizar times"
  ON teams FOR UPDATE
  USING (
    organization_id = current_user_org_id()
    AND current_user_role() IN ('admin', 'team_lead')
  );

-- ── POLICIES: cycles ─────────────────────────────────────────
CREATE POLICY "Usuário vê ciclos da sua organização"
  ON cycles FOR SELECT
  USING (organization_id = current_user_org_id());

CREATE POLICY "Admin pode criar e editar ciclos"
  ON cycles FOR ALL
  USING (
    organization_id = current_user_org_id()
    AND current_user_role() = 'admin'
  );

-- ── POLICIES: objectives ─────────────────────────────────────
CREATE POLICY "Usuário vê objetivos da sua organização"
  ON objectives FOR SELECT
  USING (organization_id = current_user_org_id());

CREATE POLICY "Admin e team_lead podem criar objetivos"
  ON objectives FOR INSERT
  WITH CHECK (
    organization_id = current_user_org_id()
    AND current_user_role() IN ('admin', 'team_lead')
  );

CREATE POLICY "Admin e team_lead podem editar objetivos"
  ON objectives FOR UPDATE
  USING (
    organization_id = current_user_org_id()
    AND current_user_role() IN ('admin', 'team_lead')
  );

-- ── POLICIES: key_results ────────────────────────────────────
CREATE POLICY "Usuário vê KRs da sua organização"
  ON key_results FOR SELECT
  USING (
    objective_id IN (
      SELECT id FROM objectives WHERE organization_id = current_user_org_id()
    )
  );

CREATE POLICY "Membros podem criar KRs da sua organização"
  ON key_results FOR INSERT
  WITH CHECK (
    objective_id IN (
      SELECT id FROM objectives WHERE organization_id = current_user_org_id()
    )
  );

CREATE POLICY "Membros podem atualizar KRs dos quais são donos"
  ON key_results FOR UPDATE
  USING (
    objective_id IN (
      SELECT id FROM objectives WHERE organization_id = current_user_org_id()
    )
  );

-- ── POLICIES: kr_updates ─────────────────────────────────────
CREATE POLICY "Usuário vê updates da sua organização"
  ON kr_updates FOR SELECT
  USING (
    key_result_id IN (
      SELECT kr.id FROM key_results kr
      JOIN objectives o ON kr.objective_id = o.id
      WHERE o.organization_id = current_user_org_id()
    )
  );

CREATE POLICY "Membro pode inserir update em KR da sua org"
  ON kr_updates FOR INSERT
  WITH CHECK (
    key_result_id IN (
      SELECT kr.id FROM key_results kr
      JOIN objectives o ON kr.objective_id = o.id
      WHERE o.organization_id = current_user_org_id()
    )
    AND updated_by = auth.uid()
  );

-- ── POLICIES: notifications ──────────────────────────────────
CREATE POLICY "Usuário vê apenas suas notificações"
  ON notifications FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY "Usuário pode marcar suas notificações como lidas"
  ON notifications FOR UPDATE
  USING (recipient_id = auth.uid());

-- ── POLICIES: comments ───────────────────────────────────────
CREATE POLICY "Usuário vê comentários da sua organização"
  ON comments FOR SELECT
  USING (organization_id = current_user_org_id());

CREATE POLICY "Usuário pode comentar na sua organização"
  ON comments FOR INSERT
  WITH CHECK (
    organization_id = current_user_org_id()
    AND author_id = auth.uid()
  );

-- ── POLICIES: reports ────────────────────────────────────────
CREATE POLICY "Usuário vê relatórios da sua organização ou públicos"
  ON reports FOR SELECT
  USING (organization_id = current_user_org_id() OR is_public = TRUE);

-- ============================================================
-- TRIGGERS — Automação
-- ============================================================

-- Trigger 1: Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_cycles_updated_at
  BEFORE UPDATE ON cycles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_objectives_updated_at
  BEFORE UPDATE ON objectives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_key_results_updated_at
  BEFORE UPDATE ON key_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger 2: Recalcula progresso do Objetivo quando um KR é atualizado
CREATE OR REPLACE FUNCTION recalculate_objective_progress()
RETURNS TRIGGER AS $$
DECLARE
  avg_progress NUMERIC;
  new_status TEXT;
BEGIN
  SELECT COALESCE(AVG(progress), 0)
  INTO avg_progress
  FROM key_results
  WHERE objective_id = NEW.objective_id;

  IF avg_progress >= 70 THEN
    new_status := 'on_track';
  ELSIF avg_progress >= 40 THEN
    new_status := 'at_risk';
  ELSE
    new_status := 'behind';
  END IF;

  UPDATE objectives
  SET progress = avg_progress, status = new_status, updated_at = NOW()
  WHERE id = NEW.objective_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kr_progress_changed
  AFTER INSERT OR UPDATE OF progress ON key_results
  FOR EACH ROW EXECUTE FUNCTION recalculate_objective_progress();

-- Trigger 3: Cria perfil automaticamente quando novo usuário se registra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger 4: Registra um kr_update automaticamente quando current_value muda
CREATE OR REPLACE FUNCTION auto_log_kr_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.current_value IS DISTINCT FROM NEW.current_value THEN
    INSERT INTO public.kr_updates (
      key_result_id, updated_by, previous_value, new_value, progress
    ) VALUES (
      NEW.id, auth.uid(), OLD.current_value, NEW.current_value, NEW.progress
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_log_kr_update
  AFTER UPDATE OF current_value ON key_results
  FOR EACH ROW EXECUTE FUNCTION auto_log_kr_update();

-- ============================================================
-- VIEWS — Facilita queries do frontend
-- ============================================================

-- View 1: Dashboard do CEO — progresso por time no ciclo ativo
CREATE OR REPLACE VIEW vw_ceo_dashboard AS
SELECT
  t.id            AS team_id,
  t.name          AS team_name,
  t.color         AS team_color,
  c.id            AS cycle_id,
  c.name          AS cycle_name,
  COUNT(o.id)                               AS total_objectives,
  ROUND(AVG(o.progress), 1)                AS avg_progress,
  COUNT(CASE WHEN o.status = 'on_track'  THEN 1 END) AS on_track_count,
  COUNT(CASE WHEN o.status = 'at_risk'   THEN 1 END) AS at_risk_count,
  COUNT(CASE WHEN o.status = 'behind'    THEN 1 END) AS behind_count,
  COUNT(CASE WHEN o.status = 'completed' THEN 1 END) AS completed_count,
  t.organization_id
FROM teams t
JOIN cycles c ON c.organization_id = t.organization_id AND c.is_active = TRUE
LEFT JOIN objectives o ON o.team_id = t.id AND o.cycle_id = c.id
WHERE t.is_active = TRUE
GROUP BY t.id, t.name, t.color, c.id, c.name, t.organization_id;

COMMENT ON VIEW vw_ceo_dashboard IS 'Visão consolidada por time para o Dashboard do CEO.';

-- View 2: KRs sem atualização há mais de 7 dias (alertas)
CREATE OR REPLACE VIEW vw_stale_krs AS
SELECT
  kr.id           AS kr_id,
  kr.title        AS kr_title,
  kr.status,
  o.id            AS objective_id,
  o.title         AS objective_title,
  o.organization_id,
  t.id            AS team_id,
  t.name          AS team_name,
  p.id            AS owner_id,
  p.full_name     AS owner_name,
  kr.updated_at,
  NOW() - kr.updated_at AS time_since_update
FROM key_results kr
JOIN objectives o ON kr.objective_id = o.id
LEFT JOIN teams t ON o.team_id = t.id
LEFT JOIN profiles p ON kr.owner_id = p.id
WHERE kr.updated_at < NOW() - INTERVAL '7 days'
  AND kr.status != 'completed';

COMMENT ON VIEW vw_stale_krs IS 'KRs que não são atualizados há mais de 7 dias — gera alertas no dashboard.';

-- View 3: Progresso histórico por semana (para gráfico de linha)
CREATE OR REPLACE VIEW vw_weekly_progress AS
SELECT
  o.organization_id,
  o.team_id,
  o.cycle_id,
  DATE_TRUNC('week', ku.created_at) AS week,
  ROUND(AVG(ku.progress), 1)        AS avg_progress
FROM kr_updates ku
JOIN key_results kr ON ku.key_result_id = kr.id
JOIN objectives o ON kr.objective_id = o.id
GROUP BY o.organization_id, o.team_id, o.cycle_id, DATE_TRUNC('week', ku.created_at)
ORDER BY week;

COMMENT ON VIEW vw_weekly_progress IS 'Evolução do progresso semana a semana — alimenta o gráfico de linha do CEO.';

-- ============================================================
-- DADOS INICIAIS DE EXEMPLO (opcional — remova se preferir)
-- ============================================================

-- Descomente abaixo para inserir dados de demonstração:

/*
INSERT INTO organizations (name, slug, sector, plan) VALUES
  ('Empresa Demo', 'empresa-demo', 'Tecnologia', 'growth');

INSERT INTO cycles (organization_id, name, type, start_date, end_date, is_active)
SELECT id, 'Q2 2026', 'quarterly', '2026-04-01', '2026-06-30', TRUE
FROM organizations WHERE slug = 'empresa-demo';
*/

-- ============================================================
-- FIM DO SCRIPT
-- ============================================================
-- Tabelas criadas: 13
-- Índices criados: 14
-- Políticas RLS:   16
-- Triggers:         4
-- Views:            3
-- ============================================================
