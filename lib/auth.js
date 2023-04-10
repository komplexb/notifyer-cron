const msal = require('@azure/msal-node') // Microsoft Authentication Library for Node
const localStorage = require('./store')
const db = require('../db/persist')
const notify = require('./notify')
const { promises: fs } = require('fs')

const msalConfig = {
  scopes: ['user.read', 'notes.read', 'offline_access'],
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
      console.error('deviceLogin()', JSON.stringify(error))
    })
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
  const account = localStorage.getItem('onenote').account;

  if (!account) return deviceLogin();
  const { homeAccountId, environment } = account;
  const { aud } = localStorage.getItem('onenote').idTokenClaims
  let cache
  await fs
    .readFile(process.env.CACHE_PATH, 'utf-8')
    .then(data => {
      cache = JSON.parse(data)
    })
    .catch(error => {
      console.log('Cache Error', error)
    })

  const refreshToken =
    cache.RefreshToken[`${homeAccountId}-${environment}-refreshtoken-${aud}--`]
      .secret

  const pca = new msal.PublicClientApplication({
    auth: msalConfig.auth,
    cache: cachePlugin()
  })

  const refreshTokenRequest = {
    refreshToken,
    scopes: msalConfig.scopes
  }

  return new Promise((resolve, reject) => {
    pca
      .acquireTokenByRefreshToken(refreshTokenRequest)
      .then(response => {
        localStorage.setItem(
          'onenote',
          { datestamp: Date.now(), ...response },
          true
        )
        console.log('Token Refreshed')
        resolve()
      })
      .catch(error => {
        console.error('refreshToken', error.status, JSON.stringify(error))
        reject(error)
      })
  })
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

  return Date.now() <= Date.parse(localStorage.getItem('onenote').expiresOn)
}

module.exports = {
  refreshToken,
  deviceLogin,
  hasValidToken
}
