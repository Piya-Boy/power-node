import { prefetchExecution } from "@/features/executions/server/prefetch";
import { HydrateClient } from "@/trpc/server";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { MobileExecutionDetail, MobileExecutionDetailError, MobileExecutionDetailLoading } from "./mobile-execution-detail";

type Props = {
  params: Promise<{ id: string }>;
};

export const generateMetadata = async ({ params }: Props) => {
  const { id } = await params;
  return { title: `Execution ${id} — PowerNode` };
};

const Page = async ({ params }: Props) => {
  const { id } = await params;
  prefetchExecution(id);

  return (
    <div className="px-4 py-4">
      <HydrateClient>
        <ErrorBoundary fallback={<MobileExecutionDetailError />}>
          <Suspense fallback={<MobileExecutionDetailLoading />}>
            <MobileExecutionDetail id={id} />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </div>
  );
};

export default Page;
