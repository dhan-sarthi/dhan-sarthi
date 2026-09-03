# Application load balancer in the public subnets, reachable only from CloudFront's origin-facing
# ranges. With a domain: an ACM certificate for origin.<domain>, HTTPS listener, HTTP redirect.
# Without one: plain HTTP from CloudFront, which is still TLS to the viewer. The idle timeout
# is 120 s; browser WebRTC goes to LiveKit directly and never crosses this ALB.

resource "aws_lb" "this" {
  name               = substr(local.name, 0, 32)
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
  idle_timeout       = 120

  drop_invalid_header_fields = true
  enable_deletion_protection = var.environment == "idbi-sandbox"
}

resource "aws_lb_target_group" "api" {
  name        = substr("${local.name}-api", 0, 32)
  port        = 3001
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.this.id

  # Short deregistration so a rolling deploy does not hold the old task longer than its own
  # 120 s drain.
  deregistration_delay = 30

  health_check {
    path                = "/api/v1/health"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

# --- certificate for the origin hostname (only with a domain) ---------------------------------

resource "aws_acm_certificate" "origin" {
  count = local.has_domain ? 1 : 0

  domain_name       = "origin.${var.domain_name}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "origin_validation" {
  for_each = local.has_domain ? {
    for dvo in aws_acm_certificate.origin[0].domain_validation_options : dvo.domain_name => {
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

resource "aws_acm_certificate_validation" "origin" {
  count = local.has_domain ? 1 : 0

  certificate_arn         = aws_acm_certificate.origin[0].arn
  validation_record_fqdns = [for r in aws_route53_record.origin_validation : r.fqdn]
}

resource "aws_route53_record" "origin" {
  count = local.has_domain ? 1 : 0

  zone_id = var.hosted_zone_id
  name    = "origin.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = false
  }
}

# --- listeners ---------------------------------------------------------------------------------

resource "aws_lb_listener" "https" {
  count = local.has_domain ? 1 : 0

  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.origin[0].certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = local.has_domain ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  dynamic "default_action" {
    for_each = local.has_domain ? [] : [1]
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.api.arn
    }
  }
}
