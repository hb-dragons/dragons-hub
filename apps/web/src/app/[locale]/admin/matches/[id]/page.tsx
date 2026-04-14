import { notFound } from "next/navigation";
import { fetchAPIServer } from "@/lib/api.server";
import { APIError } from "@/lib/api";
import { MatchDetailPage as MatchDetailPageComponent } from "@/components/admin/matches/match-detail-page";
import type { MatchDetailResponse, MatchChangeHistoryResponse } from "@/components/admin/matches/types";

interface MatchDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function MatchDetailPage({ params }: MatchDetailPageProps) {
  const { id } = await params;
  const matchId = Number(id);

  let detail: MatchDetailResponse;
  try {
    detail = await fetchAPIServer<MatchDetailResponse>(`/admin/matches/${id}`);
  } catch (e) {
    if (e instanceof APIError && e.status === 404) {
      notFound();
    }
    throw e;
  }

  let history: MatchChangeHistoryResponse = { changes: [], total: 0 };
  try {
    history = await fetchAPIServer<MatchChangeHistoryResponse>(
      `/admin/matches/${id}/history?limit=50&offset=0`,
    );
  } catch {
    // History fetch failure is non-critical — page still renders
  }

  return (
    <MatchDetailPageComponent
      matchId={matchId}
      initialDetail={detail}
      initialHistory={history}
    />
  );
}
