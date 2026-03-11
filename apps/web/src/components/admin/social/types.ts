export type PostType = "preview" | "results";

export interface MatchItem {
  id: number;
  teamLabel: string;
  opponent: string;
  isHome: boolean;
  kickoffDate: string;
  kickoffTime: string;
  homeScore: number | null;
  guestScore: number | null;
}

export interface PlayerPhoto {
  id: number;
  filename: string;
  originalName: string;
  width: number;
  height: number;
}

export interface Background {
  id: number;
  filename: string;
  originalName: string;
  width: number;
  height: number;
  isDefault: boolean;
}

export interface PlayerPosition {
  x: number;
  y: number;
  scale: number;
}

export interface WizardState {
  step: 1 | 2 | 3 | 4;
  postType: PostType;
  calendarWeek: number;
  year: number;
  matches: MatchItem[];
  selectedPhotoId: number | null;
  selectedPhoto: PlayerPhoto | null;
  selectedBackgroundId: number | null;
  playerPosition: PlayerPosition;
}
