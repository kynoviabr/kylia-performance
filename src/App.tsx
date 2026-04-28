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
import { createInvite, createWorkspace, loadKyliaData, persistKrUpdate } from "./lib/kyliaStore";
import { isSupabaseConfigured, signInWithEmail, signInWithGoogle, signOut, signUpWithEmail, supabase } from "./lib/supabase";
import type { Invite, KeyResult, KrUpdate, Objective, KyliaData, OnboardingInput, Organization, Profile, Role, Status, Team, WeeklyProgress } from "./types";

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
              lastUpdate: "2026-04-27",
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
          createdAt: "2026-04-27",
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
            keyResults={keyResults}
            cycles={cycles}
            teams={teams}
            profiles={profiles}
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
            onUpdateKr={setUpdateTarget}
          />
        )}
        {dataMode !== "needs_onboarding" && dataMode !== "signed_out" && view === "teams" && (
          <TeamsView organization={organization} profiles={profiles} teams={teams} invites={invites} onInvite={sendInvite} />
        )}
      </section>
      {updateTarget && (
        <KrUpdateModal
          keyResult={updateTarget}
          onClose={() => setUpdateTarget(null)}
          onSubmit={handleKrUpdate}
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
  const staleKrs = keyResults.filter((kr) => kr.status !== "on_track" || kr.hasBlocker);
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
        <Metric icon={KeyRound} label="Key Results" value={String(keyResults.length)} delta={`${staleKrs.length} em atenção`} />
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
          {staleKrs.map((kr) => (
            <button className="alert-item" key={kr.id} type="button" onClick={() => onOpenObjective(kr.objectiveId)}>
              <div>
                <strong>{kr.title}</strong>
                <span>{ownerName(profiles, kr.ownerId)} · {kr.lastUpdate}</span>
              </div>
              <Badge tone={kr.status === "behind" ? "danger" : "warning"}>{statusMeta[kr.status].label}</Badge>
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
  keyResults,
  cycles,
  teams,
  profiles,
  onOpenObjective,
}: {
  filters: Filters;
  setFilters: (filters: Filters) => void;
  objectives: Objective[];
  keyResults: KeyResult[];
  cycles: KyliaData["cycles"];
  teams: Team[];
  profiles: Profile[];
  onOpenObjective: (objectiveId: string) => void;
}) {
  return (
    <div className="page-stack">
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
        {objectives.map((objective) => {
          const objectiveKrs = keyResults.filter((kr) => kr.objectiveId === objective.id);
          return (
            <button className="objective-card" key={objective.id} type="button" onClick={() => onOpenObjective(objective.id)}>
              <div className="objective-main">
                <div>
                  <Badge tone={objective.isCompanyOkr ? "success" : "neutral"}>
                    {objective.isCompanyOkr ? "Empresa" : teamName(teams, objective.teamId)}
                  </Badge>
                  <h2>{objective.title}</h2>
                  <p>{objective.description}</p>
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
        })}
      </section>
    </div>
  );
}

function ObjectiveDetail({
  objective,
  keyResults,
  updates,
  teams,
  profiles,
  onBack,
  onUpdateKr,
}: {
  objective: Objective;
  keyResults: KeyResult[];
  updates: KrUpdate[];
  teams: Team[];
  profiles: Profile[];
  onBack: () => void;
  onUpdateKr: (kr: KeyResult) => void;
}) {
  const recentUpdates = updates.filter((update) => keyResults.some((kr) => kr.id === update.keyResultId));

  return (
    <div className="page-stack">
      <section className="detail-header">
        <button className="ghost-button" type="button" onClick={onBack}>
          <ChevronRight className="rotate-180" size={18} /> Objetivos
        </button>
        <div className="detail-title">
          <Badge tone={objective.isCompanyOkr ? "success" : "neutral"}>{teamName(teams, objective.teamId)}</Badge>
          <h2>{objective.title}</h2>
          <p>{objective.description}</p>
        </div>
        <Progress value={objective.progress} status={objective.status} large />
      </section>

      <section className="kr-grid">
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
              <button className="primary-button compact" type="button" onClick={() => onUpdateKr(kr)}>
                <ArrowUpRight size={16} /> Atualizar
              </button>
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
}: {
  organization: Organization;
  profiles: Profile[];
  teams: Team[];
  invites: Invite[];
  onInvite: (email: string, role: Role) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    onInvite(email.trim(), role);
    setEmail("");
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
            <span className="eyebrow">Update de KR</span>
            <h2>{keyResult.title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar modal">
            <X size={18} />
          </button>
        </div>
        <label>
          Novo valor
          <input value={newValue} onChange={(event) => setNewValue(event.target.value)} type="number" />
        </label>
        <label>
          Confiança: {confidence}/10
          <input value={confidence} min="1" max="10" onChange={(event) => setConfidence(Number(event.target.value))} type="range" />
        </label>
        <label>
          Comentário
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Contexto da atualização" rows={4} />
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
          <ArrowUpRight size={18} /> Registrar update
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
