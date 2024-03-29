/* global alert */
const apiRequests = require('superagent')
const localStorage = require('./store')

const TIMEOUTS = {
  response: 120000, // Wait 60 seconds for the server to start sending,
  deadline: 60000 // but allow 1 minute for the file to finish loading.
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

        const note = await getNextNote(section, { top: 100, skip: skipRange }); // random
        return getNotePreview(note);
      }
    } catch (err) {
      console.error('getNote', err);
    }
  }

  /**
   * Retrieves the next note from a given section in OneNote.
   * @param {Object} section - The section to retrieve the note from.
   * @param {Object} paginationQuery - The pagination query to use for retrieving the note.
   * @returns {Promise<Object>} - A promise that resolves with the retrieved note.
   */
  function getNextNote(section, paginationQuery) {
    return new Promise(resolve => {
      const { accessToken } = localStorage.getItem('onenote')

      // https://docs.microsoft.com/en-us/graph/onenote-get-content#example-get-requests
      apiRequests
        .get(section.pagesUrl)
        .query(`$orderby=title,createdDateTime`)
        .query({
          select: 'title,links,self,id', // fields to return
          count: true, // show the amount of pages in section
          ...paginationQuery
        })
        .timeout(TIMEOUTS)
        .set('Authorization', `Bearer ${accessToken}`)
        .then(response => {
          if (response && response.ok) {
            const notes = response.body.value

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
                resolve(note)
              } else {
                console.warn("*** random note ***")
                const note = getRandomNote(notes, settings.sectionHandle)
                logRecentNote(note, settings.sectionHandle)
                resolve(note)
              }
              console.log("DB", {section: settings.sectionHandle, pageCount, lastPage: nextPage})
            } else {
              console.warn('getNextNote(), ****No notes found.****')
            }
          } else {
            throw new Error(response)
          }
        })
        .catch(err => {
          console.error(
            `Random note retrieval failed.`,
            err,
            err.status || err.message
          )
          console.error(
            'getNote => p',
            JSON.parse(err.response.text).error.message
          )
        })
    })
  }
}

function getNoteCount(section, settings) {
  console.log(/** ******* getNoteCount() ********/)
    return new Promise(resolve => {
      const { accessToken } = localStorage.getItem('onenote')
      console.log("section", section.pagesUrl)

      apiRequests
        .get(section.pagesUrl)
        .query({
          select: 'title',
          count: true,
          top: 100
        })
        .timeout(TIMEOUTS)
        .set('Authorization', `Bearer ${accessToken}`)
        .then(response => {
          if (response && response.ok) {
            const newCount = Number(response.body['@odata.count'])

            localStorage.setItem(
              `${settings.sectionHandle}_section_count`,
              newCount,
              true
            )
            resolve(newCount)
          } else {
            throw new Error(response)
          }
        })
        .catch(err => {
          console.error(
            'getNoteCount Failed', err
          )
        })
    })
  }

/**
 * Get the note id for the defined section
 * to build the url request for pages in this section
 *
 * @returns {String}
 */
function setNoteSection(settings) {
  console.log(/** ******* setNoteSection() ********/)
  return new Promise((resolve, reject) => {
    const { accessToken } = localStorage.getItem('onenote')

    apiRequests
      .get(`${process.env.MS_GRAPH_ROOT}/onenote/sections`)
      .query(`$filter=displayName eq '${settings.sectionName}'`)
      .query('$select=id,pagesUrl,displayName')
      .query('$expand=parentNotebook($select=displayName,sectionsUrl)')
      .timeout(TIMEOUTS)
      .set({
        Authorization: `Bearer ${accessToken}`,
        FavorDataRecency: process.env.FAVOR_DATA_RECENCY
      })
      .then(response => {
        if (response && response.ok) {
          const section = response.body.value.find(
            section =>
              section.parentNotebook.displayName === settings.notebookName
          )
          if (typeof section === 'undefined') {
            console.error(`Unable to find ${settings.sectionName}.`)
            throw new Error()
          } else {
            resolve(section)
          }

          console.log(
            'setSectionNote',
            `${section.parentNotebook.displayName} > ${section.displayName}`,
            response.request.url
          )
        } else {
          throw new Error(response)
        }
      })
      .catch(err => {
        console.error(
          `Failed to set note section to ${settings.sectionName}. Error`,
          err.status
        )
        console.error(
          'setNoteSection()',
          JSON.parse(err.response.text).error.message
        )
        reject(err)
      })
  })
}

/**
 * getNote() uses this to provide a note object to function consumers.
 * It uses the page's preview endpoint to get preview plain text of the page
 * and an optional previewImageUrl.
 *
 * @param {Object} note
 * @returns {Object} { title, previewText, noteLinks, url }
 */
function getNotePreview(note) {
  const { links, self: url, title, id } = note

  return new Promise((resolve, reject) => {
    const { accessToken } = localStorage.getItem('onenote')

    apiRequests
      .get(`${url}/preview`) // /me/onenote/pages/{id}/preview
      .timeout(TIMEOUTS)
      .set('Authorization', `Bearer ${accessToken}`)
      .then(response => {
        if (response && response.ok) {
          resolve({
            title,
            preview: response.body,
            noteLinks: links,
            url
          })
        } else {
          throw new Error(response)
        }
      })
      .catch(err => {
        console.error('getNotePreview', err, err.status)
        console.error(
          'getNotePreview',
          JSON.parse(err.response.text).error.message
        )

        reject(err)
      })
  })
}

/**
 * Use the page's content endpoint to get the HTML content of a page
 *
 * @param {Object} note
 * @returns {Promise}
 */
function getNoteContents(url) {
  return new Promise((resolve, reject) => {
    const { accessToken } = localStorage.getItem('onenote')

    apiRequests
      .get(`${url}/content`) // '/me/onenote/pages/{id}/content'
      .timeout(TIMEOUTS)
      .set('Authorization', `Bearer ${accessToken}`)
      .then(response => {
        if (response && response.ok) {
          resolve({ content: response.text })
        } else {
          throw new Error(response)
        }
      })
      .catch(err => {
        console.error('getNoteContents', err)
        reject(err)
      })
  })
}

/**
 * log recent notes to ensure no repeats of recent notes
 * @param {*} note
 * @param {*} sectionName
 */
function logRecentNote(note, sectionHandle) {
  const notes = localStorage.getItem(`recent_${sectionHandle}`, true) || []
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
    getRandomNote(notes)
  }

  return note
}

module.exports = {
  getNote,
  getNoteContents,
  setNoteSection
}
