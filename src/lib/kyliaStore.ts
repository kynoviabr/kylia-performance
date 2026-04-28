import { demoData } from "../data";
import type {
  Cycle,
  Invite,
  InviteInput,
  KeyResult,
  KrUpdate,
  KrUpdateInput,
  Objective,
  KyliaData,
  OnboardingInput,
  Organization,
  Profile,
  Team,
  WeeklyProgress,
} from "../types";
import { isSupabaseConfigured, supabase } from "./supabase";

const today = "2026-04-27";

type StoreMode = "demo" | "signed_out" | "supabase" | "needs_onboarding";

export type LoadedKyliaData = KyliaData & {
  mode: StoreMode;
};

type ProfileRow = {
  id: string;
  organization_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  role: Profile["role"];
};

type TeamMemberRow = {
  team_id: string;
  profile_id: string;
};

type KeyResultRow = {
  id: string;
  objective_id: string;
  title: string;
  description: string | null;
  owner_id: string | null;
  kr_type: KeyResult["krType"];
  start_value: number | null;
  target_value: number;
  current_value: number | null;
  unit: string | null;
  progress: number | null;
  status: KeyResult["status"];
  confidence: number | null;
  sort_order: number | null;
  updated_at?: string | null;
};

export async function loadKyliaData(): Promise<LoadedKyliaData> {
  if (!isSupabaseConfigured || !supabase) {
    return { ...cloneDemoData(), mode: "demo" };
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ...cloneDemoData(), mode: "signed_out" };
  }

  const { data: currentProfile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .single<ProfileRow>();

  if (profileError || !currentProfile?.organization_id) {
    return {
      ...cloneDemoData(),
      profiles: [mapProfile(currentProfile ?? fallbackProfile(userData.user.id), [], userData.user.email ?? "")],
      mode: "needs_onboarding",
    };
  }

  const organizationId = currentProfile.organization_id;
  const [
    organizationResult,
    profilesResult,
    teamsResult,
    membersResult,
    cyclesResult,
    objectivesResult,
    keyResultsResult,
    updatesResult,
    invitesResult,
    weeklyResult,
  ] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", organizationId).single(),
    supabase.from("profiles").select("*").eq("organization_id", organizationId).order("full_name"),
    supabase.from("teams").select("*").eq("organization_id", organizationId).order("name"),
    supabase.from("team_members").select("*"),
    supabase.from("cycles").select("*").eq("organization_id", organizationId).order("start_date", { ascending: false }),
    supabase.from("objectives").select("*").eq("organization_id", organizationId).order("created_at", { ascending: true }),
    supabase.from("key_results").select("*").order("sort_order", { ascending: true }),
    supabase.from("kr_updates").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("invites").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("vw_weekly_progress").select("*").eq("organization_id", organizationId).limit(12),
  ]);

  if (organizationResult.error || profilesResult.error || teamsResult.error || cyclesResult.error) {
    return { ...cloneDemoData(), mode: "demo" };
  }

  const teamMembers = (membersResult.data ?? []) as TeamMemberRow[];
  const profiles = ((profilesResult.data ?? []) as ProfileRow[]).map((profile) =>
    mapProfile(profile, teamMembers, userData.user.email ?? ""),
  );

  return {
    organization: mapOrganization(organizationResult.data),
    profiles,
    teams: ((teamsResult.data ?? []) as any[]).map(mapTeam),
    cycles: ((cyclesResult.data ?? []) as any[]).map(mapCycle),
    objectives: ((objectivesResult.data ?? []) as any[]).map(mapObjective),
    keyResults: ((keyResultsResult.data ?? []) as KeyResultRow[]).map(mapKeyResult),
    updates: ((updatesResult.data ?? []) as any[]).map(mapKrUpdate),
    invites: ((invitesResult.data ?? []) as any[]).map(mapInvite),
    weeklyProgress: mapWeeklyProgress((weeklyResult.data ?? []) as any[]),
    mode: "supabase",
  };
}

export async function persistKrUpdate(input: KrUpdateInput) {
  if (!isSupabaseConfigured || !supabase) return;

  await supabase
    .from("key_results")
    .update({
      current_value: input.newValue,
      progress: input.progress,
      confidence: input.confidence,
    })
    .eq("id", input.krId);

  await supabase.from("kr_updates").insert({
    key_result_id: input.krId,
    updated_by: input.updatedBy,
    new_value: input.newValue,
    progress: input.progress,
    confidence: input.confidence,
    comment: input.comment,
    has_blocker: input.hasBlocker,
    blocker_description: input.blockerDescription || null,
  });
}

