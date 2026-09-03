# A monthly cost budget for the account, alerting at 80 % forecast and 100 % actual. Runway's own
# spend is not an AWS cost; the avatar_budget alarm in observability.tf covers that side.

resource "aws_budgets_budget" "monthly" {
  name         = "${local.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit       = false
    include_refund       = false
    include_subscription = true
    include_tax          = true
    include_upfront      = true
    use_amortized        = false
    use_blended          = false
  }

  dynamic "notification" {
    for_each = var.alert_email != "" ? [80, 100] : []
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = notification.value == 80 ? "FORECASTED" : "ACTUAL"
      subscriber_email_addresses = [var.alert_email]
    }
  }
}
