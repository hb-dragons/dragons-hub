import { permanentRedirect } from "next/navigation";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  permanentRedirect(`/${locale}/admin/referees?tab=referees`);
}
