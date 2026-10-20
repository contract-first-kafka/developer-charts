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
