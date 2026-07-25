const providerRequirements = {
  qwen: [],
  gmi: ["GMI_API_KEY", "GMI_MODEL"],
  aiand: ["AIAND_API_KEY", "AIAND_MODEL"],
  nosana: ["NOSANA_API_KEY", "NOSANA_JOB_ID"],
  daytona: ["DAYTONA_API_KEY", "DAYTONA_TARGET"],
  storage: ["BLOB_READ_WRITE_TOKEN"]
} as const;

export type ProviderPresence = Record<keyof typeof providerRequirements, boolean>;

export function providerPresence(
  env: Record<string, string | undefined> = process.env
): ProviderPresence {
  return Object.fromEntries(
    Object.entries(providerRequirements).map(([provider, names]) => [
      provider,
      names.every((name) => typeof env[name] === "string" && env[name]!.length > 0) &&
        (provider !== "qwen" ||
          Boolean(
            (typeof env.DASHSCOPE_API_KEY === "string" && env.DASHSCOPE_API_KEY.length > 0) ||
            (typeof env.QWEN_API_KEY === "string" && env.QWEN_API_KEY.length > 0)
          ) &&
            (env.QWEN_REGION === undefined ||
              env.QWEN_REGION === "" ||
              env.QWEN_REGION === "intl"))
    ])
  ) as ProviderPresence;
}
