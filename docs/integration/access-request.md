# Access request — IDBI sandbox AWS account

**Account:** 453866368974 · **IAM user:** `Atomic_DWM` · **Region wanted:** `ap-south-1` (Mumbai)

Raised 17 September 2026. As issued, the user can sign in and do essentially nothing:
`iam:ListUsers`, `cloudshell:CreateEnvironment` and the account-name read are all denied, so
neither the console nor CloudShell nor the CLI can be used to deploy.

The ask below is deliberately the **smallest thing that runs the product**, not a production
topology. One EC2 instance runs the whole stack through `docker-compose.yml` — Postgres, the API
and the web build — which is why there is no request here for RDS, ECS, Fargate, ALB or ECR.
Fewer permissions should mean a faster grant.

---

## 1. Programmatic access

An **access key and secret** for `Atomic_DWM`, or a role we can assume. The user cannot create one
itself (`iam:CreateAccessKey` is not available), so it has to be issued.

## 2. Permissions

**The quickest way to grant this** is to attach three AWS managed policies to `Atomic_DWM`:

| Policy | Covers |
|---|---|
| `AmazonEC2FullAccess` | The instance, its security group, its disk, and the Elastic IP |
| `CloudWatchLogsFullAccess` | Application logs |
| `AmazonSSMFullAccess` | Shell access to the instance **without opening port 22 to the internet** |

That is three clicks and it unblocks everything below. `AmazonSSMFullAccess` is worth granting
specifically because it *removes* the need for an inbound SSH port — it is the more secure option,
not the more permissive one.

**If least privilege is required instead**, the exact actions are:

```
ec2:RunInstances, ec2:TerminateInstances, ec2:StartInstances, ec2:StopInstances,
ec2:DescribeInstances, ec2:DescribeImages, ec2:DescribeInstanceTypes,
ec2:CreateTags,

ec2:DescribeVpcs, ec2:DescribeSubnets, ec2:DescribeSecurityGroups,
ec2:CreateSecurityGroup, ec2:AuthorizeSecurityGroupIngress,
ec2:AuthorizeSecurityGroupEgress,

ec2:AllocateAddress, ec2:AssociateAddress, ec2:DescribeAddresses,
ec2:CreateVolume, ec2:AttachVolume, ec2:DescribeVolumes,

ssm:StartSession, ssm:DescribeInstanceInformation, ssm:SendCommand,
logs:CreateLogGroup, logs:CreateLogStream, logs:PutLogEvents, logs:DescribeLogStreams,

iam:PassRole          (so the instance can carry an SSM role)
iam:GetUser           (so we can confirm what we have)
```

Scoped to `ap-south-1` and to resources tagged `project=dhan-sarthi` is fine by us.

We are **not** asking for RDS, ECS, Fargate, ALB, ECR, Route 53 or any IAM write beyond the
above. The whole stack runs as one `docker-compose` on a single instance.

## 3. One thing to verify, and one thing we will check ourselves

**To be clear about scope:** this document is about the **AWS account** only. The IDBI **API
sandbox** is a separate system with its own IP whitelist, run by a different team, and is not
being asked about here.

### 3a. Does this account's VPC allow outbound HTTPS?

We will test this ourselves the moment §2 lands — it is a five-minute check, not a question worth
a round trip. **Flag it only if you already know the answer is no**, because in that case the live
avatar cannot function at all and we would rather redesign now than find out in week three. It
reaches a hosted provider over 443:

```
api.dev.runwayml.com          the avatar provider
*.livekit.cloud               the media path its audio and video ride on
```

### 3b. Nothing else

An existing VPC and subnet are fine; we do not need to create one. If the account has no default
VPC and we may not create one, tell us and we will work inside whatever exists.

---

## A separate request, for whoever runs the API sandbox

Not for the cloud team — please forward.

The sandbox currently whitelists a developer laptop. Once the backend runs on a server, calls will
arrive from the **server's** address instead, and will be rejected until that address is added.

1. **How long does adding an address take** — same day, or a change request?
2. **How many can the list hold at once?** We need the server's address *and* at least one
   developer address. If it holds only one, adding the server ends local development.
3. We will supply a **fixed (Elastic) IP**, so it needs adding once rather than after every
   restart. The address does not exist yet — it is allocated when the server is created, which
   needs §2 above. Flagging the lead time now so the two are not serialised.

---

## What we are doing meanwhile

Not waiting. The same stack is being deployed to a commercial host so the submission is never
blocked on this account, and the compose and Terraform files are written so the identical build
moves into this account whenever access lands.
