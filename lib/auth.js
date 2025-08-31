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
      
      if (cacheData && cacheData.trim()) {
        // Validate that we have proper MSAL cache structure
        try {
          const parsed = JSON.parse(cacheData);
          if (parsed.Account && parsed.RefreshToken && parsed.AccessToken) {
            cacheContext.tokenCache.deserialize(cacheData);
            console.log(`Valid MSAL cache loaded from file system (${cacheData.length} chars)`);
          } else {
            console.log('Invalid cache structure, starting fresh');
            // Let MSAL start with its default empty structure
          }
        } catch (parseError) {
          console.log('Cache data is not valid JSON, starting fresh');
          // Let MSAL start with its default empty structure
        }
      } else {
        console.log('Cache file is empty, starting with fresh cache');
      }
    } catch (error) {
      console.log('No cache file found or error reading cache:', error.message);
      // Cache will start empty if file doesn't exist - this is normal for first run
    }
  }

  const afterCacheAccess = async cacheContext => {
    if (cacheContext.cacheHasChanged) {
      try {
        const cachePath = path.resolve(process.env.CACHE_PATH);
        const serializedCache = cacheContext.tokenCache.serialize();
        
        console.log(`Cache changed, serialized length: ${serializedCache?.length || 0}`);
        console.log(`Cache preview: ${serializedCache?.substring(0, 100)}...`);
        
        // Validate the serialized cache before saving
        if (serializedCache && serializedCache.length > 10) {
          try {
            const parsed = JSON.parse(serializedCache);
            if (parsed.Account && parsed.RefreshToken) {
              // Write to local file system
              await fs.writeFile(cachePath, serializedCache);
              console.log('Valid cache written to file system');
              
              // Persist to DynamoDB
              await db.setItem('cache', serializedCache);
              console.log('Valid cache persisted to DynamoDB');
            } else {
              console.warn('Cache structure is invalid, not persisting');
            }
          } catch (parseError) {
            console.warn('Serialized cache is not valid JSON, not persisting');
          }
        } else {
          console.warn('Cache is too small or empty, not persisting');
        }
      } catch (error) {
        console.error('Error persisting cache:', error);
        throw error;
      }
    } else {
      console.log('Cache has not changed, skipping persistence');
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
function deviceLogin (reason = 'Authentication required') {
  console.log(`Starting device login process... Reason: ${reason}`);
  
  const pca = new msal.PublicClientApplication({
    auth: msalConfig.auth,
    cache: cachePlugin()
  })

  // Create contextual messages based on the reason
  const getContextualMessage = (reason) => {
    const messages = {
      'tokens_expired': '⏰ Your authentication tokens have expired and need to be renewed.',
      'no_tokens_found': '🔍 No valid authentication tokens found in cache.',
      'invalid_tokens': '❌ Current authentication tokens are invalid or corrupted.',
      'no_account_found': '👤 No authenticated account found in the system.',
      'cache_corrupted': '💾 Authentication cache is corrupted and needs to be rebuilt.',
      'first_time_setup': '🆕 First time setup - authentication required.',
      'refresh_failed': '🔄 Token refresh failed - re-authentication needed.',
      'unknown_error': '⚠️ Authentication error occurred - re-authentication needed.'
    };
    
    return messages[reason] || messages['unknown_error'];
  };

  const deviceCodeRequest = {
    deviceCodeCallback: response => {
      console.log('Device code received, sending to Telegram...');
      const contextMessage = getContextualMessage(reason);
      
      return notify.sendNoteToTelegram(
        `🔐 Device Login Required\n\n${contextMessage}\n\n${response.message}\n\n⏰ Code expires in ${Math.round(response.expiresIn/60)} minutes`,
        process.env.DEFAULT_TELEGRAM_CHANNEL, 
        null, 
        true
      );
    },
    scopes: msalConfig.scopes
  }

  return pca
    .acquireTokenByDeviceCode(deviceCodeRequest)
    .then(async response => {
      // Store the response with timestamp
      const tokenData = { datestamp: Date.now(), ...response };
      localStorage.setItem('onenote', tokenData, true);
      
      console.log('Device login completed successfully');
      console.log(`Token expires at: ${new Date(response.expiresOn)}`);
      console.log(`Extended expiry: ${new Date(response.extExpiresOn)}`);
      
      // Manually persist cache to ensure it's saved
      try {
        await persistCache();
      } catch (error) {
        console.error('Error persisting cache after device login:', error);
      }

      return response;
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
  console.log("=== REFRESH TOKEN DEBUG START ===");
  let account;
  try {
    const onenoteData = localStorage.getItem('onenote');
    console.log(`OneNote data in refresh: ${!!onenoteData}`);
    if (onenoteData) {
      console.log(`OneNote data keys: ${Object.keys(onenoteData)}`);
      account = onenoteData.account;
      console.log(`Account extracted: ${!!account}`);
      if (account) {
        console.log(`Account homeAccountId: ${account.homeAccountId}`);
        console.log(`Account environment: ${account.environment}`);
      }
    }
  } catch (error) {
    console.log('Error retrieving account from localStorage:', error);
    return deviceLogin('cache_corrupted');
  }

  if (!account) {
    console.log('No account found, initiating device login');
    return deviceLogin('no_account_found');
  }

  const { homeAccountId, environment } = account;
  const { aud } = localStorage.getItem('onenote').idTokenClaims;
  let cache;

  // Create MSAL instance with cache plugin - let MSAL handle cache loading
  const pca = new msal.PublicClientApplication({
    auth: msalConfig.auth,
    cache: cachePlugin()
  });

  try {
    // Get all accounts from MSAL cache instead of using localStorage account
    const accounts = await pca.getTokenCache().getAllAccounts();
    console.log(`Found ${accounts.length} accounts in MSAL cache`);
    
    if (accounts.length === 0) {
      console.log('No accounts found in MSAL cache, initiating device login');
      return deviceLogin('no_account_found');
    }
    
    // Use the first account (or find matching account)
    const msalAccount = accounts[0];
    console.log(`Using MSAL account: ${msalAccount.homeAccountId}`);
    console.log(`Account username: ${msalAccount.username}`);
    
    // Use MSAL's built-in silent token acquisition
    const silentRequest = {
      account: msalAccount,
      scopes: msalConfig.scopes
    };

    console.log('Attempting silent token acquisition with MSAL account...');
    const response = await pca.acquireTokenSilent(silentRequest);
    const tokenData = { datestamp: Date.now(), ...response };
    localStorage.setItem('onenote', tokenData, true);
    
    console.log('Token Refreshed successfully');
    console.log(`New token expires at: ${new Date(response.expiresOn)}`);
    console.log(`Extended expiry: ${new Date(response.extExpiresOn)}`);
    
    // Manually persist cache to ensure it's saved
    try {
      await persistCache();
    } catch (persistError) {
      console.error('Error persisting cache after refresh:', persistError);
    }
    
    return response;
  } catch (error) {
    console.error('Silent token acquisition failed:', error.errorCode, error.errorMessage);
    console.error('Error details:', JSON.stringify({
      errorCode: error.errorCode,
      errorMessage: error.errorMessage,
      timestamp: new Date().toISOString()
    }));
    
    // Handle different MSAL error codes that should trigger device login
    const errorReasonMap = {
      'invalid_grant': 'invalid_tokens',
      'interaction_required': 'tokens_expired',
      'no_tokens_found': 'no_tokens_found',
      'no_account_found': 'no_account_found',
      'no_cached_refresh_token': 'no_tokens_found',
      'refresh_token_expired': 'tokens_expired'
    };
    
    // Check for specific error codes
    if (errorReasonMap[error.errorCode]) {
      console.log(`Error requires device login: ${error.errorCode}`);
      return deviceLogin(errorReasonMap[error.errorCode]);
    }
    
    // Check for specific error messages
    if (error.message?.includes('No refresh token found') || 
        error.message?.includes('Please sign-in')) {
      console.log(`Error message requires device login: ${error.message}`);
      return deviceLogin('no_tokens_found');
    }
    
    // For other errors, still try device login as fallback
    console.log('Unknown error, falling back to device login');
    return deviceLogin('unknown_error');
  }
}


/**
 * MS Graph API calls are central to the functionality of the service.
 * Ensure there is a valid access token to ensure successful API calls.
 */
function hasValidToken () {
  console.log('=== TOKEN VALIDATION DEBUG ===');
  
  // no-one has logged in before, or localStorage restore failed.
  const onenoteData = localStorage.getItem('onenote');
  console.log(`OneNote data exists: ${!!onenoteData}`);
  
  if (!onenoteData) {
    console.log('No OneNote data found in localStorage');
    return false;
  }

  console.log(`OneNote data keys: ${Object.keys(onenoteData)}`);
  console.log(`OneNote data sample: ${JSON.stringify(onenoteData).substring(0, 200)}...`);

  // Check if we have valid expiration dates
  if (!onenoteData.extExpiresOn || !onenoteData.expiresOn) {
    console.log('Missing expiration dates in token data');
    console.log(`extExpiresOn: ${onenoteData.extExpiresOn}`);
    console.log(`expiresOn: ${onenoteData.expiresOn}`);
    return false;
  }

  const bufferTime = 5 * 60 * 1000; // 5 minutes buffer time
  const extExpiresOn = Date.parse(onenoteData.extExpiresOn);
  const expiresOn = Date.parse(onenoteData.expiresOn);
  
  // Check if dates are valid
  if (isNaN(extExpiresOn) || isNaN(expiresOn)) {
    console.log('Invalid expiration dates in token data');
    console.log(`extExpiresOn parse result: ${extExpiresOn}`);
    console.log(`expiresOn parse result: ${expiresOn}`);
    return false;
  }

  const now = Date.now();
  const isValid = now <= extExpiresOn - bufferTime;
  const timeUntilExpiry = extExpiresOn - now;
  const hoursUntilExpiry = timeUntilExpiry / (1000 * 60 * 60);
  
  console.log(`=== TOKEN VALIDATION RESULTS ===`);
  console.log(`Current time: ${new Date(now).toISOString()}`);
  console.log(`Token expires: ${new Date(expiresOn).toISOString()}`);
  console.log(`Token ext expires: ${new Date(extExpiresOn).toISOString()}`);
  console.log(`Hours until expiry: ${hoursUntilExpiry.toFixed(2)}`);
  console.log(`Is valid: ${isValid}`);
  console.log(`Buffer time: ${bufferTime / 1000 / 60} minutes`);
  
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
