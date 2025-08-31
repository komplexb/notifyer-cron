const { hasValidToken, refreshToken, deviceLogin } = require("./lib/auth");
const { getNote } = require("./lib/onenote");
const notify = require("./lib/notify");
const localStorage = require("./lib/store");
const { promises: fs } = require("fs");
const db = require("./db/persist");
const { snakeCase } = require("snake-case");

/**
 * Lambda functions have ephemeral storage on the server in /tmp.
 * Seed the MSAL Key Cache and localStorage with the latest from the database
 */
async function initCache(sectionHandle) {
  try {
    // populate cache with db contents
    let cacheData;
    try {
      cacheData = await db.getItem("cache");
    } catch (error) {
      // Cache not found in DB, will start fresh
      cacheData = null;
    }

    // Handle corrupted cache data (object instead of string)
    if (
      cacheData &&
      typeof cacheData === "object" &&
      Object.keys(cacheData).length === 0
    ) {
      await db.setItem("cache", null); // Clear the corrupted cache
      cacheData = null;
    }

    if (cacheData && typeof cacheData === "string" && cacheData.trim()) {
      // Validate that we have proper MSAL cache structure
      try {
        const parsed = JSON.parse(cacheData);
        if (parsed.Account && parsed.RefreshToken && parsed.AccessToken) {
          const path = require("path");
          const cachePath = path.resolve(process.env.CACHE_PATH);
          await fs.writeFile(cachePath, cacheData);
        }
      } catch (parseError) {
        // Cache data is not valid JSON, will start fresh
      }
    }

    // populate local storage with login contents
    // coerced to json
    localStorage.initStore();

    try {
      const onenote = await db.getItem("onenote", true);
      if (onenote) {
        localStorage.setItem("onenote", onenote);
      }
    } catch (error) {
      // OneNote data not found or corrupted, will be recreated on next auth
    }

    try {
      const count = await db.getItem(`${sectionHandle}_section_count`);
      localStorage.setItem(`${sectionHandle}_section_count`, count);
    } catch (error) {
      // Section count not found, will start from 0
    }

    try {
      const lastPage = await db.getItem(`${sectionHandle}_last_page`);
      localStorage.setItem(`${sectionHandle}_last_page`, lastPage);
    } catch (error) {
      // Last page not found, will start fresh
    }

    try {
      const recent = (await db.getItem(`recent_${sectionHandle}`, true)) || [];
      // Ensure recent is always an array
      const recentArray = Array.isArray(recent) ? recent : [];
      localStorage.setItem(`recent_${sectionHandle}`, recentArray);
    } catch (error) {
      // Recent data not found, will start with empty array
      localStorage.setItem(`recent_${sectionHandle}`, []);
    }
  } catch (err) {
    console.error("Error initializing cache", err);
    throw err;
  }
}

const app = async (event) => {
  let { onenoteSettings, messageSettings } = event;

  onenoteSettings = {
    sectionHandle: snakeCase(onenoteSettings.sectionName),
    isSequential: false,
    ...onenoteSettings,
  };

  const resp = await initCache(onenoteSettings.sectionHandle)
    .then(() => refreshToken())
    .then((tokenResponse) => {
      if (!tokenResponse || !hasValidToken()) {
        throw new Error("Token refresh failed - device login required");
      }
      return tokenResponse;
    })
    .then(() => getNote(onenoteSettings))
    .then((note) => {
      if (typeof note === "undefined") {
        throw new Error("Note is undefined");
      }
      return notify.withTelegram(note, messageSettings);
    })
    .catch(async (err) => {
      console.error("App: Check Logs", err);
      const errorMessage = err.errorMessage || err.message || String(err);

      if (err.message === "Token refresh failed - device login required") {
        try {
          await deviceLogin();
        } catch (loginErr) {
          const loginErrorMsg =
            loginErr.errorMessage || loginErr.message || String(loginErr);
          await notify.sendNoteToTelegram(
            `Device login failed: ${loginErrorMsg}`,
            process.env.ADMIN_TELEGRAM_CHANNEL,
            null,
            true
          );
        }
      } else {
        await notify.sendNoteToTelegram(
          errorMessage,
          process.env.ADMIN_TELEGRAM_CHANNEL,
          null,
          true
        );
      }

      return {
        status: 400,
        title: "Error",
        body: errorMessage,
      };
    });

  return {
    status: resp.status,
    title: resp.title,
    body: resp.body,
  };
};

module.exports = {
  app,
};
