import { Catalog } from "@/components/Catalog";
import { requirePageActor } from "@/lib/identity";

export default async function CatalogPage() {
  await requirePageActor();
  return <Catalog/>;
}
