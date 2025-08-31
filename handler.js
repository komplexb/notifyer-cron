const {
  hasValidToken,
  refreshToken,
  persistCache,
  deviceLogin,
} = require("./lib/auth");
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
    const cacheData = await db.getItem("cache");
    console.log(
      `Retrieved cache data from DynamoDB: ${
        cacheData ? "Data found" : "No data"
      } (type: ${typeof cacheData}, length: ${cacheData?.length || 0})`
    );
    console.log(`Cache data JSON: ${JSON.stringify(cacheData)}`);
    console.log(`Cache data constructor: ${cacheData?.constructor?.name}`);

    // Handle corrupted cache data (object instead of string)
    if (
      cacheData &&
      typeof cacheData === "object" &&
      Object.keys(cacheData).length === 0
    ) {
      console.warn("Detected corrupted cache (empty object), clearing it");
      await db.setItem("cache", null); // Clear the corrupted cache
      cacheData = null;
    }

    if (cacheData && typeof cacheData === "string" && cacheData.trim()) {
      // Validate that we have proper MSAL cache structure
      try {
        const parsed = JSON.parse(cacheData);
        console.log(`=== CACHE RESTORATION DEBUG ===`);
        console.log(`Cache data length: ${cacheData.length}`);
        console.log(`Parsed cache keys: ${Object.keys(parsed)}`);

        if (parsed.AccessToken) {
          const accessTokens = Object.keys(parsed.AccessToken);
          console.log(`Access tokens count: ${accessTokens.length}`);
          if (accessTokens.length > 0) {
            const firstToken = parsed.AccessToken[accessTokens[0]];
            console.log(
              `First access token expires: ${new Date(
                parseInt(firstToken.expires_on) * 1000
              ).toISOString()}`
            );
            console.log(
              `First access token ext expires: ${new Date(
                parseInt(firstToken.extended_expires_on) * 1000
              ).toISOString()}`
            );
          }
        }

        if (parsed.RefreshToken) {
          const refreshTokens = Object.keys(parsed.RefreshToken);
          console.log(`Refresh tokens count: ${refreshTokens.length}`);
        }

        if (parsed.Account && parsed.RefreshToken && parsed.AccessToken) {
          const path = require("path");
          const cachePath = path.resolve(process.env.CACHE_PATH);
          console.log(`Writing cache to: ${cachePath}`);
          await fs.writeFile(cachePath, cacheData);
          console.log("✅ Valid MSAL cache restored to file system");

          // Verify the file was written
          const writtenData = await fs.readFile(cachePath, "utf-8");
          console.log(
            `✅ Verified written cache length: ${writtenData.length}`
          );
        } else {
          console.warn(
            "Invalid MSAL cache structure in DynamoDB, will start fresh"
          );
          console.warn(
            `Missing sections: Account=${!!parsed.Account}, RefreshToken=${!!parsed.RefreshToken}, AccessToken=${!!parsed.AccessToken}`
          );
        }
      } catch (parseError) {
        console.warn(
          "Cache data from DynamoDB is not valid JSON, will start fresh"
        );
        console.warn(`Parse error: ${parseError.message}`);
      }
    } else {
      console.warn(
        `No valid cache data found in DynamoDB - cacheData: ${JSON.stringify(
          cacheData
        )} (type: ${typeof cacheData})`
      );
    }

    // populate local storage with login contents
    // coerced to json
    localStorage.initStore();
    const onenote = await db.getItem("onenote", true);
    console.log(
      `Retrieved OneNote data from DynamoDB: ${
        onenote ? "Data found" : "No data"
      }`
    );

    if (onenote) {
      localStorage.setItem("onenote", onenote);
      console.log(
        `OneNote token expires: ${new Date(
          onenote.expiresOn
        )}, ExtExpires: ${new Date(onenote.extExpiresOn)}`
      );
    }

    const count = await db.getItem(`${sectionHandle}_section_count`);
    localStorage.setItem(`${sectionHandle}_section_count`, count);

    const lastPage = await db.getItem(`${sectionHandle}_last_page`);
    localStorage.setItem(`${sectionHandle}_last_page`, lastPage);

    const recent = (await db.getItem(`recent_${sectionHandle}`, true)) || [];
    // Ensure recent is always an array
    const recentArray = Array.isArray(recent) ? recent : [];
    localStorage.setItem(`recent_${sectionHandle}`, recentArray);

    console.log("localStorage restoration completed");
  } catch (err) {
    console.error("Error initializing cache", err);
    throw err;
  }
}

const app = async (event, context) => {
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
