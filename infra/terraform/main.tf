# Dhan Sarthi — one root module, two environments (envs/*.tfvars). ADR-0010.
#
#   terraform init
#   terraform plan  -var-file=envs/team-sandbox.tfvars
#   terraform apply -var-file=envs/team-sandbox.tfvars
#
# The README beside this file is the runbook. Nothing here assumes a CI identity in the target
# account; every command runs equally well from a laptop with the bank's credentials.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state. Local state is fine for the first apply from a laptop; switch to S3 once the
  # bucket exists so two people cannot apply from stale state:
  #
  #   1. aws s3api create-bucket --bucket <state-bucket> --region ap-south-1 \
  #        --create-bucket-configuration LocationConstraint=ap-south-1
  #   2. aws s3api put-bucket-versioning --bucket <state-bucket> \
  #        --versioning-configuration Status=Enabled
  #   3. aws dynamodb create-table --table-name dhan-sarthi-tf-lock \
  #        --attribute-definitions AttributeName=LockID,AttributeType=S \
  #        --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST
  #   4. Uncomment the block below, fill in the bucket, then `terraform init -migrate-state`.
  #
  # backend "s3" {
  #   bucket         = "<state-bucket>"
  #   key            = "dhan-sarthi/terraform.tfstate"
  #   region         = "ap-south-1"
  #   dynamodb_table = "dhan-sarthi-tf-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(
      {
        Project     = var.project
        Environment = var.environment
        ManagedBy   = "terraform"
      },
      var.tags,
    )
  }
}

# CloudFront only accepts ACM certificates issued in us-east-1, whatever region the rest lives in.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = merge(
      {
        Project     = var.project
        Environment = var.environment
        ManagedBy   = "terraform"
      },
      var.tags,
    )
  }
}

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name       = "${var.project}-${var.environment}"
  account_id = data.aws_caller_identity.current.account_id
  azs        = slice(data.aws_availability_zones.available.names, 0, 2)
  has_domain = var.domain_name != ""
}

check "domain_requires_hosted_zone" {
  assert {
    condition     = !local.has_domain || var.hosted_zone_id != ""
    error_message = "domain_name is set but hosted_zone_id is empty; certificates are validated through Route 53, so both are needed together."
  }
}
