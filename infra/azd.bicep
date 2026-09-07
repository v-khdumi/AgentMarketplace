targetScope = 'subscription'

@minLength(2)
@maxLength(40)
param environmentName string
param location string
param entraClientId string
param entraTenantId string = tenant().tenantId
@secure()
param entraClientSecret string
@secure()
param nextAuthSecret string
param adminGroupIds string = ''
param graphMailSender string = ''
@secure()
param teamsNotificationWebhook string = ''
@secure()
@minLength(32)
param notificationsJobToken string

resource group 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: { 'azd-env-name': environmentName }
}

module application './main.bicep' = {
  name: 'marketplace-${environmentName}'
  scope: group
  params: {
    appName: 'agents-${uniqueString(subscription().subscriptionId, environmentName)}'
    location: location
    entraClientId: entraClientId
    entraClientSecret: entraClientSecret
    entraTenantId: entraTenantId
    nextAuthSecret: nextAuthSecret
    adminGroupIds: adminGroupIds
    graphMailSender: graphMailSender
    teamsNotificationWebhook: teamsNotificationWebhook
    notificationsJobToken: notificationsJobToken
  }
}

output AZURE_RESOURCE_GROUP string = group.name
output AZURE_WEBAPP_NAME string = application.outputs.appName
output AZURE_STORAGE_ACCOUNT string = application.outputs.storageAccountName
output AZURE_KEY_VAULT_NAME string = application.outputs.keyVaultName
output AZURE_WEBAPP_PRINCIPAL_ID string = application.outputs.principalId
output SERVICE_WEB_ENDPOINT_URL string = application.outputs.appUrl