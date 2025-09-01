# Design Document

## Overview

This design document outlines the migration strategy for transitioning the notifyer-cron serverless application from AWS SDK for JavaScript v2 to v3. The migration focuses on maintaining functional equivalence while leveraging v3's performance improvements, reduced bundle sizes, and modular architecture.

The primary changes involve replacing the v2 `AWS.DynamoDB.DocumentClient` with v3's modular `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb` packages, updating import statements, client instantiation patterns, and error handling to align with v3's architecture.

## Architecture

### Current Architecture (v2)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Lambda        │    │   AWS SDK v2     │    │   DynamoDB      │
│   Functions     │───▶│   DocumentClient │───▶│   Table         │
│                 │    │   (93.6MB)       │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Target Architecture (v3)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Lambda        │    │   AWS SDK v3     │    │   DynamoDB      │
│   Functions     │───▶│   Modular Client │───▶│   Table         │
│                 │    │   (17MB)         │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                            │
                            ├─ @aws-sdk/client-dynamodb
                            └─ @aws-sdk/lib-dynamodb
```

### Migration Strategy
The migration will follow a **direct replacement approach** rather than gradual migration, ensuring:
- Single deployment with complete v3 implementation
- Minimal code changes through strategic abstraction
- Preservation of existing functionality and error handling patterns
- Optimization for serverless/Lambda environment

## Components and Interfaces

### 1. Database Persistence Layer (`db/persist.js`)

**Current Implementation:**
```javascript
const AWS = require('aws-sdk')
const documentClient = new AWS.DynamoDB.DocumentClient({
  apiVersion: '2012-10-08'
})
```

**Target Implementation:**
```javascript
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb')

const client = new DynamoDBClient({
  region: process.env.REGION
})

const documentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true // Maintain v2 behavior
  }
})
```

**Interface Changes:**
- Replace `.promise()` calls with direct `await` on `send()` method
- Update error handling to account for v3's error structure (`error.$metadata`)
- Maintain existing `getItem()` and `setItem()` function signatures

### 2. Package Dependencies

**Removals:**
- `aws-sdk` (v2) from devDependencies

**Additions:**
- `@aws-sdk/client-dynamodb` (v3)
- `@aws-sdk/lib-dynamodb` (v3)

**Bundle Size Impact:**
- Current: ~93.6MB install size
- Target: ~17MB install size
- Runtime bundle reduction: ~3.4MB → ~234KB

### 3. Serverless Plugin Compatibility

**Current Plugins:**
- `serverless-webpack` (v5.11.0)
- `serverless-offline` (v12.0.4)
- `serverless-dynamodb-local` (v0.2.40) - currently commented out

**Compatibility Assessment:**
- **serverless-webpack**: Generally compatible with v3, may need version verification
- **serverless-offline**: Should work with v3 SDK operations, requires testing
- **serverless-dynamodb-local**: May need updates for v3 compatibility if re-enabled

**Webpack Configuration:**
```javascript
// webpack.config.js - current configuration maintained
module.exports = {
  externals: {
    // AWS SDK v3 modules will be bundled for optimal tree-shaking
    // No externals needed as v3 is designed for bundling
  }
}
```

**Serverless Framework Integration:**
- Maintain existing `serverless-webpack` plugin configuration
- Leverage v3's improved tree-shaking for smaller bundles
- No changes required to `serverless.yml`
- Verify plugin compatibility and upgrade if necessary

**Plugin Compatibility Research Required:**
- Verify serverless-webpack v5.11.0 works with AWS SDK v3 modular imports
- Test serverless-offline v12.0.4 compatibility with v3 SDK operations
- Check if serverless-dynamodb-local v0.2.40 needs updates for v3 (if re-enabled)
- Document any required plugin version upgrades or configuration changes

## Data Models

### DynamoDB Operations Mapping

| Operation | v2 Implementation | v3 Implementation |
|-----------|-------------------|-------------------|
| Get Item | `documentClient.get(params).promise()` | `documentClient.send(new GetCommand(params))` |
| Update Item | `documentClient.update(params).promise()` | `documentClient.send(new UpdateCommand(params))` |

### Error Structure Changes

**v2 Error Structure:**
```javascript
{
  code: 'ResourceNotFoundException',
  statusCode: 400,
  // ... other top-level properties
}
```

**v3 Error Structure:**
```javascript
{
  name: 'ResourceNotFoundException',
  $metadata: {
    httpStatusCode: 400,
    // ... metadata in subfield
  }
}
```

### Data Marshalling Considerations

**Key Configuration:**
```javascript
const documentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true, // Replicate v2 behavior
    convertEmptyValues: false    // Maintain current handling
  }
})
```

## Error Handling

### Error Handling Strategy

1. **Preserve Existing Patterns:** Maintain current try/catch blocks and error propagation
2. **Adapt Error Structure:** Update error property access to use v3's structure
3. **Logging Consistency:** Ensure error logs maintain current format

### Implementation Approach

**Current Error Handling:**
```javascript
try {
  const data = await documentClient.get(params).promise()
  return parse ? JSON.parse(data.Item[itemName]) : data.Item[itemName]
} catch (err) {
  console.error(`Error getting db item: '${itemName}'`)
  console.error(err)
  throw err
}
```

**Target Error Handling:**
```javascript
try {
  const data = await documentClient.send(new GetCommand(params))
  return parse ? JSON.parse(data.Item[itemName]) : data.Item[itemName]
} catch (err) {
  console.error(`Error getting db item: '${itemName}'`)
  console.error(err)
  throw err // Error structure will be v3 format but handling remains the same
}
```

### Error Compatibility Layer

No compatibility layer needed as:
- Error throwing/catching patterns remain unchanged
- Console logging will work with v3 error objects
- Application-level error handling doesn't depend on specific error properties

## Testing Strategy

### Unit Testing Approach

1. **Functional Equivalence Testing:**
   - Test all DynamoDB operations return identical results
   - Verify error scenarios produce equivalent behavior
   - Validate data marshalling/unmarshalling consistency

2. **Integration Testing:**
   - Test complete Lambda function execution
   - Verify serverless deployment process
   - Test local development with serverless-offline
   - Validate AWS IAM permissions compatibility
   - Test serverless plugin functionality

3. **Performance Testing:**
   - Measure cold start time improvements
   - Validate bundle size reductions
   - Monitor memory usage changes

### Test Implementation Strategy

**Mock Testing:**
```javascript
// Use aws-sdk-client-mock for v3 testing
const { mockClient } = require('aws-sdk-client-mock')
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb')

