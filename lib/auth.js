const msal = require('@azure/msal-node') // Microsoft Authentication Library for Node
const localStorage = require('./store')
const db = require('../db/persist')
const notify = require('./notify')
const { promises: fs } = require('fs')

const msalConfig = {
  scopes: ['user.read', 'notes.read', 'offline_access'], // ensure offline_access is included
  auth: {
    clientId: process.env.NOTIFYER_CLIENT_ID,
    authority: process.env.MS_GRAPH_AUTHORITY
  }
}

/**
 * Provides token cache serialization and persistence.
 */
function cachePlugin () {
  const path = require('path');
  
  const beforeCacheAccess = async cacheContext => {
    try {
      const cachePath = path.resolve(process.env.CACHE_PATH);
      const cacheData = await fs.readFile(cachePath, 'utf-8');
      cacheContext.tokenCache.deserialize(cacheData);
      console.log('Cache loaded from file system');
    } catch (error) {
      console.log('No cache file found or error reading cache:', error.message);
      // Cache will start empty if file doesn't exist
    }
  }

  const afterCacheAccess = async cacheContext => {
    if (cacheContext.cacheHasChanged) {
      try {
        const cachePath = path.resolve(process.env.CACHE_PATH);
        const serializedCache = cacheContext.tokenCache.serialize();
        
        // Write to local file system
        await fs.writeFile(cachePath, serializedCache);
        console.log('Cache written to file system');
        
        // Persist to DynamoDB
        await db.setItem('cache', serializedCache);
        console.log('Cache persisted to DynamoDB');
      } catch (error) {
        console.error('Error persisting cache:', error);
        throw error;
      }
    }
  }

  return {
    cachePlugin: {
      beforeCacheAccess,
      afterCacheAccess
    }
  }
}

/**
 * The Microsoft identity platform supports the device authorization grant,
 * which allows users to sign in to input-constrained devices such as a smart TV, IoT device, console apps, daemon, or printer.
 * To enable this flow, the device has the user visit a webpage in their browser on another device to sign in.
 * Once the user signs in, the device is able to get access tokens and refresh tokens as needed.
 *
 * This method is perfect for a event driven serverless app that runs with no user interaction once initialized.
 *
 * {@link https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-device-code}
 */
function deviceLogin () {
  console.log('Starting device login process...');
  
  const pca = new msal.PublicClientApplication({
    auth: msalConfig.auth,
    cache: cachePlugin()
  })

  const deviceCodeRequest = {
    deviceCodeCallback: response => {
      console.log('Device code received, sending to Telegram...');
      return notify.sendNoteToTelegram(
        `🔐 Device Login Required\n\n${response.message}\n\n⏰ Code expires in ${Math.round(response.expiresIn/60)} minutes`,
        process.env.DEFAULT_TELEGRAM_CHANNEL, 
        null, 
        true
      );
    },
    scopes: msalConfig.scopes
  }

  return pca
    .acquireTokenByDeviceCode(deviceCodeRequest)
    .then(response => {
      localStorage.setItem(
        'onenote',
        { datestamp: Date.now(), ...response },
        true
      )
      console.log('Device login completed successfully');
      console.log(`Token expires at: ${new Date(response.expiresOn)}`);
      console.log(`Extended expiry: ${new Date(response.extExpiresOn)}`);

      return response
    })
    .catch(error => {
      console.error('Device login failed:', error.errorCode, error.errorMessage);
      
      if (error.errorCode === 'expired_token') {
        console.log('Device code expired. User took too long to authenticate.');
        throw new Error(`Device code expired after timeout. User must complete authentication within the time limit.`);
      } else if (error.code === 'ECONNREFUSED') {
        console.log('Connection refused. Network connectivity issue.');
        throw new Error('Network connectivity issue during device login');
      } else if (error.errorCode === 'authorization_declined') {
        console.log('User declined the authorization request');
        throw new Error('User declined the device login authorization');
      }
      
      throw error; // Re-throw other errors for the caller to handle
    });
}

