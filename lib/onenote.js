/* global alert */
const apiRequests = require('superagent')
const { requestOneNoteToken } = require('./auth')
const storage = require('./store')

const TIMEOUTS = {
  response: 120000,  // Wait 60 seconds for the server to start sending,
  deadline: 60000 // but allow 1 minute for the file to finish loading.
}

const Chance = require('chance')
const chance = new Chance()

/**
 * This is where the magic happens but the magic can't happen without:
 * - a fresh token (conditional HTTP request)
 * - a note section id (conditional HTTP request)
 * - Best case only one HTTP request is required,
 * on avg it will be two, since most schedules are daily
 *
 * Ref Mistake #4: https://pouchdb.com/2015/05/18/we-have-a-problem-with-promises.html
 *
 * @returns {Promise}
 */
function getRandomNote () {
  console.log(/********* getRandomNote() ********/)
  return requestOneNoteToken({
      client_id: process.env.NOTIFYER_CLIENT_ID,
      scope: process.env.MS_GRAPH_DEFAULT_SCOPE,
      client_secret: process.env.NOTIFYER_CLIENT_SECRET,
      grant_type: 'client_credentials',
    })
    .then(setNoteSection(process.env.NOTIFYER_SECTION))
    // .then(p)
    .catch(err => {
      console.error('getRandomNote', err)
    })

  function hasNoteSection () {
    console.log(/********* hasNoteSection() ********/)
    return Promise.resolve().then(() => {
      if (storage.getItem('onenote_section_id') === null) {
        return setNoteSection(process.env.NOTIFYER_SECTION)
      }
    })
  }

  function p () {
    return new Promise((resolve, reject) => {
      const onenote_section_id = storage.getItem('onenote_section_id')
      const { access_token } = storage.getItem('onenote')
      // instead of showing the first/last 100 records,
      // randomly select a starting point and get the next 100 results
      const skip = chance.natural({ min: 0, max: storage.getItem('onenote_section_count') || 1 })

      // https://docs.microsoft.com/en-us/graph/onenote-get-content#example-get-requests
      apiRequests
        .get(`${process.env.MS_GRAPH_ROOT}/notes/sections/${onenote_section_id}/pages`)
        .query({
          select: 'title,links,self', // fields to return
          count: true, // show the amount of pages in section
          top: 100, // maximum pages query can return
          skip // The number of entries to skip in the result set.
        })
        .timeout(TIMEOUTS)
        .set('Authorization', `Bearer ${access_token}`)
        .then((response) => {
          console.log('resolve p', access_token, onenote_section_id)

          if (response && response.ok) {
            const notes = response.body.value
            storage.setItem('onenote_section_count', response.body['@odata.count'])
            // TODO
            // if notes is zero REJECT or RETRY
            const noteIndex = chance.natural({ min: 0, max: notes.length - 1 })
            const note = notes[noteIndex]
            resolve(getNotePreview(note))
          } else {
            throw new Error(response)
          }
        })
        .catch((err) => {
          console.error('getRandomNote => p', err)
          reject(err)
        })
    })
  }
}

/**
 * setNoteSection - Description
 *
 * @param {string} [section=Quotes] Description
 * @returns {Promise} Description
 */
function setNoteSection (sectionName) {
  console.log(/********* setNoteSection() ********/)
  return new Promise((resolve, reject) => {
    const { access_token } = storage.getItem('onenote')
    // console.log('access_token', access_token)
    apiRequests
    .get(`${process.env.MS_GRAPH_ROOT}/onenote/sections/`)
    .query({ filter: `name eq '${sectionName}'` })
    .timeout(TIMEOUTS)
    .set({
      Authorization: `Bearer ${access_token}`,
      FavorDataRecency: 'true'
      // TODO:  FavorDataRecency: is.dev() ? 'false' : 'true'
    })
    .then((response) => {
      console.log(response.req)
      if (response && response.ok) {
        console.log('setNoteSection', response.body.value[0].id)
        storage.setItem('onenote_section_id', response.body.value[0].id)
        resolve(response.body.value[0].id)
      } else {
        throw new Error(response)
      }
    })
    .catch((err) => {
      console.error(`Section ID null, ${sectionName} section not found. Error`, err.status)
      console.error(JSON.parse(err.response.text).error.message)
      // reject(err)
    })
  })
}

/**
 * getNotePreview - getRandomNote() uses this
 * to provide a note object to the UI
 * What's neat is when I tried this in Rails (2015)
 * There was no page preview endpoint, so I had to strip the HTML from the page.
 * The preview enpoint provides a previewText snippet as plain text
 * and an optional previewImageUrl which I use to embelish the display
 * of notes and notifications.
 * https://dev.onenote.com/docs#/reference/get-pages/v10menotespagesidpreview/get
 *
 * @param {Object} note
 * @returns {Promise} Description
 */
function getNotePreview (note) {
  const { links, self: url, title } = note

  return new Promise((resolve, reject) => {
    const { access_token } = storage.getItem('onenote')

    apiRequests
      .get(`${url}/preview`)
      .timeout(TIMEOUTS)
      .set('Authorization', `Bearer ${access_token}`)
      .then((response) => {
        if (response && response.ok) {
          resolve({ title, preview: response.body, noteLinks: links, url })
        } else {
          throw new Error(response)
        }
      })
      .catch((err) => {
        console.error('getNotePreview', err)
        reject(err)
      })
  })
}

/**
 * https://dev.onenote.com/docs#/reference/get-pages/v10menotespagesidpreview/get
 *
 * @param {Object} note
 * @returns {Promise} Description
 */
function getNoteContents (url) {
  return new Promise((resolve, reject) => {
    const { access_token } = storage.getItem('onenote')

    apiRequests
      .get(`${url}/content`)
      .timeout(TIMEOUTS)
      .set('Authorization', `Bearer ${access_token}`)
      .then((response) => {
        if (response && response.ok) {
          resolve({ content: response.text })
        } else {
          throw new Error(response)
        }
      })
      .catch((err) => {
        console.log('getNoteContents', err)
        reject(err)
      })
  })
}

module.exports = {
  getRandomNote: getRandomNote,
  getNoteContents: getNoteContents,
  setNoteSection: setNoteSection
}
