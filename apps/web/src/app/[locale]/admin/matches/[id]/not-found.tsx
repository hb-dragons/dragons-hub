import { useTranslations } from "next-intl";
import { Button } from "@dragons/ui/components/button";
import { Link } from "@/lib/navigation";

export default function MatchNotFound() {
  const t = useTranslations("errors");

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-bold">{t("notFound.matchTitle")}</h1>
      <p className="text-muted-foreground max-w-md">{t("notFound.matchDescription")}</p>
      <Button asChild>
        <Link href="/admin/matches">{t("goHome")}</Link>
      </Button>
    </div>
  );
}
