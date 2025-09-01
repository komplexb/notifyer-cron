# Design Document

## Overview

This design outlines the migration from direct REST API calls using superagent to the official Microsoft Graph SDK (@microsoft/microsoft-graph-client) for OneNote operations. The migration will maintain all existing functionality while leveraging the SDK's built-in features including automatic retries, better error handling, and improved authentication integration.

The current system uses direct HTTP calls to Microsoft Graph endpoints for OneNote operations including retrieving sections, pages, page content, and image downloads. The new implementation will use the Graph SDK's fluent API while preserving the exact same behavior and data flow.

## Architecture

### Current Architecture
```
MSAL Authentication → superagent HTTP calls → OneNote REST API
```

### New Architecture
```
MSAL Authentication → Graph SDK Client → OneNote REST API
```

### Authentication Integration

The Graph SDK will integrate with the existing MSAL authentication system through a custom authentication provider that bridges the current token management with the SDK's authentication interface.

```javascript
class MSALAuthenticationProvider {
  async getAccessToken() {
    const onenoteData = localStorage.getItem('onenote');
    if (!onenoteData || !onenoteData.accessToken) {
      throw new Error('No access token available');
    }
    return onenoteData.accessToken;
  }
}
```

## Components and Interfaces

### 1. Authentication Provider Bridge

**Purpose**: Bridge existing MSAL token management with Graph SDK authentication requirements

**Implementation**:
- Implements the Graph SDK's `AuthenticationProvider` interface
- Retrieves tokens from existing localStorage cache
- Handles token expiration by delegating to existing refresh mechanisms

### 2. Graph Client Factory

**Purpose**: Create and configure the Microsoft Graph client instance

**Implementation**:
```javascript
function createGraphClient() {
  const authProvider = new MSALAuthenticationProvider();
  
  return Client.initWithMiddleware({
    authProvider,
    defaultVersion: 'v1.0',
    debugLogging: process.env.NODE_ENV === 'development'
  });
}
```

### 3. OneNote Service Layer

**Purpose**: Encapsulate all OneNote operations using the Graph SDK

**Key Methods**:
- `getSections(notebookName, sectionName)` - Find section by notebook and name
- `getPageCount(sectionId)` - Get total page count for a section
- `getPages(sectionId, options)` - Get pages with pagination
- `getPagePreview(pageId)` - Get page preview content
- `getPageContent(pageId)` - Get full page HTML content
- `downloadImage(imageUrl)` - Download images from Graph endpoints

### 4. Migration Wrapper

**Purpose**: Provide backward compatibility during migration

**Implementation**: Maintains the same function signatures as existing code while internally using the Graph SDK.

## Data Models

### Section Model
```javascript
{
  id: string,
  displayName: string,
  pagesUrl: string,
  parentNotebook: {
    displayName: string,
    sectionsUrl: string
  }
}
```

### Page Model
```javascript
{
  id: string,
  title: string,
  self: string,
  links: {
    oneNoteClientUrl: { href: string },
    oneNoteWebUrl: { href: string }
  }
}
```

### Page Preview Model
```javascript
{
  previewText: string,
  links: {
    previewImageUrl?: { href: string }
  }
}
```

## Error Handling

### SDK Error Mapping

The Graph SDK provides enhanced error handling that will be mapped to maintain compatibility with existing error handling patterns:

```javascript
function mapGraphError(error) {
  // Map Graph SDK errors to existing error format
  if (error.code === 'InvalidAuthenticationToken') {
    throw new Error('Token refresh failed - device login required');
  }
  
  if (error.code === 'TooManyRequests') {
    // SDK handles retries automatically, but we can add custom logic
    throw new Error('Rate limit exceeded');
  }
  
  // Preserve original error structure for unknown errors
  throw error;
}
```

### Timeout Configuration

Configure SDK timeouts to match existing behavior:

```javascript
const client = Client.initWithMiddleware({
  authProvider,
  middleware: [
    new TimeoutHandler({
      timeout: 120000 // 120 seconds to match existing TIMEOUTS.response
    })
  ]
});
```

## Testing Strategy

### Unit Tests

1. **Authentication Provider Tests**
   - Test token retrieval from localStorage
   - Test error handling when tokens are missing/expired
   - Test integration with existing MSAL flow

2. **OneNote Service Tests**
   - Mock Graph SDK client responses
   - Test all OneNote operations (sections, pages, content, images)
   - Verify data transformation matches existing format
   - Test error scenarios and mapping

3. **Integration Tests**
   - Test complete flow from authentication to data retrieval
   - Verify backward compatibility with existing function signatures
   - Test timeout and retry behavior

### Migration Testing

1. **Parallel Testing**
   - Run both old and new implementations side-by-side
   - Compare outputs to ensure identical behavior
   - Measure performance differences

2. **Feature Parity Tests**
   - Random note selection produces same distribution
   - Sequential note tracking works identically
   - Image download maintains size limits and streaming
   - Recent note filtering behaves the same

## Implementation Plan

### Phase 1: Foundation
- Install Graph SDK and fetch polyfill dependencies
- Create authentication provider bridge
- Set up Graph client factory with proper configuration

### Phase 2: Core Services
- Implement OneNote service layer using Graph SDK
- Create migration wrapper maintaining existing interfaces
- Add comprehensive error handling and mapping

### Phase 3: Feature Migration
- Replace section lookup functionality
- Replace page counting and retrieval
- Replace page preview and content operations
- Replace image download functionality

### Phase 4: Testing & Validation
- Implement comprehensive test suite
- Run parallel testing to verify behavior
- Performance testing and optimization
- Remove superagent dependency if no longer needed

## Configuration Changes

### Package.json Updates
```json
{
  "dependencies": {
    "@microsoft/microsoft-graph-client": "^3.0.7",
    "isomorphic-fetch": "^3.0.0"
  }
}
```

### Environment Variables
No new environment variables required - existing MS Graph configuration will be reused.

## Backward Compatibility

The migration maintains 100% backward compatibility by:

1. **Preserving Function Signatures**: All existing function calls work unchanged
2. **Maintaining Data Structures**: Response objects have identical structure
3. **Keeping Error Patterns**: Error messages and types remain consistent
4. **Preserving Behavior**: Random selection, sequential tracking, and caching work identically

## Performance Considerations

### Expected Improvements
- **Automatic Retries**: SDK handles transient failures automatically
- **Connection Pooling**: Better HTTP connection management
- **Request Optimization**: SDK optimizes Graph API calls

### Monitoring Points
- Response times for OneNote operations
- Memory usage during image downloads
- Error rates and retry patterns
- Token refresh frequency

## Security Considerations

### Token Handling
- Graph SDK never stores tokens - relies on our authentication provider
- Existing MSAL security model remains unchanged
- Token refresh logic preserved exactly

### Image Downloads
- Maintain existing 3MB size limits
- Preserve streaming download behavior for large files
- Keep existing timeout protections