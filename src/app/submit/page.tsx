import { AgentEditor } from "@/components/AgentEditor";
import { requirePageActor } from "@/lib/identity";

export default async function SubmitPage() {
  await requirePageActor(["publisher", "reviewer", "admin"]);
  return <AgentEditor/>;
}