export async function createInvite(input: InviteInput) {
  if (!isSupabaseConfigured || !supabase) return;

  await supabase.from("invites").insert({
    organization_id: input.organizationId,
    invited_by: input.invitedBy,
    email: input.email,
    role: input.role,
  });
}

export async function createWorkspace(input: OnboardingInput) {
  if (!isSupabaseConfigured || !supabase) {
    return { error: new Error("Supabase is not configured.") };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: userError ?? new Error("No authenticated user.") };
  }

  const { error } = await supabase.rpc("create_initial_workspace", {
    org_name: input.organizationName,
    org_slug: input.organizationSlug,
    org_sector: input.sector || "Business performance",
    first_team_name: input.teamName,
    first_team_description: input.teamDescription,
  });

  return { error };
}

function cloneDemoData(): KyliaData {
  return structuredClone(demoData);
}

function mapOrganization(row: any): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sector: row.sector ?? "Nao informado",
    plan: row.plan,
    maxUsers: row.max_users ?? 10,
  };
}

function mapProfile(row: ProfileRow, teamMembers: TeamMemberRow[], fallbackEmail: string): Profile {
  return {
    id: row.id,
    fullName: row.full_name ?? "Usuario",
    email: fallbackEmail,
    jobTitle: row.job_title ?? "Membro",
    role: row.role,
    teamIds: teamMembers.filter((member) => member.profile_id === row.id).map((member) => member.team_id),
    avatarUrl: row.avatar_url ?? undefined,
  };
}

function fallbackProfile(id: string): ProfileRow {
  return {
    id,
    organization_id: null,
    full_name: "Usuario",
    avatar_url: null,
    job_title: null,
    role: "admin",
  };
}

function mapTeam(row: any): Team {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    color: row.color ?? "#7EBF8E",
    leadId: row.lead_id ?? "",
    isActive: Boolean(row.is_active),
  };
}

function mapCycle(row: any): Cycle {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: Boolean(row.is_active),
  };
}

function mapObjective(row: any): Objective {
  return {
    id: row.id,
    cycleId: row.cycle_id,
    teamId: row.team_id ?? undefined,
    parentId: row.parent_id ?? undefined,
    title: row.title,
    description: row.description ?? "",
    ownerId: row.owner_id ?? "",
    progress: Number(row.progress ?? 0),
    status: row.status,
    isCompanyOkr: Boolean(row.is_company_okr),
  };
}

function mapKeyResult(row: KeyResultRow): KeyResult {
  return {
    id: row.id,
    objectiveId: row.objective_id,
    title: row.title,
    description: row.description ?? "",
    ownerId: row.owner_id ?? "",
    krType: row.kr_type,
    startValue: Number(row.start_value ?? 0),
    targetValue: Number(row.target_value),
    currentValue: Number(row.current_value ?? 0),
    unit: row.unit ?? "",
    progress: Number(row.progress ?? 0),
    status: row.status,
    confidence: Number(row.confidence ?? 5),
    sortOrder: Number(row.sort_order ?? 0),
    lastUpdate: row.updated_at ? row.updated_at.slice(0, 10) : today,
  };
}

function mapKrUpdate(row: any): KrUpdate {
  return {
    id: row.id,
    keyResultId: row.key_result_id,
    updatedBy: row.updated_by,
    previousValue: Number(row.previous_value ?? 0),
    newValue: Number(row.new_value ?? 0),
    progress: Number(row.progress ?? 0),
    confidence: Number(row.confidence ?? 5),
    comment: row.comment ?? "",
    hasBlocker: Boolean(row.has_blocker),
    blockerDescription: row.blocker_description ?? undefined,
    createdAt: row.created_at ? row.created_at.slice(0, 10) : today,
  };
}

function mapInvite(row: any): Invite {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    accepted: Boolean(row.accepted),
    expiresAt: row.expires_at ? row.expires_at.slice(0, 10) : today,
  };
}

function mapWeeklyProgress(rows: any[]): WeeklyProgress[] {
  if (!rows.length) return demoData.weeklyProgress;

  return rows.map((row) => ({
    week: String(row.week_start ?? row.week ?? "").slice(5, 10).replace("-", "/"),
    company: Number(row.company_progress ?? row.company ?? 0),
    product: Number(row.product_progress ?? row.product ?? 0),
    sales: Number(row.sales_progress ?? row.sales ?? 0),
    success: Number(row.success_progress ?? row.success ?? 0),
  }));
}
