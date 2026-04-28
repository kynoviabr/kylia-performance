import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  Flag,
  Goal,
  KeyRound,
  LayoutDashboard,
  LineChart,
  LockKeyhole,
  LogIn,
  MailPlus,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { demoData } from "./data";
import { createInvite, createKeyResult, createObjective, createTeam, createWorkspace, loadKyliaData, persistKrUpdate, updateKeyResult, updateObjective } from "./lib/kyliaStore";
import { isSupabaseConfigured, signInWithEmail, signInWithGoogle, signOut, signUpWithEmail, supabase } from "./lib/supabase";
import type { Invite, KeyResult, KrType, KrUpdate, Objective, KyliaData, OnboardingInput, Organization, Profile, Role, Status, Team, WeeklyProgress } from "./types";

type View = "auth" | "dashboard" | "objectives" | "detail" | "teams";
type Language = "pt" | "en";
type DataMode = "demo" | "signed_out" | "supabase" | "needs_onboarding";
type Filters = {
  cycleId: string;
  teamId: string;
  status: "all" | Status;
  query: string;
};

const statusMeta: Record<Status, { label: string; color: string; soft: string }> = {
  on_track: { label: "No trilho", color: "#7EBF8E", soft: "rgba(126, 191, 142, .16)" },
  at_risk: { label: "Em risco", color: "#E8B86D", soft: "rgba(232, 184, 109, .16)" },
  behind: { label: "Atrasado", color: "#E07070", soft: "rgba(224, 112, 112, .16)" },
  completed: { label: "Concluido", color: "#6DBBE8", soft: "rgba(109, 187, 232, .16)" },
};

const roleLabels: Record<Role, string> = {
  admin: "Admin",
  team_lead: "Lider de time",
  member: "Membro",
};

