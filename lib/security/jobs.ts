import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

const TTL = 24 * 60 * 60 * 1000;
const MAX_JOB_BYTES = 128 * 1024 * 1024;
const MAX_TOTAL_BYTES = 768 * 1024 * 1024;
export const root = path.resolve(process.env.DESIGNMD_OUTPUT_DIR || path.join(process.cwd(), 'output'));
const stateRoot = path.resolve(process.env.DESIGNMD_STATE_DIR || path.join(process.cwd(), '.designmd-state'));
const MAX_JOBS = 12;
export const jobIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const known = new Set(['tokens.json','regenerated-ramp.json','tailwind.css','shadcn-theme.css','shadcn-omit-reason.md','preview.html','proof.html','report.html','DESIGN.md','prompts/universal.md']);
export function artifactName(name: string): boolean {
  return known.has(name) || /^screenshots\/(?:[a-zA-Z0-9_-]+\/)?[a-zA-Z0-9_.-]+\.png$/.test(name) && !name.split('/').some(x=>x.startsWith('.') || x.includes('..'));
}
function ensureDir(dir: string) {
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  if (fs.realpathSync(dir)!==dir || !fs.lstatSync(dir).isDirectory()) throw new Error('Unsafe storage root');
}
export interface Manifest {owner:string; expires:number; files:string[]}
function manifest(dir: string): Manifest | null {
  try {
    const f=path.join(dir,'.manifest.json');
    if (!fs.lstatSync(f).isFile() || fs.lstatSync(f).size>65536) return null;
    const data=JSON.parse(fs.readFileSync(f,'utf8'));
    return typeof data.owner==='string' && typeof data.expires==='number' && Array.isArray(data.files) && data.files.every((n:unknown)=>typeof n==='string'&&artifactName(n))?data:null;
  } catch {return null;}
}
function scan(dir:string,prefix=''): {files:string[];bytes:number} {
  const files:string[]=[];let bytes=0;
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const name=prefix+e.name;
    const p=path.join(dir,e.name);
    if(e.isSymbolicLink())throw new Error('Symlink in job storage');
    if(e.isDirectory()){
      const child=scan(p,name+'/');bytes+=child.bytes;files.push(...child.files);
    } else if(e.isFile()){
      bytes+=fs.statSync(p).size;if(artifactName(name))files.push(name);
    } else throw new Error('Unexpected file type');
    if(bytes>MAX_JOB_BYTES||files.length>256)throw new Error('Artifact budget exceeded');
  }
  return {files,bytes};
}
function prune() {
  ensureDir(root);
  let bytes=0,count=0;
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
    if(!entry.isDirectory()||!jobIdPattern.test(entry.name))continue;
    const dir=path.join(root,entry.name);
    const m=manifest(dir);
    if(!m || m.expires<=Date.now()){fs.rmSync(dir,{recursive:true,force:true});continue;}
    bytes+=scan(dir).bytes;count++;
  }
  if(count>=MAX_JOBS||bytes+MAX_JOB_BYTES>MAX_TOTAL_BYTES)throw new Error('Storage capacity reached');
}
let active=false;
let starts:number[]=[];
export function admit(owner:string): {id:string;dir:string;publish:()=>void;release:()=>void}|null {
  // One app replica, one active job, one global daily quota. A second
  // instance must not share this storage; use an external atomic queue first.
  if(active)return null;
  ensureDir(stateRoot);
  const state=path.join(stateRoot,'starts.json');
  if(fs.existsSync(state)){
    const stat=fs.lstatSync(state);
    if(!stat.isFile()||stat.size>65536)throw new Error('Invalid quota state');
    const data:unknown=JSON.parse(fs.readFileSync(state,'utf8'));
    if(!Array.isArray(data)||!data.every(x=>typeof x==='number'&&Number.isSafeInteger(x)))throw new Error('Invalid quota state');
    starts=data;
  }
  const now=Date.now();
  starts=starts.filter(t=>t>now-TTL);
  if(starts.length>=12)return null;
  prune();
  const id=randomUUID(),dir=path.join(root,id);
  fs.mkdirSync(dir,{mode:0o700});
  try {
    const temp=path.join(stateRoot,id+'.tmp');
    fs.writeFileSync(temp,JSON.stringify([...starts,now]),{mode:0o600,flag:'wx'});
    fs.renameSync(temp,state);starts.push(now);
  } catch(e){fs.rmSync(dir,{recursive:true,force:true});throw e;}
  active=true;
  let published=false,released=false;
  return {id,dir,publish(){
    const {files}=scan(dir);
    fs.writeFileSync(path.join(dir,'.manifest.json'),JSON.stringify({owner,expires:Date.now()+TTL,files}),{mode:0o600,flag:'wx'});
    published=true;
  },release(){
    if(released)return;released=true;
    try{if(!published)fs.rmSync(dir,{recursive:true,force:true});}
    finally{active=false;}
  }};
}
export function ownedArtifact(owner:string,id:string,name:string):string|null {
  if(!jobIdPattern.test(id)||!artifactName(name))return null;
  const dir=path.join(root,id);
  try{
    if(fs.realpathSync(dir)!==dir)return null;
    const m=manifest(dir);
    if(!m||m.owner!==owner||m.expires<=Date.now()||!m.files.includes(name))return null;
    return path.join(dir,name);
  }catch{return null;}
}
