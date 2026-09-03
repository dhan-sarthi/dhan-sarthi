# Logs, metrics, alarms and a dashboard. The API writes pino JSON to the log group (14 days,
# redaction in the application) and publishes embedded-metric-format metrics in the
# DhanSarthi namespace; the avatar-budget alarm reads one of them.

locals {
  metric_namespace = "DhanSarthi"
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/${var.project}/${var.environment}/api"
  retention_in_days = var.log_retention_days
}

resource "aws_sns_topic" "alarms" {
  name = "${local.name}-alarms"
}

resource "aws_sns_topic_subscription" "alarms_email" {
  count = var.alert_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# --- alarms ------------------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${local.name}-alb-5xx"
  alarm_description   = "More than five 5xx responses from the ALB or the API in five minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 5
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "total"
    expression  = "elb + target"
    label       = "5xx (ALB + target)"
    return_data = true
  }

  metric_query {
    id = "elb"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_ELB_5XX_Count"
      period      = 300
      stat        = "Sum"
      dimensions  = { LoadBalancer = aws_lb.this.arn_suffix }
    }
  }

  metric_query {
    id = "target"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_Target_5XX_Count"
      period      = 300
      stat        = "Sum"
      dimensions  = { LoadBalancer = aws_lb.this.arn_suffix }
    }
  }

  alarm_actions = [aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]
}

resource "aws_cloudwatch_metric_alarm" "no_healthy_task" {
  alarm_name          = "${local.name}-no-healthy-task"
  alarm_description   = "The single API task is not healthy behind the ALB"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  threshold           = 1
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HealthyHostCount"
  period              = 60
  statistic           = "Minimum"
  treat_missing_data  = "breaching"

  dimensions = {
    LoadBalancer = aws_lb.this.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.name}-rds-cpu"
  alarm_description   = "RDS CPU above 80 % for ten minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 80
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  period              = 300
  statistic           = "Average"

  dimensions = { DBInstanceIdentifier = aws_db_instance.this.identifier }

  alarm_actions = [aws_sns_topic.alarms.arn]
}

resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "${local.name}-rds-free-storage"
  alarm_description   = "RDS free storage below 2 GB"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  threshold           = 2 * 1024 * 1024 * 1024
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  period              = 300
  statistic           = "Minimum"

  dimensions = { DBInstanceIdentifier = aws_db_instance.this.identifier }

  alarm_actions = [aws_sns_topic.alarms.arn]
}

resource "aws_cloudwatch_metric_alarm" "avatar_budget" {
  alarm_name          = "${local.name}-avatar-budget-80pct"
  alarm_description   = "Runway minutes used today above 80 % of RUNWAY_DAILY_MINUTE_BUDGET"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = floor(var.runway_daily_minute_budget * 0.8)
  namespace           = local.metric_namespace
  metric_name         = "avatar_minutes_used_today"
  period              = 300
  statistic           = "Maximum"
  treat_missing_data  = "notBreaching"

  dimensions = { Environment = var.environment }

  alarm_actions = [aws_sns_topic.alarms.arn]
}

# --- dashboard ---------------------------------------------------------------------------------

resource "aws_cloudwatch_dashboard" "this" {
  dashboard_name = local.name

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Requests and 5xx"
          region = var.aws_region
          stat   = "Sum"
          period = 60
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.this.arn_suffix],
            [".", "HTTPCode_Target_5XX_Count", ".", "."],
            [".", "HTTPCode_ELB_5XX_Count", ".", "."],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Target response time p95"
          region = var.aws_region
          stat   = "p95"
          period = 60
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.this.arn_suffix],
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Avatar: minutes today, grants, waitlist, breaker"
          region = var.aws_region
          stat   = "Maximum"
          period = 300
          metrics = [
            [local.metric_namespace, "avatar_minutes_used_today", "Environment", var.environment],
            [".", "avatar_grants", ".", ".", { stat = "Sum" }],
            [".", "avatar_waitlist_length", ".", "."],
            [".", "breaker_open", ".", "."],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Advice records written · RDS CPU"
          region = var.aws_region
          period = 300
          metrics = [
            [local.metric_namespace, "advice_records_written", "Environment", var.environment, { stat = "Sum" }],
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.this.identifier, { stat = "Average", yAxis = "right" }],
          ]
        }
      },
    ]
  })
}
