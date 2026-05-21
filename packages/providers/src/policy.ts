import type { GenerationModality } from "@quillby/core";
import type { ProviderRouter } from "./router.js";

type DeploymentMode = "local" | "self-hosted" | "cloud";

export type ProviderSetupMode = "host-client" | "user-env" | "admin-env" | "managed-cloud";

export type ProviderCapability = {
  modality: GenerationModality;
  available: boolean;
  tier: "sampling" | "cloud" | "direct" | null;
  setupMode: ProviderSetupMode;
  message: string;
};

export type ProviderPolicyReport = {
  deploymentMode: DeploymentMode;
  recommendedPrimarySetup: ProviderSetupMode;
  capabilities: ProviderCapability[];
};

function preferredSetupFor(mode: DeploymentMode, modality: GenerationModality): ProviderSetupMode {
  if (mode === "cloud") return "managed-cloud";
  if (mode === "self-hosted") return "admin-env";
  return modality === "image" ? "host-client" : "user-env";
}

function messageFor(mode: DeploymentMode, modality: GenerationModality, tier: ProviderCapability["tier"]): string {
  if (tier === "sampling") {
    return modality === "image"
      ? "Uses your connected AI client. No provider key needed."
      : "Uses your connected AI client when supported by the host. No provider key needed.";
  }
  if (tier === "cloud") {
    return "Included in Quillby Cloud and billed through Quillby, with provider routing handled automatically.";
  }
  if (tier === "direct") {
    if (mode === "self-hosted") return "Configured once at deployment level by the admin/operator.";
    return "Configured from local environment variables for this machine.";
  }
  if (mode === "cloud") {
    return `Not enabled for ${modality}. Quillby Cloud should manage this automatically once the service provider is configured.`;
  }
  if (mode === "self-hosted") {
    return `Not enabled for ${modality}. Ask the deployment admin to add the provider environment variables.`;
  }
  return modality === "image"
    ? "Not enabled. Use a host client with image sampling support or add provider env vars locally."
    : "Not enabled. Add provider env vars locally to unlock this modality.";
}

export function getProviderPolicyReport(
  deploymentMode: DeploymentMode,
  router: ProviderRouter,
): ProviderPolicyReport {
  const modalities: GenerationModality[] = ["image", "audio", "video"];
  const capabilities: ProviderCapability[] = modalities.map((modality) => {
    const tier = router.resolvesTier(modality);
    return {
      modality,
      available: tier != null,
      tier,
      setupMode: preferredSetupFor(deploymentMode, modality),
      message: messageFor(deploymentMode, modality, tier),
    };
  });

  return {
    deploymentMode,
    recommendedPrimarySetup:
      deploymentMode === "cloud"
        ? "managed-cloud"
        : deploymentMode === "self-hosted"
          ? "admin-env"
          : "user-env",
    capabilities,
  };
}