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
function getRandomNote(settings) {
  return setNoteSection(settings)
    .then(p)
    .then(getNotePreview)
    .catch(err => {
      console.error(
        'getRandomNote',
        err.response.statusMessage,
        err.request.url
      )
    })

  function p(section) {
    return new Promise(resolve => {
      const { accessToken } = localStorage.getItem('onenote')
      // instead of showing the first/last 100 records,
      // randomly select a starting point and get the next 100 results
      const oldCount =
        localStorage.getItem(`${settings.sectionHandle}_section_count`) || 1
      const skip = chance.natural({
        min: 0,
        max: oldCount
      })

      // https://docs.microsoft.com/en-us/graph/onenote-get-content#example-get-requests
      apiRequests
        .get(section.pagesUrl)
        .query({
          select: 'title,links,self,id', // fields to return
          count: true, // show the amount of pages in section
          top: 100, // maximum pages query can return
          skip: oldCount < 100 ? 0 : skip // The number of entries to skip in the result set.
        })
        .timeout(TIMEOUTS)
        .set('Authorization', `Bearer ${accessToken}`)
        .then(response => {
          if (response && response.ok) {
            const notes = response.body.value
            const newCount = response.body['@odata.count']
            console.log('Pages - Old:New', oldCount, newCount)
            localStorage.setItem(
              `${settings.sectionHandle}_section_count`,
              newCount,
              true
            )
            if (notes.length > 0) {
              const note = checkRecentNotes(notes, settings.sectionHandle)
              logRecentNote(note, settings.sectionHandle)
              resolve(note)
            } else {
              console.warn('****No notes found.****')
              throw new Error({ message: 'No notes found' })
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
            'getRandomNote => p',
            JSON.parse(err.response.text).error.message
          )
        })
    })
  }
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
 * getRandomNote() uses this to provide a note object to function consumers.
 * It uses the page's preview endpoint to get preview plain text of the page
 * and an optional previewImageUrl.
 *
 * @param {Object} note
 * @returns {Object} { title, previewText, noteLinks, url }
 */
function getNotePreview(note) {
  const { links, self: url, title } = note

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
        console.log('getNoteContents', err)
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
function checkRecentNotes(notes, sectionHandle) {
  const note = chance.pickone(notes)

  if (notes.length < Number(process.env.RECENT_NOTE_LENGTH)) return note

  const recentNotes =
    localStorage.getItem(`recent_${sectionHandle}`, true) || []

  if (recentNotes.includes(note.id)) {
    checkRecentNotes(notes)
  }

  return note
}

module.exports = {
  getRandomNote,
  getNoteContents,
  setNoteSection
}
