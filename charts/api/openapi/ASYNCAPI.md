# AsyncAPI contract publication

Set `specificationType: asyncapi` in the existing System `apis/<id>/values.yaml`.
OpenAPI remains the default. The same initial-publish hook, webhook listener, service
accounts and publisher secrets provision the specification pipeline.

The complete `specification.yaml` stays authoritative. Pinned AsyncAPI parser 3.6.6
validates 3.0/3.1, including internal references; Avro and JSON Schema validators
check native payloads and examples. External references and unsupported schema
formats fail before publication. Extracted files and the identity manifest live
only on the PipelineRun workspace PVC, never in Git. Runtime npm installation uses
a committed lockfile and requires access to the npm registry.

## Registry identity and Kafka clients

The contract artifact ID is the API ID in the existing System registry group.
Each payload artifact is `<api-id>.payload.<first-24-hex-of-sha256(identity)>`.
`identity` is the JSON-encoded internal payload reference, then a referenced
multi-format schema, then the canonical message reference, or finally the
`channel-key/message-key` for an inline message. IDs do not depend on content,
topic address or contract version. Keep these reference keys stable when evolving
schemas. Shared payload references deduplicate; distinct message identities never
collapse merely because they use the same topic. The validation log and workspace
`extracted/manifest.json` map every channel/message to its artifact ID and type.

Use Apicurio 3.x's explicit artifact coordinates for each message serializer:

```properties
apicurio.registry.url=<target schemaRegistry.apiUrl>
apicurio.registry.artifact.group-id=<System spec.groupId>
apicurio.registry.artifact.artifact-id=<mapping artifactId>
apicurio.registry.artifact.version=<published version>
apicurio.registry.auto-register=false
apicurio.registry.headers.enabled=true
```

The default `DynamicArtifactReferenceResolverStrategy` honors these coordinates.
Configure one serializer per payload identity (or an application resolver that
selects those same coordinates); the default topic-only identity is unsuitable for
multiple messages on one topic. A reused payload may use the same artifact across
topics. Supply normal registry OAuth credentials independently of these public
coordinates. Use the published version returned in `extracted/published.json`:
unchanged content can reuse an older commit version.

For header mode, pass Kafka Headers to the serializer/deserializer; Apicurio's
headers convey its schema identity. They are separate from CloudEvents `ce_*`
binary-mode headers. Standard Kafka bindings can declare `schemaIdLocation:
header`, `schemaRegistryUrl`, and `schemaRegistryVendor: apicurio`. Do not claim
Confluent's four-byte ID payload encoding when using Apicurio headers. Schema IDs
(`globalId`, `contentId`) and artifact coordinates are different identifiers;
let the matching Apicurio serde encode/decode them. JSON and Avro have different
native encodings even when they share the same Kafka topic.

Main commits use `FIND_OR_CREATE_VERSION` and their Git SHA; unchanged content is
reused. Existing release tags use `CREATE_VERSION` and retain the original release
semantics. No test tags are needed. Payloads receive a BACKWARD compatibility rule
before subsequent updates; an existing administrator-selected rule is preserved.
Registry rule failures fail publication. Publication across several artifacts is
not transactional: rerun after fixing a failure to complete publication safely.

Microcks receives the entire original document using the existing authenticated
CLI integration with TLS verification. Import does not provision Kafka or enable
the optional Microcks async minion. Availability of Kafka/WS mocking depends on
those installed capabilities. Pipeline success alone is not proof of Kafka
serializer interoperability.

Installed Microcks 1.14.0 accepts AsyncAPI 3.1 but its importer retains only the
last message's examples in a multi-message operation, and ignores examples when
`operation.messages` is omitted. Use one explicit message per operation when full
example import is needed; several operations may still share the same Kafka topic.
A post-import gate verifies all operations, channels, supplied payload examples
and headers, and fails if Microcks silently drops any. The full source contract is
always imported unchanged. This is a Microcks capability limit, not a restriction
on registry schema extraction.
