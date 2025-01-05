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
  const beforeCacheAccess = async cacheContext => {
    cacheContext.tokenCache.deserialize(
      await fs.readFile(process.env.CACHE_PATH, 'utf-8')
    )
  }

  const afterCacheAccess = async cacheContext => {
    if (cacheContext.cacheHasChanged) {
      await fs.writeFile(
        process.env.CACHE_PATH,
        cacheContext.tokenCache.serialize()
      )
      const data = await fs.readFile(process.env.CACHE_PATH, 'utf-8')
      db.setItem('cache', data) // persist updated cache to DB
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

      resolve()
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
    const data = await fs.readFile(process.env.CACHE_PATH, 'utf-8');
    cache = JSON.parse(data);
  } catch (error) {
    console.log('Cache Error', error);
    return deviceLogin();
  }

  const refreshTokenKey = `${homeAccountId}-${environment}-refreshtoken-${aud}--`;
  const refreshToken = cache.RefreshToken[refreshTokenKey]?.secret;

  if (!refreshToken) {
    console.log('No refresh token found, initiating device login');
    return deviceLogin();
  }

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
    console.log('Token Refreshed');
    return response;
  } catch (error) {
    console.error('refreshToken error:', error.errorCode, error.errorMessage);
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

module.exports = {
  refreshToken,
  deviceLogin,
  hasValidToken
}
