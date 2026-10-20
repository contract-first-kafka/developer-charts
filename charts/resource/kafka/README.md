# Kafka Resource

Requires Red Hat Streams for Apache Kafka 3.2 (installed by platform-components).
Uses Kafka 4.2 and KRaft combined broker/controller node pools. One replica is a
non-HA development default; three replicas tolerate one node failure. PVCs are
retained on deletion. Size and storage class are environment configuration.

The internal plaintext listener is restricted by the operator's NetworkPolicy to
pods in the same namespace. This initial profile is for trusted System workloads;
it does not offer external access, user authentication, or a production security
profile. Extend listener/authentication policy before using it for other trust boundaries.

`<clusterName>-connection` contains `KAFKA_BOOTSTRAP_SERVERS`. Components reference
that ConfigMap through `runtime.env[].valueFrom.configMapKeyRef` in their System
environment values; no workshop hostname is embedded in application code.

The existing System Resource ApplicationSet discovers `resources/kafka/*` and
creates the resource application. No Kafka-specific ApplicationSet is needed.
