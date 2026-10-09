# Security Policy

## Supported versions

Security fixes go into the latest minor release. Please upgrade to it before
reporting.

| Version | Supported |
| ------- | --------- |
| 1.1.x   | Yes       |
| < 1.1   | No        |

## Reporting a vulnerability

Please report privately, not in a public issue:

- Preferred: [GitHub private vulnerability reporting](https://github.com/counterpoint-studio/audio-file-mcp-app/security/advisories/new)
- Fallback: email tero@teropa.info

Include the affected version, the host you used, and steps or a proof of
concept. You'll get an acknowledgement within 7 days. Fixes are disclosed
through a GitHub Security Advisory, with credit to the reporter if they want
it.

## Scope

This is a local stdio MCP server that runs with your user account's
permissions. Opening audio files that the user (or the model, through a tool
call) names by path, anywhere on disk, is intended behaviour. Reading files
that are not audio, or anything that works around that check, is in scope.
See the "Security model" section of the [README](README.md).
