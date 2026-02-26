export interface VenueListItem {
  id: number;
  apiId: number;
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  latitude: string | null;
  longitude: string | null;
}
