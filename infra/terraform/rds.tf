# RDS Postgres 16, private, encrypted, TLS enforced. The vector extension is available on RDS
# without any parameter; migration 0001 runs CREATE EXTENSION IF NOT EXISTS vector as the
# migrate role (ADR-0011, ADR-0012). The parameter group exists to force SSL and to keep the
# statement timeout the application expects visible in one place.

resource "aws_db_subnet_group" "this" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id

  tags = { Name = local.name }
}

resource "aws_db_parameter_group" "postgres16" {
  name        = "${local.name}-pg16"
  family      = "postgres16"
  description = "Dhan Sarthi: force SSL, log slow statements"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  # pgvector, pg_trgm and btree_gist are all in rds.extensions for Postgres 16 by default; listing
  # them as allowed extensions keeps a future restriction from surprising a migration.
  parameter {
    name  = "rds.allowed_extensions"
    value = "vector,pgcrypto,pg_trgm,btree_gist,plpgsql"
  }
}

resource "random_password" "db_master" {
  length           = 32
  special          = true
  override_special = "_-"
}

resource "aws_db_instance" "this" {
  identifier = local.name

  engine                = "postgres"
  engine_version        = "16"
  instance_class        = var.db_instance_class
  allocated_storage     = var.db_allocated_storage_gb
  max_allocated_storage = var.db_allocated_storage_gb * 2
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "dhan"
  username = "dhan_master"
  password = random_password.db_master.result
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]
  parameter_group_name   = aws_db_parameter_group.postgres16.name
  publicly_accessible    = false
  multi_az               = var.db_multi_az

  backup_retention_period   = 7
  backup_window             = "20:00-21:00" # 01:30-02:30 IST, outside any review window
  maintenance_window        = "Sun:21:00-Sun:22:00"
  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = var.db_skip_final_snapshot
  final_snapshot_identifier = var.db_skip_final_snapshot ? null : "${local.name}-final"
  copy_tags_to_snapshot     = true

  performance_insights_enabled = false
  auto_minor_version_upgrade   = true
  apply_immediately            = true

  tags = { Name = local.name }
}
