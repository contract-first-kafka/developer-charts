const fs = require('node:fs');
const enc = encodeURIComponent;
(async () => {
  const [source, output, apiId, groupId, version, mode] = process.argv.slice(2);
  const base = process.env.REGISTRY_URL.replace(/\/$/,'');
  const tokenResponse = await fetch(process.env.APICURIO_AUTH_SERVER_URL + '/protocol/openid-connect/token', {
    method:'POST', body:new URLSearchParams({grant_type:'client_credentials',client_id:process.env.APICURIO_CLIENT_ID,client_secret:process.env.APICURIO_CLIENT_SECRET})
  });
  if (!tokenResponse.ok) throw Error(`Registry authentication failed: HTTP ${tokenResponse.status}`);
  const token = (await tokenResponse.json()).access_token;
  async function api(path, method='GET', body) {
    const response = await fetch(base+path,{method, headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body && JSON.stringify(body)});
    const text = await response.text();
    if (!response.ok) { const error = Error(`${method} ${path}: HTTP ${response.status}: ${text}`); error.status=response.status; throw error; }
    return text ? JSON.parse(text) : null;
  }
  const manifest = JSON.parse(fs.readFileSync(output+'/manifest.json','utf8'));
  const artifacts = [{artifactId:apiId, artifactType:'ASYNCAPI', content:fs.readFileSync(source,'utf8'),contentType:'application/yaml'},...manifest.artifacts];
  const results = [];
  for (const artifact of artifacts) {
    const collection = `/groups/${enc(groupId)}/artifacts`;
    const resource = collection+'/'+enc(artifact.artifactId);
    let exists = false;
    try {
      const current = await api(resource); exists=true;
      if (current.artifactType !== artifact.artifactType) throw Error(`Artifact type collision: ${artifact.artifactId}`);
    } catch(error) { if (error.status!==404) throw error; }
    // Install compatibility before updating an existing payload. Do not overwrite an administrator's rule.
    async function ensureCompatibility() {
      if (artifact.artifactType==='ASYNCAPI') return;
      try { await api(resource+'/rules/COMPATIBILITY'); }
      catch(error) {
        if(error.status!==404) throw error;
        try { await api(resource+'/rules','POST',{ruleType:'COMPATIBILITY',config:'BACKWARD'}); }
        catch(error) { if(error.status!==409) throw error; }
      }
    }
    if(exists) await ensureCompatibility();
    const result = await api(collection+'?ifExists='+enc(mode)+'&canonical=true','POST',{
      artifactId:artifact.artifactId,artifactType:artifact.artifactType,
      firstVersion:{version,content:{content:artifact.content,contentType:artifact.contentType}}
    });
    await ensureCompatibility();
    results.push({artifactId:artifact.artifactId,artifactType:artifact.artifactType,...result.version});
    console.log(`Published ${artifact.artifactType} ${groupId}/${artifact.artifactId}: version=${result.version?.version} globalId=${result.version?.globalId} contentId=${result.version?.contentId}`);
  }
  fs.writeFileSync(output+'/published.json',JSON.stringify({groupId,artifacts:results,mappings:manifest.mappings},null,2));
})().catch(error => {console.error(error.message);process.exitCode=1;});
