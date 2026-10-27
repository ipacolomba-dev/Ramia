import { usePathname } from "expo-router";

import type { Role } from "@/src/types";

/** Landing route of each role's protected area. */
export function homeFor(role?: Role | string | null): string {
  switch (role) {
    case "producer":
      return "/producer/dashboard";
    case "logistics":
      return "/logistics/spedizioni";
    case "collaborator":
      return "/compliance/servizi";
    case "admin":
      return "/admin/dashboard";
    default:
      return "/buyer/mercato";
  }
}

/** Area (first URL segment) the current screen lives in, e.g. "/producer". */
export function useAreaBase(): string {
  const pathname = usePathname();
  const seg = pathname.split("/").filter(Boolean)[0] ?? "buyer";
  return `/${seg}`;
}

/** Where regulatory alerts live for a role. */
export function alertsRouteFor(role?: Role | string | null): string {
  return role === "business" || role === "consumer" ? "/buyer/trattative/alerts" : "/producer/export/alerts";
}
