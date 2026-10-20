const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const crypto=require('node:crypto');const {spawnSync}=require('node:child_process');
const {repositoryRoot:root}=require('./helpers/paths');

test('image intent preserves Domain metadata and retries GitHub transient mergeability without rebuilding',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-intent-'));
 try {
  const mock=path.join(temp,'github.mjs');
  fs.writeFileSync(mock,`
import assert from 'node:assert/strict';
let merges=0;
globalThis.fetch=async(url,options)=>{
 const p=new URL(url).pathname,q=new URL(url).search;const method=options.method;const body=options.body?JSON.parse(options.body):null;
 let data={},status=200;
 if(p==='/orgs/demo/installation')data={id:1};
 else if(p==='/app/installations/1/access_tokens'){assert.deepEqual(body.repositories,['demo-domain']);data={token:'test-token'};}
 else if(p.endsWith('/contents/catalog-info.yaml') && method==='GET')data=q==='?ref=main'?{sha:'blob',content:Buffer.from('kind: Domain\\nmetadata:\\n  name: demo\\n  description: Keep authored identity\\nspec:\\n  eventCatalog:\\n    enabled: true\\n').toString('base64')}:{sha:'blob'};
 else if(p.endsWith('/contents/catalog-info.yaml') && method==='PUT'){const content=Buffer.from(body.content,'base64').toString();assert.match(content,/Keep authored identity/);assert.match(content,/inputDigest: abc123/);assert.match(content,/image: quay.example/);data={commit:{sha:'new-head'}};}
 else if(p.endsWith('/git/ref/heads/main'))data={object:{sha:'base'}};
 else if(p.includes('/git/ref/heads/eventcatalog-image-'))status=404;
 else if(p.endsWith('/git/refs'))assert.equal(body.sha,'base');
 else if(p.endsWith('/pulls') && method==='GET')data=[];
 else if(p.endsWith('/pulls') && method==='POST')data={number:1,html_url:'https://example.invalid/pr/1'};
 else if(p.endsWith('/pulls/1'))data={mergeable:true};
 else if(p.endsWith('/pulls/1/merge')){assert.equal(body.sha,'new-head');merges++;if(merges===1)status=405;else data={merged:true};}
 else throw Error('Unexpected request '+method+' '+p);
 return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
};
process.on('exit',()=>assert.equal(merges,2));
`);
  const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const result=spawnSync(process.execPath,['--import',mock,path.join(root,'charts/domain/environment/files/eventcatalog/publish-intent.mjs'),'https://github.com/demo/demo-domain.git','quay.example/catalog@sha256:'+'a'.repeat(64),'abc123'],{encoding:'utf8',env:{...process.env,PROJECT:path.join(root,'test'),GITHUB_APP_ID:'1',GITHUB_APP_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'})}});
  expect(result.status).toBe(0);expect(result.stderr).toBe('');expect(result.stdout).toContain('Updated GitOps intent');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
