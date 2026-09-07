@description('Globally unique application name')
@minLength(2)
@maxLength(60)
param appName string
@description('Azure region')
param location string = resourceGroup().location
@description('Microsoft Entra application client ID')
@minLength(36)
@maxLength(36)
param entraClientId string
@secure()
@description('Microsoft Entra application client secret')
@minLength(1)
param entraClientSecret string
@description('Resource tenant GUID. B2B guests must be invited into this tenant.')
@minLength(36)
@maxLength(36)
param entraTenantId string = tenant().tenantId
@secure()
@minLength(32)
@description('Random session encryption secret, at least 32 characters')
param nextAuthSecret string
@description('Comma-separated Entra group object IDs with administrator recovery access')
param adminGroupIds string = ''
@allowed(['B1', 'B2', 'B3', 'S1', 'P1v3', 'P2v3'])
param skuName string = 'B1'
@minValue(1)
@description('Monthly malware scanning limit in GB. Defender for Storage incurs additional charges.')
param malwareScanCapGB int = 100
@description('Optional Exchange Online mailbox used by Microsoft Graph sendMail')
param graphMailSender string = ''
@secure()
@description('Optional Teams Workflows webhook URL')
param teamsNotificationWebhook string = ''
@secure()
@minLength(32)
@description('Bearer token used only by the scheduled notification worker')
param notificationsJobToken string

var suffix = uniqueString(resourceGroup().id, appName)
var storageName = 'am${suffix}'
var vaultName = 'am-${suffix}-kv'

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${appName}-plan'
  location: location
  sku: { name: skuName }
  kind: 'linux'
  properties: { reserved: true }
}
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}
resource blob 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    isVersioningEnabled: true
    deleteRetentionPolicy: { enabled: true, days: 14 }
    containerDeleteRetentionPolicy: { enabled: true, days: 14 }
  }
}
resource packages 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = { parent: blob, name: 'agent-packages', properties: { publicAccess: 'None' } }
resource defender 'Microsoft.Security/defenderForStorageSettings@2025-06-01' = {
  name: 'current'
  scope: storage
  properties: {
    isEnabled: true
    overrideSubscriptionLevelSettings: true
    malwareScanning: { onUpload: { isEnabled: true, capGBPerMonth: malwareScanCapGB } }
    sensitiveDataDiscovery: { isEnabled: false }
  }
}
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: vaultName
  location: location
  properties: {
    tenantId: tenant().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    enablePurgeProtection: true
    softDeleteRetentionInDays: 90
  }
}
resource clientSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'entra-client-secret'
  properties: { value: entraClientSecret }
}
resource sessionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'nextauth-secret'
  properties: { value: nextAuthSecret }
}
resource notificationJobSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'notifications-job-token'
  properties: { value: notificationsJobToken }
}
resource teamsWebhookSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(teamsNotificationWebhook)) {
  parent: vault
  name: 'teams-notification-webhook'
  properties: { value: teamsNotificationWebhook }
}
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = { name: take('${appName}-logs', 63), location: location, properties: { retentionInDays: 30, features: { enableLogAccessUsingOnlyResourcePermissions: true } } }
resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  tags: { 'azd-service-name': 'web' }
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'node server.js'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      ftpsState: 'Disabled'
      alwaysOn: true
      healthCheckPath: '/api/health'
      http20Enabled: true
    }
  }
}
resource storageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, app.id, 'blob-contributor')
  scope: storage
  properties: { principalId: app.identity.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe') }
}
resource vaultRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, app.id, 'secrets-user')
  scope: vault
  properties: { principalId: app.identity.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6') }
}
var requiredAppSettings = {
  NODE_ENV: 'production'
  HOSTNAME: '0.0.0.0'
  WEBSITE_NODE_DEFAULT_VERSION: '~22'
  WEBSITE_RUN_FROM_PACKAGE: '1'
  SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
  ENABLE_ORYX_BUILD: 'false'
  NEXTAUTH_URL: 'https://${app.properties.defaultHostName}'
  NEXTAUTH_SECRET: '@Microsoft.KeyVault(SecretUri=${vault.properties.vaultUri}secrets/nextauth-secret/)'
  ENTRA_CLIENT_ID: entraClientId
  ENTRA_CLIENT_SECRET: '@Microsoft.KeyVault(SecretUri=${vault.properties.vaultUri}secrets/entra-client-secret/)'
  ENTRA_TENANT_ID: entraTenantId
  ADMIN_GROUP_IDS: adminGroupIds
  AZURE_STORAGE_ACCOUNT: storage.name
  AZURE_STORAGE_CONTAINER: packages.name
  GRAPH_AUTH_MODE: 'managed-identity'
  GRAPH_MAIL_SENDER: graphMailSender
  NOTIFICATIONS_JOB_TOKEN: '@Microsoft.KeyVault(SecretUri=${vault.properties.vaultUri}secrets/notifications-job-token/)'
  REQUIRE_MALWARE_SCAN: 'true'
  DEMO_MODE: 'false'
  SEED_EXAMPLES: 'false'
  NEXT_TELEMETRY_DISABLED: '1'
}
var optionalAppSettings = empty(teamsNotificationWebhook) ? {} : {
  TEAMS_NOTIFICATION_WEBHOOK: '@Microsoft.KeyVault(SecretUri=${vault.properties.vaultUri}secrets/teams-notification-webhook/)'
}
resource appSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: app
  name: 'appsettings'
  dependsOn: [vaultRole, storageRole, clientSecret, sessionSecret, notificationJobSecret, teamsWebhookSecret]
  properties: union(requiredAppSettings, optionalAppSettings)
}
resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'marketplace-logs'
  scope: app
  properties: {
    workspaceId: logs.id
    logs: [
      { category: 'AppServiceConsoleLogs', enabled: true }
      { category: 'AppServiceHTTPLogs', enabled: true }
      { category: 'AppServicePlatformLogs', enabled: true }
    ]
    metrics: [{ category: 'AllMetrics', enabled: true }]
  }
}
output appUrl string = 'https://${app.properties.defaultHostName}'
output appName string = app.name
output principalId string = app.identity.principalId
output storageAccountName string = storage.name
output keyVaultName string = vault.name
