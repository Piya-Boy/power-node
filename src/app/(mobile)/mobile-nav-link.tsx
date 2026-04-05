"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileNavLinkProps {
  href: string;
  icon: LucideIcon;
  label: string;
}

export const MobileNavLink = ({ href, icon: Icon, label }: MobileNavLinkProps) => {
  const pathname = usePathname();
  const isActive = pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center gap-1 px-6 py-2 rounded-lg transition-colors",
        isActive
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-5" />
      <span className="text-xs font-medium">{label}</span>
    </Link>
  );
};
