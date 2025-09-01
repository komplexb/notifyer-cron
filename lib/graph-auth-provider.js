require('isomorphic-fetch');
const localStorage = require('./store');

class MSALAuthenticationProvider {
  constructor() {
    this.name = 'MSAL Authentication Provider';
  }

  async getAccessToken() {
    const onenoteData = localStorage.getItem('onenote');

    if (!onenoteData || !onenoteData.accessToken) {
      throw new Error('No access token available');
    }

    const now = Date.now();
    const expiresOn = Date.parse(onenoteData.expiresOn);

    if (isNaN(expiresOn) || now >= expiresOn - (5 * 60 * 1000)) {
      throw new Error('Access token is expired or will expire soon');
    }

    return onenoteData.accessToken;
  }
}

module.exports = MSALAuthenticationProvider;