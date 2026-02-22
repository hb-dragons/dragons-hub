"use client";

import { createContext, useContext, useState } from "react";

export interface ClubConfig {
  clubId: number;
  clubName: string;
}

export interface TrackedLeague {
  id: number;
  ligaNr: number;
  name: string;
  seasonName: string;
}

interface SettingsContextValue {
  clubConfig: ClubConfig | null;
  setClubConfig: (config: ClubConfig | null) => void;
  trackedLeagues: TrackedLeague[];
  setTrackedLeagues: (leagues: TrackedLeague[]) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

interface SettingsProviderProps {
  initialClubConfig: ClubConfig | null;
  initialTrackedLeagues: TrackedLeague[];
  children: React.ReactNode;
}

export function SettingsProvider({
  initialClubConfig,
  initialTrackedLeagues,
  children,
}: SettingsProviderProps) {
  const [clubConfig, setClubConfig] = useState<ClubConfig | null>(initialClubConfig);
  const [trackedLeagues, setTrackedLeagues] = useState<TrackedLeague[]>(initialTrackedLeagues);

  return (
    <SettingsContext.Provider
      value={{ clubConfig, setClubConfig, trackedLeagues, setTrackedLeagues }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
