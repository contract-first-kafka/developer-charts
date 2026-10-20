import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(process.env.PROJECT+'/package.json');const YAML=require('yaml');
const [repository, image, fingerprint]=process.argv.slice(2);
const {pathname}=new URL(repository);const [org,repo]=pathname.replace(/^\//,'').replace(/\.git$/,'').split('/');
const now=Math.floor(Date.now()/1000),b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const message=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iat:now-60,exp:now+540,iss:process.env.GITHUB_APP_ID});
const jwt=message+'.'+crypto.sign('RSA-SHA256',Buffer.from(message),process.env.GITHUB_APP_PRIVATE_KEY).toString('base64url');
async function api(path,token,data,method=data?'POST':'GET') {
 const response=await fetch('https://api.github.com'+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
 if(!response.ok)throw Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
 return response.status===204?null:response.json();
}
const installation=await api(`/orgs/${org}/installation`,jwt);
const {token}=await api(`/app/installations/${installation.id}/access_tokens`,jwt,{repositories:[repo],permissions:{contents:'write',pull_requests:'write'}});
const base=`/repos/${org}/${repo}`;
const target=await api(base+'/contents/catalog-info.yaml?ref=main',token);
const current=YAML.parse(Buffer.from(target.content,'base64').toString());
if(current.spec.eventCatalog?.inputDigest===fingerprint && current.spec.eventCatalog?.image===image){console.log('GitOps intent already current');process.exit(0);}
current.spec.eventCatalog={...current.spec.eventCatalog,enabled:true,image,inputDigest:fingerprint};
const head=(await api(base+'/git/ref/heads/main',token)).object.sha;
const branch='eventcatalog-image-'+fingerprint.slice(0,20);
let branchExists=true;try{await api(base+'/git/ref/heads/'+branch,token);}catch{branchExists=false;}
if(!branchExists)await api(base+'/git/refs',token,{ref:'refs/heads/'+branch,sha:head});
const branchFile=await api(base+'/contents/catalog-info.yaml?ref='+branch,token);
const updated=await api(base+'/contents/catalog-info.yaml',token,{message:'Deploy EventCatalog input '+fingerprint.slice(0,12),branch,sha:branchFile.sha,content:Buffer.from(YAML.stringify(current)).toString('base64')},'PUT');
const existing=await api(base+'/pulls?state=open&head='+encodeURIComponent(org+':'+branch),token);
const pr=existing[0] || await api(base+'/pulls',token,{head:branch,base:'main',title:'Deploy Domain EventCatalog '+fingerprint.slice(0,12),body:'Generated image intent only. Authoritative contracts and authored architecture documentation remain in Git. Image: `'+image+'`.'});
const merged=await api(base+'/pulls/'+pr.number+'/merge',token,{sha:updated.commit.sha,merge_method:'merge'},'PUT');
if(!merged.merged)throw Error('GitOps image-intent PR could not be merged');
console.log(`Updated GitOps intent through ${pr.html_url}: ${image}`);
