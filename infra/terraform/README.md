# Terraform: the AWS deployment

One root module, two environments, applied from a laptop or from `deploy.yml` when the target
account allows a CI identity ([ADR-0010](../../docs/architecture/adr/ADR-0010.md)). This file is
the runbook: a fresh account to a running deployment in under 45 minutes, then the four things
an operator does during the review window. What the topology is and why is in
[`TESTING-AND-DEPLOYMENT.md`](../../docs/architecture/TESTING-AND-DEPLOYMENT.md).

## What it creates

| File | Resources |
|---|---|
| `main.tf` | Providers (`ap-south-1`, plus `us-east-1` for the CloudFront certificate), the commented S3 backend, shared locals |
| `variables.tf` | Every knob, with defaults that match the team sandbox |
| `vpc.tf` | VPC, two public and two private subnets over two AZs, one NAT gateway, three security groups (ALB, task, database) |
| `rds.tf` | Postgres 16 db.t4g.micro, private, encrypted, `rds.force_ssl`, 7-day backups; parameter group allowing `vector` |
| `ecs.tf` | ECR repository, Fargate cluster, execution and task roles, the API task definition (1 vCPU / 2 GB, secrets injected, 120 s stop timeout), the seed task definition, the service with `desired_count = 1` |
| `alb.tf` | ALB reachable only from CloudFront's origin-facing ranges, target group on `/api/v1/health`, HTTPS listener with an ACM certificate when a domain is set |
| `cdn.tf` | Private S3 bucket with Origin Access Control, CloudFront with `/` → S3 and `/api/*` → ALB (caching disabled, all viewer headers forwarded), SPA error fallback |
| `secrets.tf` | `dhan-sarthi/<env>/runway`, `/database`, `/operator` in Secrets Manager |
| `observability.tf` | Log group (14 days), SNS topic, alarms (ALB 5xx, no healthy task, RDS CPU, RDS storage, avatar minutes at 80 %), dashboard |
| `budget.tf` | AWS Budgets monthly cost alarm |
| `outputs.tf` | URL, bucket, distribution id, ECR, cluster and service names, secret ARNs, the egress request |

Monthly cost at `ap-south-1` list prices is about US$115–130: NAT ≈ $35, Fargate ≈ $35, ALB ≈
$20, RDS ≈ $18, the rest ≈ $8.

## Prerequisites

- Terraform ≥ 1.6 and the AWS CLI v2, authenticated as an identity that can create the above
  (`AdministratorAccess` in a sandbox is the honest answer).
- Docker with buildx, to build the API image for `linux/amd64`.
- `pnpm` and Node 22, to build the web bundle.
- Optional: a Route 53 hosted zone for a custom domain. Without one the CloudFront hostname is
  the URL and everything still works.

## The ten-step apply

Every step names the command and what a successful run prints. Times are from the Day 8
rehearsal in a clean account.

1. **Choose the environment.** `export ENV=team-sandbox` (or `idbi-sandbox`). Edit
   `envs/$ENV.tfvars`: `alert_email`, and `domain_name` + `hosted_zone_id` if you have them.
   (1 min)

2. **Init.** `cd infra/terraform && terraform init`. Prints `Terraform has been successfully
   initialized!`. Local state is fine for the first apply; the S3 backend block in `main.tf`
   has the commands to switch later. (1 min)

3. **Plan.** `terraform plan -var-file=envs/$ENV.tfvars -out=$ENV.tfplan`. Expect roughly 60
   resources to add and nothing to change or destroy. Read the plan; it is the review artefact.
   (2 min)

4. **Apply.** `terraform apply $ENV.tfplan`. RDS takes the longest (8–12 minutes); CloudFront
   distribution creation is asynchronous and finishes in the background. Outputs print at the
   end; keep the terminal. (15 min)

5. **Confirm the alarm subscription.** If `alert_email` was set, open the SNS confirmation email
   and click the link. Until then alarms fire into the topic and reach nobody. (1 min)

6. **Put the Runway credentials in Secrets Manager.** Terraform created the secret with empty
   values and will never overwrite it:

   ```bash
   aws secretsmanager put-secret-value \
     --secret-id "dhan-sarthi/$ENV/runway" \
     --secret-string '{"RUNWAY_API_KEY":"<key>","RUNWAY_CHARACTER_ID":"<character>"}'
   ```

   Comma-separated lists pool more than one account; entries pair by index. Skip this step to
   run with the avatar disabled; the text tier answers instead. (2 min)

