# IDBI's sandbox account. Differs from team-sandbox only in CIDR (chosen not to collide with the
# bank's ranges; confirm with their network team), domain, protection flags and the alert address.

environment = "idbi-sandbox"
aws_region  = "ap-south-1"

vpc_cidr = "10.41.0.0/16"

# Fill in once the bank tells us which hostname and Route 53 zone the sandbox may use.
domain_name    = ""
hosted_zone_id = ""

api_image_tag    = "v1.0.0-review"
cpu_architecture = "X86_64"

db_instance_class      = "db.t4g.micro"
db_multi_az            = false
db_deletion_protection = true
db_skip_final_snapshot = false

alert_email        = ""
monthly_budget_usd = 100

runway_daily_minute_budget = 240

egress_domains = ["api.dev.runwayml.com", "*.livekit.cloud"]
