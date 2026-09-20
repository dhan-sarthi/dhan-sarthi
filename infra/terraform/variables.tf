variable "project" {
  description = "Resource name prefix."
  type        = string
  default     = "dhan-sarthi"
}

variable "environment" {
  description = "Which tfvars this is: team-sandbox or idbi-sandbox. Appears in every name and in the Secrets Manager paths."
  type        = string

  validation {
    condition     = contains(["team-sandbox", "idbi-sandbox"], var.environment)
    error_message = "environment must be team-sandbox or idbi-sandbox."
  }
}

variable "aws_region" {
  description = "Everything lives in ap-south-1 (data residency); the variable exists so plan output states it explicitly."
  type        = string
  default     = "ap-south-1"
}

variable "tags" {
  description = "Extra tags merged into every resource."
  type        = map(string)
  default     = {}
}

# --- network -----------------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR of the VPC. Two public and two private /24s are carved from it."
  type        = string
  default     = "10.40.0.0/16"
}

variable "egress_domains" {
  description = "The hostnames the API task must reach. Recorded here and in the outputs so the request to the bank's network team is a copy of what the deployment actually needs. Security groups allow 443/TCP and the LiveKit media range outbound; a per-domain allow-list is enforced by a network firewall in the bank's account when they require one (see README)."
  type        = list(string)
  default     = ["api.dev.runwayml.com", "*.livekit.cloud"]
}

variable "livekit_media_udp_range" {
  description = "UDP port range LiveKit uses for WebRTC media from the RPC participant. TCP 443 is the TURN/TLS fallback."
  type = object({
    from = number
    to   = number
  })
  default = {
    from = 50000
    to   = 60000
  }
}

# --- domain and certificates -------------------------------------------------------------------

variable "domain_name" {
  description = "Public hostname for the app (CloudFront). Empty means no custom domain: CloudFront's default certificate and hostname are used and the ALB listens on plain HTTP behind it."
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone that owns domain_name. Required when domain_name is set."
  type        = string
  default     = ""
}

# --- api task ----------------------------------------------------------------------------------

variable "api_image_tag" {
  description = "Tag of the API image in ECR that the task definition points at. deploy-api.sh pushes and then re-applies with the new tag."
  type        = string
  default     = "latest"
}

variable "api_cpu" {
  description = "Fargate CPU units for the one API task (1024 = 1 vCPU)."
  type        = number
  default     = 1024
}

variable "api_memory" {
  description = "Fargate memory in MiB for the one API task."
  type        = number
  default     = 2048
}

variable "cpu_architecture" {
  description = "Fargate CPU architecture. Must match the platform the image was built for (deploy-api.sh defaults to linux/amd64)."
  type        = string
  default     = "X86_64"

  validation {
    condition     = contains(["X86_64", "ARM64"], var.cpu_architecture)
    error_message = "cpu_architecture must be X86_64 or ARM64."
  }
}

variable "api_environment" {
  description = "Non-secret environment for the API task. Secrets arrive through the task definition's secrets block, never here."
  type        = map(string)
  default = {
    NODE_ENV                   = "production"
    BANK_SOURCE                = "postgres"
    # `SET ROLE dhan_app` on every pooled connection. Without it the API runs as the master
    # login and the REVOKEs in migration 0007 bind nothing.
    DB_ROLE                    = "dhan_app"
    AVATAR_PROVIDER            = "runway"
    AVATAR_ENABLED             = "true"
    RUNWAY_MAX_SESSION_SECONDS = "600"
    RUNWAY_DAILY_MINUTE_BUDGET = "240"
    LOG_LEVEL                  = "info"
  }
}

variable "runway_daily_minute_budget" {
  description = "Mirror of RUNWAY_DAILY_MINUTE_BUDGET, used to place the 80 % CloudWatch alarm."
  type        = number
  default     = 240
}

# --- database ----------------------------------------------------------------------------------

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_allocated_storage_gb" {
  type    = number
  default = 20
}

variable "db_multi_az" {
  description = "Single-AZ is enough for a review window; flip this if the bank asks."
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  type    = bool
  default = true
}

variable "db_skip_final_snapshot" {
  description = "true only in the team sandbox, where tearing down and rebuilding is routine."
  type        = bool
  default     = false
}

# --- alerting and cost -------------------------------------------------------------------------

variable "alert_email" {
  description = "Address subscribed to the alarm topic and the budget notification. Empty disables the subscription (the topic still exists)."
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "AWS Budgets threshold for the whole account's monthly cost."
  type        = number
  default     = 100
}

variable "log_retention_days" {
  type    = number
  default = 14
}
