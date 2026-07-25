import { CaptureClient } from "@/components/capture-client";
import { ProcessSteps } from "@/components/process-steps";
import { SiteHeader } from "@/components/site-header";

export default function CapturePage() {
  return (
    <>
      <SiteHeader />
      <main className="app-shell">
        <ProcessSteps current={1} />
        <CaptureClient />
      </main>
    </>
  );
}

