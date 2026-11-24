// HTTPS CONNECT only. DNS results are checked, then the socket uses the exact
// validated numeric address (never resolves the hostname again).
import http from 'node:http';
import net from 'node:net';
import { lookup } from 'node:dns/promises';
import { pathToFileURL } from 'node:url';

const denied = new net.BlockList();
for (const [ip, bits] of [
  ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],
  ['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],
  ['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],
  ['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4],
]) denied.addSubnet(ip,bits,'ipv4');
const globalV6 = new net.BlockList();
globalV6.addSubnet('2000::',3,'ipv6');
for (const [ip,bits] of [
  ['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20],
]) denied.addSubnet(ip,bits,'ipv6');
for (const cidr of (process.env.DESIGNMD_DENY_CIDRS || '').split(',').filter(Boolean)) {
  const [ip, bits] = cidr.trim().split('/');
  const family = net.isIP(ip);
  if (!family || !/^\d+$/.test(bits || '') || Number(bits) > (family===4?32:128)) throw new Error('Invalid deny CIDR');
  denied.addSubnet(ip,Number(bits),family===4?'ipv4':'ipv6');
}
export function publicAddress(ip) {
  const family=net.isIP(ip);
  if (family===4) return !denied.check(ip,'ipv4');
  if (family===6) return globalV6.check(ip,'ipv6') && !denied.check(ip,'ipv6');
  return false;
}
export async function resolvePublic(host, resolver=lookup) {
  const answers = net.isIP(host) ? [{address:host,family:net.isIP(host)}] : await resolver(host,{all:true,verbatim:true});
  if (!answers.length || answers.some(a=>!publicAddress(a.address)||a.family!==net.isIP(a.address))) throw new Error('Destination denied');
  return answers[0];
}
export function parseAuthority(authority) {
  if (typeof authority !== 'string' || authority.length>300 || !/^(?:\[[0-9a-f:.]+\]|[a-z0-9.-]+):443$/i.test(authority)) throw new Error('HTTPS port 443 required');
  const url=new URL('https://'+authority);
  const host=url.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'');
  if (!net.isIP(host) && (!host.includes('.') || /(?:^|\.)(?:localhost|local|internal|test|invalid|onion|home|arpa)$/i.test(host))) throw new Error('Destination denied');
  return host;
}
export function createProxy() {
  const server=http.createServer({maxHeaderSize:8192},(_req,res)=>{res.writeHead(405);res.end();});
  let active=0;
  server.maxConnections=128;
  server.on('connect',async(req,client,head)=>{
    client.on('error',()=>client.destroy());
    const reject=()=>{if(!client.destroyed) client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');};
    if(active>=64){reject();return;}
    active++;
    let upstream;
    let timer;
    let bytes=0;
    let released=false;
    const cleanup=()=>{if(released)return;released=true;active--;clearTimeout(timer);upstream?.destroy();};
    client.once('close',cleanup);
    timer=setTimeout(()=>client.destroy(),60_000);
    client.setTimeout(20_000,()=>client.destroy());
    try {
      const target=await resolvePublic(parseAuthority(req.url));
      if(client.destroyed)return;
      upstream=net.connect({host:target.address,port:443,family:target.family});
      upstream.setTimeout(20_000,()=>client.destroy());
      upstream.on('error',()=>client.destroy());
      upstream.once('close',()=>client.destroy());
      const meter=chunk=>{bytes+=chunk.length;if(bytes>25*1024*1024)client.destroy();};
      client.on('data',meter);upstream.on('data',meter);
      upstream.once('connect',()=>{
        if(client.destroyed){upstream.destroy();return;}
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if(head.length){meter(head);upstream.write(head);}
        client.pipe(upstream);upstream.pipe(client);
      });
    }catch{reject();}
  });
  return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  createProxy().listen(8081,'0.0.0.0',()=>console.log('Restricted HTTPS egress ready'));
}
