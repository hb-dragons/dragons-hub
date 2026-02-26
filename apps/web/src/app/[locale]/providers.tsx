"use client";

import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Link } from "@/lib/navigation";
import { authClient } from "@/lib/auth-client";

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <AuthUIProvider
      authClient={authClient}
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => {
        router.refresh();
      }}
      redirectTo="/admin"
      signUp={false}
      Link={Link}
    >
      {children}
    </AuthUIProvider>
  );
}
