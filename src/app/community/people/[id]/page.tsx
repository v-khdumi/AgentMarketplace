import { CommunityProfilePage } from "@/components/community/Profiles";
import { requirePageActor } from "@/lib/identity";

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageActor();
  const { id } = await params;
  return <CommunityProfilePage id={id}/>;
}