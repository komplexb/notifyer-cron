const onenote = require('../onenote')
const localStorage = require('../store')

jest.mock('../store')
jest.mock('../graph-onenote-service')

describe('OneNote Integration Tests', () => {
  let mockGraphService

  beforeEach(() => {
    const GraphOneNoteService = require('../graph-onenote-service')
    mockGraphService = {
      getSections: jest.fn(),
      getPageCount: jest.fn(),
      getPages: jest.fn(),
      getPagePreview: jest.fn(),
      getPageContent: jest.fn(),
      getImageSize: jest.fn(),
      downloadImage: jest.fn()
    }
    GraphOneNoteService.mockImplementation(() => mockGraphService)

    localStorage.getItem.mockReturnValue('[]')
    localStorage.setItem = jest.fn()
    jest.clearAllMocks()
  })

  describe('setNoteSection', () => {
    it('should return section information', async () => {
      const mockSection = {
        id: 'section-123',
        displayName: 'Test Section',
        parentNotebook: { displayName: 'Test Notebook' }
      }

      mockGraphService.getSections.mockResolvedValue(mockSection)

      const result = await onenote.setNoteSection({
        notebookName: 'Test Notebook',
        sectionName: 'Test Section'
      })

      expect(result).toEqual(mockSection)
      expect(mockGraphService.getSections).toHaveBeenCalledWith('Test Notebook', 'Test Section')
    })

    it('should handle errors properly', async () => {
      const error = new Error('Section not found')
      mockGraphService.getSections.mockRejectedValue(error)

      await expect(onenote.setNoteSection({
        notebookName: 'Test Notebook',
        sectionName: 'Missing Section'
      })).rejects.toThrow('Section not found')
    })
  })

  describe('extractFirstImage', () => {
    it('should extract first image from HTML content', () => {
      const htmlContent = `
        <html>
          <body>
            <p>Some text</p>
            <img src="image1.jpg" alt="First image" width="100" height="200" data-fullres-src="image1-full.jpg" />
            <img src="image2.jpg" alt="Second image" />
          </body>
        </html>
      `

      const result = onenote.extractFirstImage(htmlContent)

      expect(result).toEqual({
        imageUrl: 'image1.jpg',
        dataFullresSrc: 'image1-full.jpg',
        altText: 'First image',
        width: '100',
        height: '200'
      })
    })

    it('should return null when no image found', () => {
      const htmlContent = '<html><body><p>No images here</p></body></html>'

      const result = onenote.extractFirstImage(htmlContent)

      expect(result).toBeNull()
    })

    it('should handle images without alt text', () => {
      const htmlContent = '<html><body><img src="image.jpg" /></body></html>'

      const result = onenote.extractFirstImage(htmlContent)

      expect(result).toEqual({
        imageUrl: 'image.jpg',
        dataFullresSrc: null,
        altText: '',
        width: null,
        height: null
      })
    })
  })

  describe('getImageSize', () => {
    it('should return image size', async () => {
      mockGraphService.getImageSize.mockResolvedValue(1024000)

      const result = await onenote.getImageSize('https://graph.microsoft.com/v1.0/image-url')

      expect(result).toBe(1024000)
      expect(mockGraphService.getImageSize).toHaveBeenCalledWith('https://graph.microsoft.com/v1.0/image-url')
    })
  })

  describe('downloadImage', () => {
    it('should download image when size is within limits', async () => {
      const mockBuffer = Buffer.from('fake image data')
      mockGraphService.getImageSize.mockResolvedValue(1024000) // 1MB
      mockGraphService.downloadImage.mockResolvedValue(mockBuffer)

      const result = await onenote.downloadImage('https://graph.microsoft.com/v1.0/image-url')

      expect(result).toEqual(mockBuffer)
      expect(mockGraphService.getImageSize).toHaveBeenCalledWith('https://graph.microsoft.com/v1.0/image-url')
      expect(mockGraphService.downloadImage).toHaveBeenCalledWith('https://graph.microsoft.com/v1.0/image-url', 3145728)
    })

    it('should reject download when image is too large', async () => {
      const maxSize = 1024000 // 1MB
      mockGraphService.getImageSize.mockResolvedValue(2048000) // 2MB

      await expect(onenote.downloadImage('https://graph.microsoft.com/v1.0/image-url', maxSize))
        .rejects.toThrow('Image too large: 2048000 bytes (max: 1024000)')

      expect(mockGraphService.downloadImage).not.toHaveBeenCalled()
    })

    it('should proceed with download if size check fails', async () => {
      const mockBuffer = Buffer.from('fake image data')
      mockGraphService.getImageSize.mockRejectedValue(new Error('Size check failed'))
      mockGraphService.downloadImage.mockResolvedValue(mockBuffer)

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      const result = await onenote.downloadImage('https://graph.microsoft.com/v1.0/image-url')

      expect(result).toEqual(mockBuffer)
      expect(consoleSpy).toHaveBeenCalledWith('Could not check image size, proceeding with download:', 'Size check failed')
      expect(mockGraphService.downloadImage).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('getNoteContents', () => {
    it('should extract page ID from URL and get content', async () => {
      const mockContent = { content: '<html>Page content</html>' }
      mockGraphService.getPageContent.mockResolvedValue(mockContent)

      const pageUrl = 'https://graph.microsoft.com/v1.0/me/onenote/pages/page-123-456/content'
      const result = await onenote.getNoteContents(pageUrl)

      expect(result).toEqual(mockContent)
      expect(mockGraphService.getPageContent).toHaveBeenCalledWith('page-123-456')
    })

    it('should handle invalid URL format', async () => {
      const invalidUrl = 'https://graph.microsoft.com/v1.0/invalid-url'

      await expect(onenote.getNoteContents(invalidUrl))
        .rejects.toThrow('Could not extract page ID from URL: ' + invalidUrl)
    })
  })
})