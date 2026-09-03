output "app_url" {
  description = "Where the product is served."
  value       = local.has_domain ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.web.domain_name}"
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.web.domain_name
}

output "cloudfront_distribution_id" {
  description = "For the invalidation in deploy-web.sh."
  value       = aws_cloudfront_distribution.web.id
}

output "web_bucket" {
  description = "S3 bucket the web build is synced to."
  value       = aws_s3_bucket.web.bucket
}

output "alb_dns_name" {
  value = aws_lb.this.dns_name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "ecs_cluster" {
  value = aws_ecs_cluster.this.name
}

output "ecs_service" {
  value = aws_ecs_service.api.name
}

output "seed_task_definition" {
  description = "Family of the one-off seed task; seed-remote.sh runs its latest revision."
  value       = aws_ecs_task_definition.seed.family
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "task_security_group_id" {
  value = aws_security_group.task.id
}

output "rds_endpoint" {
  value = aws_db_instance.this.address
}

output "secret_arns" {
  value = {
    runway   = aws_secretsmanager_secret.runway.arn
    database = aws_secretsmanager_secret.database.arn
    operator = aws_secretsmanager_secret.operator.arn
  }
}

output "log_group" {
  value = aws_cloudwatch_log_group.api.name
}

output "alarm_topic_arn" {
  value = aws_sns_topic.alarms.arn
}

output "egress_request" {
  description = "What to ask the bank's network team for, verbatim."
  value = {
    tcp_443_to   = var.egress_domains
    udp_range_to = "*.livekit.cloud ${var.livekit_media_udp_range.from}-${var.livekit_media_udp_range.to} (TCP 443 TURN/TLS fallback)"
    nat_eip      = aws_eip.nat.public_ip
  }
}
