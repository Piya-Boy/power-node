import { CheckSquareIcon } from "lucide-react";

export const metadata = {
  title: "Approvals — PowerNode",
};

const Page = () => {
  return (
    <div className="px-4 py-4">
      <h1 className="text-lg font-semibold mb-4">Pending Approvals</h1>
      <ApprovalsEmpty />
    </div>
  );
};

const ApprovalsEmpty = () => (
  <div className="mt-12 flex flex-col items-center gap-3 text-center text-muted-foreground">
    <CheckSquareIcon className="size-12 opacity-30" />
    <p className="text-sm font-medium">No pending approvals</p>
    <p className="text-xs max-w-[240px]">
      When a workflow pauses for human approval, it will appear here for you to
      approve or reject.
    </p>
  </div>
);

export default Page;
