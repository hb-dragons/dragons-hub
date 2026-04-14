"use client";

import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import { ThemeProvider, useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { Link } from "@/lib/navigation";
import { authClient } from "@/lib/auth-client";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster theme={resolvedTheme === "dark" ? "dark" : "light"} />;
}

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
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
        <ThemedToaster />
      </AuthUIProvider>
    </ThemeProvider>
  );
}