7. **Build and push the API image.** `infra/scripts/deploy-api.sh $ENV v1.0.0-review`. Builds
   `apps/api/Dockerfile` for `linux/amd64`, pushes to the ECR repository from the outputs,
   re-applies with `api_image_tag` set to the tag, and waits for the service to be stable. The
   first run stabilises only after step 8 because the task cannot reach a database with no
   schema; that is expected. (8 min)

8. **Migrate and seed.** `infra/scripts/seed-remote.sh $ENV`. Runs the seed task definition as a
   one-off Fargate task with the migrate connection string, follows its log stream, and exits
   with the task's exit code. Expect `seed ok` with the content hash and row counts. Reseed
   later with `infra/scripts/seed-remote.sh $ENV --force`. (4 min)

9. **Build and publish the web bundle.** `infra/scripts/deploy-web.sh $ENV`. Exports
   `apps/mobile` for the web platform with `expo export` and syncs the resulting
   `apps/mobile/dist` to the bucket (`_expo/**` and `assets/**` immutable, `index.html` and
   `metadata.json` no-cache), then invalidates `/*` on the distribution. The API URL is baked in
   at export time as `EXPO_PUBLIC_API_URL`. (3 min)

10. **Smoke.** `infra/scripts/smoke.sh "$(terraform output -raw app_url)"`. Health, customers,
    a session, a view, a decision, availability. Every line prints `ok` and the script exits 0.
    Open the URL on a phone. (2 min)

## Operator runbook

| Situation | Action |
|---|---|
| A credential is stuck (a browser died mid-call, the lease has not expired) | `curl -X POST -H "X-Operator-Key: $(aws secretsmanager get-secret-value --secret-id dhan-sarthi/$ENV/operator --query SecretString --output text \| jq -r .OPERATOR_KEY)" "$APP_URL/api/v1/operator/avatar/release-all"` |
| Reseed (numbers must match the generator again, or the seed changed) | `infra/scripts/seed-remote.sh $ENV --force`. Refuses without `--force` while sessions exist. |
| Rotate the Runway key | `aws secretsmanager put-secret-value` as in step 6, then `aws ecs update-service --cluster <cluster> --service <service> --force-new-deployment`. Secrets are read at task start. |
| Kill switch: stop all avatar spend now | Set `AVATAR_ENABLED = "false"` in `api_environment` (tfvars override or `-var`), `terraform apply`, which forces a new deployment. The product keeps running on the text tier. |
| Deploy a new API build | `infra/scripts/deploy-api.sh $ENV <tag>` outside an announced demo window. Rolling with a 120 s drain; a live call at deploy time is ended gracefully with `end_reason='deploy'`. |
| Deploy a new web build | `infra/scripts/deploy-web.sh $ENV` |
| See what is happening | CloudWatch dashboard `dhan-sarthi-$ENV`; logs in `/dhan-sarthi/$ENV/api`; `GET /api/v1/health` for db, seed hash, breaker and RPC count |
| Tear down (team sandbox) | `terraform destroy -var-file=envs/team-sandbox.tfvars`. The bucket and ECR repository are `force_destroy` there; RDS skips the final snapshot. In `idbi-sandbox` both protections are on and must be lifted first. |

## Egress the bank's network team must allow

The task sits in a private subnet and leaves through one NAT gateway whose Elastic IP is in the
outputs (`egress_request`). The security group allows outbound TCP 443 and UDP
50000–60000. A per-hostname allow-list cannot be expressed on a NAT gateway; where the bank
requires one, AWS Network Firewall (or their existing egress proxy) in front of the NAT is the
place, and the list is:

- `api.dev.runwayml.com` — TCP 443 (session create, poll, consume, cancel, transcript)
- `*.livekit.cloud` — TCP 443 (signalling and TURN/TLS fallback) and UDP 50000–60000 (media)
- AWS service endpoints for ECR, Secrets Manager and CloudWatch Logs in `ap-south-1` (or VPC
  endpoints, which are a small addition to `vpc.tf` if the bank prefers no public egress for
  AWS traffic)

No model API is called from this deployment
([ADR-0011](../../docs/architecture/adr/ADR-0011.md)); the earlier request for OpenAI, Anthropic
or Bedrock egress is superseded.

## When the sandbox is only an EC2 instance

If IDBI grants the t3.medium the sandbox form asked for and nothing else, `../ec2-compose/`
carries a cloud-init that installs Docker and runs the compose stack behind Caddy. Caddy proxies
to the API and to nothing else — there is no browser tier in the repository any more, so that box
serves `/api/v1/*` and answers `/` with the API's 404. The client stays the mobile build, pointed
at the instance's hostname. It is the hedge, not the target.
