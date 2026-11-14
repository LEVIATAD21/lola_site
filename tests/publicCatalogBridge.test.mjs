import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicCatalogBridge} from '../functions/_shared/publicCatalogBridge.js';
test('public bridge forwards only GET catalog requests without browser credentials',async()=>{
 const old=globalThis.fetch;
 let sent;
 globalThis.fetch=async (url,options)=>{sent={url,options};return new Response('{"products":[]}',{headers:{'Content-Type':'application/json','Set-Cookie':'private=x'}});};
 try {
 const context={request:new Request('https://shop.example/api/catalog',{headers:{Cookie:'admin=private',Authorization:'Bearer private'}})};
 const response=await publicCatalogBridge(context,'/catalog');
 assert.equal(response.status,200);
 assert.equal(sent.url,'https://lola-admin-api.pages.dev/api/public/catalog');
 assert.equal(sent.options.credentials,'omit');
 assert.equal(sent.options.redirect,'error');
 assert.deepEqual(sent.options.headers,{Accept:'application/json'});
 assert.equal(response.headers.get('set-cookie'),null);
 assert.equal(response.headers.get('cache-control'),'no-store');
 sent=null;
 assert.equal((await publicCatalogBridge(context,'/../admin/catalog')).status,404);
 assert.equal(sent,null);
 assert.equal((await publicCatalogBridge({request:new Request('https://shop.example',{method:'POST'})},'/catalog')).status,405);
 assert.equal(sent,null);
 globalThis.fetch=async()=>new Response('<html>error</html>',{headers:{'Content-Type':'text/html'}});
 assert.equal((await publicCatalogBridge(context,'/catalog')).status,503);
 globalThis.fetch=async()=>{throw new Error('offline');};
 assert.equal((await publicCatalogBridge(context,'/catalog')).status,503);
 }finally{globalThis.fetch=old;}
});
