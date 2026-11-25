import * as fs from 'node:fs';
import * as path from 'node:path';
const types:Record<string,string>={'.html':'text/html; charset=utf-8','.png':'image/png','.json':'application/json; charset=utf-8','.md':'text/markdown; charset=utf-8','.css':'text/css; charset=utf-8'};
export const artifactCsp = "sandbox; default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'";
export function serveArtifact(root:string,file:string):Response {
  let fd:number|undefined;
  try{
    const base=fs.realpathSync(root);
    const resolved=fs.realpathSync(file);
    if(!resolved.startsWith(base+path.sep)||resolved!==file)return new Response('Not found',{status:404});
    const ext=path.extname(file);
    if(!types[ext])return new Response('Not found',{status:404});
    fd=fs.openSync(resolved,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
    const stat=fs.fstatSync(fd);
    if(!stat.isFile()||stat.size>24*1024*1024)return new Response('Not found',{status:404});
    const data=fs.readFileSync(fd);
    const inline=ext==='.html'||ext==='.png';
    return new Response(new Uint8Array(data),{headers:{
      'content-type':types[ext],'content-length':String(data.length),
      'content-disposition':(inline?'inline':'attachment')+'; filename="'+path.basename(file).replace(/[^a-zA-Z0-9_.-]/g,'_')+'"',
      'cache-control':'private, no-store','x-content-type-options':'nosniff',
      'content-security-policy':artifactCsp,'referrer-policy':'no-referrer',
      'cross-origin-resource-policy':'same-origin',
    }});
  }catch{return new Response('Not found',{status:404});}
  finally{if(fd!==undefined)fs.closeSync(fd);}
}
