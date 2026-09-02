# AWS sandbox request — what we asked for

Submitted via the IDBI Innovate sandbox access form. Recorded here so the infra plan is not lost
in a form somewhere.

## Shape of the stack

Deliberately small. No GPU, no training, no model hosting.

| Service | Purpose |
|---|---|
| EC2 (1× t3.medium, 24/7) | Application backend, advisory orchestration, suitability and projection maths |
| Lambda | Scheduled nudge triggers — salary day, FD maturity. Low invocation volume |
| RDS PostgreSQL (db.t3.micro, 20 GB) | Consent ledger, risk profiles, suitability and audit records |
| S3 (~20 GB) | Static app build, synthetic datasets, audit artefacts |
| VPC | Private subnets |
| Bedrock | All AI inference — text reasoning and speech-to-speech. Specific models TBD |
| Secrets Manager, CloudWatch, IAM | Keys, logging, access control |

Region: **Mumbai (ap-south-1) only.** All PII and audit data stay in India under DPDP and RBI
localisation rules.

Estimated cost: **US$150–250/month.** Most of it Bedrock inference; ~$30 EC2, ~$20 RDS, ~$15
everything else.

## The critical ask

> **Outbound HTTPS (port 443) egress from the sandbox VPC to hosted model APIs, for any capability
> not available in ap-south-1.**

Bank sandbox VPCs frequently ship with no outbound internet at all, or an allow-list requiring a
separate security review. If that is the case here and the request is not on record, **the voice
conversation — the centrepiece of the prototype — simply will not function**, and we would find
out weeks in.

Have `api.openai.com` and `api.anthropic.com` ready to hand over when their network team asks for
specific domains.

## Open question

Whether **Amazon Nova Sonic** (speech-to-speech via Bedrock) is available in `ap-south-1`.

- If yes: the voice layer becomes fully in-region and the external API dependency disappears
  entirely. Strong compliance story.
- If no: we keep gpt-realtime and rely on the egress rule.

Either way we are covered, but it decides whether Phase 2 includes a voice-layer migration.
