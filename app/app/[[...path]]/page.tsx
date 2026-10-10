import Workspace from "@/components/workspace";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  if (
    path.length &&
    ![
      "library",
      "papers",
      "discover",
      "queue",
      "notes",
      "teams",
      "settings",
    ].includes(path[0])
  )
    notFound();
  return <Workspace />;
}
