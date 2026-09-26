# Authentication v2 — Identity Requirements

**Status:** Target requirements for Authentication v2  
**Scope:** Authentication, profiles, caches, and internal features that reference users

## Purpose

Authentication v2 introduces email-based login while preserving a consistent
user identity across internal systems. These requirements define the intended
behavior for implementation and integration review; they do not certify that
the current demonstration satisfies every requirement.

## Identity model

**AUTH-01 — Email login.** Users must authenticate using their email address.
Successful authentication must resolve the credential to a user record that
includes the user's immutable ID.

**AUTH-02 — Credentials are not canonical identity.** Email is a login
credential, not the canonical internal identity. Internal consumers must not
assume that the value entered at login is a username or a stable user identifier.

**ID-01 — Canonical user ID.** The immutable `user.id` is the canonical identity
across internal systems. It must remain unchanged for the lifetime of the user
record and must not be reassigned to another user.

**ID-02 — Mutable attributes.** Both username and email may change. Such changes
must preserve the user's identity and association with their existing profile
and internal records. Neither attribute may be treated as permanently stable.

## Integration and caching

**CACHE-01 — Stable cache identity.** Internal user and profile caches must not
rely on username or email as permanent user identifiers. Cache entries that
represent a user should be keyed by immutable user ID. Any secondary lookup by
username or email must resolve to that ID and be updated or invalidated when
the attribute changes.

**INT-01 — Authentication and profile compatibility.** Authentication and profile
systems must agree on the identity passed between them. After a successful
login, the application must be able to retrieve the corresponding profile
using the resolved user identity. Passing a raw email credential to an API
expecting a username does not satisfy this requirement.

**INT-02 — Identity use in new features.** Features that store, exchange, or look
up user identity should prefer immutable user ID. Use of a mutable attribute
must have a documented purpose and an explicit mapping to the canonical ID.

## Acceptance criteria

- Email login resolves to the expected user ID and corresponding profile.
- Changing username or email does not change the user ID or detach the profile.
- Cache lookups remain correct after an attribute change; stale secondary
  mappings cannot return another user's data.
- Integration tests verify the full login-to-profile flow in addition to
  authentication and cache unit tests.

Reviewers must assess these requirements across feature boundaries. Passing
isolated tests or merging without textual conflicts is not sufficient evidence
of identity compatibility.

