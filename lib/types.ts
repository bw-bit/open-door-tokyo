import type {
  ProviderErrorCode,
  ProviderMode,
  ProviderValidation
} from "./providers/contract";

export type {
  ProviderErrorCode,
  ProviderMode,
  ProviderValidation
} from "./providers/contract";

export type LocalizedText = {
  ja: string;
  en: string;
};

export type FieldStatus =
  | "ai_observed"
  | "staff_stated"
  | "staff_measured"
  | "confirmed"
  | "unknown"
  | "conflict";

export type EvidenceSection =
  | "entrance"
  | "path_to_seat"
  | "communication"
  | "restroom";

export type ProviderId =
  | "qwen"
  | "gmi"
  | "aiand"
  | "nosana"
  | "daytona";

export type CardState =
  | "draft"
  | "uploading"
  | "frames_ready"
  | "transcribing"
  | "analyzing"
  | "auditing"
  | "review"
  | "staff_confirmed"
  | "phrasing"
  | "card_built"
  | "sandbox_checked"
  | "published"
  | "degraded";

export interface VenueBrief {
  cardId: string;
  name: string;
  category: "cafe" | "restaurant" | "other";
  sourceUrl?: string;
  address?: LocalizedText;
  googleMapsUrl?: string;
  location?: { lat: number; lng: number };
  languages: ("ja" | "en")[];
  createdAt: string;
}

export interface Provenance {
  kind: "video_frame" | "audio_transcript" | "staff_input" | "system";
  frameId?: string;
  tSec?: number;
  transcriptSpan?: {
    startSec: number;
    endSec: number;
    text: string;
  };
  staffLabel?: LocalizedText;
  capturedAt: string;
}

export interface EvidenceFrame {
  frameId: string;
  tSec: number;
  url: string;
  alt: LocalizedText;
}

export interface EvidenceItem {
  id: string;
  field: string;
  section: EvidenceSection;
  label: LocalizedText;
  description: LocalizedText;
  value: string | number | boolean | null;
  unit?: "cm" | "step" | "seat";
  status: FieldStatus;
  confidence: number;
  provenance: Provenance[];
  staffPrompt?: LocalizedText;
  requiredForPublish?: boolean;
  confirmedByStaff?: boolean;
  conflictWith?: {
    source: Provenance;
    value: string | number | boolean;
  };
  lastVerifiedAt: string | null;
}

export interface BlockedClaim {
  text: string;
  rule: string;
  reason: LocalizedText;
  suggestion: LocalizedText;
  resolved: boolean;
}

export interface SafetyAudit {
  passedDeterministic: boolean;
  blocked: BlockedClaim[];
  llmVerdicts: {
    claim: string;
    verdict: "supported" | "unsupported";
    reason: string;
    rewrite?: LocalizedText;
  }[];
  auditedBy: {
    deterministic: true;
    gmi: ProviderMode;
  };
  auditedAt: string;
}

export interface ProviderTrace {
  provider: ProviderId;
  mode: ProviderMode;
  task: LocalizedText;
  model?: string;
  requestId?: string;
  startedAt: string;
  latencyMs: number;
  ok: boolean;
  errorCode?: ProviderErrorCode;
  reservationId?: string;
  validation?: ProviderValidation;
  detail?: LocalizedText;
}

export interface SandboxAudit {
  mode: ProviderMode;
  previewUrl?: string;
  checksRun: number;
  issuesFound: number;
  issuesFixed: number;
  humanReviewNeeded: number;
  repairedIssue?: LocalizedText;
}

export interface AccessCard {
  schemaVersion: 1;
  brief: VenueBrief;
  state: CardState;
  items: EvidenceItem[];
  unknowns: string[];
  conflicts: string[];
  safetyAudit: SafetyAudit;
  traces: ProviderTrace[];
  sandbox?: SandboxAudit;
  frames: EvidenceFrame[];
  publishedAt: string | null;
  lastVerifiedAt: string | null;
  updatedAt: string;
}

export interface ExtractedFramePayload {
  frameId: string;
  tSec: number;
  dataUrl?: string;
  fixtureUrl?: string;
}

export interface AnalyzeRequest {
  cardId: string;
  brief: Omit<VenueBrief, "cardId" | "createdAt">;
  frames: ExtractedFramePayload[];
  transcript?: string;
  useFixture?: boolean;
}

export interface StaffConfirmation {
  field: string;
  value: string | number | boolean;
  method: "staff_stated" | "staff_measured";
}

export interface ConfirmRequest {
  cardId: string;
  confirmations: StaffConfirmation[];
}

export interface ProviderResult<T> {
  data: T;
  trace: ProviderTrace;
}
