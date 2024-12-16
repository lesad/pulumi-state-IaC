import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

// Define project ID
const project = pulumi.getProject();

// Create KMS Key Ring
const keyRing = new gcp.kms.KeyRing("keyRing", {
    location: "global",
    project,
});

// Create KMS Crypto Key
const cryptoKey = new gcp.kms.CryptoKey("cryptoKey", {
    keyRing: keyRing.id,
    purpose: "ENCRYPT_DECRYPT",
    rotationPeriod: "100000s",
    versionTemplate: {
        algorithm: "GOOGLE_SYMMETRIC_ENCRYPTION",
    },
});

// Create the main state bucket
const stateBucket = new gcp.storage.Bucket("stateBucket", {
    name: `pulumi-state-${project}`,
    location: "EU",
    storageClass: "STANDARD",
    uniformBucketLevelAccess: true,
    versioning: {
        enabled: true,
    },
    encryption: {
        defaultKmsKeyName: cryptoKey.id,
    },
    publicAccessPrevention: "enforced",
    logging: {
        logBucket: `pulumi-state-logs-${project}`,
        logObjectPrefix: "state-logs",
    },
});

// Create the logs bucket
const logsBucket = new gcp.storage.Bucket("logsBucket", {
    name: `pulumi-state-logs-${project}`,
    location: "EU",
    storageClass: "STANDARD",
    uniformBucketLevelAccess: true,
    publicAccessPrevention: "enforced",
    versioning: {
        enabled: true,
    },
});

// IAM Binding for state bucket
new gcp.storage.BucketIAMBinding("stateBucketIAMBinding", {
    bucket: stateBucket.name,
    role: "roles/storage.objectAdmin",
    members: ["group:your-group@example.com"],
});

// IAM Binding for logs bucket
new gcp.storage.BucketIAMBinding("logsBucketIAMBinding", {
    bucket: logsBucket.name,
    role: "roles/storage.objectViewer",
    members: ["group:your-group@example.com"],
});

// Configure audit logs
new gcp.projects.IAMAuditConfig("storageAuditConfig", {
    project: project,
    service: "storage.googleapis.com",
    auditLogConfigs: [
        { logType: "ADMIN_READ" },
        { logType: "DATA_READ" },
        { logType: "DATA_WRITE" },
    ],
});

// Export logs to logs bucket
new gcp.logging.ProjectSink("storageAuditSink", {
    project: project,
    destination: `storage.googleapis.com/${logsBucket.name}`,
    filter: `resource.type="gcs_bucket" resource.labels.bucket_name="${stateBucket.name}"`,
});

// TODO: fix this - add combiner
// Alerting policy for unauthorized access attempts
new gcp.monitoring.AlertPolicy("storageAlertPolicy", {
    displayName: "Pulumi State Storage Alert Policy",
    conditions: [{
        displayName: "Unauthorized Access Attempts",
        conditionThreshold: {
            filter: `resource.type="gcs_bucket" AND resource.labels.bucket_name="${stateBucket.name}" AND metric.type="storage.googleapis.com/storage/audit_log_entry_count" AND metric.labels.method="storage.buckets.get" AND metric.labels.status="PERMISSION_DENIED"`,
            duration: "60s",
            comparison: "COMPARISON_GT",
            thresholdValue: 1.0,
        },
    }],
    notificationChannels: [], // Add your notification channel IDs here
});

// Export the bucket names
export const stateBucketName = stateBucket.name;
export const logsBucketName = logsBucket.name;
