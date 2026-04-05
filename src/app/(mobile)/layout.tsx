import { requireAuth } from "@/lib/auth-utils";
import { ActivityIcon, CheckSquareIcon, ZapIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { MobileNavLink } from "./mobile-nav-link";

const Layout = async ({ children }: { children: ReactNode }) => {
  await requireAuth();

  return (
    <div className="flex flex-col min-h-svh bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
        <div className="flex h-14 items-center px-4 gap-3">
          <Link href="/mobile" className="flex items-center gap-2">
            <ZapIcon className="size-5 text-primary" />
            <span className="font-semibold text-sm">PowerNode</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto pb-20">
        {children}
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/80 backdrop-blur-sm safe-bottom">
        <div className="flex h-16 items-center justify-around px-4">
          <MobileNavLink href="/mobile/executions" icon={ActivityIcon} label="Executions" />
          <MobileNavLink href="/mobile/approvals" icon={CheckSquareIcon} label="Approvals" />
        </div>
      </nav>
    </div>
  );
};

export default Layout;
