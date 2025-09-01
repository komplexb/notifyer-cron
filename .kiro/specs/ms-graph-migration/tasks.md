# Implementation Plan

- [ ] 1. Set up project dependencies and configuration
  - Install @microsoft/microsoft-graph-client and isomorphic-fetch packages
  - Update package.json with new dependencies
  - Configure fetch polyfill import in main application files
  - _Requirements: 5.1, 5.3_

- [ ] 2. Create authentication provider bridge
  - Implement MSALAuthenticationProvider class that implements AuthenticationProvider interface
  - Add getAccessToken method that retrieves tokens from existing localStorage cache
  - Add error handling for missing or expired tokens
  - Write unit tests for authentication provider functionality
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 3. Implement Graph client factory and configuration
  - Create createGraphClient function that initializes Graph SDK with authentication provider
  - Configure client with appropriate timeouts matching existing TIMEOUTS constants
  - Add debug logging configuration based on environment
  - Write unit tests for client factory
  - _Requirements: 1.1, 1.2, 6.2_

- [ ] 4. Create OneNote service layer with section operations
  - Implement getSections method using Graph SDK to replace setNoteSection functionality
  - Add section filtering by notebook name and section name
  - Ensure response data structure matches existing section object format
  - Write unit tests for section lookup operations
  - _Requirements: 3.1, 3.2, 1.4_

- [ ] 5. Implement page counting functionality
  - Create getPageCount method using Graph SDK to replace getNoteCount
  - Use Graph SDK's count parameter and pagination to get accurate page counts
  - Maintain existing localStorage caching for section page counts
  - Write unit tests for page counting with various section sizes
  - _Requirements: 3.1, 3.2, 6.4_

- [ ] 6. Implement page retrieval with pagination
  - Create getPages method using Graph SDK with skip and top parameters
  - Support both random and sequential page retrieval modes
  - Ensure orderby parameter matches existing API calls (title,createdDateTime)
  - Write unit tests for pagination scenarios
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 7. Implement page preview functionality
  - Create getPagePreview method using Graph SDK to access page preview endpoint
  - Ensure preview response format matches existing getNotePreview output
  - Handle preview image URLs and metadata correctly
  - Write unit tests for page preview retrieval
  - _Requirements: 3.3, 3.4_

- [ ] 8. Implement page content retrieval
  - Create getPageContent method using Graph SDK to access page content endpoint
  - Ensure HTML content response matches existing getNoteContents format
  - Handle content encoding and parsing correctly
  - Write unit tests for content retrieval
  - _Requirements: 3.3, 3.4_

- [ ] 9. Implement image download functionality
  - Create downloadImage method using Graph SDK for image endpoint access
  - Maintain existing 3MB size limit and streaming download behavior
  - Preserve getImageSize functionality for size checking before download
  - Add proper error handling for oversized images and network issues
  - Write unit tests for image download scenarios including size limits
  - _Requirements: 3.4, 6.3_

- [ ] 10. Create migration wrapper layer
  - Implement wrapper functions that maintain existing function signatures
  - Map getNote, getNoteCount, setNoteSection, getNotePreview, getNoteContents calls to new service layer
  - Ensure extractFirstImage and downloadImage functions work with new implementation
  - Add error mapping from Graph SDK errors to existing error format
  - _Requirements: 1.4, 3.1, 3.2, 3.3, 3.4_

- [ ] 11. Add comprehensive error handling and mapping
  - Implement mapGraphError function to convert Graph SDK errors to existing error patterns
  - Handle authentication errors by triggering existing device login flow
  - Map timeout and rate limiting errors appropriately
  - Ensure error messages match existing format for backward compatibility
  - Write unit tests for error scenarios and mapping
  - _Requirements: 1.3, 4.4_

- [ ] 12. Update main application integration
  - Modify lib/onenote.js to use new Graph SDK implementation
  - Ensure all existing function exports work with new implementation
  - Update any import statements and initialization code
  - Verify handler.js continues to work without changes
  - _Requirements: 1.1, 1.4_

- [ ] 13. Create comprehensive test suite
  - Write integration tests that verify complete OneNote workflow
  - Add tests for random vs sequential note selection behavior
  - Test recent note filtering and localStorage integration
  - Create tests for image extraction and download workflows
  - Add performance tests to ensure response times are maintained
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 14. Implement parallel testing for migration validation
  - Create test harness that runs both old and new implementations
  - Compare outputs to ensure identical behavior for all OneNote operations
  - Validate that random note selection produces equivalent distributions
  - Verify sequential note tracking maintains exact same state
  - Test image download behavior matches existing implementation
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 15. Performance testing and optimization
  - Measure response times for all OneNote operations with new implementation
  - Compare memory usage during image downloads
  - Test timeout behavior matches existing 120s response / 60s deadline limits
  - Optimize any performance regressions found during testing
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 16. Clean up dependencies and finalize migration
  - Remove superagent dependency if no longer used elsewhere in the codebase
  - Update any remaining direct HTTP calls to use Graph SDK
  - Clean up any unused imports or configuration
  - Update documentation and comments to reflect new implementation
  - _Requirements: 5.2, 5.4_