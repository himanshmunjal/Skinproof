import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { ScanResult } from "./scan-result";

// The scan id is request-time URL data, so the client view streams in inside Suspense (Next 16 Cache Components).
export default function ScanResultPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Spinner className="size-6 text-accent" />
        </div>
      }
    >
      <ScanResult />
    </Suspense>
  );
}