const productCopy: Record<Language, {
  localeLabel: string;
  brand: string;
  tagline: string;
  workspaceTitle: string;
  nav: Record<View, string>;
  tenant: string;
  loading: string;
  connected: string;
  awaitingLogin: string;
  needsOnboarding: string;
  demo: string;
  ceoDashboard: string;
  hero: string;
}> = {
  pt: {
    localeLabel: "PT",
    brand: "Kylia Performance by Kynovia",
    tagline: "Smart Goals. Real Results.",
    workspaceTitle: "Metas e Performance",
    nav: {
      dashboard: "Dashboard",
      objectives: "Objetivos",
      detail: "Detalhe",
      teams: "Times",
      auth: "Acesso",
    },
    tenant: "Tenant isolado",
    loading: "Carregando",
    connected: "Supabase conectado",
    awaitingLogin: "Aguardando login",
    needsOnboarding: "Configurar workspace",
    demo: "Modo demo",
    ceoDashboard: "Dashboard executivo",
    hero: "Foco, performance e bloqueios em uma única rotina assistida por IA.",
  },
  en: {
    localeLabel: "EN",
    brand: "Kylia Performance by Kynovia",
    tagline: "Smart Goals. Real Results.",
    workspaceTitle: "Goals & Performance",
    nav: {
      dashboard: "Dashboard",
      objectives: "Goals",
      detail: "Detail",
      teams: "Teams",
      auth: "Access",
    },
    tenant: "Isolated tenant",
    loading: "Loading",
    connected: "Supabase connected",
    awaitingLogin: "Awaiting login",
    needsOnboarding: "Set up workspace",
    demo: "Demo mode",
    ceoDashboard: "Executive Dashboard",
    hero: "Focus, performance, and blockers in one AI-powered operating rhythm.",
  },
};

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [language, setLanguage] = useState<Language>("pt");
  const [data, setData] = useState<KyliaData>(demoData);
  const [dataMode, setDataMode] = useState<DataMode>("demo");
  const [isLoading, setIsLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState("");
  const [onboardingMessage, setOnboardingMessage] = useState("");
  const [filters, setFilters] = useState<Filters>({
    cycleId: "q2_2026",
    teamId: "all",
    status: "all",
    query: "",
  });
  const [selectedObjectiveId, setSelectedObjectiveId] = useState("obj_company_growth");
  const [updateTarget, setUpdateTarget] = useState<KeyResult | null>(null);
  const [editKrTarget, setEditKrTarget] = useState<KeyResult | null>(null);
  const [editObjectiveTarget, setEditObjectiveTarget] = useState<Objective | null>(null);

  const { organization, profiles, teams, cycles, objectives, keyResults, updates, invites, weeklyProgress } = data;
  const copy = productCopy[language];
  const selectedObjective = objectives.find((objective) => objective.id === selectedObjectiveId) ?? objectives[0];
  const activeCycle = cycles.find((cycle) => cycle.id === filters.cycleId) ?? cycles[0];
  const currentUser = profiles[0];

  useEffect(() => {
    refreshData();

    if (!isSupabaseConfigured) return;

    const authSubscription = supabase?.auth.onAuthStateChange(() => {
      refreshData();
    });

    return () => {
      authSubscription?.data.subscription.unsubscribe();
    };
  }, []);

  async function refreshData() {
    setIsLoading(true);
    const loadedData = await loadKyliaData();
    const { mode, ...nextData } = loadedData;
    setData(nextData);
    setDataMode(mode);
    if (mode === "signed_out") {
      setView("auth");
    }
    setFilters((current) => ({
      ...current,
      cycleId: nextData.cycles.find((cycle) => cycle.isActive)?.id ?? nextData.cycles[0]?.id ?? current.cycleId,
    }));
    setSelectedObjectiveId(nextData.objectives[0]?.id ?? selectedObjectiveId);
    setIsLoading(false);
  }

  async function handleEmailAuth(input: { mode: "login" | "signup"; email: string; password: string; fullName: string }) {
    setAuthMessage("");
    const result = input.mode === "login"
      ? await signInWithEmail(input.email, input.password)
      : await signUpWithEmail(input.email, input.password, input.fullName);

    if (result.error) {
      setAuthMessage(result.error.message);
      return;
    }

    if (!result.data.session) {
      setAuthMessage("Conta criada. Confirme seu e-mail e depois volte para fazer login.");
      setView("auth");
      await refreshData();
      return;
    }

    setAuthMessage(input.mode === "login" ? "Sessão iniciada." : "Cadastro criado e sessão iniciada.");
    await refreshData();
    setView("dashboard");
  }

  async function handleGoogleAuth() {
    const result = await signInWithGoogle();
    if (result.error) {
      setAuthMessage(result.error.message);
    }
  }

  async function handleSignOut() {
    await signOut();
    await refreshData();
    setView("auth");
  }

  async function handleOnboarding(input: OnboardingInput) {
    setOnboardingMessage("");
    const result = await createWorkspace(input);

    if (result.error) {
      setOnboardingMessage(result.error.message);
      return;
    }

    await refreshData();
    setView("dashboard");
  }

  async function handleCreateTeam(input: {
    name: string;
    description: string;
    color: string;
    ownerId: string;
  }) {
    const result = await createTeam({
      organizationId: organization.id,
      ...input,
    });

    if (result.error || !result.data) {
      return result.error?.message ?? "Could not create team.";
    }

    setData((current) => ({
      ...current,
      teams: [...current.teams, result.data],
      profiles: current.profiles.map((profile) =>
        profile.id === input.ownerId && !profile.teamIds.includes(result.data.id)
          ? { ...profile, teamIds: [...profile.teamIds, result.data.id] }
          : profile,
      ),
    }));

    return "";
  }

  async function handleCreateObjective(input: {
    cycleId: string;
    teamId?: string;
    parentId?: string;
    title: string;
    description: string;
    ownerId: string;
    isCompanyOkr: boolean;
  }) {
    const result = await createObjective({
      organizationId: organization.id,
      createdBy: currentUser.id,
      ...input,
    });

    if (result.error || !result.data) {
      return result.error?.message ?? "Could not create objective.";
    }

    setData((current) => ({
      ...current,
      objectives: [...current.objectives, result.data],
    }));
    setSelectedObjectiveId(result.data.id);

    return "";
  }

  async function handleUpdateObjective(input: {
    id: string;
    cycleId: string;
    teamId?: string;
    parentId?: string;
    title: string;
    description: string;
    ownerId: string;
    isCompanyOkr: boolean;
  }) {
    const result = await updateObjective(input);
    if (result.error || !result.data) return result.error?.message ?? "Could not update objective.";
    setData((current) => ({
      ...current,
      objectives: current.objectives.map((objective) => (objective.id === input.id ? result.data : objective)),
    }));
    setEditObjectiveTarget(null);
    return "";
  }

  async function handleCreateKeyResult(input: {
    objectiveId: string;
    title: string;
    description: string;
    ownerId: string;
    krType: KrType;
    startValue: number;
    targetValue: number;
    currentValue: number;
    unit: string;
    confidence: number;
  }) {
    const objectiveKrs = keyResults.filter((kr) => kr.objectiveId === input.objectiveId);
    const result = await createKeyResult({
      ...input,
      sortOrder: objectiveKrs.length + 1,
    });

    if (result.error || !result.data) {
      return result.error?.message ?? "Could not create key result.";
    }

    const nextKrs = [...objectiveKrs, result.data];
    const objectiveProgress = average(nextKrs.map((kr) => kr.progress));

    setData((current) => ({
      ...current,
      keyResults: [...current.keyResults, result.data],
      objectives: current.objectives.map((objective) =>
        objective.id === input.objectiveId
          ? {
              ...objective,
              progress: objectiveProgress,
              status: statusFromProgress(objectiveProgress),
            }
          : objective,
      ),
    }));

    return "";
  }

  async function handleUpdateKeyResult(input: {
    id: string;
    title: string;
    description: string;
    ownerId: string;
    krType: KrType;
    startValue: number;
    targetValue: number;
    currentValue: number;
    unit: string;
    confidence: number;
  }) {
    const result = await updateKeyResult(input);
    if (result.error || !result.data) return result.error?.message ?? "Could not update key result.";

    const existing = keyResults.find((kr) => kr.id === input.id);
    const objectiveId = existing?.objectiveId ?? result.data.objectiveId;
    const nextObjectiveKrs = keyResults
      .map((kr) => (kr.id === input.id ? { ...result.data, hasBlocker: kr.hasBlocker } : kr))
      .filter((kr) => kr.objectiveId === objectiveId);
    const objectiveProgress = average(nextObjectiveKrs.map((kr) => kr.progress));

    setData((current) => ({
      ...current,
      keyResults: current.keyResults.map((kr) => (kr.id === input.id ? { ...result.data, hasBlocker: kr.hasBlocker } : kr)),
      objectives: current.objectives.map((objective) =>
        objective.id === objectiveId ? { ...objective, progress: objectiveProgress, status: statusFromProgress(objectiveProgress) } : objective,
      ),
    }));
    setEditKrTarget(null);
    return "";
  }

  const filteredObjectives = useMemo(() => {
    return objectives.filter((objective) => {
      const matchesCycle = objective.cycleId === filters.cycleId;
      const matchesTeam = filters.teamId === "all" || objective.teamId === filters.teamId;
      const matchesStatus = filters.status === "all" || objective.status === filters.status;
      const haystack = `${objective.title} ${objective.description}`.toLowerCase();
      const matchesQuery = haystack.includes(filters.query.toLowerCase());
      return matchesCycle && matchesTeam && matchesStatus && matchesQuery;
    });
  }, [filters, objectives]);

  function openObjective(objectiveId: string) {
    setSelectedObjectiveId(objectiveId);
    setView("detail");
  }

  function handleKrUpdate(payload: {
    krId: string;
    newValue: number;
    confidence: number;
    comment: string;
    hasBlocker: boolean;
    blockerDescription: string;
  }) {
    const target = keyResults.find((kr) => kr.id === payload.krId);
    if (!target) return;

    const progress = calculateProgress(target, payload.newValue);
    const status = statusFromProgress(progress);

    setData((current) => ({
      ...current,
      keyResults: current.keyResults.map((kr) =>
        kr.id === payload.krId
          ? {
              ...kr,
              currentValue: payload.newValue,
              progress,
              status,
              confidence: payload.confidence,
              hasBlocker: payload.hasBlocker,
              lastUpdate: new Date().toISOString().slice(0, 10),
            }
          : kr,
      ),
      updates: [
        {
          id: `upd_${current.updates.length + 1}`,
          keyResultId: payload.krId,
          updatedBy: currentUser.id,
          previousValue: target.currentValue,
          newValue: payload.newValue,
          progress,
          confidence: payload.confidence,
          comment: payload.comment,
          hasBlocker: payload.hasBlocker,
          blockerDescription: payload.blockerDescription || undefined,
          createdAt: new Date().toISOString().slice(0, 10),
        },
        ...current.updates,
      ],
    }));

    const objectiveKrs = keyResults
      .map((kr) =>
        kr.id === payload.krId
          ? { ...kr, progress, status }
          : kr,
      )
      .filter((kr) => kr.objectiveId === target.objectiveId);
    const objectiveProgress = Math.round(
      objectiveKrs.reduce((sum, kr) => sum + kr.progress, 0) / objectiveKrs.length,
    );

    setData((current) => ({
      ...current,
      objectives: current.objectives.map((objective) =>
        objective.id === target.objectiveId
          ? {
              ...objective,
              progress: objectiveProgress,
              status: statusFromProgress(objectiveProgress),
            }
          : objective,
      ),
    }));

    persistKrUpdate({
      krId: payload.krId,
      updatedBy: currentUser.id,
      previousValue: target.currentValue,
      newValue: payload.newValue,
      progress,
      confidence: payload.confidence,
      comment: payload.comment,
      hasBlocker: payload.hasBlocker,
      blockerDescription: payload.blockerDescription,
    });
    setUpdateTarget(null);
  }

  function sendInvite(email: string, role: Role) {
    setData((current) => ({
      ...current,
      invites: [
        {
          id: `invite_${current.invites.length + 1}`,
          email,
          role,
          accepted: false,
          expiresAt: "2026-05-04",
        },
        ...current.invites,
      ],
    }));

    createInvite({
      organizationId: organization.id,
      invitedBy: currentUser.id,
      email,
      role,
    });
  }

  return (
    <main className="app-shell">
      <Sidebar activeView={view} copy={copy} organizationPlan={organization.plan} organizationSlug={organization.slug} onNavigate={setView} />
      <section className="workspace">
        <Topbar
          currentUserName={currentUser.fullName}
          activeCycleName={activeCycle?.name ?? "No cycle"}
          copy={copy}
          language={language}
          onLanguageChange={setLanguage}
          isLoading={isLoading}
          dataMode={dataMode}
          onSignOut={handleSignOut}
        />
        {dataMode === "needs_onboarding" && (
          <OnboardingExperience message={onboardingMessage} onCreateWorkspace={handleOnboarding} />
        )}
        {dataMode !== "needs_onboarding" && view === "auth" && (
          <AuthExperience
            message={authMessage}
            onEmailAuth={handleEmailAuth}
            onGoogleAuth={handleGoogleAuth}
          />
        )}
        {dataMode !== "needs_onboarding" && dataMode !== "signed_out" && view === "dashboard" && (
          <Dashboard
            objectives={objectives}
            keyResults={keyResults}
            teams={teams}
            weeklyProgress={weeklyProgress}
            profiles={profiles}
            copy={copy}
            onOpenObjective={openObjective}
          />
        )}
        {dataMode !== "needs_onboarding" && dataMode !== "signed_out" && view === "objectives" && (
          <ObjectivesView
            filters={filters}
            setFilters={setFilters}
            objectives={filteredObjectives}
            allObjectives={objectives}
            keyResults={keyResults}
            cycles={cycles}
            teams={teams}
            profiles={profiles}
            onCreateObjective={handleCreateObjective}
            onOpenObjective={openObjective}
          />
        )}
        {dataMode !== "needs_onboarding" && dataMode !== "signed_out" && view === "detail" && selectedObjective && (
          <ObjectiveDetail
            objective={selectedObjective}
            keyResults={keyResults.filter((kr) => kr.objectiveId === selectedObjective.id)}
            updates={updates}
            teams={teams}
            profiles={profiles}
            onBack={() => setView("objectives")}
            onEditObjective={setEditObjectiveTarget}
            onUpdateKr={setUpdateTarget}
            onEditKr={setEditKrTarget}
            onCreateKeyResult={handleCreateKeyResult}
          />
        )}
        {dataMode !== "needs_onboarding" && dataMode !== "signed_out" && view === "teams" && (
          <TeamsView
            organization={organization}
            profiles={profiles}
            teams={teams}
            invites={invites}
            onInvite={sendInvite}
            onCreateTeam={handleCreateTeam}
          />
        )}
      </section>
      {updateTarget && (
        <KrUpdateModal
          keyResult={updateTarget}
          onClose={() => setUpdateTarget(null)}
          onSubmit={handleKrUpdate}
        />
      )}
      {editKrTarget && (
        <KrEditModal
          keyResult={editKrTarget}
          profiles={profiles}
          onClose={() => setEditKrTarget(null)}
          onSubmit={handleUpdateKeyResult}
        />
      )}
      {editObjectiveTarget && (
        <ObjectiveEditModal
          objective={editObjectiveTarget}
          objectives={objectives}
          cycles={cycles}
          teams={teams}
          profiles={profiles}
          onClose={() => setEditObjectiveTarget(null)}
          onSubmit={handleUpdateObjective}
        />
      )}
    </main>
  );
}

