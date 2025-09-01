/* global alert */
require('isomorphic-fetch')
const { Client } = require('@microsoft/microsoft-graph-client')
const localStorage = require('./store')

const TIMEOUTS = {
  response: 120000, // Wait 60 seconds for the server to start sending,
  deadline: 60000 // but allow 1 minute for the file to finish loading.
}

/**
 * Authentication provider bridge for Microsoft Graph SDK
 * Integrates with existing MSAL token management
 */
class MSALAuthenticationProvider {
  async getAccessToken() {
    const onenoteData = localStorage.getItem('onenote')
    if (!onenoteData || !onenoteData.accessToken) {
      throw new Error('No access token available - device login required')
    }
    return onenoteData.accessToken
  }
}

/**
 * Create and configure Microsoft Graph client
 * @returns {Client} Configured Graph client instance
 */
function createGraphClient() {
  const authProvider = new MSALAuthenticationProvider()
  
  return Client.initWithMiddleware({
    authProvider,
    defaultVersion: 'v1.0',
    debugLogging: process.env.NODE_ENV === 'development'
  })
}

/**
 * Map Microsoft Graph SDK errors to existing error format for backward compatibility
 * @param {Error} error - Graph SDK error
 * @returns {Error} Mapped error
 */
function mapGraphError(error) {
  console.error('Graph SDK Error:', error)
  
  // Handle authentication errors
  if (error.code === 'InvalidAuthenticationToken' || error.code === 'Unauthenticated') {
    throw new Error('Token refresh failed - device login required')
  }
  
  // Handle rate limiting
  if (error.code === 'TooManyRequests' || error.statusCode === 429) {
    throw new Error('Rate limit exceeded')
  }
  
  // Handle not found errors  
  if (error.code === 'ItemNotFound' || error.statusCode === 404) {
    throw new Error('Resource not found')
  }
  
  // Handle timeout errors
  if (error.code === 'RequestTimeout' || error.statusCode === 408) {
    throw new Error('Request timeout')
  }
  
  // Preserve original error structure for unknown errors
  throw error
}

const Chance = require('chance')
const chance = new Chance()

/**
 * Get upto 100 pages from the defined section and return a random page
 *
 * @returns {Object} { title, previewText, noteLinks, url }
 */
async function getNote(settings) {
  const section = await setNoteSection(settings)
  const pageCount = await getNoteCount(section, settings)
  return getNotePreviewAsync(settings)

  async function getNotePreviewAsync(settings) {
    try {
      if (settings.isSequential) {
        const lastPage = Number(localStorage.getItem(`${settings.sectionHandle}_last_page`) || "-1");
        const nextPage = lastPage + 1 >= pageCount ? 0 : lastPage + 1; // this field should be initialized to -1

        const note = await getNextNote(section, { top: 1, skip: nextPage }); // sequential
        if (!note) return undefined;
        return await getNotePreview(note);
      } else {
        let skipRange;
        do {
          skipRange = chance.natural({
            min: 0,
            max: pageCount - 1
          });
          console.log("getNextNote", { pageCount, skipRange });
        } while (skipRange >= pageCount);

        const note = await getNextNote(section, { top: 100, skip: skipRange }); // random
        if (!note) return undefined;
        return await getNotePreview(note);
      }
    } catch (err) {
      console.error('getNote', err);
      throw err;
    }
  }

  /**
   * Retrieves the next note from a given section in OneNote.
   * @param {Object} section - The section to retrieve the note from.
   * @param {Object} paginationQuery - The pagination query to use for retrieving the note.
   * @returns {Promise<Object>} - A promise that resolves with the retrieved note.
   */
  async function getNextNote(section, paginationQuery) {
    try {
      const graphClient = createGraphClient()
      const sectionId = section.id

      // https://docs.microsoft.com/en-us/graph/onenote-get-content#example-get-requests
      const response = await graphClient
        .api(`/me/onenote/sections/${sectionId}/pages`)
        .orderby('title,createdDateTime')
        .select('title,links,self,id') // fields to return
        .count(true) // show the amount of pages in section
        .top(paginationQuery.top)
        .skip(paginationQuery.skip)
        .get()

      const notes = response.value

      let nextPage;
      if (notes.length > 0) {
        if (settings.isSequential) {
          console.warn("*** sequential note ***")
          nextPage = paginationQuery.skip
          localStorage.setItem(
            `${settings.sectionHandle}_last_page`,
            nextPage,
            true
          )
          const note = notes[0]
          return note
        } else {
          console.warn("*** random note ***")
          const note = getRandomNote(notes, settings.sectionHandle)
          logRecentNote(note, settings.sectionHandle)
          return note
        }
        console.log("DB", {section: settings.sectionHandle, pageCount, lastPage: nextPage})
      } else {
        console.warn('getNextNote(), ****No notes found.****')
        return null
      }
    } catch (err) {
      console.error(
        `Random note retrieval failed:`,
        err.message || err
      )
      throw mapGraphError(err)
    }
  }
}

