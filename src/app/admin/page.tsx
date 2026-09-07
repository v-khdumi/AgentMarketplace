import { AdminCenter } from "@/components/AdminCenter";
import { requirePageActor } from "@/lib/identity";

export default async function AdminPage() {
  await requirePageActor(["admin", "reviewer"]);
  return <AdminCenter/>;
}