const GraphOneNoteService = require('./graph-onenote-service')
const localStorage = require('./store')

const Chance = require('chance')
const chance = new Chance()

const graphService = new GraphOneNoteService()

async function getNote(settings) {
  const section = await setNoteSection(settings)
  const pageCount = await getNoteCount(section, settings)
  return getNotePreviewAsync(settings)

  async function getNotePreviewAsync(settings) {
    try {
      if (settings.isSequential) {
        const lastPage = Number(localStorage.getItem(`${settings.sectionHandle}_last_page`) || "-1");
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
          console.log("getNextNote", { pageCount, skipRange });
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
      const response = await graphService.getPages(section.id, paginationQuery)
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
          return notes[0]
        } else {
          console.warn("*** random note ***")
          const note = getRandomNote(notes, settings.sectionHandle)
          logRecentNote(note, settings.sectionHandle)
          return note
        }
        console.log("DB", {section: settings.sectionHandle, pageCount, lastPage: nextPage})
      } else {
        console.warn('getNextNote(), ****No notes found.****')
        throw new Error('No notes found')
      }
    } catch (error) {
      console.error(
        `Random note retrieval failed.`,
        error,
        error.status || error.message
      )
      throw error
    }
  }
}

async function getNoteCount(section, settings) {
  console.log(/** ******* getNoteCount() ********/)
  try {
    const newCount = await graphService.getPageCount(section.id)
    
    localStorage.setItem(
      `${settings.sectionHandle}_section_count`,
      newCount,
      true
    )
    return newCount
  } catch (error) {
    console.error('getNoteCount Failed', error)
    throw error
  }
}

async function setNoteSection(settings) {
  console.log(/** ******* setNoteSection() ********/)
  try {
    const section = await graphService.getSections(settings.notebookName, settings.sectionName)
    
    console.log(
      'setSectionNote',
      `${section.parentNotebook.displayName} > ${section.displayName}`
    )
    
    return section
  } catch (error) {
    console.error(
      `Failed to set note section to ${settings.sectionName}. Error`,
      error.status || error.message
    )
    throw error
  }
}

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

function logRecentNote(note, sectionHandle) {
  let notes = localStorage.getItem(`recent_${sectionHandle}`, true) || []
  
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

async function getImageSize(imageUrl) {
  try {
    return await graphService.getImageSize(imageUrl)
  } catch (error) {
    console.error('getImageSize', error)
    throw error
  }
}

async function downloadImage(imageUrl, maxSizeBytes = 3 * 1024 * 1024) {
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