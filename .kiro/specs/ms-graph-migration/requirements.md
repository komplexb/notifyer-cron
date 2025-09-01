# Requirements Document

## Introduction

This feature involves migrating the existing OneNote API integration from direct REST API calls using superagent to the official Microsoft Graph SDK (@microsoft/microsoft-graph-client). The current system retrieves random or sequential notes from OneNote sections and sends them via Telegram notifications. The migration should maintain all existing functionality while leveraging the benefits of the official SDK including better error handling, automatic retries, and improved type safety.

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want the OneNote integration to use the official Microsoft Graph SDK, so that the system benefits from improved reliability, better error handling, and official Microsoft support.

#### Acceptance Criteria

1. WHEN the system initializes THEN it SHALL use @microsoft/microsoft-graph-client instead of direct superagent calls
2. WHEN making Graph API requests THEN the system SHALL use the Graph SDK's built-in authentication handling
3. WHEN API errors occur THEN the system SHALL leverage the SDK's enhanced error handling and retry mechanisms
4. WHEN the migration is complete THEN all existing OneNote functionality SHALL work identically to the current implementation

### Requirement 2

**User Story:** As a developer, I want comprehensive tests for the migrated OneNote functionality, so that I can ensure the migration maintains all existing behavior and catches any regressions.

#### Acceptance Criteria

1. WHEN tests are written THEN they SHALL cover all OneNote API operations (getNote, getNoteCount, setNoteSection, getNotePreview, getNoteContents)
2. WHEN tests run THEN they SHALL verify authentication token handling works correctly with the Graph SDK
3. WHEN tests execute THEN they SHALL validate that random and sequential note retrieval functions identically to the current implementation
4. WHEN tests complete THEN they SHALL confirm that image extraction and download functionality remains unchanged

### Requirement 3

**User Story:** As a system user, I want the note retrieval functionality to work exactly as before, so that my Telegram notifications continue to deliver the same OneNote content without interruption.

#### Acceptance Criteria

1. WHEN retrieving notes in random mode THEN the system SHALL return random notes from the specified section with the same distribution as before
2. WHEN retrieving notes in sequential mode THEN the system SHALL return notes in the same order and track the last page identically
3. WHEN getting note previews THEN the system SHALL return the same preview text and metadata as the current implementation
4. WHEN extracting images THEN the system SHALL download and process images with the same size limits and error handling

### Requirement 4

**User Story:** As a system maintainer, I want the authentication flow to remain unchanged, so that existing token management and device login processes continue to work without modification.

#### Acceptance Criteria

1. WHEN using the Graph SDK THEN it SHALL integrate seamlessly with the existing MSAL authentication system
2. WHEN tokens are refreshed THEN the Graph SDK SHALL use the same cached tokens from the current MSAL implementation
3. WHEN authentication fails THEN the system SHALL trigger the same device login flow as currently implemented
4. WHEN tokens expire THEN the Graph SDK SHALL handle token refresh transparently using existing mechanisms

### Requirement 5

**User Story:** As a developer, I want the migration to include proper dependency management, so that the new Graph SDK is correctly installed and configured while removing unused dependencies.

#### Acceptance Criteria

1. WHEN installing dependencies THEN the system SHALL add @microsoft/microsoft-graph-client and appropriate fetch polyfill
2. WHEN the migration is complete THEN superagent dependency SHALL be removed if no longer needed elsewhere
3. WHEN the application starts THEN it SHALL import and configure the Graph SDK with proper authentication middleware
4. WHEN making API calls THEN the system SHALL use the Graph SDK's fluent API instead of manual URL construction

### Requirement 6

**User Story:** As a system operator, I want the migrated system to maintain the same performance characteristics, so that note retrieval times and resource usage remain consistent.

#### Acceptance Criteria

1. WHEN retrieving notes THEN response times SHALL be comparable to or better than the current implementation
2. WHEN handling timeouts THEN the Graph SDK SHALL respect the same timeout values (120s response, 60s deadline)
3. WHEN processing large images THEN the system SHALL maintain the same 3MB size limits and streaming download behavior
4. WHEN caching data THEN the system SHALL continue to use the same localStorage and DynamoDB persistence patterns