import type { StatefulRule } from "../types.js";

/**
 * Resource types where "delete" or "replace" means real, usually unrecoverable
 * data loss or a production outage -- the exact set of actions behind the
 * Amazon Kiro (Cost Explorer wiped) and PocketOS (production DB + backups
 * wiped in one call) incidents that motivated this tool. Deliberately
 * over-inclusive: a false positive costs you one confirmation prompt, a
 * false negative costs you your database.
 */
export const BUILTIN_STATEFUL_RULES: StatefulRule[] = [
  // --- Terraform (provider-agnostic resource type strings) ---
  { provider: "terraform", pattern: "^aws_db_instance", label: "RDS instance" },
  { provider: "terraform", pattern: "^aws_db_cluster", label: "Aurora/RDS cluster" },
  { provider: "terraform", pattern: "^aws_rds_cluster", label: "RDS cluster" },
  { provider: "terraform", pattern: "^aws_dynamodb_table", label: "DynamoDB table" },
  { provider: "terraform", pattern: "^aws_elasticache", label: "ElastiCache cluster" },
  { provider: "terraform", pattern: "^aws_s3_bucket$", label: "S3 bucket" },
  { provider: "terraform", pattern: "^aws_efs_file_system", label: "EFS file system" },
  { provider: "terraform", pattern: "^aws_backup_vault", label: "AWS Backup vault" },
  { provider: "terraform", pattern: "^google_sql_database", label: "Cloud SQL instance/database" },
  { provider: "terraform", pattern: "^google_storage_bucket$", label: "GCS bucket" },
  { provider: "terraform", pattern: "^google_container_cluster", label: "GKE cluster" },
  { provider: "terraform", pattern: "^azurerm_sql_database|^azurerm_mssql_database", label: "Azure SQL database" },
  { provider: "terraform", pattern: "^azurerm_cosmosdb", label: "Cosmos DB account" },
  { provider: "terraform", pattern: "^azurerm_storage_account$", label: "Azure storage account" },
  { provider: "terraform", pattern: "^kubernetes_persistent_volume", label: "Kubernetes PersistentVolume" },

  // --- AWS CloudFormation ---
  { provider: "cloudformation", pattern: "^AWS::RDS::DBInstance$", label: "RDS instance" },
  { provider: "cloudformation", pattern: "^AWS::RDS::DBCluster$", label: "RDS/Aurora cluster" },
  { provider: "cloudformation", pattern: "^AWS::DynamoDB::Table$", label: "DynamoDB table" },
  { provider: "cloudformation", pattern: "^AWS::ElastiCache::", label: "ElastiCache resource" },
  { provider: "cloudformation", pattern: "^AWS::S3::Bucket$", label: "S3 bucket" },
  { provider: "cloudformation", pattern: "^AWS::EFS::FileSystem$", label: "EFS file system" },
  { provider: "cloudformation", pattern: "^AWS::Backup::BackupVault$", label: "AWS Backup vault" },
  { provider: "cloudformation", pattern: "^AWS::Cognito::UserPool$", label: "Cognito user pool" },

  // --- Azure (ARM/Bicep resource type strings) ---
  { provider: "azure", pattern: "^Microsoft\\.Sql/servers/databases$", label: "Azure SQL database" },
  { provider: "azure", pattern: "^Microsoft\\.DocumentDB/databaseAccounts$", label: "Cosmos DB account" },
  { provider: "azure", pattern: "^Microsoft\\.Storage/storageAccounts$", label: "Azure storage account" },
  { provider: "azure", pattern: "^Microsoft\\.DBforPostgreSQL/", label: "Azure PostgreSQL" },
  { provider: "azure", pattern: "^Microsoft\\.DBforMySQL/", label: "Azure MySQL" },

  // --- Kubernetes ---
  { provider: "kubernetes", pattern: "^PersistentVolumeClaim$", label: "PersistentVolumeClaim" },
  { provider: "kubernetes", pattern: "^PersistentVolume$", label: "PersistentVolume" },
  { provider: "kubernetes", pattern: "^StatefulSet$", label: "StatefulSet" },
  { provider: "kubernetes", pattern: "^Namespace$", label: "Namespace (deletes everything inside it)" },
  { provider: "kubernetes", pattern: "^Secret$", label: "Secret" },

  // --- Single-shot AWS CLI calls with no plan/dry-run equivalent ---
  { provider: "aws-cli", pattern: "^rds:db-instance$", label: "RDS instance" },
  { provider: "aws-cli", pattern: "^rds:db-cluster$", label: "RDS/Aurora cluster" },
  { provider: "aws-cli", pattern: "^dynamodb:table$", label: "DynamoDB table" },
  { provider: "aws-cli", pattern: "^s3:bucket$", label: "S3 bucket" },
  { provider: "aws-cli", pattern: "^ec2:instance$", label: "EC2 instance" },
  { provider: "aws-cli", pattern: "^elasticache:cache-cluster$", label: "ElastiCache cluster" },
  { provider: "aws-cli", pattern: "^cloudformation:stack$", label: "CloudFormation stack" }
];

export function isStateful(
  provider: string,
  resourceType: string,
  extraPatterns: string[] = []
): { stateful: boolean; label?: string } {
  for (const rule of BUILTIN_STATEFUL_RULES) {
    if (rule.provider !== provider) continue;
    if (new RegExp(rule.pattern).test(resourceType)) {
      return { stateful: true, label: rule.label };
    }
  }
  for (const pattern of extraPatterns) {
    if (new RegExp(pattern).test(resourceType)) {
      return { stateful: true, label: "user-configured pattern" };
    }
  }
  return { stateful: false };
}
