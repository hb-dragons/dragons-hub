"use client";

import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Badge } from "@dragons/ui/components/badge";
import { CheckCircle2 } from "lucide-react";
import type { FieldDiff } from "./types";

interface MatchDivergenceTableProps {
  diffs: FieldDiff[];
}

export function MatchDivergenceTable({ diffs }: MatchDivergenceTableProps) {
  const t = useTranslations("matchDetail.divergence");

  const diverged = diffs.filter((d) => d.status === "diverged");

  return (
    <Card className={diverged.length > 0 ? "border-l-4 border-l-amber-500" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{t("title")}</CardTitle>
          {diverged.length > 0 && (
            <Badge variant="outline" className="border-amber-500 text-amber-600">
              {t("count", { count: diverged.length })}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {diverged.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            {t("allSynced")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-4 text-left font-medium text-muted-foreground">
                    {t("field")}
                  </th>
                  <th className="py-2 pr-4 text-left font-medium text-muted-foreground">
                    {t("remote")}
                  </th>
                  <th className="py-2 text-left font-medium text-muted-foreground">
                    {t("local")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {diverged.map((diff) => (
                  <tr key={diff.field} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-medium">{diff.label}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {diff.remoteValue ?? "\u2014"}
                    </td>
                    <td className="py-2 font-medium">
                      {diff.localValue ?? "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
