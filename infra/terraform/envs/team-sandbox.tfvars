# The team's own AWS account: applied first, so idbi-sandbox is a redeploy (ADR-0010).
# No custom domain by default; the CloudFront hostname is the demo URL until one is chosen.

environment = "team-sandbox"
aws_region  = "ap-south-1"

vpc_cidr = "10.40.0.0/16"

domain_name    = ""
hosted_zone_id = ""

api_image_tag    = "latest"
cpu_architecture = "X86_64"

# t4g (Graviton) had no capacity in any ap-south-1 AZ on 20 Sep 2026; t3 is x86 and orderable
# in 1a/1b/1c. Same 2 vCPU / 1 GiB, about $3/month more.
db_instance_class      = "db.t3.micro"
db_multi_az            = false
db_deletion_protection = false
db_skip_final_snapshot = true

alert_email        = ""
monthly_budget_usd = 100

runway_daily_minute_budget = 240

egress_domains = ["api.dev.runwayml.com", "*.livekit.cloud"]
