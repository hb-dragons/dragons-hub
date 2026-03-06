import { RefereeMatchList } from "@/components/referee/referee-match-list";

export default function RefereeMatchesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Offene Schiedsrichter-Ansetzungen</h1>
      <RefereeMatchList />
    </div>
  );
}
