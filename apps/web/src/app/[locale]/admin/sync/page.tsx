import { getTranslations } from "next-intl/server";
import { fetchAPIServer } from "@/lib/api.server";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dragons/ui/components/tabs";
import { SyncProvider } from "@/components/admin/sync/sync-provider";
import { SyncTriggerButton } from "@/components/admin/sync/sync-trigger-button";
import { SyncErrorBanner } from "@/components/admin/sync/sync-error-banner";
import { SyncStatusCards } from "@/components/admin/sync/sync-status-cards";
import { SyncLiveLogsContainer } from "@/components/admin/sync/sync-live-logs-container";
import { SyncHistoryTable } from "@/components/admin/sync/sync-history-table";
import { SyncScheduleConfig } from "@/components/admin/sync/sync-schedule-config";
import type {
  SyncStatusResponse,
  LogsResponse,
  SyncScheduleData,
} from "@/components/admin/sync/types";

export default async function SyncPage() {
  const t = await getTranslations();
  let status: SyncStatusResponse | null = null;
  let logs: LogsResponse | null = null;
  let schedule: SyncScheduleData | null = null;
  let error: string | null = null;

  try {
    [status, logs, schedule] = await Promise.all([
      fetchAPIServer<SyncStatusResponse>("/admin/sync/status"),
      fetchAPIServer<LogsResponse>("/admin/sync/logs?limit=20&offset=0"),
      fetchAPIServer<SyncScheduleData>("/admin/sync/schedule"),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  return (
    <div className="space-y-6">
      <SyncProvider
        initialStatus={status}
        initialLogs={logs}
        initialSchedule={schedule}
        initialError={error}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {t("sync.title")}
            </h1>
            <p className="text-muted-foreground">
              {t("sync.description")}
            </p>
          </div>
          <SyncTriggerButton />
        </div>

        {/* Error Banner */}
        <SyncErrorBanner />

        {/* Status Cards */}
        <SyncStatusCards />

        {/* Live Logs */}
        <SyncLiveLogsContainer />

        {/* Tabs */}
        <Tabs defaultValue="history">
          <TabsList>
            <TabsTrigger value="history">{t("sync.tabs.history")}</TabsTrigger>
            <TabsTrigger value="schedule">{t("sync.tabs.schedule")}</TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="mt-4">
            <SyncHistoryTable />
          </TabsContent>

          <TabsContent value="schedule" className="mt-4">
            <SyncScheduleConfig />
          </TabsContent>
        </Tabs>
      </SyncProvider>
    </div>
  );
}
