export interface RefereeListItem {
  id: number;
  apiId: number;
  firstName: string | null;
  lastName: string | null;
  licenseNumber: number | null;
  matchCount: number;
  roles: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RefereeListResponse {
  items: RefereeListItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
