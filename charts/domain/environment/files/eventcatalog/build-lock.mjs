// One native Kubernetes Lease coalesces overlapping refresh signals per Domain.
// It is not an inventory or queue. A successful build signals a final rediscovery.
import fs from 'node:fs';
const [mode, namespace, run, uid, status] = process.argv.slice(2);
const token=fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token','utf8');
const server='https://kubernetes.default.svc';
async function api(path, method='GET', data) {
 const r=await fetch(server+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(15000)});
 if(!r.ok && ![404,409].includes(r.status))throw Error(`Kubernetes ${method}: HTTP ${r.status}`);
 return {status:r.status,body:r.status===404?null:await r.json()};
}
const base=`/apis/coordination.k8s.io/v1/namespaces/${namespace}/leases`,name='eventcatalog-build';
const lease=await api(base+'/'+name);
if(mode==='acquire') {
 if(lease.status===200) {
  const previous=await api(`/apis/tekton.dev/v1/namespaces/${namespace}/pipelineruns/${lease.body.spec.holderIdentity}`);
  const terminal=previous.status===404 || previous.body.status?.conditions?.some(c=>c.type==='Succeeded' && c.status!=='Unknown');
  if(terminal)await api(base+'/'+name,'DELETE',{preconditions:{uid:lease.body.metadata.uid}});
 }
 const created=await api(base,'POST',{apiVersion:'coordination.k8s.io/v1',kind:'Lease',metadata:{name,ownerReferences:[{apiVersion:'tekton.dev/v1',kind:'PipelineRun',name:run,uid}]},spec:{holderIdentity:run}});
 const acquired=created.status===201;
 fs.writeFileSync('/tekton/results/acquired',String(acquired));
 console.log(acquired?'Acquired Domain build lease':'An active Domain build owns the lease; refresh coalesced');
} else {
 if(lease.status===200 && lease.body.spec.holderIdentity===run)await api(base+'/'+name,'DELETE',{preconditions:{uid:lease.body.metadata.uid}});
 console.log('Released Domain build lease');
 // Succeeded means no tasks were skipped; an unchanged-input run is Completed.
 // The extra discovery catches upstream changes received while the lease was held.
 if(status==='Succeeded') {
  const r=await fetch('http://el-eventcatalog:8080',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Final rediscovery signal HTTP '+r.status);
  console.log('Signaled final rediscovery');
 }
}
