import { describe,it,expect } from 'vitest';
import { parseExtraction } from '../input';
describe('extraction admission',()=>{
 it('accepts a normal URL',()=>expect(parseExtraction({url:'example.com'}).url).toBe('https://example.com/'));
 it('rejects unsafe options',()=>{
  for(const input of [{url:'http://example.com'},{url:'https://a:b@example.com'},{url:'https://example.com/?token=x'},{url:'example.com',maxPages:100},{url:'example.com',noInteraction:false},{url:'example.com',unknown:true}])expect(()=>parseExtraction(input)).toThrow();
 });
});
