import { getTranslations } from "next-intl/server";
import { fetchAPIServer } from "@/lib/api.server";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dragons/ui/components/tabs";
import { SyncRunProvider } from "@/components/admin/sync/sync-run-provider";
import { SyncCompletionWatcher } from "@/components/admin/sync/use-sync";
import { SyncTriggerButton } from "@/components/admin/sync/sync-trigger-button";
import { PageHeader } from "@/components/admin/shared/page-header";
import { SyncErrorBanner } from "@/components/admin/sync/sync-error-banner";
import { SyncStatusCards } from "@/components/admin/sync/sync-status-cards";
import { SyncLiveLogsContainer } from "@/components/admin/sync/sync-live-logs-container";
import { SyncHistoryTable } from "@/components/admin/sync/sync-history-table";
import { SyncScheduleConfig } from "@/components/admin/sync/sync-schedule-config";
import { RefereeSyncTab, RefereeSyncRunProvider } from "@/components/admin/sync/referee-sync-tab";
import { RefereeSyncCompletionWatcher } from "@/components/admin/sync/use-sync";
import type {
  SyncStatusResponse,
  PaginatedResponse,
  SyncRun,
  SyncScheduleData,
} from "@/components/admin/sync/types";

export default async function SyncPage() {
  const t = await getTranslations();
  let status: SyncStatusResponse | null = null;
  let logs: PaginatedResponse<SyncRun> | null = null;
  let schedule: SyncScheduleData | null = null;
  let refereeStatus: SyncStatusResponse | null = null;
  let refereeLogs: PaginatedResponse<SyncRun> | null = null;
  let refereeSchedule: SyncScheduleData | null = null;
  let error: string | null = null;

  try {
    [status, logs, schedule, refereeStatus, refereeLogs, refereeSchedule] = await Promise.all([
      fetchAPIServer<SyncStatusResponse>("/admin/sync/status"),
      fetchAPIServer<PaginatedResponse<SyncRun>>("/admin/sync/logs?limit=20&offset=0"),
      fetchAPIServer<SyncScheduleData>("/admin/sync/schedule"),
      fetchAPIServer<SyncStatusResponse>("/admin/sync/status?syncType=referee-games"),
      fetchAPIServer<PaginatedResponse<SyncRun>>(
        "/admin/sync/logs?limit=20&offset=0&syncType=referee-games",
      ),
      fetchAPIServer<SyncScheduleData>("/admin/sync/schedule?syncType=referee-games"),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("sync.title")} subtitle={t("sync.description")} />
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("sync.title")} subtitle={t("sync.description")} />

      <Tabs defaultValue="main">
        <TabsList>
          <TabsTrigger value="main">{t("sync.tabs.mainSync")}</TabsTrigger>
          <TabsTrigger value="referee">{t("sync.tabs.refereeGames")}</TabsTrigger>
        </TabsList>

        <TabsContent value="main" className="mt-4">
          <SyncRunProvider
            initialStatus={status}
            initialLogs={logs}
            initialSchedule={schedule}
          >
            <SyncCompletionWatcher />
            <div className="space-y-6">
              <div className="flex items-center justify-end">
                <SyncTriggerButton />
              </div>
              <SyncErrorBanner />
              <SyncStatusCards />
              <SyncLiveLogsContainer />
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
            </div>
          </SyncRunProvider>
        </TabsContent>

        <TabsContent value="referee" className="mt-4">
          <RefereeSyncRunProvider
            initialStatus={refereeStatus}
            initialLogs={refereeLogs}
            initialSchedule={refereeSchedule}
          >
            <RefereeSyncCompletionWatcher />
            <RefereeSyncTab />
          </RefereeSyncRunProvider>
        </TabsContent>
      </Tabs>
    </div>
  );
}