async function getNoteCount(section, settings) {
  console.log(/** ******* getNoteCount() ********/)
  try {
    const graphClient = createGraphClient()
    console.log("section", section.pagesUrl)

    // Extract section ID from pagesUrl for the Graph API call
    const sectionId = section.id
    
    const response = await graphClient
      .api(`/me/onenote/sections/${sectionId}/pages`)
      .select('title')
      .count(true)
      .top(100)
      .get()

    const newCount = Number(response['@odata.count'] || 0)

    localStorage.setItem(
      `${settings.sectionHandle}_section_count`,
      newCount,
      true
    )
    
    return newCount
  } catch (err) {
    console.error('getNoteCount Failed:', err.message || err)
    throw mapGraphError(err)
  }
}

/**
 * Get the note id for the defined section
 * to build the url request for pages in this section
 *
 * @returns {String}
 */
async function setNoteSection(settings) {
  console.log(/** ******* setNoteSection() ********/)
  try {
    const graphClient = createGraphClient()
    
    const response = await graphClient
      .api('/me/onenote/sections')
      .filter(`displayName eq '${settings.sectionName}'`)
      .select('id,pagesUrl,displayName')
      .expand('parentNotebook($select=displayName,sectionsUrl)')
      .header('Prefer', `outlook.timezone="${process.env.TIMEZONE || 'UTC'}"`)
      .header('FavorDataRecency', process.env.FAVOR_DATA_RECENCY || 'false')
      .get()

    const section = response.value.find(
      section => section.parentNotebook.displayName === settings.notebookName
    )
    
    if (typeof section === 'undefined') {
      console.error(`Unable to find ${settings.sectionName}.`)
      throw new Error(`Section '${settings.sectionName}' not found in notebook '${settings.notebookName}'`)
    }
    
    console.log(
      'setSectionNote',
      `${section.parentNotebook.displayName} > ${section.displayName}`
    )
    
    return section
  } catch (err) {
    console.error(
      `Failed to set note section to ${settings.sectionName}. Error:`,
      err.message || err
    )
    throw mapGraphError(err)
  }
}

/**
 * getNote() uses this to provide a note object to function consumers.
 * It uses the page's preview endpoint to get preview plain text of the page
 * and an optional previewImageUrl.
 *
 * @param {Object} note
 * @returns {Object} { title, previewText, noteLinks, url }
 */
async function getNotePreview(note) {
  const { links, self: url, title, id } = note

  try {
    const graphClient = createGraphClient()

    const response = await graphClient
      .api(`/me/onenote/pages/${id}/preview`)
      .get()

    return {
      title,
      preview: response,
      noteLinks: links,
      url
    }
  } catch (err) {
    console.error('getNotePreview:', err.message || err)
    throw mapGraphError(err)
  }
}

/**
 * Use the page's content endpoint to get the HTML content of a page
 *
 * @param {string} url - The page URL or page ID
 * @returns {Promise}
 */
async function getNoteContents(url) {
  try {
    const graphClient = createGraphClient()
    
    // Extract page ID from URL if needed
    let pageId = url
    if (url.includes('/pages/')) {
      pageId = url.split('/pages/')[1].split('/')[0]
    }

    const response = await graphClient
      .api(`/me/onenote/pages/${pageId}/content`)
      .get()

    return { content: response }
  } catch (err) {
    console.error('getNoteContents:', err.message || err)
    throw mapGraphError(err)
  }
}

