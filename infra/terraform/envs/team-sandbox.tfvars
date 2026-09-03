# The team's own AWS account: applied first, so idbi-sandbox is a redeploy (ADR-0010).
# No custom domain by default; the CloudFront hostname is the demo URL until one is chosen.

environment = "team-sandbox"
aws_region  = "ap-south-1"

vpc_cidr = "10.40.0.0/16"

domain_name    = ""
hosted_zone_id = ""

api_image_tag    = "latest"
cpu_architecture = "X86_64"

db_instance_class      = "db.t4g.micro"
db_multi_az            = false
db_deletion_protection = false
db_skip_final_snapshot = true

alert_email        = ""
monthly_budget_usd = 100

runway_daily_minute_budget = 240

egress_domains = ["api.dev.runwayml.com", "*.livekit.cloud"]
