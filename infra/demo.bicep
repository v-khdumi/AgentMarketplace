@description('Globally unique App Service name')
@minLength(2)
@maxLength(60)
param appName string = 'agent-marketplace-${uniqueString(resourceGroup().id)}'

@description('Azure region for the demo resources')
param location string = resourceGroup().location

@description('Public GitHub repository containing the application')
param repositoryUrl string = 'https://github.com/v-khdumi/AgentMarketplace'

@description('Repository branch deployed by App Service')
param branch string = 'main'

var suffix = uniqueString(resourceGroup().id, appName)
var storageName = 'amdemo${suffix}'
var sessionSecret = '${uniqueString(resourceGroup().id, appName, subscription().subscriptionId)}${uniqueString(appName, tenant().tenantId)}${uniqueString(storageName, resourceGroup().id)}'

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${appName}-plan'
  location: location
  sku: { name: 'F1' }
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
    deleteRetentionPolicy: { enabled: true, days: 7 }
  }
}

resource packages 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blob
  name: 'agent-packages'
  properties: { publicAccess: 'None' }
}

resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'npm start'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      ftpsState: 'Disabled'
      alwaysOn: false
      healthCheckPath: '/api/health'
      http20Enabled: true
    }
  }
}

resource storageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, app.id, 'blob-contributor')
  scope: storage
  properties: {
    principalId: app.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
  }
}

resource appSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: app
  name: 'appsettings'
  dependsOn: [storageRole]
  properties: {
    NODE_ENV: 'production'
    WEBSITE_NODE_DEFAULT_VERSION: '~22'
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'true'
    ENABLE_ORYX_BUILD: 'true'
    NEXTAUTH_URL: 'https://${app.properties.defaultHostName}'
    NEXTAUTH_SECRET: sessionSecret
    PUBLIC_DEMO_MODE: 'true'
    DEMO_TENANT_ID: 'agent-marketplace-demo'
    SEED_EXAMPLES: 'true'
    AZURE_STORAGE_ACCOUNT: storage.name
    AZURE_STORAGE_CONTAINER: packages.name
    REQUIRE_MALWARE_SCAN: 'false'
    NEXT_TELEMETRY_DISABLED: '1'
  }
}

resource sourceControl 'Microsoft.Web/sites/sourcecontrols@2023-12-01' = {
  parent: app
  name: 'web'
  dependsOn: [appSettings]
  properties: {
    repoUrl: repositoryUrl
    branch: branch
    isManualIntegration: true
    deploymentRollbackEnabled: false
    isMercurial: false
  }
}

output demoUrl string = 'https://${app.properties.defaultHostName}'
output storageAccountName string = storage.name