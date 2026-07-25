export type ProviderMode =
  | "live"
  | "verified_sample"
  | "fallback"
  | "not_configured";

export type ProviderErrorCode =
  | "auth_failed"
  | "quota_exceeded"
  | "rate_limited"
  | "timeout"
  | "transport_failed"
  | "schema_invalid"
  | "semantic_invalid"
  | "budget_blocked"
  | "budget_unknown"
  | "lifecycle_unknown"
  | "config_missing"
  | "response_empty"
  | "model_not_found"
  | "payload_too_large"
  | "provider_http_error";

export type ProviderValidation =
  | "schema_and_semantic_passed"
  | "verified_sample"
  | "not_run"
  | "failed";

