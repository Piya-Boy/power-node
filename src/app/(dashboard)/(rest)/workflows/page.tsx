import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  WorkflowsContainer,
  WorkflowsError,
  WorkflowsInsightsError,
  WorkflowsInsightsLoading,
  WorkflowsList,
  WorkflowsLoading,
} from "@/features/workflows/components/workflows";
import { WorkflowsInsights } from "@/features/workflows/components/workflows-insights";
import { workflowsParamsLoader } from "@/features/workflows/server/params-loader";
import {
  prefetchWorkflowInsights,
  prefetchWorkflows,
} from "@/features/workflows/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";

type Props = {
  searchParams: Promise<SearchParams>;
};

const Page = async ({ searchParams }: Props) => {
  await requireAuth();

  const params = await workflowsParamsLoader(searchParams);
  prefetchWorkflows(params);
  prefetchWorkflowInsights(30);

  return (
    <WorkflowsContainer>
      <HydrateClient>
        <ErrorBoundary fallback={<WorkflowsInsightsError />}>
          <Suspense fallback={<WorkflowsInsightsLoading />}>
            <WorkflowsInsights />
          </Suspense>
        </ErrorBoundary>
        <ErrorBoundary fallback={<WorkflowsError />}>
          <Suspense fallback={<WorkflowsLoading />}>
            <WorkflowsList />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </WorkflowsContainer>
  );
};

export default Page;
