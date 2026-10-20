const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const YAML = require('yaml');
const {Parser} = require('@asyncapi/parser');
const {AvroSchemaParser} = require('@asyncapi/avro-schema-parser');
const avsc = require('avsc');
const Ajv = require('ajv');
const Ajv2019 = require('ajv/dist/2019');
const Ajv2020 = require('ajv/dist/2020');
const formats = require('ajv-formats');
const stable = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const hash = value => crypto.createHash('sha256').update(stable(value)).digest('hex');

async function extract(text, apiId) {
  const doc = YAML.parse(text, {uniqueKeys: true, maxAliasCount: 100});
  if (!/^3\.(0|1)\.\d+$/.test(doc?.asyncapi)) throw Error('Expected supported AsyncAPI 3.0.x or 3.1.x');
  function pointer(ref) {
    if (typeof ref !== 'string' || !ref.startsWith('#/')) throw Error(`Only internal document references are allowed: ${ref}`);
    let obj = doc;
    for (const part of decodeURIComponent(ref.slice(2)).split('/')) {
      const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
      if (!obj || !Object.hasOwn(obj, key)) throw Error(`Unresolved internal reference: ${ref}`);
      obj = obj[key];
    }
    return obj;
  }
  function checkRefs(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Object.hasOwn(obj, '$ref')) pointer(obj.$ref);
    for (const value of Object.values(obj)) checkRefs(value);
  }
  checkRefs(doc); // Reject remote reads before invoking the AsyncAPI parser.
  const parser = new Parser();
  parser.registerSchemaParser(AvroSchemaParser());
  const parsed = await parser.parse(text);
  const errors = parsed.diagnostics.filter(d => d.severity === 0);
  if (!parsed.document || errors.length) throw Error('AsyncAPI validation failed:\n' + errors.map(d => `${d.path?.join('/')}: ${d.message}`).join('\n'));
  function resolve(obj, seen = new Set()) {
    if (!obj?.$ref) return obj;
    if (seen.has(obj.$ref)) throw Error(`Cyclic object reference: ${obj.$ref}`);
    return resolve(pointer(obj.$ref), new Set([...seen, obj.$ref]));
  }
  function avroBundle(obj, seen = new Set()) {
    if (!obj || typeof obj !== 'object') return obj;
    if (obj.$ref) {
      if (seen.has(obj.$ref)) throw Error('Use Avro named types for recursive records');
      return avroBundle(pointer(obj.$ref), new Set([...seen, obj.$ref]));
    }
    return Array.isArray(obj) ? obj.map(v => avroBundle(v, seen)) : Object.fromEntries(Object.entries(obj).map(([k,v]) => [k,avroBundle(v,seen)]));
  }
  function jsonBundle(schema) {
    const defs = {}, names = new Map();
    function visit(obj) {
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(visit);
      const result = {};
      for (const [k,v] of Object.entries(obj)) {
        if (k === '$ref') {
          if (!names.has(v)) {
            const name = 'ref_' + hash(v).slice(0,16);
            names.set(v,name); defs[name] = null;
            defs[name] = visit(pointer(v));
          }
          result.$ref = '#/$defs/' + names.get(v);
        } else result[k] = visit(v);
      }
      return result;
    }
    const result = visit(schema);
    if (Object.keys(defs).length) result.$defs = {...result.$defs, ...defs};
    return result;
  }
  const artifacts = new Map(), mappings = [];
  for (const [channelId, channelRef] of Object.entries(doc.channels || {})) {
    const channel = resolve(channelRef);
    for (const [messageId, messageRef] of Object.entries(channel.messages || {})) {
      const message = resolve(messageRef);
      if (!Object.hasOwn(message, 'payload')) throw Error(`${channelId}/${messageId}: payload is required for registry publication`);
      const payload = resolve(message.payload);
      const format = payload.schemaFormat || 'application/vnd.aai.asyncapi+json;version=' + doc.asyncapi;
      const raw = payload.schemaFormat ? payload.schema : payload;
      const type = /^application\/vnd\.apache\.avro;version=1\./.test(format) ? 'AVRO'
        : /^(application\/schema\+json|application\/vnd\.aai\.asyncapi\+json)/.test(format) ? 'JSON' : null;
      if (!type) throw Error(`Unsupported payload schemaFormat: ${format}`);
      const schema = type === 'AVRO' ? avroBundle(raw) : jsonBundle(raw);
      let validator;
      if (type === 'AVRO') validator = avsc.Type.forSchema(schema);
      else {
        const dialect = schema.$schema || '';
        const Engine = dialect.includes('2020-12') ? Ajv2020 : dialect.includes('2019-09') ? Ajv2019 : Ajv;
        const ajv = formats(new Engine({strict: false, allErrors: true, validateFormats: true}));
        if (!ajv.validateSchema(schema)) throw Error(`Invalid JSON Schema: ${ajv.errorsText()}`);
        validator = ajv.compile(schema);
      }
      for (const example of message.examples || []) {
        if (!Object.hasOwn(example, 'payload')) continue;
        const valid = type === 'AVRO' ? validator.isValid(example.payload) : validator(example.payload);
        if (!valid) throw Error(`Invalid payload example for ${channelId}/${messageId}: ${JSON.stringify(validator.errors || [])}`);
      }
      // Schema identity comes from a shared payload reference, otherwise the canonical message reference/name.
      // Explicit serializer coordinates work for both Avro and JSON and never collapse a topic's messages.
      const identity = message.payload.$ref || (payload.schemaFormat && payload.schema?.$ref)
        || messageRef.$ref || `${channelId}/${messageId}`;
      const artifactId = `${apiId}.payload.${hash(identity).slice(0,24)}`;
      const content = stable(schema);
      if (artifacts.has(artifactId) && artifacts.get(artifactId).content !== content) throw Error(`Schema identity collision: ${identity}`);
      artifacts.set(artifactId, {artifactId, artifactType:type, content, contentType:'application/json', schemaFormat:format, identity});
      mappings.push({channel:channelId, topic:channel.bindings?.kafka?.topic || channel.address, message:messageId, artifactId, artifactType:type, schemaFormat:format});
    }
  }
  if (!artifacts.size) throw Error('No message payload schemas found');
  return {artifacts:[...artifacts.values()], mappings};
}

if (require.main === module) (async () => {
  const [input, output, apiId] = process.argv.slice(2);
  const result = await extract(fs.readFileSync(input,'utf8'), apiId);
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(result,null,2));
  for (const item of result.artifacts) fs.writeFileSync(path.join(output,item.artifactId+'.json'),item.content);
  console.log(`Validated AsyncAPI: ${result.mappings.length} channel/message mappings, ${result.artifacts.length} distinct payload schemas`);
  console.log(JSON.stringify(result.mappings,null,2));
})().catch(error => { console.error(error.message); process.exitCode=1; });
module.exports = {extract};
