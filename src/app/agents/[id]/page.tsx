import { AgentDetailView } from "@/components/AgentDetailView";
import { requirePageActor } from "@/lib/identity";

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageActor();
  const { id } = await params;
  return <AgentDetailView key={id} id={id}/>;
}