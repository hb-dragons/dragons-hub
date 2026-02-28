import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/navigation";

export default async function HomePage() {
  const t = await getTranslations("public");

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6">
      <h1 className="text-3xl font-bold">Dragons</h1>
      <nav className="flex flex-col gap-3 text-center">
        <Link
          href="/schedule"
          className="rounded-lg border px-6 py-3 font-medium hover:bg-muted"
        >
          {t("schedule")}
        </Link>
        <Link
          href="/standings"
          className="rounded-lg border px-6 py-3 font-medium hover:bg-muted"
        >
          {t("standings")}
        </Link>
        <Link
          href="/teams"
          className="rounded-lg border px-6 py-3 font-medium hover:bg-muted"
        >
          {t("teams")}
        </Link>
        <Link
          href="/admin"
          className="mt-4 text-sm text-muted-foreground hover:text-foreground"
        >
          {t("adminLink")} →
        </Link>
      </nav>
    </div>
  );
}
