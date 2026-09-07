import { CommunityTeamPage } from "@/components/community/Profiles";
import { requirePageActor } from "@/lib/identity";

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageActor();
  const { id } = await params;
  return <CommunityTeamPage id={id}/>;
}