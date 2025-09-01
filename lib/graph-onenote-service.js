// Microsoft Graph SDK service layer for OneNote operations
// Replaces direct REST API calls with official Graph SDK
const { createGraphClient } = require('./graph-client')
const localStorage = require('./store')

function mapGraphError(error) {
  if (error.code === 'InvalidAuthenticationToken') {
    throw new Error('Token refresh failed - device login required')
  }
  
  if (error.code === 'TooManyRequests') {
    throw new Error('Rate limit exceeded')
  }

  if (error.code === 'ItemNotFound') {
    throw new Error('The requested resource was not found')
  }
  
  throw error
}

class GraphOneNoteService {
  constructor() {
    this.client = createGraphClient()
  }

  async getSections(notebookName, sectionName) {
    try {
      const response = await this.client
        .api('/me/onenote/sections')
        .filter(`displayName eq '${sectionName}'`)
        .select('id,pagesUrl,displayName')
        .expand('parentNotebook($select=displayName,sectionsUrl)')
        .get()

      const section = response.value.find(
        section => section.parentNotebook.displayName === notebookName
      )

      if (!section) {
        throw new Error(`Unable to find section '${sectionName}' in notebook '${notebookName}'`)
      }

      return section
    } catch (error) {
      mapGraphError(error)
    }
  }

  async getPageCount(sectionId) {
    try {
      const response = await this.client
        .api(`/me/onenote/sections/${sectionId}/pages`)
        .select('title')
        .count(true)
        .top(100)
        .get()

      return response['@odata.count'] || 0
    } catch (error) {
      mapGraphError(error)
    }
  }

  async getPages(sectionId, options = {}) {
    try {
      let request = this.client
        .api(`/me/onenote/sections/${sectionId}/pages`)
        .select('title,links,self,id')
        .count(true)
        .orderby('title,createdDateTime')

      if (options.top) {
        request = request.top(options.top)
      }
      
      if (options.skip) {
        request = request.skip(options.skip)
      }

      const response = await request.get()
      return response
    } catch (error) {
      mapGraphError(error)
    }
  }

  async getPagePreview(pageId) {
    try {
      const response = await this.client
        .api(`/me/onenote/pages/${pageId}/preview`)
        .get()

      return response
    } catch (error) {
      mapGraphError(error)
    }
  }

  async getPageContent(pageId) {
    try {
      // Use responseType to get the content as text instead of stream
      const response = await this.client
        .api(`/me/onenote/pages/${pageId}/content`)
        .responseType('text')
        .get()

      // The response should now be a string
      return { content: response }
    } catch (error) {
      mapGraphError(error)
    }
  }

  async downloadImage(imageUrl, maxSizeBytes = 3 * 1024 * 1024) {
    try {
      const urlPath = imageUrl.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, '')
      
      const response = await this.client
        .api(urlPath)
        .responseType('blob')
        .get()

      // The response should be a Buffer or ArrayBuffer
      if (response instanceof Buffer) {
        if (response.length > maxSizeBytes) {
          throw new Error(`Image download exceeded size limit: ${response.length} bytes`)
        }
        console.log(`Downloaded ${response.length} bytes`)
        return response
      } else if (response instanceof ArrayBuffer) {
        const buffer = Buffer.from(response)
        if (buffer.length > maxSizeBytes) {
          throw new Error(`Image download exceeded size limit: ${buffer.length} bytes`)
        }
        console.log(`Downloaded ${buffer.length} bytes`)
        return buffer
      } else {
        throw new Error('Unexpected response type for image download')
      }
    } catch (error) {
      mapGraphError(error)
    }
  }

  async getImageSize(imageUrl) {
    try {
      const urlPath = imageUrl.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, '')
      
      // Try to get the image with a range request to determine size
      const response = await this.client
        .api(urlPath)
        .responseType('blob')
        .get()

      // If we get the full response, return its size
      if (response instanceof Buffer) {
        return response.length
      } else if (response instanceof ArrayBuffer) {
        return response.byteLength
      }
      
      return 0
    } catch (error) {
      console.warn('Could not determine image size:', error.message)
      return 0
    }
  }
}

module.exports = GraphOneNoteService