function Sidebar({
  activeView,
  copy,
  organizationPlan,
  organizationSlug,
  onNavigate,
}: {
  activeView: View;
  copy: (typeof productCopy)[Language];
  organizationPlan: Organization["plan"];
  organizationSlug: string;
  onNavigate: (view: View) => void;
}) {
  const navItems: Array<{ view: View; label: string; icon: typeof LayoutDashboard }> = [
    { view: "dashboard", label: copy.nav.dashboard, icon: LayoutDashboard },
    { view: "objectives", label: copy.nav.objectives, icon: Goal },
    { view: "detail", label: copy.nav.detail, icon: Target },
    { view: "teams", label: copy.nav.teams, icon: Users },
    { view: "auth", label: copy.nav.auth, icon: LockKeyhole },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">K</div>
        <div>
          <strong>Kylia Performance</strong>
          <span>{organizationPlan} plan</span>
        </div>
      </div>
      <nav className="nav-list" aria-label="Principal">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={activeView === item.view ? "nav-item is-active" : "nav-item"}
              key={item.view}
              type="button"
              onClick={() => onNavigate(item.view)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="sidebar-panel">
        <ShieldCheck size={18} />
        <p>{copy.tenant}</p>
        <span>{organizationSlug}.kylia.app</span>
      </div>
    </aside>
  );
}

function Topbar({
  currentUserName,
  activeCycleName,
  copy,
  language,
  onLanguageChange,
  isLoading,
  dataMode,
  onSignOut,
}: {
  currentUserName: string;
  activeCycleName: string;
  copy: (typeof productCopy)[Language];
  language: Language;
  onLanguageChange: (language: Language) => void;
  isLoading: boolean;
  dataMode: DataMode;
  onSignOut: () => void;
}) {
  return (
    <header className="topbar">
      <div>
        <span className="eyebrow">{copy.brand}</span>
        <h1>{copy.workspaceTitle}</h1>
        <p className="topbar-tagline">{copy.tagline}</p>
      </div>
      <div className="topbar-actions">
        <div className="language-toggle" aria-label="Language">
          <button className={language === "pt" ? "is-active" : ""} type="button" onClick={() => onLanguageChange("pt")}>
            PT
          </button>
          <button className={language === "en" ? "is-active" : ""} type="button" onClick={() => onLanguageChange("en")}>
            EN
          </button>
        </div>
        <Badge tone="neutral">{activeCycleName}</Badge>
        <Badge tone={dataMode === "supabase" ? "success" : "warning"}>
          {isLoading
            ? copy.loading
            : dataMode === "supabase"
              ? copy.connected
              : dataMode === "needs_onboarding"
                ? copy.needsOnboarding
                : dataMode === "signed_out" || isSupabaseConfigured
                  ? copy.awaitingLogin
                  : copy.demo}
        </Badge>
        <button className="icon-button" type="button" aria-label="Notificações">
          <Bell size={18} />
        </button>
        {dataMode === "supabase" && (
          <button className="secondary-button compact" type="button" onClick={onSignOut}>
            Sair
          </button>
        )}
        <div className="avatar" title={currentUserName}>
          {initials(currentUserName)}
        </div>
      </div>
    </header>
  );
}

function Dashboard({
  objectives,
  keyResults,
  teams,
  weeklyProgress,
  profiles,
  copy,
  onOpenObjective,
}: {
  objectives: Objective[];
  keyResults: KeyResult[];
  teams: Team[];
  weeklyProgress: WeeklyProgress[];
  profiles: Profile[];
  copy: (typeof productCopy)[Language];
  onOpenObjective: (objectiveId: string) => void;
}) {
  const companyProgress = Math.round(
    objectives.length ? objectives.reduce((sum, objective) => sum + objective.progress, 0) / objectives.length : 0,
  );
  const alerts = keyResults
    .map((kr) => ({ kr, reason: krAlertReason(kr) }))
    .filter((alert): alert is { kr: KeyResult; reason: string } => Boolean(alert.reason))
    .slice(0, 8);
  const teamRows = teams.map((team) => {
    const teamObjectives = objectives.filter((objective) => objective.teamId === team.id);
    const progress = teamObjectives.length
      ? Math.round(teamObjectives.reduce((sum, objective) => sum + objective.progress, 0) / teamObjectives.length)
      : 0;
    return { ...team, progress, objective: teamObjectives[0] };
  });

  return (
    <div className="page-grid">
      <section className="hero-band">
        <div>
          <span className="eyebrow">{copy.ceoDashboard}</span>
          <h2>{copy.hero}</h2>
        </div>
        <div className="hero-metric">
          <span>Progresso geral</span>
          <strong>{companyProgress}%</strong>
        </div>
      </section>

      <div className="metric-row">
        <Metric icon={Flag} label="Objetivos ativos" value={String(objectives.length)} delta="+2 no ciclo" />
        <Metric icon={KeyRound} label="Key Results" value={String(keyResults.length)} delta={`${alerts.length} em atenção`} />
        <Metric icon={CircleGauge} label="Confiança média" value={`${average(keyResults.map((kr) => kr.confidence))}/10`} delta="base atual" />
      </div>

      <section className="panel wide">
        <PanelHeader
          icon={LineChart}
          title="Evolução semanal"
          action={<Badge tone="neutral">vw_weekly_progress</Badge>}
        />
        <WeeklyChart weeklyProgress={weeklyProgress} />
      </section>

      <section className="panel">
        <PanelHeader icon={Target} title="Times" action={<Badge tone="success">Semáforo</Badge>} />
        <div className="team-stack">
          {teamRows.map((team) => (
            <button
              className="team-row"
              key={team.id}
              type="button"
              onClick={() => team.objective && onOpenObjective(team.objective.id)}
            >
              <span className="team-dot" style={{ backgroundColor: team.color }} />
              <span>
                <strong>{team.name}</strong>
                <small>{team.description}</small>
              </span>
              <Progress value={team.progress} status={statusFromProgress(team.progress)} />
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelHeader icon={AlertTriangle} title="Alertas" action={<Badge tone="danger">vw_stale_krs</Badge>} />
        <div className="alert-list">
          {alerts.length === 0 && <div className="empty-state">Nenhum alerta ativo.</div>}
          {alerts.map(({ kr, reason }) => (
            <button className="alert-item" key={kr.id} type="button" onClick={() => onOpenObjective(kr.objectiveId)}>
              <div>
                <strong>{kr.title}</strong>
                <span>{ownerName(profiles, kr.ownerId)} · {reason}</span>
              </div>
              <Badge tone={kr.hasBlocker || kr.status === "behind" ? "danger" : "warning"}>{statusMeta[kr.status].label}</Badge>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ObjectivesView({
  filters,
  setFilters,
  objectives,
  allObjectives,
  keyResults,
  cycles,
  teams,
  profiles,
  onCreateObjective,
  onOpenObjective,
}: {
  filters: Filters;
  setFilters: (filters: Filters) => void;
  objectives: Objective[];
  allObjectives: Objective[];
  keyResults: KeyResult[];
  cycles: KyliaData["cycles"];
  teams: Team[];
  profiles: Profile[];
  onCreateObjective: (input: {
    cycleId: string;
    teamId?: string;
    parentId?: string;
    title: string;
    description: string;
    ownerId: string;
    isCompanyOkr: boolean;
  }) => Promise<string>;
  onOpenObjective: (objectiveId: string) => void;
}) {
  const corporateObjectives = allObjectives.filter((objective) => objective.isCompanyOkr);
  const visibleCorporateObjectives = objectives.filter((objective) => objective.isCompanyOkr);
  const departmentalObjectives = objectives.filter((objective) => !objective.isCompanyOkr);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"company" | "team">("company");
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [cycleId, setCycleId] = useState(cycles[0]?.id ?? "");
  const [ownerId, setOwnerId] = useState(profiles[0]?.id ?? "");
  const [parentId, setParentId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!cycleId && cycles[0]) setCycleId(cycles[0].id);
    if (!teamId && teams[0]) setTeamId(teams[0].id);
    if (!ownerId && profiles[0]) setOwnerId(profiles[0].id);
  }, [cycleId, cycles, ownerId, profiles, teamId, teams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (scope === "team" && !parentId) {
      setMessage("Escolha um objetivo corporativo pai antes de criar um objetivo departamental.");
      return;
    }

    const result = await onCreateObjective({
      cycleId,
      teamId: scope === "team" ? teamId : undefined,
      parentId: scope === "team" ? parentId : undefined,
      title: title.trim(),
      description: description.trim(),
      ownerId,
      isCompanyOkr: scope === "company",
    });

    if (result) {
      setMessage(result);
      return;
    }

    setTitle("");
    setDescription("");
    setParentId(scope === "team" ? parentId : "");
    setMessage("Objetivo criado.");
  }

  return (
    <div className="page-stack">
      <section className="panel wide">
        <PanelHeader icon={Plus} title="Novo objetivo" action={<Badge tone="success">objectives</Badge>} />
        <form className="objective-form" onSubmit={handleSubmit}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Título do objetivo" required />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descrição" rows={3} />
          <select value={cycleId} onChange={(event) => setCycleId(event.target.value)} required>
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>{cycle.name}</option>
            ))}
          </select>
          <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} required>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.fullName} · {roleLabels[profile.role]}</option>
            ))}
          </select>
          <select value={scope} onChange={(event) => setScope(event.target.value as "company" | "team")}>
            <option value="company">1. Corporativo</option>
            <option value="team" disabled={corporateObjectives.length === 0}>2. Departamental</option>
          </select>
          {scope === "team" && (
            <select value={teamId} onChange={(event) => setTeamId(event.target.value)} required>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          )}
          {scope === "team" && (
            <select value={parentId} onChange={(event) => setParentId(event.target.value)} required>
              <option value="">Objetivo corporativo pai</option>
              {corporateObjectives.map((objective) => (
                <option key={objective.id} value={objective.id}>{objective.title}</option>
              ))}
            </select>
          )}
          {scope === "company" && (
            <select value="" disabled>
              <option>Criar primeiro no topo da cascata</option>
            </select>
          )}
          {scope === "team" && corporateObjectives.length === 0 && (
            <p className="auth-message">Crie pelo menos um objetivo corporativo antes dos departamentais.</p>
          )}
          {scope === "company" && corporateObjectives.length > 0 && (
            <p className="auth-message">Objetivos corporativos ficam no topo. Depois crie objetivos departamentais alinhados a eles.</p>
          )}
          {scope === "team" && parentId && (
            <p className="auth-message">Este objetivo será criado abaixo do corporativo selecionado.</p>
          )}
          {message && <p className="auth-message">{message}</p>}
          <button className="primary-button" type="submit">
            <Plus size={16} /> Criar objetivo
          </button>
        </form>
      </section>

      <section className="toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            value={filters.query}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
            placeholder="Buscar objetivo"
          />
        </label>
        <select value={filters.cycleId} onChange={(event) => setFilters({ ...filters, cycleId: event.target.value })}>
          {cycles.map((cycle) => (
            <option key={cycle.id} value={cycle.id}>{cycle.name}</option>
          ))}
        </select>
        <select value={filters.teamId} onChange={(event) => setFilters({ ...filters, teamId: event.target.value })}>
          <option value="all">Todos os times</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>{team.name}</option>
          ))}
        </select>
        <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as Filters["status"] })}>
          <option value="all">Todos os status</option>
          {Object.entries(statusMeta).map(([status, meta]) => (
            <option key={status} value={status}>{meta.label}</option>
          ))}
        </select>
      </section>

      <section className="objective-list">
        <div className="cascade-heading">
          <span className="eyebrow">1. Corporativos</span>
          <p>Defina primeiro o foco da empresa. Eles serão a base para os objetivos departamentais.</p>
        </div>
        {visibleCorporateObjectives.length === 0 && (
          <div className="empty-state">Nenhum objetivo corporativo criado ainda.</div>
        )}
        {visibleCorporateObjectives.map((objective) => (
          <ObjectiveCard
            key={objective.id}
            objective={objective}
            keyResults={keyResults}
            teams={teams}
            profiles={profiles}
            onOpenObjective={onOpenObjective}
          />
        ))}

        <div className="cascade-heading">
          <span className="eyebrow">2. Departamentais</span>
          <p>Crie objetivos de times/departamentos alinhados a um objetivo corporativo.</p>
        </div>
        {departmentalObjectives.length === 0 && (
          <div className="empty-state">Nenhum objetivo departamental criado ainda.</div>
        )}
        {departmentalObjectives.map((objective) => (
          <ObjectiveCard
            key={objective.id}
            objective={objective}
            keyResults={keyResults}
            teams={teams}
            profiles={profiles}
            parentTitle={allObjectives.find((candidate) => candidate.id === objective.parentId)?.title}
            onOpenObjective={onOpenObjective}
          />
        ))}
      </section>
    </div>
  );
}

