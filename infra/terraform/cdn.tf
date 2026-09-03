# The web build in a private S3 bucket behind CloudFront, with /api/* forwarded to the ALB. One
# origin for the browser means production runs with CORS off (DATA-AND-API.md, Limits).

resource "aws_s3_bucket" "web" {
  bucket        = "${local.name}-web-${local.account_id}"
  force_destroy = var.environment == "team-sandbox"
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket = aws_s3_bucket.web.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "web" {
  bucket = aws_s3_bucket.web.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${local.name}-web"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_iam_policy_document" "web_bucket" {
  statement {
    sid       = "CloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.web]
}

# --- viewer certificate (us-east-1, only with a domain) ---------------------------------------

resource "aws_acm_certificate" "viewer" {
  count    = local.has_domain ? 1 : 0
  provider = aws.us_east_1

  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "viewer_validation" {
  for_each = local.has_domain ? {
    for dvo in aws_acm_certificate.viewer[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id         = var.hosted_zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "viewer" {
  count    = local.has_domain ? 1 : 0
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.viewer[0].arn
  validation_record_fqdns = [for r in aws_route53_record.viewer_validation : r.fqdn]
}

# --- distribution --------------------------------------------------------------------------------

# AWS-managed policies, by their fixed ids: CachingOptimized, CachingDisabled and
# AllViewerExceptHostHeader (forwards Authorization, Idempotency-Key, X-Waitlist-Ticket,
# X-Operator-Key and every other header without overriding Host).
locals {
  cache_policy_optimized    = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  cache_policy_disabled     = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  origin_request_all_viewer = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  response_headers_security = "67f7725c-6f97-4210-82d7-5512b31e9d03"
  api_origin_domain         = local.has_domain ? "origin.${var.domain_name}" : aws_lb.this.dns_name
  api_origin_protocol       = local.has_domain ? "https-only" : "http-only"
}

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = local.name
  default_root_object = "index.html"
  price_class         = "PriceClass_200" # includes India
  http_version        = "http2and3"
  aliases             = local.has_domain ? [var.domain_name] : []

  origin {
    origin_id                = "web-s3"
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  origin {
    origin_id   = "api-alb"
    domain_name = local.api_origin_domain

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = local.api_origin_protocol
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 5
    }
  }

  default_cache_behavior {
    target_origin_id           = "web-s3"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = local.cache_policy_optimized
    response_headers_policy_id = local.response_headers_security
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "api-alb"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = local.cache_policy_disabled
    origin_request_policy_id = local.origin_request_all_viewer
  }

  # S3 answers 403 for a missing key behind OAC; the SPA's history fallback needs index.html.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = local.has_domain ? false : true
    acm_certificate_arn            = local.has_domain ? aws_acm_certificate_validation.viewer[0].certificate_arn : null
    ssl_support_method             = local.has_domain ? "sni-only" : null
    minimum_protocol_version       = local.has_domain ? "TLSv1.2_2021" : "TLSv1"
  }
}

resource "aws_route53_record" "web" {
  count = local.has_domain ? 1 : 0

  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}
