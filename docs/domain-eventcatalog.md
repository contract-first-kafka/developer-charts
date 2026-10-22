# Domain EventCatalog delivery

The Domain chart owns one catalog pipeline and, once image intent exists, one
Deployment/Service/Route in `<domain>-catalog`. These resources belong to the
existing Domain Argo CD Application; no additional Application is introduced.
Enable it with `spec.eventCatalog.enabled: true` in the Domain catalog entity.
The Domain golden path supplies the project in `eventcatalog/` automatically.

Discovery follows the Domain's designated build-environment System activation
files, checks each System's catalog membership, then follows `apis/*/values.yaml`
to the API repository and its catalog `spec.definition.$text`. AsyncAPI entities supply independent contracts; Component registrations supply real
Services and their exact message selections from event-contracts.json. Git revisions are resolved to SHAs and
published in `/build-inputs.json`. There is no separate contract inventory.
The current golden paths publish public Git repositories; discovery uses HTTPS
Git access and does not inject a GitHub credential into project build scripts.

The shared pipeline runs discovery, the Domain project’s CF-IDP build-time generator and the
EventCatalog server build, then uses the platform's shared buildah Task to push
an input-hash-tagged image to the namespace's Quay organization. Deployment uses
its immutable digest. A final platform-owned step creates and merges a PR that
changes only `spec.eventCatalog.image` and `inputDigest` in the Domain entity.
The existing platform GitHub App must be installed in the Domain organization
with contents and pull-request write permissions. Its credentials are projected
only into the intent step; the minted token is limited to the Domain repository.
Argo CD reconciles the resulting image intent. No pipeline deployment patch is
used. An ImageStream provisions the Quay repository through Quay Bridge, following
the existing Component chart convention. Existing Quay Bridge push/pull
credentials are reused through buildah's explicit dockerconfig workspace.

Domain, System and Component push webhooks signal the Domain's Tekton EventListener. GitHub
ping and non-main pushes are ignored. Successful AsyncAPI publication sends the
same refresh signal as a best-effort final step; it neither generates resources
nor waits for catalog delivery. An initial GitOps hook starts the first build.
Every signal rediscovers Git inputs. If effective source content matches the
published input digest, generation, image publication, and intent updates are
skipped. The image-intent commit is excluded from this fingerprint, preventing a
webhook rebuild loop. A native Kubernetes Lease coalesces overlapping signals: only its holder builds.
A successful build releases the lease and signals one final rediscovery to catch
changes received during the build. Unchanged runs release without signaling again.
Failed runs release without an automatic retry loop; signal refresh after fixing
the source. A later run can reclaim a lease whose owning PipelineRun has finished
or been deleted. No queue service or additional controller is introduced.

EventCatalog core 5.4.1, AsyncAPI parser 3.6.0, Avro schema parser 3.0.24 and
EventCatalog SDK 2.31.2 are pinned in the Domain project lockfile. The build-time
generator creates native Domains, Systems, real Component Services, independent
Events and Kafka Channels. It never creates a Service for an API contract, and
never infers Component roles from AsyncAPI operation direction. Contract-only
Systems retain discoverable events, payload schemas and documentation.

Component catalog metadata and event-contracts.json are fingerprinted; ordinary
application source edits do not force an image build. Pinned versions resolve to
exact Git commits or release tags, and selected revisions coexist with current
contracts. Missing versions or incompatible selections fail before generation.
Removed Component registrations remove only their derived Services and relations.
Existing Domain projects must receive the updated scripts and dependency lockfile
in place: template changes cannot update previously copied project files. Their
registered Component repositories also need the existing Domain push webhook.

Author architecture context in `eventcatalog/docs/` using native EventCatalog
Markdown/MDX frontmatter (`title` and `summary`). The overview is also included in
the generated Domain page during native Domain generation.
Generated resources and fetched inputs are ignored build outputs. Regeneration
does not edit authored pages. Additional native documentation pages are optional.

Core BSL 1.1 and build dependency notices are copied to `/LICENSES/` in the static
image. This synthetic non-production reference architecture is permitted;
enterprise production use may require a commercial license.

## Server runtime

The Domain scaffold enables EventCatalog 5.4.1 native MCP at `/docs/mcp` using
Streamable HTTP and serves the UI from the same Node.js container on port 8080.
The chart reserves 256Mi and allows 1Gi, with a 180-second startup probe budget
and five-second HTTP probe timeouts. No additional service or persistent volume
is introduced for the serving application. Build workspaces remain ephemeral.

Verify with an MCP client initialization and actual `tools/call` requests; probe
health and HTTP 200 alone do not prove contract retrieval. Check the scaffold
README for packaging, client configuration, licensing, and production security.