/**
 * Exchange the authorization code for an access token [and refresh token].
 * Access_tokens are short lived, and you must refresh them after they expire to continue accessing resources.
 *
 * {@link https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow#refresh-the-access-token}
 *
 * {@link https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-common/docs/request.md#refresh-token-flow}
 *
 * @returns {Promise}
 */
async function refreshToken() {
  console.log("*** run refresh token ***");
  let account;
  try {
    account = localStorage.getItem('onenote').account;
  } catch (error) {
    console.log('Error retrieving account from localStorage:', error);
    return deviceLogin();
  }

  if (!account) {
    console.log('No account found, initiating device login');
    return deviceLogin();
  }

  const { homeAccountId, environment } = account;
  const { aud } = localStorage.getItem('onenote').idTokenClaims;
  let cache;

  try {
    const path = require('path');
    const cachePath = path.resolve(process.env.CACHE_PATH);
    const data = await fs.readFile(cachePath, 'utf-8');
    cache = JSON.parse(data);
    console.log('Cache file loaded successfully');
  } catch (error) {
    console.error('Cache Error:', error.message);
    return deviceLogin();
  }

  const refreshTokenKey = `${homeAccountId}-${environment}-refreshtoken-${aud}--`;
  console.log(`Looking for refresh token with key: ${refreshTokenKey}`);
  
  const refreshToken = cache.RefreshToken[refreshTokenKey]?.secret;

  if (!refreshToken) {
    console.log('No refresh token found in cache, initiating device login');
    console.log(`Available refresh token keys: ${Object.keys(cache.RefreshToken || {})}`);
    return deviceLogin();
  }
  
  console.log('Refresh token found, attempting token refresh');

  const pca = new msal.PublicClientApplication({
    auth: msalConfig.auth,
    cache: cachePlugin()
  });

  const refreshTokenRequest = {
    refreshToken,
    scopes: msalConfig.scopes
  };

  try {
    const response = await pca.acquireTokenByRefreshToken(refreshTokenRequest);
    localStorage.setItem('onenote', { datestamp: Date.now(), ...response }, true);
    console.log('Token Refreshed successfully');
    console.log(`New token expires at: ${new Date(response.expiresOn)}`);
    console.log(`Extended expiry: ${new Date(response.extExpiresOn)}`);
    return response;
  } catch (error) {
    console.error('refreshToken error:', error.errorCode, error.errorMessage);
    console.error('Error details:', JSON.stringify({
      errorCode: error.errorCode,
      errorMessage: error.errorMessage,
      timestamp: new Date().toISOString()
    }));
    
    if (error.errorCode === 'invalid_grant') {
      console.log('Invalid refresh token, initiating device login');
      return deviceLogin();
    }
    throw error;
  }
}


/**
 * MS Graph API calls are central to the functionality of the service.
 * Ensure there is a valid access token to ensure successful API calls.
 */
function hasValidToken () {
  // no-one has logged in before, or localStorage restore failed.
  if (localStorage.getItem('onenote') === null) {
    return false
  }

  const bufferTime = 5 * 60 * 1000; // 5 minutes buffer time
  return Date.now() <= Date.parse(localStorage.getItem('onenote').extExpiresOn) - bufferTime;
}

/**
 * Manually persist current cache state to DynamoDB
 * Call this after successful authentication operations
 */
async function persistCache() {
  try {
    const path = require('path');
    const cachePath = path.resolve(process.env.CACHE_PATH);
    const cacheData = await fs.readFile(cachePath, 'utf-8');
    await db.setItem('cache', cacheData);
    console.log('Cache manually persisted to DynamoDB');
  } catch (error) {
    console.error('Error manually persisting cache:', error);
  }
}

module.exports = {
  refreshToken,
  deviceLogin,
  hasValidToken,
  persistCache
}
