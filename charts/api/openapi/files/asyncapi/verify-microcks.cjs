const fs=require('node:fs');
const YAML=require('yaml');
const stable=value=>JSON.stringify(value,(_,v)=>v && !Array.isArray(v) && typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
function verify(doc, view) {
 function resolve(obj) {
  if(!obj?.$ref)return obj;
  const value=obj.$ref.slice(2).split('/').reduce((value,key)=>value[key.replace(/~1/g,'/').replace(/~0/g,'~')],doc);
  return resolve(value);
 }
 let count=0;
 for(const [operationId,ref] of Object.entries(doc.operations || {})) {
  const operation=resolve(ref),channel=resolve(operation.channel);
  const name=operation.action.toUpperCase()+' '+operationId;
  const imported=view.service.operations.find(op=>op.name===name);
  if(!imported)throw Error(`Microcks omitted operation ${name}`);
  const topic=channel.bindings?.kafka?.topic || channel.address;
  if(topic && !imported.resourcePaths.includes(topic))throw Error(`Microcks omitted channel ${topic}`);
  const messages=operation.messages || Object.values(channel.messages || {});
  const actual=(view.messagesMap[name] || []).map(exchange=>exchange.eventMessage || exchange.request);
  for(const ref of messages) for(const example of resolve(ref).examples || []) {
   if(!Object.hasOwn(example,'payload'))continue;
   const match=actual.find(event=>{
    try{return stable(JSON.parse(event.content))===stable(example.payload);}catch{return false;}
   });
   if(!match)throw Error(`Microcks omitted example ${example.name || '(unnamed)'} from ${name}. Microcks 1.14 requires explicit operation.messages and retains only the last message's examples per operation; use one explicit message per operation. The original contract was not transformed.`);
   for(const [header,value] of Object.entries(example.headers || {})) {
    if(!match.headers?.some(h=>h.name===header && h.values.includes(String(value))))throw Error(`Microcks omitted header ${header} for ${name}`);
   }
   count++;
  }
 }
 return count;
}
if(require.main===module)(async()=>{
 const doc=YAML.parse(fs.readFileSync(process.argv[2],'utf8'));
 const auth=await fetch(process.env.AUTH_SERVER_URL+'/protocol/openid-connect/token',{method:'POST',body:new URLSearchParams({grant_type:'client_credentials',client_id:process.env.MICROCKS_CLIENT_ID,client_secret:process.env.MICROCKS_CLIENT_SECRET})});
 if(!auth.ok)throw Error(`Microcks authentication failed: HTTP ${auth.status}`);
 const token=(await auth.json()).access_token;
 async function get(path) {
  const response=await fetch(process.env.MICROCKS_URL+'/api'+path,{headers:{Authorization:'Bearer '+token}});
  if(!response.ok)throw Error(`Microcks ${path}: HTTP ${response.status}`);
  return response.json();
 }
 let service;
 for(let page=0;;page++) {
  const services=await get(`/services?page=${page}&size=100`);
  service=services.find(s=>s.name===doc.info.title && s.version===doc.info.version);
  if(service || services.length<100)break;
 }
 if(!service)throw Error('Microcks did not retain the imported contract');
 const count=verify(doc,await get('/services/'+encodeURIComponent(service.id)));
 console.log(`Verified Microcks service ${service.id}: all operations/channels and ${count} message examples with headers`);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={verify};
