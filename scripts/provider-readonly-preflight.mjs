const provider = process.argv[2];
const timeoutMs = 12_000;

function result(status, detail = {}) {
  process.stdout.write(
    `${JSON.stringify({
      provider,
      mode: "READ_ONLY_NO_GENERATION",
      status,
      ...detail,
    })}\n`,
  );
}

function statusFromError(error) {
  const candidate =
    error?.status ??
    error?.response?.status ??
    error?.cause?.status ??
    error?.cause?.response?.status;
  return Number.isInteger(candidate) ? candidate : null;
}

async function readJson(url, token, validate, extraHeaders = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    result("REMOTE_REJECTED", { httpStatus: response.status });
    return;
  }

  const body = await response.json();
  const metadata = validate(body);
  if (!metadata) {
    result("INVALID_RESPONSE", { httpStatus: response.status });
    return;
  }

  result("AUTHENTICATED", { httpStatus: response.status, ...metadata });
}

try {
  switch (provider) {
    case "aiand": {
      const token = process.env.AIAND_API_KEY;
      if (!token) {
        result("NOT_CONFIGURED");
        break;
      }
      await readJson("https://api.aiand.com/v1/models", token, (body) =>
        Array.isArray(body?.data) ? { itemCount: body.data.length } : null,
      );
      break;
    }

    case "gmi": {
      const token = process.env.GMI_API_KEY;
      if (!token) {
        result("NOT_CONFIGURED");
        break;
      }
      await readJson("https://api.gmi-serving.com/v1/models", token, (body) =>
        Array.isArray(body?.data) ? { itemCount: body.data.length } : null,
      );
      break;
    }

    case "daytona": {
      const token = process.env.DAYTONA_API_KEY;
      if (!token) {
        result("NOT_CONFIGURED");
        break;
      }
      await readJson(
        "https://app.daytona.io/api/api-keys/current",
        token,
        (body) =>
          body && typeof body === "object" && !Array.isArray(body)
            ? { objectReceived: true }
            : null,
      );
      break;
    }

    case "qoder": {
      const token = process.env.QODER_PERSONAL_ACCESS_TOKEN;
      if (!token) {
        result("NOT_CONFIGURED");
        break;
      }
      await readJson(
        "https://api.qoder.com/api/v1/cloud/agents?limit=1",
        token,
        (body) =>
          Array.isArray(body?.data) ? { itemCount: body.data.length } : null,
      );
      break;
    }

    case "nosana": {
      const token = process.env.NOSANA_API_KEY;
      if (!token) {
        result("NOT_CONFIGURED");
        break;
      }

      const { createNosanaClient, NosanaNetwork } = await import("@nosana/kit");
      const client = createNosanaClient(NosanaNetwork.MAINNET, {
        api: { apiKey: token },
      });
      const balance = await client.api.credits.balance();
      const fields = [
        balance?.assignedCredits,
        balance?.reservedCredits,
        balance?.settledCredits,
      ];
      if (!fields.every((value) => Number.isFinite(Number(value)))) {
        result("INVALID_RESPONSE");
        break;
      }
      result("AUTHENTICATED", { balanceShapeValid: true });
      break;
    }

    case "qwen": {
      const token = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY;
      if (!token) {
        result("NOT_CONFIGURED");
        break;
      }
      const baseUrl =
        process.env.QWEN_BASE_URL ||
        "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
      const model = process.env.QWEN_MODEL || "qwen3.6-flash";
      const region = process.env.QWEN_REGION || "intl";
      if (region !== "intl") {
        result("BLOCKED_INVALID_REGION");
        break;
      }
      const workspaceId = process.env.QWEN_WORKSPACE_ID;
      await readJson(
        `${baseUrl.replace(/\/$/, "")}/models`,
        token,
        (body) => {
          if (!Array.isArray(body?.data)) return null;
          const modelAvailable = body.data.some((entry) => entry?.id === model);
          return { itemCount: body.data.length, modelAvailable };
        },
        workspaceId ? { "X-DashScope-WorkSpace": workspaceId } : {},
      );
      break;
    }

    default:
      result("UNKNOWN_PROVIDER");
  }
} catch (error) {
  result("REQUEST_FAILED", { httpStatus: statusFromError(error) });
}
