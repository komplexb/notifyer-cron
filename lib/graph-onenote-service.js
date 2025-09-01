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
      const response = await this.client
        .api(`/me/onenote/pages/${pageId}/content`)
        .get()

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
        .responseType('stream')
        .get()

      return new Promise((resolve, reject) => {
        const chunks = []
        let downloadedBytes = 0

        response.on('data', chunk => {
          downloadedBytes += chunk.length
          if (downloadedBytes > maxSizeBytes) {
            return reject(new Error(`Image download exceeded size limit: ${downloadedBytes} bytes`))
          }
          chunks.push(chunk)
        })

        response.on('end', () => {
          console.log(`Downloaded ${downloadedBytes} bytes`)
          resolve(Buffer.concat(chunks))
        })

        response.on('error', reject)
      })
    } catch (error) {
      mapGraphError(error)
    }
  }

  async getImageSize(imageUrl) {
    try {
      const urlPath = imageUrl.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, '')
      
      const response = await this.client
        .api(urlPath)
        .header('Range', 'bytes=0-0')
        .get()

      const contentRange = response.headers['content-range']
      if (contentRange) {
        const match = contentRange.match(/\/(\d+)/)
        if (match) {
          return parseInt(match[1])
        }
      }
      
      return 0
    } catch (error) {
      console.warn('Could not determine image size:', error.message)
      return 0
    }
  }
}

module.exports = GraphOneNoteService