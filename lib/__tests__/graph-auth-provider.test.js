const MSALAuthenticationProvider = require('../graph-auth-provider')
const localStorage = require('../store')

jest.mock('../store')

describe('MSALAuthenticationProvider', () => {
  let authProvider

  beforeEach(() => {
    authProvider = new MSALAuthenticationProvider()
    jest.clearAllMocks()
  })

  describe('getAccessToken', () => {
    it('should return access token when valid token exists', async () => {
      const mockTokenData = {
        accessToken: 'test-access-token',
        expiresOn: new Date(Date.now() + 600000).toISOString() // 10 minutes from now
      }
      localStorage.getItem.mockReturnValue(mockTokenData)

      const token = await authProvider.getAccessToken()

      expect(token).toBe('test-access-token')
      expect(localStorage.getItem).toHaveBeenCalledWith('onenote')
    })

    it('should throw error when no token data exists', async () => {
      localStorage.getItem.mockReturnValue(null)

      await expect(authProvider.getAccessToken()).rejects.toThrow('No access token available')
    })

    it('should throw error when no access token in data', async () => {
      localStorage.getItem.mockReturnValue({ expiresOn: new Date().toISOString() })

      await expect(authProvider.getAccessToken()).rejects.toThrow('No access token available')
    })

    it('should throw error when token is expired', async () => {
      const mockTokenData = {
        accessToken: 'test-access-token',
        expiresOn: new Date(Date.now() - 600000).toISOString() // 10 minutes ago
      }
      localStorage.getItem.mockReturnValue(mockTokenData)

      await expect(authProvider.getAccessToken()).rejects.toThrow('Access token is expired or will expire soon')
    })

    it('should throw error when token expires soon (within 5 minutes)', async () => {
      const mockTokenData = {
        accessToken: 'test-access-token',
        expiresOn: new Date(Date.now() + 240000).toISOString() // 4 minutes from now
      }
      localStorage.getItem.mockReturnValue(mockTokenData)

      await expect(authProvider.getAccessToken()).rejects.toThrow('Access token is expired or will expire soon')
    })

    it('should throw error when expiresOn is invalid', async () => {
      const mockTokenData = {
        accessToken: 'test-access-token',
        expiresOn: 'invalid-date'
      }
      localStorage.getItem.mockReturnValue(mockTokenData)

      await expect(authProvider.getAccessToken()).rejects.toThrow('Access token is expired or will expire soon')
    })
  })
})