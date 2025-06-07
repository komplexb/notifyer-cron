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
 * Handles both file system and DynamoDB persistence for Lambda environments.
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
  const pca = new msal.PublicClientApplication({
    auth: msalConfig.auth,
    cache: cachePlugin()
  })

  const deviceCodeRequest = {
    deviceCodeCallback: response => notify.sendNoteToTelegram(response.message, process.env.DEFAULT_TELEGRAM_CHANNEL, null, true),
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
      console.log(/********* logged in ********/)

      return response
    })
    .catch(error => {
      console.error('Device login failed:', error);
      if (error.errorCode === 'expired_token') {
        console.log('Device code expired. Requesting a new one...');
        return deviceLogin(); // Recursively try again
      } else if (error.code === 'ECONNREFUSED') {
        console.log('Connection refused. Check network and try again later.');
      }
      throw error; // Re-throw the error for the caller to handle
    });
}

/**
 * Use MSAL acquireTokenSilent for proper token refresh.
 * This is the recommended approach for silent token acquisition.
 *
 * @returns {Promise}
 */
async function refreshToken() {
  console.log("*** run refresh token ***");

  const pca = new msal.PublicClientApplication({
    auth: msalConfig.auth,
    cache: cachePlugin()
  });

  try {
    // Get all accounts from cache
    const accounts = await pca.getTokenCache().getAllAccounts();
    console.log(`Found ${accounts.length} accounts in cache`);

    if (accounts.length === 0) {
      console.log('No accounts in cache, initiating device login');
      return deviceLogin();
    }

    // Use the first account for silent token acquisition
    const account = accounts[0];

    const silentRequest = {
      account: account,
      scopes: msalConfig.scopes,
      forceRefresh: false // Allow using cached tokens if still valid
    };

    const response = await pca.acquireTokenSilent(silentRequest);

    // Store in localStorage for immediate access
    localStorage.setItem('onenote', { datestamp: Date.now(), ...response }, true);

    console.log('Token Refreshed via acquireTokenSilent');
    console.log(`New token expires at: ${new Date(response.expiresOn)}`);
    console.log(`Extended expiry: ${new Date(response.extExpiresOn)}`);

    return response;

  } catch (error) {
    console.error('Silent token acquisition failed:', error.errorCode, error.errorMessage);

    // Handle specific error cases that require re-authentication
    if (error.errorCode === 'no_tokens_found' ||
        error.errorCode === 'invalid_grant' ||
        error.errorCode === 'interaction_required' ||
        error.errorCode === 'token_expired') {
      console.log('Re-authentication required, initiating device login');
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
  const oneNoteData = localStorage.getItem('onenote');
  if (oneNoteData === null) {
    console.log('No token data found in localStorage');
    return false;
  }

  const bufferTime = 5 * 60 * 1000; // 5 minutes buffer time
  const now = Date.now();
  const expiresOn = Date.parse(oneNoteData.expiresOn);
  const extExpiresOn = Date.parse(oneNoteData.extExpiresOn);

  console.log(`Token check - Now: ${new Date(now)}, Expires: ${new Date(expiresOn)}, ExtExpires: ${new Date(extExpiresOn)}`);

  // Use extExpiresOn for extended validity with buffer
  const isValid = now <= extExpiresOn - bufferTime;
  console.log(`Token is ${isValid ? 'valid' : 'expired'}`);

  return isValid;
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
