"use client";
import type { ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { can, type Resource, type Action } from "@dragons/shared";

export function Can<R extends Resource>({
  resource,
  action,
  children,
  fallback = null,
}: {
  resource: R;
  action: Action<R>;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { data: session } = authClient.useSession();
  if (!session?.user) return <>{fallback}</>;
  return <>{can(session.user, resource, action) ? children : fallback}</>;
}
