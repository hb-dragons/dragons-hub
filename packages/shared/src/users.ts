export interface UserListItem {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string | null;
  refereeId: number | null;
  /** The linked `team_staff` row, or null when the account is not staff. */
  staffId: number | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: number | null;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}
