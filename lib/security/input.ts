import { normalizeUrl } from '../url-resolver';
export interface SafeRequest {url:string;maxPages:number;noDarkMode:boolean;withPhase3:boolean}
export function parseExtraction(input:unknown):SafeRequest {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid request');
  const b=input as Record<string,unknown>;
  if(typeof b.url!=='string'||b.url.length>2048||/[\x00-\x20\x7f]/.test(b.url.trim()))throw new Error('Invalid URL');
  if(Object.keys(b).some(k=>!['url','maxPages','noInteraction','noDarkMode','withPhase3'].includes(k)))throw new Error('Unknown option');
  const normalized=normalizeUrl(b.url);
  if(!normalized)throw new Error('Invalid URL');
  const url=new URL(normalized);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port&&url.port!=='443'||!url.hostname.includes('.')||url.hostname.endsWith('.local')||url.hostname.endsWith('.internal'))throw new Error('Public HTTPS URL without credentials, query or fragment required');
  const maxPages=b.maxPages??5;
  if(typeof maxPages!=='number'||!Number.isInteger(maxPages)||maxPages<1||maxPages>8)throw new Error('Invalid page limit');
  for(const k of ['noInteraction','noDarkMode','withPhase3'])if(b[k]!==undefined&&typeof b[k]!=='boolean')throw new Error('Invalid option');
  if(b.noInteraction===false)throw new Error('Interactive extraction is disabled');
  return {url:url.href,maxPages,noDarkMode:b.noDarkMode===true,withPhase3:b.withPhase3!==false};
}
export async function readSmallJson(req:Request):Promise<unknown>{
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')||!req.body)throw new Error('JSON required');
  const reader=req.body.getReader();
  let bytes=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});
  try{
    for(;;){
      const {value,done}=await reader.read();if(done)break;
      bytes+=value.byteLength;if(bytes>8192){await reader.cancel();throw new Error('Body too large');}
      text+=decoder.decode(value,{stream:true});
    }
    return JSON.parse(text+decoder.decode());
  }finally{reader.releaseLock();}
}
