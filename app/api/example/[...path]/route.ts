import * as path from "node:path";
import { authorized } from "@/lib/security/auth";
import { serveArtifact } from "@/lib/security/artifacts";
import { artifactName } from "@/lib/security/jobs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:Request,{params}:{params:Promise<{path:string[]}>}){
  if(!authorized(req))return new Response("Forbidden",{status:403});
  const [brand,...parts]=(await params).path;
  const name=parts.join("/");
  if(!["wise","stripe","ibm","linear","vercel","supabase","shopify"].includes(brand)||!artifactName(name))return new Response("Not found",{status:404});
  const root=path.resolve(process.cwd(),"examples");
  return serveArtifact(root,path.join(root,brand,name));
}
