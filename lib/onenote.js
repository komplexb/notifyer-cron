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
function getRandomNote (sectionName) {
  return setNoteSection(sectionName)
    .then(p)
    .then(getNotePreview)
    .catch(err => {
      console.error('getRandomNote', err)
    })

  function p (onenote_section_id) {
    return new Promise(resolve => {
      const { accessToken } = localStorage.getItem('onenote')
      // instead of showing the first/last 100 records,
      // randomly select a starting point and get the next 100 results
      const skip = chance.natural({
        min: 0,
        max:
          localStorage.getItem(`${sectionName.toLowerCase()}_section_count`) ||
          1
      })

      // https://docs.microsoft.com/en-us/graph/onenote-get-content#example-get-requests
      apiRequests
        .get(
          `${process.env.MS_GRAPH_ROOT}/onenote/sections/${onenote_section_id}/pages`
        )
        .query({
          select: 'title,links,self', // fields to return
          count: true, // show the amount of pages in section
          top: 100, // maximum pages query can return
          skip // The number of entries to skip in the result set.
        })
        .timeout(TIMEOUTS)
        .set('Authorization', `Bearer ${accessToken}`)
        .then(response => {
          if (response && response.ok) {
            const notes = response.body.value
            localStorage.setItem(
              `${sectionName.toLowerCase()}_section_count`,
              response.body['@odata.count'],
              true
            )
            // TODO: if notes is zero REJECT or RETRY
            const noteIndex = chance.natural({ min: 0, max: notes.length - 1 })
            const note = notes[noteIndex]
            resolve(note)
          } else {
            throw new Error(response)
          }
        })
        .catch(err => {
          console.error(`Random note retrieval failed.`, err, err.status)
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
function setNoteSection (sectionName) {
  console.log(/** ******* setNoteSection() ********/)
  return new Promise((resolve, reject) => {
    const { accessToken } = localStorage.getItem('onenote')
    apiRequests
      .get(`${process.env.MS_GRAPH_ROOT}/onenote/sections/`)
      .query({ filter: `name eq '${sectionName}'` })
      .timeout(TIMEOUTS)
      .set({
        Authorization: `Bearer ${accessToken}`,
        FavorDataRecency: process.env.FAVOR_DATA_RECENCY
      })
      .then(response => {
        if (response && response.ok) {
          resolve(response.body.value[0].id)
        } else {
          throw new Error(response)
        }
      })
      .catch(err => {
        console.error(
          `Failed to set note section to ${sectionName}. Error`,
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
function getNotePreview (note) {
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
function getNoteContents (url) {
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

module.exports = {
  getRandomNote,
  getNoteContents,
  setNoteSection
}
