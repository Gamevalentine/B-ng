# BÔNG source migration status (PR #5)

This branch is a **draft migration**, NOT a working Windows release.

## Source now staged on GitHub

| Component | Current state | Evidence |
| --- | --- | --- |
| `apps/stage-tamagotchi` | 418 reviewed source files imported from the sanitized Windows ZIP | GitHub Actions import run 37973355940 |
| `packages/provider-inference` | BÔNG Mai Chi/Piper provider definitions registered | `src/providers/local/bong-zerotts/index.ts`, `src/providers/local/bong-piper/index.ts`, registry |
| `packages/stage-ui` | Known last nonblocking Mai Chi segmenter options staged in `Stage.vue` | Uses `createTtsSegmentStream` and a 12–36 word target |
| `packages/pipelines-audio` | AIRI base code already exists; B3 punctuation behavior documented with a regression test | `src/processors/bong-tts-segmentation.test.ts` |
| ZeroTTS worker | Vietnamese Mai Chi C Python source staged **without** binaries/model | `tools/bong-tts/zerotts/worker-maichi.py` |

## Important limits

- The original **Windows-only** source trees under `E:\AIRI\packages\stage-ui`, `provider-inference`, `pipelines-audio` are not currently accessible (desktop device offline). The entries above are *targeted known changes*, **not an exact full-tree sync or verified byte-for-byte replacement**.
- The Mai Chi and Piper model weights, Python virtual environment, model downloader/installer, and Windows worker path resolution are not packaged. The repo currently cannot produce a truly self-contained offline-voice installer.
- The B2 Sherpa runtime and model assets need validation against the Windows version. Speech-recognition parity is not proven.
- The B3 issue (Mai Chi C sounds correct in reference recordings but different through the 2D character) is **not resolved**. The regression test records the existing segmentation issue; it does not fix the issue.
- `pnpm-lock.yaml` is inconsistent with `apps/stage-tamagotchi/package.json` after the source ZIP import. The draft compatibility workflow uses a non-frozen install *only for diagnosis*. Update the lockfile in a reviewed commit before any release.
- `apps/stage-tamagotchi/build/bong-bundle-ready.json` is deliberately absent; do not set readiness flags true until packaging is actually verified.

## CI policy

`.github/workflows/bong-library-compatibility.yml` runs on pushes to this migration branch. It checks source integration, types and a non-installer Electron build. This uses no Gemini credentials and must never publish or overwrite the user's installed Windows BÔNG.

`.github/workflows/bong-source-readiness.yml` reports a failure while required files are missing.

`.github/workflows/build-windows-oneclick.yml` is manual-only and hard-gated to require real runtime packaging verification.

Do not merge, publish installers, or deploy to the user's laptop until source parity, lockfile, real Windows playback and Sherpa QA all pass and the owner approves.


## Build / lockfile verification (2026-10-10)

- GitHub Actions run [38038858620](https://github.com/Gamevalentine/B-ng/actions/runs/38038858620) passed **all** draft compatibility steps, including `stage-ui` typecheck and Electron build (source build only, no Windows installer).
- The shared CI failure on the previous head was `ERR_PNPM_OUTDATED_LOCKFILE`: package manifests had changed since the existing `pnpm-lock.yaml` was generated.
- Workflow [38039206306](https://github.com/Gamevalentine/B-ng/actions/runs/38039206306) regenerated and committed `pnpm-lock.yaml` successfully to this draft branch without running project scripts or installing an app.
- Native Windows package, Sherpa/ZeroTTS runtime models, microphone, speaker, character voice quality and 2D lip sync remain **unverified**. Keep the Pull Request as a draft and block Windows releases.
