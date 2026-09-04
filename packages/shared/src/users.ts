export interface UserListItem {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string | null;
  refereeId: number | null;
  /** The linked staff person, or null when the account is not staff. */
  personId: number | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: number | null;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}
