# Domain EventCatalog delivery

The Domain chart owns one catalog pipeline and, once image intent exists, one
Deployment/Service/Route in `<domain>-catalog`. These resources belong to the
existing Domain Argo CD Application; no additional Application is introduced.
Enable it with `spec.eventCatalog.enabled: true` in the Domain catalog entity.
The Domain golden path supplies the project in `eventcatalog/` automatically.

Discovery follows the Domain's designated build-environment System activation
files, checks each System's catalog membership, then follows `apis/*/values.yaml`
to the API repository and its catalog `spec.definition.$text`. Only AsyncAPI
entities become native generator inputs. Git revisions are resolved to SHAs and
published in `/build-inputs.json`. There is no separate contract inventory.
The current golden paths publish public Git repositories; discovery uses HTTPS
Git access and does not inject a GitHub credential into project build scripts.

The shared pipeline runs discovery, the official AsyncAPI generator and the
EventCatalog static build, then uses the platform's shared buildah Task to push
an input-hash-tagged image to the namespace's Quay organization. Deployment uses
its immutable digest. A final platform-owned step creates and merges a PR that
changes only `spec.eventCatalog.image` and `inputDigest` in the Domain entity.
The existing platform GitHub App must be installed in the Domain organization
with contents and pull-request write permissions. Its credentials are projected
only into the intent step; the minted token is limited to the Domain repository.
Argo CD reconciles the resulting image intent. No pipeline deployment patch is
used. Existing Quay Bridge push/pull credentials are reused.

Domain and System push webhooks signal the Domain's Tekton EventListener. GitHub
ping and non-main pushes are ignored. Successful AsyncAPI publication sends the
same refresh signal as a best-effort final step; it neither generates resources
nor waits for catalog delivery. An initial GitOps hook starts the first build.
Every signal rediscovers Git inputs. If effective source content matches the
published input digest, generation, image publication, and intent updates are
skipped. The image-intent commit is excluded from this fingerprint, preventing a
webhook rebuild loop. Independent overlapping signals may run discovery in
parallel; this demo does not implement a distributed build queue.

EventCatalog 5.4.1 and generator-asyncapi 7.1.0 are pinned with the project lockfile.
The native generator handles messages, channels (`parseChannels: true`), schemas,
examples, specifications, and contract versions. Message IDs are prefixed with
the contract Service ID to keep independent contracts distinct. No AsyncAPI
parser, EventCatalog SDK integration, or custom resource generator is added.

Generator 7.1.0 has no native System configuration. It creates contract Services
under the Domain; Service names and summaries identify the source System and
owner. These are explicitly independent contracts, not deployed Components.
Native sends/receives reflect contract operations and do not prove real runtime
producer/consumer relationships. Typed System nodes and implementation ownership
are not synthesized. An empty Domain serves authored documentation without
invented contract resources.

Author architecture context in `eventcatalog/docs/` using native EventCatalog
Markdown/MDX frontmatter (`title` and `summary`). The overview is also included in
the generated Domain page through the generator's standard Markdown callback.
Generated resources and fetched inputs are ignored build outputs. Regeneration
does not edit authored pages. Additional native documentation pages are optional.

Core BSL 1.1 and generator MIT notices are copied to `/LICENSES/` in the static
image. This synthetic non-production reference architecture is permitted;
enterprise production use may require a commercial license.
