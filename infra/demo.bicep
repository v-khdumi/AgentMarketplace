@description('Globally unique App Service name')
@minLength(2)
@maxLength(60)
param appName string = 'agent-marketplace-${uniqueString(resourceGroup().id)}'

@description('Azure region for the demo resources')
param location string = resourceGroup().location

@description('Prebuilt Linux standalone ZIP published with the repository')
param packageUri string = 'https://raw.githubusercontent.com/v-khdumi/AgentMarketplace/a534c34/release/agent-marketplace-linux.zip'

var sessionSecret = '${uniqueString(resourceGroup().id, appName, subscription().subscriptionId)}${uniqueString(appName, tenant().tenantId)}${uniqueString(resourceGroup().id, tenant().tenantId)}'

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${appName}-plan'
  location: location
  sku: { name: 'F1' }
  kind: 'linux'
  properties: { reserved: true }
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
      appCommandLine: 'node server.js'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      ftpsState: 'Disabled'
      alwaysOn: false
      healthCheckPath: '/api/health'
      http20Enabled: true
    }
  }
}

resource appSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: app
  name: 'appsettings'
  properties: {
    NODE_ENV: 'production'
    WEBSITE_NODE_DEFAULT_VERSION: '~22'
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
    ENABLE_ORYX_BUILD: 'false'
    NEXTAUTH_URL: 'https://${app.properties.defaultHostName}'
    NEXTAUTH_SECRET: sessionSecret
    PUBLIC_DEMO_MODE: 'true'
    DEMO_TENANT_ID: 'agent-marketplace-demo-v3'
    SEED_EXAMPLES: 'true'
    MARKETPLACE_DATA_DIR: '/tmp/agent-marketplace'
    REQUIRE_MALWARE_SCAN: 'false'
    NEXT_TELEMETRY_DISABLED: '1'
  }
}

resource zipDeploy 'Microsoft.Web/sites/extensions@2021-03-01' = {
  parent: app
  name: 'onedeploy'
  dependsOn: [appSettings]
  #disable-next-line BCP187
  properties: {
    packageUri: packageUri
    type: 'zip'
    clean: true
    restart: true
  }
}

output demoUrl string = 'https://${app.properties.defaultHostName}'