const ddbMock = mockClient(DynamoDBDocumentClient)
ddbMock.on(GetCommand).resolves({ Item: { test: 'data' } })
```

**Deployment Testing:**
1. Deploy to development environment
2. Execute full application workflow
3. Verify data persistence and retrieval
4. Confirm monitoring and logging functionality

### Rollback Strategy

**Immediate Rollback Capability:**
- Maintain v2 implementation in version control
- Prepare rollback deployment package
- Document rollback procedure

**Rollback Triggers:**
- Functional regression detected
- Performance degradation beyond acceptable thresholds
- Deployment failures in production environment

## Performance Considerations

### Bundle Size Optimization

**Tree-Shaking Benefits:**
- v3's modular architecture enables automatic dead code elimination
- Only required DynamoDB operations will be included in bundle
- Estimated 85% reduction in AWS SDK bundle size

**Cold Start Improvements:**
- Smaller bundle size reduces Lambda initialization time
- Modular imports reduce memory footprint
- Estimated 10-30% improvement in cold start performance

### Memory Usage

**v2 vs v3 Memory Profile:**
- v2: Loads entire AWS SDK into memory
- v3: Loads only required service clients
- Expected memory usage reduction: 20-40%

### Runtime Performance

**Operation Performance:**
- DynamoDB operations: Equivalent performance expected
- Client initialization: Slightly faster due to reduced overhead
- Error handling: Minimal performance impact

## Deployment Strategy

### Deployment Approach

**Single-Phase Deployment:**
1. Research and verify serverless plugin compatibility
2. Update package.json dependencies (including plugin upgrades if needed)
3. Modify db/persist.js implementation
4. Test local development workflow with plugins
5. Deploy complete application
6. Monitor for issues
7. Rollback if necessary

### Deployment Validation

**Pre-Deployment Checklist:**
- [ ] Serverless plugin compatibility verified
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Local development workflow tested (serverless-offline, etc.)
- [ ] Bundle size verification
- [ ] Serverless configuration validation

**Post-Deployment Verification:**
- [ ] Lambda functions execute successfully
- [ ] DynamoDB operations function correctly
- [ ] Error handling works as expected
- [ ] Performance metrics within acceptable ranges
- [ ] Monitoring and logging operational

### Risk Mitigation

**Low-Risk Factors:**
- Minimal code changes required
- Well-documented migration path
- Extensive AWS documentation and community support
- Backward-compatible error handling approach

**Risk Mitigation Measures:**
- Comprehensive testing in development environment
- Gradual rollout capability (if needed)
- Immediate rollback procedure
- Monitoring alerts for performance degradation

## Monitoring and Observability

### Metrics to Monitor

**Performance Metrics:**
- Lambda cold start duration
- Lambda execution duration
- Memory utilization
- DynamoDB operation latency

**Functional Metrics:**
- Error rates
- Success rates for DynamoDB operations
- Application workflow completion rates

**Cost Metrics:**
- Lambda execution costs
- DynamoDB request costs
- Data transfer costs

### Logging Strategy

**Maintain Current Logging:**
- Preserve existing console.log statements
- Maintain error logging format
- Ensure CloudWatch integration continues

**Enhanced Logging (Optional):**
- Add v3-specific performance metrics
- Include bundle size information
- Log client initialization details

This design provides a comprehensive migration strategy that minimizes risk while maximizing the benefits of AWS SDK v3's improved architecture and performance characteristics.