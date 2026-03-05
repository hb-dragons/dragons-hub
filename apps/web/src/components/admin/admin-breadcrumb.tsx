"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "@/lib/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@dragons/ui/components/breadcrumb";

const segmentKeys = {
  matches: "nav.matches",
  standings: "nav.standings",
  teams: "nav.teams",
  referees: "nav.referees",
  board: "nav.board",
  bookings: "nav.bookings",
  venues: "nav.venues",
  sync: "nav.sync",
  settings: "nav.settings",
  users: "nav.users",
} as const;

type Segment = keyof typeof segmentKeys;

export function AdminBreadcrumb() {
  const pathname = usePathname();
  const t = useTranslations();

  const segments = pathname.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
  const segment = segments[0] as Segment | undefined;

  if (!segment || !(segment in segmentKeys)) {
    return null;
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbPage>{t("nav.brand")}</BreadcrumbPage>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden md:block" />
        <BreadcrumbItem>
          <BreadcrumbPage>{t(segmentKeys[segment])}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
