# Security Guidelines for CollisionLab — IBM Hackathon

This project follows the IBM Hackathon security template guidance for protecting credentials and sensitive configuration.

## Credential Management

### Do

- Use environment variables for credentials.
- Copy `.env.example` to `.env` if credentials are ever needed.
- Keep `.env` ignored by Git.
- Review `git diff` before committing.
- Use placeholders when asking AI assistants for help.

### Do not

- Do not hardcode API keys, passwords, or tokens in source files.
- Do not commit `.env` files.
- Do not place credentials in comments or prompts.
- Do not commit private keys or credential files.
- Do not remove security patterns from `.gitignore` or `.bobignore`.

## Using IBM Bob Safely

IBM Bob may retain task/session context. Never paste live credentials into prompts or ask Bob to inspect a real `.env` file.

Use placeholders instead, for example:

```text
BAD:  Here is my API key: abc123
GOOD: Help me access an API key through an environment variable.
```

The repository includes `.bobignore` patterns to reduce the risk of credentials appearing in Bob-assisted workflows.

## CollisionLab-specific note

The current CollisionLab prototype does not require IBM Cloud credentials or other runtime secrets. `.env.example`, `.bobignore`, and the expanded `.gitignore` are included to align the repository with the official IBM Hackathon security template and to keep future extensions safe.

## Before Every Commit

- [ ] No hardcoded credentials
- [ ] `.env` is not staged
- [ ] No credential/private-key files are staged
- [ ] `git diff` has been reviewed
- [ ] Bob prompts contain no secrets

If credentials are ever exposed, revoke/rotate them immediately and remove them from repository history before continuing.
