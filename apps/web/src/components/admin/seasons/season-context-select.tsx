"use client";
import useSWR from "swr";
import { queries } from "@/lib/swr-queries";

export function SeasonContextSelect({ value, onChange }: { value: number | null; onChange: (id: number) => void }) {
  const q = queries.seasons();
  const { data: seasons } = useSWR(q.key, q.fetcher);
  return (
    <select value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))}>
      {(seasons ?? []).map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}
