const { deviceLogin, hasValidToken, refreshToken } = require('../lib/auth');
const msal = require('@azure/msal-node');

// Mock dependencies
jest.mock('../lib/store');
jest.mock('../db/persist');
jest.mock('../lib/notify');
jest.mock('fs');
jest.mock('@azure/msal-node');

describe('Auth module', () => {
  describe('hasValidToken', () => {
    it('should return false when onenote is not in localStorage', () => {
      const localStorage = require('../lib/store');
      localStorage.getItem.mockReturnValue(null);
      expect(hasValidToken()).toBe(false);
    });

    it('should return true when token is not expired', () => {
      const localStorage = require('../lib/store');
      const futureDate = new Date(Date.now() + 3600000).toISOString(); // 1 hour in the future
      localStorage.getItem.mockReturnValue({ expiresOn: futureDate });
      expect(hasValidToken()).toBe(true);
    });

    it('should return false when token is expired', () => {
      const localStorage = require('../lib/store');
      const pastDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour in the past
      localStorage.getItem.mockReturnValue({ expiresOn: pastDate });
      expect(hasValidToken()).toBe(false);
    });
  });

  describe('deviceLogin', () => {
    it('should successfully log in and store token', async () => {
      const mockResponse = { datestamp: Date.now(), accessToken: 'mock_token' };
      msal.PublicClientApplication.mockImplementation(() => ({
        acquireTokenByDeviceCode: jest.fn().mockResolvedValue(mockResponse)
      }));

      const localStorage = require('../lib/store');
      localStorage.setItem = jest.fn();

      await expect(deviceLogin()).resolves.not.toThrow();
      expect(localStorage.setItem).toHaveBeenCalledWith('onenote', expect.objectContaining(mockResponse), true);
    });

    it('should handle expired token error and retry', async () => {
      const mockError = { errorCode: 'expired_token' };
      const mockResponse = { datestamp: Date.now(), accessToken: 'mock_token' };
      msal.PublicClientApplication.mockImplementation(() => ({
        acquireTokenByDeviceCode: jest.fn()
          .mockRejectedValueOnce(mockError)
          .mockResolvedValueOnce(mockResponse)
      }));

      const localStorage = require('../lib/store');
      localStorage.setItem = jest.fn();

      await expect(deviceLogin()).resolves.not.toThrow();
      expect(localStorage.setItem).toHaveBeenCalledWith('onenote', expect.objectContaining(mockResponse), true);
    });
  });

  describe('refreshToken', () => {
    it('should successfully refresh token', async () => {
      const localStorage = require('../lib/store');
      localStorage.getItem.mockReturnValue({
        account: { homeAccountId: 'mockId', environment: 'mockEnv' },
        idTokenClaims: { aud: 'mockAud' }
      });

      const fs = require('fs').promises;
      fs.readFile.mockResolvedValue(JSON.stringify({
        RefreshToken: {
          'mockId-mockEnv-refreshtoken-mockAud--': { secret: 'mock_refresh_token' }
        }
      }));

      const mockResponse = { datestamp: Date.now(), accessToken: 'new_mock_token' };
      msal.PublicClientApplication.mockImplementation(() => ({
        acquireTokenByRefreshToken: jest.fn().mockResolvedValue(mockResponse)
      }));

      await expect(refreshToken()).resolves.toEqual(mockResponse);
      expect(localStorage.setItem).toHaveBeenCalledWith('onenote', expect.objectContaining(mockResponse), true);
    });

    it('should fall back to deviceLogin if no account is found', async () => {
      const localStorage = require('../lib/store');
      localStorage.getItem.mockReturnValue(null);

      const deviceLoginMock = jest.fn().mockResolvedValue('device_login_result');
      jest.spyOn(require('../lib/auth'), 'deviceLogin').mockImplementation(deviceLoginMock);

      await expect(refreshToken()).resolves.toBe('device_login_result');
      expect(deviceLoginMock).toHaveBeenCalled();
    });
  });
});