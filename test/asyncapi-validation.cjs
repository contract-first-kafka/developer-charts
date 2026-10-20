const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {extract} = require('../charts/api/openapi/files/asyncapi/contract.cjs');
const YAML = require('../charts/api/openapi/files/asyncapi/node_modules/yaml');
const original = fs.readFileSync(__dirname+'/fixtures/asyncapi/order-events.yaml','utf8');
test('3.1 multi-message contract validates, bundles internal schemas and deduplicates shared payloads',async()=>{
 const result=await extract(original,'orders');
 assert.equal(result.artifacts.length,3);assert.equal(result.mappings.length,4);
 assert.notEqual(result.mappings[0].artifactId,result.mappings[1].artifactId);
 assert.equal(result.mappings[0].artifactId,result.mappings[2].artifactId);
 assert.equal(result.artifacts.filter(a=>a.artifactType==='AVRO').length,2);
 const json=JSON.parse(result.artifacts.find(a=>a.artifactType==='JSON').content);
 assert.match(json.properties.orderId.$ref,/^#\/\$defs\//);
 assert.equal(Object.values(json.$defs)[0].type,'string');
 const changed=YAML.parse(original);changed.info.description='Edited description';
 assert.deepEqual((await extract(YAML.stringify(changed),'orders')).mappings,result.mappings);
});
test('3.0 remains supported',async()=>assert.equal((await extract(original.replace('asyncapi: 3.1.0','asyncapi: 3.0.0'),'orders')).artifacts.length,3));
for(const [name,change,pattern] of [
 ['invalid AsyncAPI action',d=>d.operations.receiveOrders.action='invalid',/AsyncAPI validation failed/],
 ['dangling reference',d=>d.channels.orders.messages.accepted.$ref='#/missing',/Unresolved internal reference/],
 ['remote reference',d=>d.channels.orders.messages.accepted.$ref='https://example.com/schema',/Only internal/],
 ['invalid Avro type',d=>d.components.schemas.OrderAcceptedPayload.schema.fields[0].type='unknown',/invalid|undefined|Unknown/i],
 ['invalid JSON Schema',d=>d.components.schemas.Identifier.minLength=-1,/schema|minimum|>=/i],
 ['invalid message example',d=>d.components.messages.OrderAccepted.examples[0].payload.total='bad',/Invalid payload example/],
 ['unsupported schema format',d=>d.components.schemas.ShipmentPayload.schemaFormat='application/xml',/schema|Unsupported/i]
]) test(name,async()=>{const d=YAML.parse(original);change(d);await assert.rejects(extract(YAML.stringify(d),'orders'),pattern)});
const {verify}=require('../charts/api/openapi/files/asyncapi/verify-microcks.cjs');
test('Microcks completeness gate rejects silent example loss and accepts complete import',()=>{
 const doc={operations:{orders:{action:'receive',channel:{address:'orders'},messages:[{examples:[{name:'accepted',payload:{kind:'accepted'},headers:{ce_specversion:'1.0'}}]},{examples:[{name:'cancelled',payload:{kind:'cancelled'}}]}]}}};
 const view={service:{operations:[{name:'RECEIVE orders',resourcePaths:['orders']}]},messagesMap:{'RECEIVE orders':[{eventMessage:{content:'{"kind":"cancelled"}'}}]}};
 assert.throws(()=>verify(doc,view),/Microcks omitted example accepted/);
 view.messagesMap['RECEIVE orders'].push({eventMessage:{content:'{"kind":"accepted"}',headers:[{name:'ce_specversion',values:['1.0']}]}});
 assert.equal(verify(doc,view),2);
 view.messagesMap['RECEIVE orders'][1].eventMessage.headers=[];
 assert.throws(()=>verify(doc,view),/omitted header/);
});
