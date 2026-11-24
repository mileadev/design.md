import { authorized, requestOwner } from "@/lib/security/auth";
import { ownedArtifact, root } from "@/lib/security/jobs";
import { serveArtifact } from "@/lib/security/artifacts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request, {params}: {params: Promise<{path:string[]}>}) {
  const owner=requestOwner(req);
  if(!authorized(req)||!owner)return new Response("Forbidden",{status:403});
  const [id,...parts]=(await params).path;
  const file=ownedArtifact(owner,id,parts.join("/"));
  return file?serveArtifact(root,file):new Response("Not found",{status:404});
}
