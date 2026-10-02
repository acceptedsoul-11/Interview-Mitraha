# Interview मित्रः 1.0.1

## Release highlights

- Added a first-run guide, project architecture diagram, and screenshot walkthrough.
- Added a challenge write-up draft with the required `hf26challenge` DEV tag and the requested `hacktoberfest-2026` GitHub topic.
- Added GitHub Actions checks for the existing nine HTTP integration tests and JavaScript syntax checks.
- Updated the source archive to include the screenshots and submission copy.

## Verify the release

```powershell
npm.cmd test
npm.cmd run check
```

No `npm install` is required.

---

# Interview मित्रः 1.0.0

## Release highlights

- Refined, responsive dark-glow interface with an animated CSS mascot and reduced-motion support.
- Role-specific local Gemma coaching with bounded conversation context.
- Voice dictation with editable transcript review and optional spoken replies.
- Honest speech-recognition privacy notice; browser speech providers may process audio when local recognition is unavailable.
- Hardened localhost HTTP server with request validation, timeouts, security headers, and safe static paths.
- Zero runtime dependencies; MIT licensed.

## Requirements

- Windows 10/11, PowerShell 5.1 or newer.
- Node.js 20 or newer.
- Ollama installed and Gemma 3 4B downloaded (the launcher downloads it if missing; allow about 3.3 GB plus Ollama storage overhead).

## Verify the release

```powershell
npm.cmd test
npm.cmd run check
```

Both commands use Node's built-in test runner; no `npm install` is required.
