/**
 * Implements node-localstorage as a Polyfill
 * of the browser localStorage API in node.js.
 *
 * Lambda functions have ephemeral storage on the server,
 * so I've added optional persistence for pertinent config across loads.
 */

const db = require('../db/persist')
let localStorage

const initStore = function () {
  if (typeof localStorage === 'undefined' || localStorage === null) {
    const LocalStorage = require('node-localstorage').LocalStorage
    localStorage = new LocalStorage(process.env.CACHE_BASE) // eslint-disable-line
  }
}

/**
 * See spec
 * {@link http://www.w3.org/TR/webstorage/#storage}
 */
const getItem = function (key) {
  return localStorage.getItem(key) === undefined || null
    ? null
    : JSON.parse(localStorage.getItem(key))
}

/**
 * See spec
 * {@link http://www.w3.org/TR/webstorage/#storage}
 */
const removeItem = function (key) {
  localStorage.removeItem(key)
}

/**
 * See spec for original implementation
 * {@link http://www.w3.org/TR/webstorage/#storage}
 *
 * @param {*} persist: conditionally save changes to database
 */
const setItem = function (key, value, persist = false) {
  const val = JSON.stringify(value)
  localStorage.setItem(key, val)

  if (persist) {
    try {
      db.setItem(key, val)
    } catch (e) {
      console.error(e)
    }
  }
}

module.exports = {
  initStore,
  getItem,
  setItem,
  removeItem
}