function ObjectiveCard({
  objective,
  keyResults,
  teams,
  profiles,
  parentTitle,
  onOpenObjective,
}: {
  objective: Objective;
  keyResults: KeyResult[];
  teams: Team[];
  profiles: Profile[];
  parentTitle?: string;
  onOpenObjective: (objectiveId: string) => void;
}) {
  const objectiveKrs = keyResults.filter((kr) => kr.objectiveId === objective.id);

  return (
    <button className="objective-card" type="button" onClick={() => onOpenObjective(objective.id)}>
      <div className="objective-main">
        <div>
          <Badge tone={objective.isCompanyOkr ? "success" : "neutral"}>
            {objective.isCompanyOkr ? "Corporativo" : teamName(teams, objective.teamId)}
          </Badge>
          <h2>{objective.title}</h2>
          <p>{objective.description}</p>
          {parentTitle && <small className="cascade-parent">Alinhado a: {parentTitle}</small>}
        </div>
        <Progress value={objective.progress} status={objective.status} large />
      </div>
      <div className="objective-meta">
        <span><Users size={16} /> {ownerName(profiles, objective.ownerId)}</span>
        <span><KeyRound size={16} /> {objectiveKrs.length} KRs</span>
        <span><Clock3 size={16} /> {statusMeta[objective.status].label}</span>
      </div>
    </button>
  );
}

