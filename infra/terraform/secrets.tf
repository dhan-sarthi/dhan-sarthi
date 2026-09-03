# Three Secrets Manager entries, injected into the task at start and read once by config.ts.
#
#   dhan-sarthi/<env>/runway    RUNWAY_API_KEY, RUNWAY_CHARACTER_ID (comma lists) — set by hand
#   dhan-sarthi/<env>/database  DATABASE_URL (dhan_app), MIGRATE_DATABASE_URL, DHAN_APP_PASSWORD
#   dhan-sarthi/<env>/operator  OPERATOR_KEY
#
# The Runway secret is created with placeholder values and populated by the runbook; Terraform
# never sees a real key. The database secret's initial version is generated here so the first
# seed run-task can create the dhan_app role with a password the runtime task already holds.

locals {
  secret_prefix = "${var.project}/${var.environment}"
}

resource "aws_secretsmanager_secret" "runway" {
  name                    = "${local.secret_prefix}/runway"
  description             = "Runway Characters credentials for the avatar (comma-separated lists pair by index)"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "runway" {
  secret_id = aws_secretsmanager_secret.runway.id
  secret_string = jsonencode({
    RUNWAY_API_KEY      = ""
    RUNWAY_CHARACTER_ID = ""
  })

  # Populated out of band (README step 6); Terraform must not overwrite the real value.
  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "random_password" "db_app" {
  length           = 32
  special          = true
  override_special = "_-"
}

resource "aws_secretsmanager_secret" "database" {
  name                    = "${local.secret_prefix}/database"
  description             = "Postgres connection strings: runtime (dhan_app) and migrate (master)"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "database" {
  secret_id = aws_secretsmanager_secret.database.id
  secret_string = jsonencode({
    DATABASE_URL         = "postgres://dhan_app:${random_password.db_app.result}@${aws_db_instance.this.address}:5432/dhan?sslmode=require"
    MIGRATE_DATABASE_URL = "postgres://${aws_db_instance.this.username}:${random_password.db_master.result}@${aws_db_instance.this.address}:5432/dhan?sslmode=require"
    DHAN_APP_PASSWORD    = random_password.db_app.result
  })
}

resource "random_password" "operator" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "operator" {
  name                    = "${local.secret_prefix}/operator"
  description             = "X-Operator-Key for /api/v1/operator/* routes"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "operator" {
  secret_id = aws_secretsmanager_secret.operator.id
  secret_string = jsonencode({
    OPERATOR_KEY = random_password.operator.result
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
