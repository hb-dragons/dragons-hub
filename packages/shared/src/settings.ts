export interface ClubConfig {
  clubId: number;
  clubName: string;
}

export interface BookingSettings {
  bufferBefore: number;
  bufferAfter: number;
  gameDuration: number;
  dueDaysBefore: number;
}

export const BOOKING_DEFAULTS: BookingSettings = {
  bufferBefore: 60,
  bufferAfter: 60,
  gameDuration: 90,
  dueDaysBefore: 7,
};
