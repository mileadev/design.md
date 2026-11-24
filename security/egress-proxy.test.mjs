import test from 'node:test';
import assert from 'node:assert/strict';
import { publicAddress, resolvePublic, parseAuthority } from './egress-proxy.mjs';
test('denies private and special addresses',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','100.64.0.1','192.168.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('1.1.1.1'),true);
 assert.equal(publicAddress('2606:4700:4700::1111'),true);
});
test('mixed DNS answers fail closed',async()=>{
 await assert.rejects(resolvePublic('example.com',async()=>[{address:'1.1.1.1',family:4},{address:'10.0.0.1',family:4}]));
});
test('CONNECT only permits HTTPS port',()=>{
 assert.equal(parseAuthority('example.com:443'),'example.com');
 for(const value of ['localhost:443','foo.internal:443','example.com:80','user@example.com:443'])assert.throws(()=>parseAuthority(value));
});
