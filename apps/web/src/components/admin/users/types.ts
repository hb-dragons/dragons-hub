export interface UserListItem {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: number | null;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
}
