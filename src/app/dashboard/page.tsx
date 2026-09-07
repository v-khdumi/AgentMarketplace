import { Workspace } from "@/components/Workspace";
import { requirePageActor } from "@/lib/identity";

export default async function DashboardPage() {
  await requirePageActor();
  return <Workspace/>;
}