function ObjectiveDetail({
  objective,
  keyResults,
  updates,
  teams,
  profiles,
  onBack,
  onEditObjective,
  onUpdateKr,
  onEditKr,
  onCreateKeyResult,
}: {
  objective: Objective;
  keyResults: KeyResult[];
  updates: KrUpdate[];
  teams: Team[];
  profiles: Profile[];
  onBack: () => void;
  onEditObjective: (objective: Objective) => void;
  onUpdateKr: (kr: KeyResult) => void;
  onEditKr: (kr: KeyResult) => void;
  onCreateKeyResult: (input: {
    objectiveId: string;
    title: string;
    description: string;
    ownerId: string;
    krType: KrType;
    startValue: number;
    targetValue: number;
    currentValue: number;
    unit: string;
    confidence: number;
  }) => Promise<string>;
}) {
  const recentUpdates = updates.filter((update) => keyResults.some((kr) => kr.id === update.keyResultId));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState(objective.ownerId || profiles[0]?.id || "");
  const [krType, setKrType] = useState<KrType>("percentage");
  const [startValue, setStartValue] = useState(0);
  const [currentValue, setCurrentValue] = useState(0);
  const [targetValue, setTargetValue] = useState(100);
  const [unit, setUnit] = useState("%");
  const [confidence, setConfidence] = useState(7);
  const [message, setMessage] = useState("");

  function handleTypeChange(nextType: KrType) {
    setKrType(nextType);
    if (nextType === "percentage") {
      setUnit("%");
      setStartValue(0);
      setCurrentValue(0);
      setTargetValue(100);
      return;
    }
    if (nextType === "currency") {
      setUnit("R$");
      setStartValue(0);
      setCurrentValue(0);
      setTargetValue(10000);
      return;
    }
    if (nextType === "boolean") {
      setUnit("");
      setStartValue(0);
      setCurrentValue(0);
      setTargetValue(1);
      return;
    }
    setUnit("");
    setStartValue(0);
    setCurrentValue(0);
    setTargetValue(100);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!title.trim() || !ownerId) return;
    if (krType !== "boolean" && targetValue === startValue) {
      setMessage("A meta precisa ser diferente do valor inicial.");
      return;
    }

    const result = await onCreateKeyResult({
      objectiveId: objective.id,
      title: title.trim(),
      description: description.trim(),
      ownerId,
      krType,
      startValue,
      currentValue: krType === "boolean" ? (currentValue > 0 ? 1 : 0) : currentValue,
      targetValue,
      unit,
      confidence,
    });

    if (result) {
      setMessage(result);
      return;
    }

    setTitle("");
    setDescription("");
    setConfidence(7);
    handleTypeChange(krType);
    setMessage("Key Result criado.");
  }

  return (
    <div className="page-stack">
      <section className="detail-header">
        <button className="ghost-button" type="button" onClick={onBack}>
          <ChevronRight className="rotate-180" size={18} /> Objetivos
        </button>
        <button className="secondary-button compact detail-edit-button" type="button" onClick={() => onEditObjective(objective)}>
          <Pencil size={16} /> Editar objetivo
        </button>
        <div className="detail-title">
          <Badge tone={objective.isCompanyOkr ? "success" : "neutral"}>{teamName(teams, objective.teamId)}</Badge>
          <h2>{objective.title}</h2>
          <p>{objective.description}</p>
        </div>
        <Progress value={objective.progress} status={objective.status} large />
      </section>

      <section className="panel wide">
        <PanelHeader icon={Plus} title="Novo Key Result" action={<Badge tone="success">key_results</Badge>} />
        <form className="kr-form" onSubmit={handleSubmit}>
          <label><span>Título</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex: Lançar versão beta" required /></label>
          <label><span>Descrição</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Critério de sucesso" rows={3} /></label>
          <label>
            <span>Dono</span>
            <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} required>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.fullName} · {roleLabels[profile.role]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Tipo</span>
            <select value={krType} onChange={(event) => handleTypeChange(event.target.value as KrType)}>
              <option value="percentage">Percentual</option>
              <option value="numeric">Número</option>
              <option value="currency">Moeda</option>
              <option value="boolean">Sim/não</option>
            </select>
          </label>
          {krType !== "boolean" && (
            <>
              <label><span>Unidade</span><input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="%, R$, clientes" /></label>
              <label><span>Inicial</span><input value={startValue} onChange={(event) => setStartValue(Number(event.target.value))} type="number" /></label>
              <label><span>Atual</span><input value={currentValue} onChange={(event) => setCurrentValue(Number(event.target.value))} type="number" /></label>
              <label><span>Meta</span><input value={targetValue} onChange={(event) => setTargetValue(Number(event.target.value))} type="number" required /></label>
            </>
          )}
          {krType === "boolean" && (
            <label>
              <span>Status</span>
              <select value={currentValue > 0 ? "1" : "0"} onChange={(event) => setCurrentValue(Number(event.target.value))}>
                <option value="0">Ainda não concluído</option>
                <option value="1">Concluído</option>
              </select>
            </label>
          )}
          <label className="range-field">
            <span>Confiança inicial: {confidence}/10</span>
            <input value={confidence} min="1" max="10" onChange={(event) => setConfidence(Number(event.target.value))} type="range" />
          </label>
          {message && <p className="auth-message">{message}</p>}
          <button className="primary-button" type="submit">
            <Plus size={16} /> Criar Key Result
          </button>
        </form>
      </section>

      <section className="kr-grid">
        {keyResults.length === 0 && (
          <div className="empty-state">Nenhum Key Result criado ainda para este objetivo.</div>
        )}
        {keyResults.map((kr) => (
          <article className="kr-card" key={kr.id}>
            <div className="kr-topline">
              <Badge tone={kr.status === "behind" ? "danger" : kr.status === "at_risk" ? "warning" : "success"}>
                {statusMeta[kr.status].label}
              </Badge>
              {kr.hasBlocker && <Badge tone="danger">Bloqueio</Badge>}
            </div>
            <h3>{kr.title}</h3>
            <p>{kr.description}</p>
            <Progress value={kr.progress} status={kr.status} />
            <div className="kr-stats">
              <span><strong>{formatKrValue(kr.currentValue, kr.unit, kr.krType)}</strong> atual</span>
              <span><strong>{formatKrValue(kr.targetValue, kr.unit, kr.krType)}</strong> meta</span>
              <span><strong>{kr.confidence}/10</strong> confiança</span>
            </div>
            <div className="kr-footer">
              <span>{ownerName(profiles, kr.ownerId)} · {kr.lastUpdate}</span>
              <div className="button-row">
                <button className="secondary-button compact" type="button" onClick={() => onEditKr(kr)}>
                  <Pencil size={16} /> Editar
                </button>
                <button className="primary-button compact" type="button" onClick={() => onUpdateKr(kr)}>
                  <ArrowUpRight size={16} /> Atualizar
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="panel wide">
        <PanelHeader icon={Clock3} title="Linha do tempo" action={<Badge tone="neutral">kr_updates</Badge>} />
        <div className="timeline">
          {recentUpdates.length === 0 && <p className="muted">Nenhuma atualização registrada para este objetivo.</p>}
          {recentUpdates.map((update) => (
            <div className="timeline-item" key={update.id}>
              <span className="timeline-dot" />
              <div>
                <strong>{ownerName(profiles, update.updatedBy)} atualizou para {formatKrValue(update.newValue, "", "numeric")}</strong>
                <p>{update.comment}</p>
                {update.hasBlocker && <small>Bloqueio: {update.blockerDescription}</small>}
              </div>
              <time>{update.createdAt}</time>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TeamsView({
  organization,
  profiles,
  teams,
  invites,
  onInvite,
  onCreateTeam,
}: {
  organization: Organization;
  profiles: Profile[];
  teams: Team[];
  invites: Invite[];
  onInvite: (email: string, role: Role) => void;
  onCreateTeam: (input: { name: string; description: string; color: string; ownerId: string }) => Promise<string>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [teamColor, setTeamColor] = useState("#7EBF8E");
  const [ownerId, setOwnerId] = useState(profiles[0]?.id ?? "");
  const [teamMessage, setTeamMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    onInvite(email.trim(), role);
    setEmail("");
  }

  async function handleTeamSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTeamMessage("");

    if (!teamName.trim() || !ownerId) return;

    const message = await onCreateTeam({
      name: teamName.trim(),
      description: teamDescription.trim(),
      color: teamColor,
      ownerId,
    });

    if (message) {
      setTeamMessage(message);
      return;
    }

    setTeamName("");
    setTeamDescription("");
    setTeamColor("#7EBF8E");
    setOwnerId(profiles[0]?.id ?? "");
    setTeamMessage("Time/departamento criado.");
  }

  return (
    <div className="page-grid">
      <section className="panel wide">
        <PanelHeader icon={Users} title="Times e usuarios" action={<Badge tone="neutral">admin only</Badge>} />
        <div className="people-grid">
          {teams.map((team) => (
            <article className="team-card" key={team.id}>
              <span className="team-dot large" style={{ backgroundColor: team.color }} />
              <h3>{team.name}</h3>
              <p>{team.description}</p>
              <Badge tone="neutral">Owner: {ownerName(profiles, team.leadId)}</Badge>
              <div className="member-list">
                {profiles.filter((profile) => profile.teamIds.includes(team.id)).map((profile) => (
                  <span key={profile.id}>{profile.fullName} · {roleLabels[profile.role]}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelHeader icon={Plus} title="Novo time/depto" action={<Badge tone="success">teams</Badge>} />
        <form className="invite-form" onSubmit={handleTeamSubmit}>
          <input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Ex: Marketing" required />
          <textarea value={teamDescription} onChange={(event) => setTeamDescription(event.target.value)} placeholder="Descrição do time/departamento" rows={3} />
          <label className="color-input">
            <span>Cor</span>
            <input value={teamColor} onChange={(event) => setTeamColor(event.target.value)} type="color" />
          </label>
          <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} required>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.fullName} · {roleLabels[profile.role]}
              </option>
            ))}
          </select>
          {teamMessage && <p className="auth-message">{teamMessage}</p>}
          <button className="primary-button" type="submit">
            <Plus size={16} /> Criar time/depto
          </button>
        </form>
      </section>

      <section className="panel">
        <PanelHeader icon={MailPlus} title="Convites" action={<Badge tone="success">invites</Badge>} />
        <form className="invite-form" onSubmit={handleSubmit}>
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@empresa.com" type="email" />
          <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            {Object.entries(roleLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button className="primary-button" type="submit">
            <Plus size={16} /> Convidar
          </button>
        </form>
        <div className="invite-list">
          {invites.map((invite) => (
            <div className="invite-row" key={invite.id}>
              <div>
                <strong>{invite.email}</strong>
                <span>{roleLabels[invite.role]} · expira {invite.expiresAt}</span>
              </div>
              <Badge tone={invite.accepted ? "success" : "warning"}>{invite.accepted ? "Aceito" : "Pendente"}</Badge>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelHeader icon={Settings} title="Organização" action={<Badge tone="neutral">profiles</Badge>} />
        <div className="org-facts">
          <span><strong>{organization.name}</strong> Empresa</span>
          <span><strong>{organization.sector}</strong> Setor</span>
          <span><strong>{profiles.length}/{organization.maxUsers}</strong> Usuários</span>
          <span><strong>{teams.length}</strong> Times ativos</span>
        </div>
      </section>
    </div>
  );
}

function AuthExperience({
  message,
  onEmailAuth,
  onGoogleAuth,
}: {
  message: string;
  onEmailAuth: (input: { mode: "login" | "signup"; email: string; password: string; fullName: string }) => void;
  onGoogleAuth: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onEmailAuth({ mode, email, password, fullName });
  }

  return (
    <div className="auth-layout">
      <section className="auth-copy">
        <span className="eyebrow">Primeira entrada</span>
        <h2>Configure a organização, convide o time e comece o ciclo sem sair do fluxo.</h2>
        <div className="auth-steps">
          <span><CheckCircle2 size={18} /> Criar organização</span>
          <span><CheckCircle2 size={18} /> Definir primeiro time</span>
          <span><CheckCircle2 size={18} /> Entrar no dashboard</span>
        </div>
      </section>
      <form className="auth-panel" onSubmit={handleSubmit}>
        <div className="auth-tabs">
          <button className={mode === "login" ? "is-active" : ""} type="button" onClick={() => setMode("login")}>Login</button>
          <button className={mode === "signup" ? "is-active" : ""} type="button" onClick={() => setMode("signup")}>Cadastro</button>
        </div>
        {mode === "signup" && (
          <label>
            Nome
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Seu nome" type="text" />
          </label>
        )}
        <label>
          E-mail
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" type="email" required />
        </label>
        <label>
          Senha
          <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" type="password" minLength={6} required />
        </label>
        {message && <p className="auth-message">{message}</p>}
        <button className="primary-button" type="submit">
          <LogIn size={18} /> {mode === "login" ? "Entrar" : "Criar conta"}
        </button>
        <button className="secondary-button" type="button" onClick={onGoogleAuth}>
          <Sparkles size={18} /> Continuar com Google
        </button>
      </form>
    </div>
  );
}

function OnboardingExperience({
  message,
  onCreateWorkspace,
}: {
  message: string;
  onCreateWorkspace: (input: OnboardingInput) => void;
}) {
  const [organizationName, setOrganizationName] = useState("Kynovia");
  const [organizationSlug, setOrganizationSlug] = useState("kynovia");
  const [sector, setSector] = useState("AI products and business performance");
  const [teamName, setTeamName] = useState("Leadership");
  const [teamDescription, setTeamDescription] = useState("Executive goals, strategy, and operating cadence");

  function handleOrganizationName(value: string) {
    setOrganizationName(value);
    setOrganizationSlug(slugify(value));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreateWorkspace({
      organizationName,
      organizationSlug,
      sector,
      teamName,
      teamDescription,
    });
  }

  return (
    <div className="auth-layout">
      <section className="auth-copy">
        <span className="eyebrow">Workspace setup</span>
        <h2>Create your first Kylia workspace and start with a clean performance system.</h2>
        <div className="auth-steps">
          <span><CheckCircle2 size={18} /> Organization</span>
          <span><CheckCircle2 size={18} /> First team</span>
          <span><CheckCircle2 size={18} /> First cycle</span>
        </div>
      </section>
      <form className="auth-panel" onSubmit={handleSubmit}>
        <label>
          Organization
          <input value={organizationName} onChange={(event) => handleOrganizationName(event.target.value)} required />
        </label>
        <label>
          Workspace slug
          <input value={organizationSlug} onChange={(event) => setOrganizationSlug(slugify(event.target.value))} required />
        </label>
        <label>
          Sector
          <input value={sector} onChange={(event) => setSector(event.target.value)} />
        </label>
        <label>
          First team
          <input value={teamName} onChange={(event) => setTeamName(event.target.value)} required />
        </label>
        <label>
          Team description
          <textarea value={teamDescription} onChange={(event) => setTeamDescription(event.target.value)} rows={3} />
        </label>
        {message && <p className="auth-message">{message}</p>}
        <button className="primary-button" type="submit">
          <Plus size={18} /> Create workspace
        </button>
      </form>
    </div>
  );
}

function KrUpdateModal({
  keyResult,
  onClose,
  onSubmit,
}: {
  keyResult: KeyResult;
  onClose: () => void;
  onSubmit: (payload: {
    krId: string;
    newValue: number;
    confidence: number;
    comment: string;
    hasBlocker: boolean;
    blockerDescription: string;
  }) => void;
}) {
  const [newValue, setNewValue] = useState(String(keyResult.currentValue));
  const [confidence, setConfidence] = useState(keyResult.confidence);
  const [comment, setComment] = useState("");
  const [hasBlocker, setHasBlocker] = useState(Boolean(keyResult.hasBlocker));
  const [blockerDescription, setBlockerDescription] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      krId: keyResult.id,
      newValue: Number(newValue),
      confidence,
      comment,
      hasBlocker,
      blockerDescription,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">Check-in semanal</span>
            <h2>{keyResult.title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar modal">
            <X size={18} />
          </button>
        </div>
        <label>
          Valor atual
          <input value={newValue} onChange={(event) => setNewValue(event.target.value)} type="number" />
        </label>
        <label>
          Confiança: {confidence}/10
          <input value={confidence} min="1" max="10" onChange={(event) => setConfidence(Number(event.target.value))} type="range" />
        </label>
        <label>
          Comentário
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="O que avançou, mudou ou precisa de atenção?" rows={4} />
        </label>
        <label className="checkbox-row">
          <input checked={hasBlocker} onChange={(event) => setHasBlocker(event.target.checked)} type="checkbox" />
          Existe bloqueio
        </label>
        {hasBlocker && (
          <label>
            Descrição do bloqueio
            <textarea value={blockerDescription} onChange={(event) => setBlockerDescription(event.target.value)} rows={3} />
          </label>
        )}
        <button className="primary-button" type="submit">
          <ArrowUpRight size={18} /> Registrar check-in
        </button>
      </form>
    </div>
  );
}

function ObjectiveEditModal({
  objective,
  objectives,
  cycles,
  teams,
  profiles,
  onClose,
  onSubmit,
}: {
  objective: Objective;
  objectives: Objective[];
  cycles: KyliaData["cycles"];
  teams: Team[];
  profiles: Profile[];
  onClose: () => void;
  onSubmit: (payload: {
    id: string;
    cycleId: string;
    teamId?: string;
    parentId?: string;
    title: string;
    description: string;
    ownerId: string;
    isCompanyOkr: boolean;
  }) => Promise<string>;
}) {
  const corporateObjectives = objectives.filter((candidate) => candidate.isCompanyOkr && candidate.id !== objective.id);
  const [title, setTitle] = useState(objective.title);
  const [description, setDescription] = useState(objective.description);
  const [cycleId, setCycleId] = useState(objective.cycleId);
  const [scope, setScope] = useState<"company" | "team">(objective.isCompanyOkr ? "company" : "team");
  const [teamId, setTeamId] = useState(objective.teamId ?? teams[0]?.id ?? "");
  const [parentId, setParentId] = useState(objective.parentId ?? "");
  const [ownerId, setOwnerId] = useState(objective.ownerId);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (scope === "team" && !parentId) {
      setMessage("Escolha um objetivo corporativo pai.");
      return;
    }

    const result = await onSubmit({
      id: objective.id,
      cycleId,
      teamId: scope === "team" ? teamId : undefined,
      parentId: scope === "team" ? parentId : undefined,
      title: title.trim(),
      description: description.trim(),
      ownerId,
      isCompanyOkr: scope === "company",
    });
    if (result) setMessage(result);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">Editar Objetivo</span>
            <h2>{objective.title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar modal">
            <X size={18} />
          </button>
        </div>
        <label>Título<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
        <label>Descrição<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label>
        <label>
          Ciclo
          <select value={cycleId} onChange={(event) => setCycleId(event.target.value)}>
            {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
          </select>
        </label>
        <label>
          Tipo
          <select value={scope} onChange={(event) => setScope(event.target.value as "company" | "team")}>
            <option value="company">Corporativo</option>
            <option value="team">Departamental</option>
          </select>
        </label>
        {scope === "team" && (
          <>
            <label>
              Time/depto
              <select value={teamId} onChange={(event) => setTeamId(event.target.value)} required>
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            <label>
              Objetivo pai
              <select value={parentId} onChange={(event) => setParentId(event.target.value)} required>
                <option value="">Selecione</option>
                {corporateObjectives.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
              </select>
            </label>
          </>
        )}
        <label>
          Dono
          <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} required>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.fullName} · {roleLabels[profile.role]}</option>)}
          </select>
        </label>
        {message && <p className="auth-message">{message}</p>}
        <button className="primary-button" type="submit">
          <Pencil size={18} /> Salvar objetivo
        </button>
      </form>
    </div>
  );
}

function KrEditModal({
  keyResult,
  profiles,
  onClose,
  onSubmit,
}: {
  keyResult: KeyResult;
  profiles: Profile[];
  onClose: () => void;
  onSubmit: (payload: {
    id: string;
    title: string;
    description: string;
    ownerId: string;
    krType: KrType;
    startValue: number;
    targetValue: number;
    currentValue: number;
    unit: string;
    confidence: number;
  }) => Promise<string>;
}) {
  const [title, setTitle] = useState(keyResult.title);
  const [description, setDescription] = useState(keyResult.description);
  const [ownerId, setOwnerId] = useState(keyResult.ownerId);
  const [krType, setKrType] = useState<KrType>(keyResult.krType);
  const [startValue, setStartValue] = useState(keyResult.startValue);
  const [currentValue, setCurrentValue] = useState(keyResult.currentValue);
  const [targetValue, setTargetValue] = useState(keyResult.targetValue);
  const [unit, setUnit] = useState(keyResult.unit);
  const [confidence, setConfidence] = useState(keyResult.confidence);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (krType !== "boolean" && targetValue === startValue) {
      setMessage("A meta precisa ser diferente do valor inicial.");
      return;
    }

    const result = await onSubmit({
      id: keyResult.id,
      title: title.trim(),
      description: description.trim(),
      ownerId,
      krType,
      startValue,
      currentValue: krType === "boolean" ? (currentValue > 0 ? 1 : 0) : currentValue,
      targetValue,
      unit,
      confidence,
    });
    if (result) setMessage(result);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">Editar Key Result</span>
            <h2>{keyResult.title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar modal">
            <X size={18} />
          </button>
        </div>
        <label>Título<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
        <label>Descrição<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label>
        <label>
          Dono
          <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} required>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.fullName} · {roleLabels[profile.role]}</option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select value={krType} onChange={(event) => setKrType(event.target.value as KrType)}>
            <option value="percentage">Percentual</option>
            <option value="numeric">Número</option>
            <option value="currency">Moeda</option>
            <option value="boolean">Sim/não</option>
          </select>
        </label>
        {krType !== "boolean" && (
          <>
            <label>Unidade<input value={unit} onChange={(event) => setUnit(event.target.value)} /></label>
            <label>Inicial<input value={startValue} onChange={(event) => setStartValue(Number(event.target.value))} type="number" /></label>
            <label>Atual<input value={currentValue} onChange={(event) => setCurrentValue(Number(event.target.value))} type="number" /></label>
            <label>Meta<input value={targetValue} onChange={(event) => setTargetValue(Number(event.target.value))} type="number" required /></label>
          </>
        )}
        {krType === "boolean" && (
          <label>
            Status
            <select value={currentValue > 0 ? "1" : "0"} onChange={(event) => setCurrentValue(Number(event.target.value))}>
              <option value="0">Ainda não concluído</option>
              <option value="1">Concluído</option>
            </select>
          </label>
        )}
        <label>Confiança: {confidence}/10<input value={confidence} min="1" max="10" onChange={(event) => setConfidence(Number(event.target.value))} type="range" /></label>
        {message && <p className="auth-message">{message}</p>}
        <button className="primary-button" type="submit">
          <Pencil size={18} /> Salvar edição
        </button>
      </form>
    </div>
  );
}

function Metric({ icon: Icon, label, value, delta }: { icon: typeof Flag; label: string; value: string; delta: string }) {
  return (
    <article className="metric-card">
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{delta}</small>
    </article>
  );
}

function PanelHeader({ icon: Icon, title, action }: { icon: typeof LineChart; title: string; action?: React.ReactNode }) {
  return (
    <div className="panel-header">
      <div>
        <Icon size={18} />
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function Progress({ value, status, large = false }: { value: number; status: Status; large?: boolean }) {
  return (
    <div className={large ? "progress is-large" : "progress"}>
      <div className="progress-label">
        <span>{value}%</span>
        <small>{statusMeta[status].label}</small>
      </div>
      <div className="progress-track">
        <span style={{ width: `${Math.min(value, 100)}%`, backgroundColor: statusMeta[status].color }} />
      </div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "success" | "warning" | "danger" | "neutral" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function WeeklyChart({ weeklyProgress }: { weeklyProgress: WeeklyProgress[] }) {
  const max = 100;
  return (
    <div className="chart">
      {weeklyProgress.map((point) => (
        <div className="chart-column" key={point.week}>
          <span style={{ height: `${(point.company / max) * 100}%` }} title={`Empresa ${point.company}%`} />
          <span style={{ height: `${(point.product / max) * 100}%` }} title={`Produto ${point.product}%`} />
          <span style={{ height: `${(point.sales / max) * 100}%` }} title={`Receita ${point.sales}%`} />
          <span style={{ height: `${(point.success / max) * 100}%` }} title={`Sucesso ${point.success}%`} />
          <small>{point.week}</small>
        </div>
      ))}
    </div>
  );
}

function calculateProgress(kr: KeyResult, newValue: number) {
  if (kr.krType === "boolean") return newValue > 0 ? 100 : 0;
  const denominator = kr.targetValue - kr.startValue;
  if (denominator === 0) return 0;
  const raw = ((newValue - kr.startValue) / denominator) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function statusFromProgress(progress: number): Status {
  if (progress >= 100) return "completed";
  if (progress >= 70) return "on_track";
  if (progress >= 40) return "at_risk";
  return "behind";
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function ownerName(profiles: Profile[], profileId: string) {
  return profiles.find((profile) => profile.id === profileId)?.fullName ?? "Sem dono";
}

function teamName(teams: Team[], teamId?: string) {
  return teams.find((team) => team.id === teamId)?.name ?? "Empresa";
}

function initials(name: string) {
  return name.split(" ").map((piece) => piece[0]).slice(0, 2).join("");
}

function formatKrValue(value: number, unit: string, type: KeyResult["krType"]) {
  if (type === "currency") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
  }
  if (unit === "%") return `${value}%`;
  return `${value}${unit ? ` ${unit}` : ""}`;
}

function krAlertReason(kr: KeyResult) {
  if (kr.status === "completed") return "";
  if (kr.hasBlocker) return "bloqueio reportado";
  if (kr.status === "behind") return "atrasado";
  if (kr.status === "at_risk") return "em risco";

  const lastUpdate = new Date(kr.lastUpdate);
  if (!Number.isNaN(lastUpdate.getTime())) {
    const days = Math.floor((Date.now() - lastUpdate.getTime()) / 86400000);
    if (days >= 7) return `${days} dias sem check-in`;
  }

  return "";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
