const { Client } = require('@microsoft/microsoft-graph-client');
const MSALAuthenticationProvider = require('./graph-auth-provider');

function createGraphClient() {
  const authProvider = new MSALAuthenticationProvider();

  const client = Client.initWithMiddleware({
    authProvider,
    defaultVersion: 'v1.0',
    debugLogging: process.env.NODE_ENV === 'development'
  });

  return client;
}

module.exports = {
  createGraphClient
};