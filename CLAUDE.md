# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Run app locally with watch mode using test data from eventData.json
- `npm run app` - Run app locally once
- `npm run offline` - Start serverless offline on port 4500
- `npm run refresh` - Test refresh token functionality
- `npm test` - Run Jest tests
- `npm run deploy` - Deploy to production AWS environment
- `npm run logs` - Tail production Lambda logs

## High-Level Architecture

This is a serverless notification service that retrieves random inspirational quotes from Microsoft OneNote and sends them to Telegram channels on scheduled intervals.

### Core Components

**handler.js** - Main Lambda entry point that orchestrates the entire flow:
1. Initializes MSAL token cache from DynamoDB
2. Refreshes Microsoft Graph API tokens
3. Retrieves random notes from OneNote sections
4. Sends formatted messages to Telegram channels

**lib/auth.js** - Microsoft Graph API authentication using MSAL Node:
- Device code flow for initial login (sends auth prompts to Telegram)
- Automatic token refresh with fallback to device login
- Token cache persistence to DynamoDB and local file system

**lib/onenote.js** - OneNote integration via Microsoft Graph API:
- Fetches notes from specified notebook sections
- Supports both random and sequential note selection
- Prevents recent note repeats using localStorage tracking
- Handles note preview and full content retrieval

**lib/notify.js** - Message formatting and delivery:
- Converts OneNote HTML content to Telegram MarkdownV2 format
- Handles image removal and source link extraction
- Manages message length limits and formatting

### Data Flow

1. EventBridge triggers Lambda on cron schedules defined in events.yml
2. Lambda restores authentication cache from DynamoDB
3. Microsoft Graph API calls retrieve notes from OneNote sections
4. HTML content is converted to Markdown and sent to Telegram channels

### Environment Configuration

- **dev**: Uses local tmp/ directory for cache, dev Telegram channels
- **prod**: Uses Lambda /tmp for cache, production channels and secrets from SSM Parameter Store

### Key Dependencies

- `@azure/msal-node` for Microsoft authentication
- `superagent` for HTTP requests
- `telegram-format` for MarkdownV2 formatting
- `serverless` framework for AWS deployment