/**
 * log recent notes to ensure no repeats of recent notes
 * @param {*} note
 * @param {*} sectionName
 */
function logRecentNote(note, sectionHandle) {
  let notes = localStorage.getItem(`recent_${sectionHandle}`, true) || []
  
  // Ensure notes is always an array
  if (!Array.isArray(notes)) {
    console.warn(`Expected array for recent_${sectionHandle}, got:`, typeof notes, notes)
    notes = []
  }
  
  const recent = Number(process.env.RECENT_NOTE_LENGTH) || 7
  console.log('recent', recent)
  if (notes.length === recent) {
    notes.shift()
  }
  notes.push(note.id)
  localStorage.setItem(`recent_${sectionHandle}`, notes, true)
}

/**
 * If note has been sent recently, pick a new one to send
 * @param {*} notes
 * @param {*} sectionName
 */
function getRandomNote(notes, sectionHandle) {
  const note = chance.pickone(notes)

  if (notes.length < Number(process.env.RECENT_NOTE_LENGTH)) return note

  const recentNotes =
    localStorage.getItem(`recent_${sectionHandle}`, true) || []

  if (recentNotes.includes(note.id)) {
    return getRandomNote(notes, sectionHandle)
  }

  return note
}

/**
 * Extract first image from OneNote HTML content
 * @param {string} htmlContent - OneNote page HTML content
 * @returns {Object|null} { imageUrl, altText, dataFullresSrc } or null if no image found
 */
function extractFirstImage(htmlContent) {
  const HTMLParser = require('node-html-parser')
  const wrapper = HTMLParser.parse(htmlContent)

  const firstImg = wrapper.querySelector('img')
  if (!firstImg) {
    return null
  }

  return {
    imageUrl: firstImg.getAttribute('src'),
    dataFullresSrc: firstImg.getAttribute('data-fullres-src'),
    altText: firstImg.getAttribute('alt') || '',
    width: firstImg.getAttribute('width'),
    height: firstImg.getAttribute('height')
  }
}

/**
 * Check image size before downloading
 * @param {string} imageUrl - The Graph API image endpoint URL
 * @returns {Promise<number>} Image size in bytes
 */
async function getImageSize(imageUrl) {
  try {
    const authProvider = new MSALAuthenticationProvider()
    const token = await authProvider.getAccessToken()

    const response = await fetch(imageUrl, {
      method: 'HEAD',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (response.ok) {
      const contentLength = response.headers.get('content-length')
      return contentLength ? parseInt(contentLength) : 0
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  } catch (err) {
    console.error('getImageSize:', err.message || err)
    throw mapGraphError(err)
  }
}

/**
 * Download image from Microsoft Graph API endpoint with size limits
 * @param {string} imageUrl - The Graph API image endpoint URL
 * @param {number} maxSizeBytes - Maximum file size in bytes (default 3MB)
 * @returns {Promise<Buffer>} Image buffer
 */
async function downloadImage(imageUrl, maxSizeBytes = 3 * 1024 * 1024) {
  // Check size first
  try {
    const imageSize = await getImageSize(imageUrl)
    if (imageSize > maxSizeBytes) {
      throw new Error(`Image too large: ${imageSize} bytes (max: ${maxSizeBytes})`)
    }
    console.log(`Downloading image: ${imageSize} bytes`)
  } catch (err) {
    console.warn('Could not check image size, proceeding with download:', err.message)
  }

  try {
    const authProvider = new MSALAuthenticationProvider()
    const token = await authProvider.getAccessToken()

    const response = await fetch(imageUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    if (buffer.length > maxSizeBytes) {
      throw new Error(`Image download exceeded size limit: ${buffer.length} bytes`)
    }

    console.log(`Downloaded ${buffer.length} bytes`)
    return buffer
  } catch (err) {
    console.error('downloadImage:', err.message || err)
    throw mapGraphError(err)
  }
}

module.exports = {
  getNote,
  getNoteContents,
  setNoteSection,
  extractFirstImage,
  downloadImage,
  getImageSize
}
