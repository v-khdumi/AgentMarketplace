import { CommunityHub } from "@/components/community/CommunityHub";
import { requirePageActor } from "@/lib/identity";

export default async function CommunityPage() {
  await requirePageActor();
  return <CommunityHub/>;
}