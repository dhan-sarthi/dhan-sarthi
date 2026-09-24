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

# Uday tries the numbered Runway account first and Anam second (docs/engineering/avatar-accounts.md).
# Every key listed must exist in the dhan-sarthi/team-sandbox/runway secret.
avatar_secret_keys = [
  "RUNWAY_API_KEY_1",
  "RUNWAY_CHARACTER_ID_1",
  # A second Runway account with the same character: takes the call when the first is busy with
  # its one live session, out of credits, or refusing.
  "RUNWAY_API_KEY_2",
  "RUNWAY_CHARACTER_ID_2",
  "ANAM_API_KEY_1",
  "ANAM_AVATAR_ID_1",
  "ANAM_VOICE_ID",
  "ANAM_LLM_ID",
  # Not an avatar key, but the same secret: lets Uday's text chat phrase answers to questions the
  # rules do not match. Without it the chat answers only the questions it recognises.
  "OPENAI_API_KEY",
]
api_environment_overrides = {
  # Anam is out of the chain while its org has no minutes left: its engine answers 429 "No
  # available minutes" at connect time, on the phone, after the grant — too late for the pool to
  # try anything else — so a fall-through to it is a broken call, not a fallback. Put
  # "runway,anam" back once the Anam plan has minutes.
  AVATAR_PROVIDER = "runway"
  # CloudFront -> ALB: without this every caller is the ALB's address and every per-IP rate
  # limit is one bucket shared by everyone.
  TRUST_PROXY     = "true"
  OPENAI_MODEL    = "gpt-5.4-mini"
}

egress_domains = ["api.dev.runwayml.com", "*.livekit.cloud", "api.openai.com"]
