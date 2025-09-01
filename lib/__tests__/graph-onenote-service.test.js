const GraphOneNoteService = require('../graph-onenote-service')

jest.mock('../graph-client')
jest.mock('isomorphic-fetch')

describe('GraphOneNoteService', () => {
  let service
  let mockClient

  beforeEach(() => {
    mockClient = {
      api: jest.fn().mockReturnThis(),
      filter: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      expand: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      top: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      orderby: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      responseType: jest.fn().mockReturnThis(),
      get: jest.fn()
    }

    const { createGraphClient } = require('../graph-client')
    createGraphClient.mockReturnValue(mockClient)

    service = new GraphOneNoteService()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('getSections', () => {
    it('should return section matching notebook and section name', async () => {
      const mockSection = {
        id: 'section-123',
        displayName: 'Test Section',
        pagesUrl: 'https://graph.microsoft.com/v1.0/sections/section-123/pages',
        parentNotebook: {
          displayName: 'Test Notebook',
          sectionsUrl: 'https://graph.microsoft.com/v1.0/notebooks/notebook-123/sections'
        }
      }

      mockClient.get.mockResolvedValue({
        value: [mockSection, {
          id: 'section-456',
          displayName: 'Test Section',
          parentNotebook: { displayName: 'Other Notebook' }
        }]
      })

      const result = await service.getSections('Test Notebook', 'Test Section')

      expect(result).toEqual(mockSection)
      expect(mockClient.api).toHaveBeenCalledWith('/me/onenote/sections')
      expect(mockClient.filter).toHaveBeenCalledWith("displayName eq 'Test Section'")
      expect(mockClient.select).toHaveBeenCalledWith('id,pagesUrl,displayName')
      expect(mockClient.expand).toHaveBeenCalledWith('parentNotebook($select=displayName,sectionsUrl)')
    })

    it('should throw error when section not found', async () => {
      mockClient.get.mockResolvedValue({ value: [] })

      await expect(service.getSections('Test Notebook', 'Nonexistent Section'))
        .rejects.toThrow("Unable to find section 'Nonexistent Section' in notebook 'Test Notebook'")
    })
  })

  describe('getPageCount', () => {
    it('should return page count for section', async () => {
      mockClient.get.mockResolvedValue({ '@odata.count': 42 })

      const result = await service.getPageCount('section-123')

      expect(result).toBe(42)
      expect(mockClient.api).toHaveBeenCalledWith('/me/onenote/sections/section-123/pages')
      expect(mockClient.select).toHaveBeenCalledWith('title')
      expect(mockClient.count).toHaveBeenCalledWith(true)
      expect(mockClient.top).toHaveBeenCalledWith(100)
    })

    it('should return 0 when count is not provided', async () => {
      mockClient.get.mockResolvedValue({})

      const result = await service.getPageCount('section-123')

      expect(result).toBe(0)
    })
  })

  describe('getPages', () => {
    it('should return pages with pagination', async () => {
      const mockResponse = {
        value: [
          { id: 'page-1', title: 'Page 1', links: {}, self: 'page-1-url' },
          { id: 'page-2', title: 'Page 2', links: {}, self: 'page-2-url' }
        ],
        '@odata.count': 100
      }

      mockClient.get.mockResolvedValue(mockResponse)

      const result = await service.getPages('section-123', { top: 10, skip: 20 })

      expect(result).toEqual(mockResponse)
      expect(mockClient.api).toHaveBeenCalledWith('/me/onenote/sections/section-123/pages')
      expect(mockClient.select).toHaveBeenCalledWith('title,links,self,id')
      expect(mockClient.count).toHaveBeenCalledWith(true)
      expect(mockClient.orderby).toHaveBeenCalledWith('title,createdDateTime')
      expect(mockClient.top).toHaveBeenCalledWith(10)
      expect(mockClient.skip).toHaveBeenCalledWith(20)
    })

    it('should work without pagination options', async () => {
      const mockResponse = { value: [], '@odata.count': 0 }
      mockClient.get.mockResolvedValue(mockResponse)

      const result = await service.getPages('section-123')

      expect(result).toEqual(mockResponse)
      expect(mockClient.top).not.toHaveBeenCalled()
      expect(mockClient.skip).not.toHaveBeenCalled()
    })
  })

  describe('getPagePreview', () => {
    it('should return page preview', async () => {
      const mockPreview = {
        previewText: 'This is a preview...',
        links: { previewImageUrl: { href: 'image-url' } }
      }

      mockClient.get.mockResolvedValue(mockPreview)

      const result = await service.getPagePreview('page-123')

      expect(result).toEqual(mockPreview)
      expect(mockClient.api).toHaveBeenCalledWith('/me/onenote/pages/page-123/preview')
    })
  })

  describe('getPageContent', () => {
    it('should return page content', async () => {
      const mockContent = '<html><body>Page content</body></html>'

      mockClient.get.mockResolvedValue(mockContent)

      const result = await service.getPageContent('page-123')

      expect(result).toEqual({ content: mockContent })
      expect(mockClient.api).toHaveBeenCalledWith('/me/onenote/pages/page-123/content')
    })
  })
})