// OneNote integration using Microsoft Graph SDK
// Migrated from direct REST API calls (superagent) to official Graph SDK
// Original implementation preserved in lib/onenote-original.js
const GraphOneNoteService = require('./graph-onenote-service');
const localStorage = require('./store');

const Chance = require('chance');
const chance = new Chance();

const graphService = new GraphOneNoteService();

/**
 * Get upto 100 pages from the defined section and return a random page
 *
 * @returns {Object} { title, previewText, noteLinks, url }
 */
async function getNote(settings) {
  const section = await setNoteSection(settings)
  const pageCount = await getNoteCount(section, settings)
  return getNotePreviewAsync(settings);

  async function getNotePreviewAsync(settings) {
    try {
      if (settings.isSequential) {
        const lastPage = Number(localStorage.getItem(`${settings.sectionHandle}_last_page`) || '-1');
        const nextPage = lastPage + 1 >= pageCount ? 0 : lastPage + 1;

        const note = await getNextNote(section, { top: 1, skip: nextPage });
        return getNotePreview(note);
      } else {
        let skipRange;
        do {
          skipRange = chance.natural({
            min: 0,
            max: pageCount
          });
          console.log('getNextNote', { pageCount, skipRange });
        } while (skipRange === pageCount);

        const note = await getNextNote(section, { top: 100, skip: skipRange });
        return getNotePreview(note);
      }
    } catch (err) {
      console.error('getNote', err);
      throw err;
    }
  }

  async function getNextNote(section, paginationQuery) {
    try {
      const response = await graphService.getPages(section.id, paginationQuery);
      const notes = response.value;

      let nextPage;
      if (notes.length > 0) {
        if (settings.isSequential) {
          console.warn('*** sequential note ***');
          nextPage = paginationQuery.skip;
          localStorage.setItem(
            `${settings.sectionHandle}_last_page`,
            nextPage,
            true
          );
          console.log('DB', {section: settings.sectionHandle, pageCount, lastPage: nextPage});
          return notes[0];
        } else {
          console.warn('*** random note ***');
          const note = getRandomNote(notes, settings.sectionHandle);
          logRecentNote(note, settings.sectionHandle);
          console.log('DB', {section: settings.sectionHandle, pageCount, lastPage: nextPage});
          return note;
        }
      } else {
        console.warn('getNextNote(), ****No notes found.****');
        throw new Error('No notes found');
      }
    } catch (error) {
      console.error(
        'Random note retrieval failed.',
        error,
        error.status || error.message
      );
      throw error;
    }
  }
}

async function getNoteCount(section, settings) {
  console.log('******* getNoteCount() ********');
  try {
    const newCount = await graphService.getPageCount(section.id);

    localStorage.setItem(
      `${settings.sectionHandle}_section_count`,
      newCount,
      true
    );
    return newCount;
  } catch (error) {
    console.error('getNoteCount Failed', error);
    throw error;
  }
}

/**
 * Get the note id for the defined section
 * to build the url request for pages in this section
 *
 * @returns {String}
 */
async function setNoteSection(settings) {
  console.log('******* setNoteSection() ********');
  try {
    const section = await graphService.getSections(settings.notebookName, settings.sectionName);

    if (section && section.parentNotebook) {
      console.log(
        'setSectionNote',
        `${section.parentNotebook.displayName} > ${section.displayName}`
      );
    }

    return section;
  } catch (error) {
    console.error(
      `Failed to set note section to ${settings.sectionName}. Error`,
      error.status || error.message
    );
    throw error;
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
    const response = await graphService.getPagePreview(id)
    
    return {
      title,
      preview: response,
      noteLinks: links,
      url
    }
  } catch (error) {
    console.error('getNotePreview', error, error.status)
    throw error
  }
}

/**
 * Use the page's content endpoint to get the HTML content of a page
 *
 * @param {Object} note
 * @returns {Promise}
 */
async function getNoteContents(url) {
  try {
    const pageId = extractPageIdFromUrl(url)
    const response = await graphService.getPageContent(pageId)
    return response
  } catch (error) {
    console.error('getNoteContents', error)
    throw error
  }
}

function extractPageIdFromUrl(url) {
  const match = url.match(/pages\/([^\/]+)/)
  if (match) {
    return match[1]
  }
  throw new Error('Could not extract page ID from URL: ' + url)
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
    dataFullresSrc: firstImg.getAttribute('data-fullres-src') || null,
    altText: firstImg.getAttribute('alt') || '',
    width: firstImg.getAttribute('width') || null,
    height: firstImg.getAttribute('height') || null
  }
}

/**
 * Check image size before downloading
 * @param {string} imageUrl - The Graph API image endpoint URL
 * @returns {Promise<number>} Image size in bytes
 */
async function getImageSize(imageUrl) {
  try {
    return await graphService.getImageSize(imageUrl)
  } catch (error) {
    console.error('getImageSize', error)
    throw error
  }
}

/**
 * Download image from Microsoft Graph API endpoint with size limits
 * @param {string} imageUrl - The Graph API image endpoint URL
 * @param {number} maxSizeBytes - Maximum file size in bytes (default 3MB)
 * @returns {Promise<Buffer>} Image buffer
 */
async function downloadImage(imageUrl, maxSizeBytes = 3 * 1024 * 1024) {
  try {
    const imageSize = await getImageSize(imageUrl)
    if (imageSize > maxSizeBytes) {
      throw new Error(`Image too large: ${imageSize} bytes (max: ${maxSizeBytes})`)
    }
    console.log(`Downloading image: ${imageSize} bytes`)
  } catch (err) {
    // If it's a size limit error, re-throw it
    if (err.message.includes('Image too large:')) {
      throw err
    }
    // Otherwise, it's a size check error, proceed with download
    console.warn('Could not check image size, proceeding with download:', err.message)
  }

  try {
    return await graphService.downloadImage(imageUrl, maxSizeBytes)
  } catch (error) {
    console.error('downloadImage', error)
    throw error
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
