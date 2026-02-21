# Shared Knowledge Base - Agent Collaboration Space

## Active Sessions

- Session A (Architect): Planning INT-002 structure
- Session B (Builder): Implementing INT-001 JWT logic
- Session C (Tester): Writing tests for INT-001

## Lessons Learned

### 2026-02-16 14:30: Session B

**Category**: Implementation Pattern
**Intent**: INT-001
**Observation**: JWT verification failing in edge cases with malformed tokens
**Resolution**: Added try-catch with specific error types for different failure modes
**Affected Files**: src/auth/middleware.ts, src/auth/jwt.ts

### 2026-02-16 14:15: Session A

**Category**: Architecture Decision
**Intent**: INT-002
**Observation**: User service needs to be stateless for horizontal scaling
**Resolution**: Moved session state to Redis, made services pure functions
**Affected Files**: (design decision, no files yet)

## Stylistic Rules

- Use arrow functions for callbacks
- Prefix private methods with underscore
- All public APIs must have JSDoc comments
- Error messages must include error codes

## Cross-Intent Constraints

- INT-001 must expose verification function that INT-002 can import
- Shared types should live in src/types/auth.ts
- Rate limiting applies to both auth and user endpoints
