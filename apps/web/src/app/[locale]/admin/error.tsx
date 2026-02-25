"use client";

import { useTranslations } from "next-intl";
import { Button } from "@dragons/ui/components/button";
import { Link } from "@/lib/navigation";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted-foreground max-w-md">{t("description")}</p>
      <div className="flex gap-3">
        <Button onClick={reset}>{t("tryAgain")}</Button>
        <Button variant="outline" asChild>
          <Link href="/admin/matches">{t("goHome")}</Link>
        </Button>
      </div>
    </div>
  );
}
