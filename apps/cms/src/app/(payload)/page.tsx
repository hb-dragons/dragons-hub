import { redirect } from "next/navigation";

// The CMS has no public pages — the bare domain should land in the admin.
export default function RootPage(): never {
  redirect("/admin");
}
