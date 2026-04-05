import { prefetchExecutions } from "@/features/executions/server/prefetch";
import { HydrateClient } from "@/trpc/server";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { MobileExecutionList, MobileExecutionListError, MobileExecutionListLoading } from "./mobile-execution-list";

export const metadata = {
  title: "Executions — PowerNode",
};

const Page = async () => {
  prefetchExecutions({ page: 1, pageSize: 20 });

  return (
    <div className="px-4 py-4">
      <h1 className="text-lg font-semibold mb-4">Recent Executions</h1>
      <HydrateClient>
        <ErrorBoundary fallback={<MobileExecutionListError />}>
          <Suspense fallback={<MobileExecutionListLoading />}>
            <MobileExecutionList />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </div>
  );
};

export default Page;
