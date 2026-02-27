"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Button } from "@dragons/ui";
import { Moon, Sun } from "lucide-react";

export function ThemeSettings() {
  const t = useTranslations();
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.theme.title")}</CardTitle>
        <CardDescription>{t("settings.theme.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Button
            variant={resolvedTheme === "light" ? "default" : "outline"}
            onClick={() => setTheme("light")}
          >
            <Sun className="mr-2 h-4 w-4" />
            {t("settings.theme.light")}
          </Button>
          <Button
            variant={resolvedTheme === "dark" ? "default" : "outline"}
            onClick={() => setTheme("dark")}
          >
            <Moon className="mr-2 h-4 w-4" />
            {t("settings.theme.dark")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
