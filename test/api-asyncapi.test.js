const assert=require('node:assert/strict');
const {chartValues,lint,render,resource}=require('./helpers/helm');
test('AsyncAPI uses existing hooks, triggers and credentials while validating before publication',()=>{
 const values=chartValues('charts/api/openapi');values.specificationType='asyncapi';values.apiName='events';
 lint('charts/api/openapi',values);const resources=render('charts/api/openapi',values);
 const tasks=new Map(resource(resources,'Pipeline','events-api').spec.tasks.map(t=>[t.name,t]));
 assert.deepEqual(tasks.get('publish-git-version').runAfter,['validate-extract']);
 assert.deepEqual(tasks.get('microcks-import').runAfter,['validate-extract']);
 assert.deepEqual(tasks.get('verify-microcks').runAfter,['microcks-import']);
 assert.ok(!JSON.stringify(tasks.get('microcks-import')).includes('insecure-tls'));
 assert.ok(resource(resources,'ConfigMap','events-asyncapi-tools').data['package-lock.json']);
 assert.ok(resource(resources,'Job','events-api-initial-publish'));
 assert.ok(resource(resources,'EventListener','events-api'));
});

test('only successful AsyncAPI publication signals the Domain, without waiting for its build',()=>{
 const values=chartValues('charts/api/openapi');values.specificationType='asyncapi';values.apiName='events';values.eventCatalogRefreshUrl='https://catalog-refresh.example';
 const pipeline=resource(render('charts/api/openapi',values),'Pipeline','events-api');
 const signal=pipeline.spec.finally[0];
 assert.deepEqual(signal.when,[{input:'$(tasks.status)',operator:'in',values:['Succeeded','Completed']}]);
 assert.equal(signal.taskSpec.steps[0].env[0].value,values.eventCatalogRefreshUrl);
 assert.match(signal.taskSpec.steps[0].script,/AbortSignal.timeout/);
 assert.match(signal.taskSpec.steps[0].script,/\.catch\(e=>console.log/);
 values.specificationType='openapi';
 assert.equal(resource(render('charts/api/openapi',values),'Pipeline','events-api').spec.finally,undefined);
});
