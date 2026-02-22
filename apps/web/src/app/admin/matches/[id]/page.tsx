import { notFound } from "next/navigation";
import { fetchAPIServer } from "@/lib/api.server";
import { APIError } from "@/lib/api";
import { MatchDetailView } from "@/components/admin/matches/match-detail-view";
import type { MatchDetailResponse } from "@/components/admin/matches/types";

interface MatchDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function MatchDetailPage({ params }: MatchDetailPageProps) {
  const { id } = await params;

  let data: MatchDetailResponse;
  try {
    data = await fetchAPIServer<MatchDetailResponse>(`/admin/matches/${id}`);
  } catch (e) {
    if (e instanceof APIError && e.status === 404) {
      notFound();
    }
    throw e;
  }

  return <MatchDetailView initialData={data} />;
}
