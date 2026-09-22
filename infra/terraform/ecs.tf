# One Fargate service, desired_count 1 (ADR-0004). The RPC host holds a LiveKit connection for
# the life of a call, so the task is a persistent process and the deploy is rolling with a
# 120-second drain. A second task definition runs the seed as a one-off (ADR-0012) with the
# migrate connection string; the runtime task never holds it.

resource "aws_ecr_repository" "api" {
  name                 = "${var.project}/api"
  image_tag_mutability = "MUTABLE"
  force_delete         = var.environment == "team-sandbox"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecs_cluster" "this" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# --- IAM -----------------------------------------------------------------------------------------

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# The execution role is what pulls the image, reads the three secrets at task start and opens the
# log stream. The application itself never calls Secrets Manager (CONTRIBUTING: fetch at startup).
resource "aws_iam_role" "execution" {
  name               = "${local.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secrets" {
  statement {
    sid     = "ReadTheThreeSecrets"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_secretsmanager_secret.runway.arn,
      aws_secretsmanager_secret.database.arn,
      aws_secretsmanager_secret.operator.arn,
    ]
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

# The task role is what the running process can do: write its own log stream and publish the
# embedded-metric-format metrics the alarms read. Nothing else.
resource "aws_iam_role" "task" {
  name               = "${local.name}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "task_runtime" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.api.arn}:*"]
  }

  statement {
    sid       = "Metrics"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = [local.metric_namespace]
    }
  }
}

resource "aws_iam_role_policy" "task_runtime" {
  name   = "runtime"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_runtime.json
}

# --- task definitions ----------------------------------------------------------------------------

locals {
  api_image = "${aws_ecr_repository.api.repository_url}:${var.api_image_tag}"

  # ANAM_PUBLIC_BASE_URL is where Anam posts tool calls back to us: the public origin, because
  # CloudFront forwards /api/* to the ALB. Unused unless anam is in AVATAR_PROVIDER.
  api_environment = [
    for k, v in merge(
      var.api_environment,
      { ANAM_PUBLIC_BASE_URL = local.has_domain ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.web.domain_name}" },
      var.api_environment_overrides,
      { PORT = "3001", HOST = "0.0.0.0", ENVIRONMENT = var.environment },
    ) :
    { name = k, value = v }
  ]

  # Each avatar key named in var.avatar_secret_keys must exist in the avatar secret's JSON, or the
  # task fails to start; the secret is populated out of band (README step 6).
  api_secrets = concat(
    [for k in var.avatar_secret_keys : { name = k, valueFrom = "${aws_secretsmanager_secret.runway.arn}:${k}::" }],
    [
      { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.database.arn}:DATABASE_URL::" },
      { name = "OPERATOR_KEY", valueFrom = "${aws_secretsmanager_secret.operator.arn}:OPERATOR_KEY::" },
    ],
  )

  seed_secrets = [
    { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.database.arn}:MIGRATE_DATABASE_URL::" },
    { name = "DHAN_APP_PASSWORD", valueFrom = "${aws_secretsmanager_secret.database.arn}:DHAN_APP_PASSWORD::" },
  ]

  log_configuration = {
    logDriver = "awslogs"
    options = {
      "awslogs-group"         = aws_cloudwatch_log_group.api.name
      "awslogs-region"        = var.aws_region
      "awslogs-stream-prefix" = "api"
    }
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([{
    name      = "api"
    image     = local.api_image
    essential = true
    portMappings = [{
      containerPort = 3001
      protocol      = "tcp"
    }]
    environment = local.api_environment
    secrets     = local.api_secrets
    # SIGTERM drain: stop granting, wait for live calls (≤ 120 s), then cancel with
    # end_reason='deploy'. Must match the API's own drain ceiling.
    stopTimeout      = 120
    logConfiguration = local.log_configuration
    healthCheck = {
      command     = ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3001/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))\""]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 20
    }
  }])
}

resource "aws_ecs_task_definition" "seed" {
  family                   = "${local.name}-seed"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([{
    name      = "seed"
    image     = local.api_image
    essential = true
    command   = ["node", "dist/cli/seed.js"]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "BANK_SOURCE", value = "postgres" },
      { name = "ENVIRONMENT", value = var.environment },
    ]
    secrets = local.seed_secrets
    logConfiguration = merge(local.log_configuration, {
      options = merge(local.log_configuration.options, { "awslogs-stream-prefix" = "seed" })
    })
  }])
}

# --- service -------------------------------------------------------------------------------------

resource "aws_ecs_service" "api" {
  name            = "${local.name}-api"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  # Rolling with overlap: the atomic lease claim in Postgres makes two tasks safe for the
  # duration of a deploy, and the old task drains live calls before it goes.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 60
  enable_execute_command             = false

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.task.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3001
  }

  depends_on = [aws_lb_listener.http]
}
