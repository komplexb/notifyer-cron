/* global localStorage */

const db = require('../db/persist')

if (typeof localStorage === 'undefined' || localStorage === null) {
  const LocalStorage = require('node-localstorage').LocalStorage
  const prefix = process.env.STAGE === 'prod' ? '/' : './'
  localStorage = new LocalStorage(`${prefix}${process.env.CACHE_BASE}`) // eslint-disable-line
}

const storage = localStorage

const getItem = function (key) {
  return localStorage.getItem(key) === undefined || null
    ? null
    : JSON.parse(localStorage.getItem(key))
}

const removeItem = function (key) {
  localStorage.removeItem(key)
}

const setItem = function (key, value, persist = false) {
  const val = JSON.stringify(value)
  localStorage.setItem(key, val)
  if (persist) {
    db.setItem(key, val)
  }
}

module.exports = {
  storage,
  getItem,
  setItem,
  removeItem
}
