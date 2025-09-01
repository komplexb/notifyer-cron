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

This is a serverless notification service that retrieves content from Microsoft OneNote and sends them to Telegram channels on scheduled intervals. The system supports multiple content types including quotes, verses, recipes, and mantras with image processing capabilities.

### Core Components

**handler.js** - Main Lambda entry point that orchestrates the notification flow:
- Initializes MSAL token cache and localStorage from DynamoDB
- Manages authentication state with token refresh and fallback to device login
- Retrieves notes from OneNote sections using Microsoft Graph SDK
- Sends formatted messages with images to Telegram channels
- Handles error recovery and admin notifications

**lib/auth.js** - Microsoft Graph API authentication using MSAL Node:
- Device code flow for initial authentication with Telegram notifications
- Automatic token refresh with intelligent error handling and fallback
- Token cache persistence to both DynamoDB and local file system
- Enhanced validation of token expiration with buffer time

**lib/onenote.js** - OneNote integration via Microsoft Graph SDK:
- **MIGRATED**: Now uses official Microsoft Graph SDK instead of direct REST API calls
- Fetches notes from specified notebook sections with improved error handling
- Supports both random and sequential note selection modes
- Prevents recent note repeats using localStorage tracking with DynamoDB persistence
- Handles note preview and full content retrieval with image processing

**lib/graph-onenote-service.js** - Graph SDK service layer:
- Centralizes all Microsoft Graph OneNote operations
- Handles API calls for sections, pages, page counts, previews, and content
- Image download functionality with size validation and buffer management

**lib/graph-client.js & lib/graph-auth-provider.js** - Graph SDK integration:
- Factory for creating configured Microsoft Graph clients
- Authentication provider bridge integrating MSAL tokens with Graph SDK

**lib/notify.js** - Message formatting and delivery with image support:
- Converts OneNote HTML content to Telegram MarkdownV2 format
- **ENHANCED**: Supports image processing, validation, and delivery
- Handles image extraction, size validation, and sending photos with captions
- Manages message length limits and formatting with graceful degradation

**lib/markdown.js** - HTML to Markdown conversion:
- Custom OneNote-specific HTML parsing rules
- Telegram MarkdownV2 formatting with proper escaping

**lib/store.js** - Enhanced localStorage with DynamoDB persistence:
- Node.js localStorage polyfill with conditional database persistence
- Handles authentication cache and note tracking data

**db/persist.js** - DynamoDB persistence layer:
- Generic wrapper for DynamoDB operations using AWS SDK v2
- Handles cache data, tokens, section counts, and recent note tracking

### Data Flow

1. EventBridge triggers Lambda on cron schedules defined in events.yml with specific OneNote settings
2. Lambda restores authentication cache from DynamoDB and initializes localStorage
3. Authentication flow attempts token refresh with fallback to device login via Telegram
4. Microsoft Graph SDK retrieves notebook sections and pages (random or sequential)
5. Content processing extracts note content and images, converts HTML to Telegram MarkdownV2
6. Message delivery sends images first (if present) with captions, then formatted text to Telegram channels

### Environment Configuration

- **dev**: Uses local tmp/ directory for cache, dev Telegram channels, every minute testing schedule
- **prod**: Uses Lambda /tmp for cache, production channels, complex cron schedules for different content types, secrets from SSM Parameter Store

### Key Dependencies

- `@azure/msal-node` (v2.16.2) - Microsoft authentication
- `@microsoft/microsoft-graph-client` (v3.0.7) - Official Graph SDK
- `superagent` (v10.0.0) - HTTP requests for Telegram API  
- `node-html-parser` (v6.1.5) - OneNote HTML parsing
- `telegram-format` (v2.1.0) - Telegram MarkdownV2 formatting
- `serverless` (v3.31.0) - AWS deployment framework
- `chance` (v1.1.11) - Random selection for notes