export type Role = "admin" | "team_lead" | "member";
export type Status = "on_track" | "at_risk" | "behind" | "completed";
export type KrType = "percentage" | "numeric" | "currency" | "boolean";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  sector: string;
  plan: "starter" | "growth" | "enterprise";
  maxUsers: number;
};

export type Profile = {
  id: string;
  fullName: string;
  email: string;
  jobTitle: string;
  role: Role;
  teamIds: string[];
  avatarUrl?: string;
};

export type Team = {
  id: string;
  name: string;
  description: string;
  color: string;
  leadId: string;
  isActive: boolean;
};

export type Cycle = {
  id: string;
  name: string;
  type: "quarterly" | "annual" | "custom";
  startDate: string;
  endDate: string;
  isActive: boolean;
};

export type Objective = {
  id: string;
  cycleId: string;
  teamId?: string;
  parentId?: string;
  title: string;
  description: string;
  ownerId: string;
  progress: number;
  status: Status;
  isCompanyOkr: boolean;
};

export type KeyResult = {
  id: string;
  objectiveId: string;
  title: string;
  description: string;
  ownerId: string;
  krType: KrType;
  startValue: number;
  targetValue: number;
  currentValue: number;
  unit: string;
  progress: number;
  status: Status;
  confidence: number;
  sortOrder: number;
  lastUpdate: string;
  hasBlocker?: boolean;
};

export type KrUpdate = {
  id: string;
  keyResultId: string;
  updatedBy: string;
  previousValue: number;
  newValue: number;
  progress: number;
  confidence: number;
  comment: string;
  hasBlocker: boolean;
  blockerDescription?: string;
  createdAt: string;
};

export type Invite = {
  id: string;
  email: string;
  role: Role;
  accepted: boolean;
  expiresAt: string;
};

export type WeeklyProgress = {
  week: string;
  company: number;
  product: number;
  sales: number;
  success: number;
};

export type KyliaData = {
  organization: Organization;
  profiles: Profile[];
  teams: Team[];
  cycles: Cycle[];
  objectives: Objective[];
  keyResults: KeyResult[];
  updates: KrUpdate[];
  invites: Invite[];
  weeklyProgress: WeeklyProgress[];
};

export type KrUpdateInput = {
  krId: string;
  updatedBy: string;
  newValue: number;
  progress: number;
  confidence: number;
  comment: string;
  hasBlocker: boolean;
  blockerDescription: string;
};

export type CreateKeyResultInput = {
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
  sortOrder: number;
};

export type InviteInput = {
  organizationId: string;
  invitedBy: string;
  email: string;
  role: Role;
};

export type OnboardingInput = {
  organizationName: string;
  organizationSlug: string;
  sector: string;
  teamName: string;
  teamDescription: string;
};

export type CreateTeamInput = {
  organizationId: string;
  name: string;
  description: string;
  color: string;
  ownerId: string;
};

export type CreateObjectiveInput = {
  organizationId: string;
  cycleId: string;
  teamId?: string;
  parentId?: string;
  title: string;
  description: string;
  ownerId: string;
  isCompanyOkr: boolean;
  createdBy: string;
};
