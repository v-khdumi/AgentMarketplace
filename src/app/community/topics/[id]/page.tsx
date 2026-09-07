import { CommunityDiscussion } from "@/components/community/Discussion";
import { requirePageActor } from "@/lib/identity";

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageActor();
  const { id } = await params;
  return <CommunityDiscussion id={id}/>;
}