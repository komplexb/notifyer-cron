---
inclusion: always
---

# Diagnostic Log Cleanup

When completing tasks, remove any diagnostic console.log statements that were added during development or debugging.

## Guidelines

- Remove `console.log` statements that were added for debugging purposes
- Keep essential logging for error handling and important application events
- Remove temporary logging that was added to understand code flow
- Preserve existing production logging that provides value for monitoring

## Examples of logs to remove

- Debug logs showing variable values during development
- Temporary logs added to trace execution flow
- Console logs added to verify function calls during testing
- Any logs that were specifically added for task completion verification

## Examples of logs to keep

- Error logging (`console.error`)
- Important application state changes
- Authentication and authorization events
- Performance monitoring logs that existed before task implementation