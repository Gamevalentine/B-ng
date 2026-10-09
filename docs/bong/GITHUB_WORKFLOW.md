# BÔNG: GitHub-only development workflow

Status: **preparation, not a release**. This branch does not replace the BÔNG build currently installed on Windows.

## Source of truth

- GitHub repo: `Gamevalentine/B-ng` (currently public).
- The existing GitHub `main` branch contains an AIRI-based application, but **does not yet contain the BÔNG-specific Sherpa and ZeroTTS Mai Chi changes from the Windows workspace**.
- A GitHub build made from `main` is therefore **not** a verified BÔNG build. Do not offer it as an update to the Windows installation.
- The Windows workspace is the current source of the customized implementation until a reviewed migration commits its changes.
- Preserve the original 2D character and speech configuration. Keep B2 frozen; B3 is still under investigation.

## Safe source migration checklist

1. Obtain an exact copy of the current **source files** from the authorized Windows workspace. Do not infer or recreate missing code from screenshots or previous summaries.
2. Review the files before they are uploaded to this **public** repository. Remove API keys, credentials, chat databases, private prompts, personal files, local paths with identifying information, and test recordings.
3. Never commit `.env`, `*.key`, `*.pem`, `*.p12`, local browser/session profiles, the local Python virtual environment, `node_modules`, or large model/cache files. The repository's `.gitignore` is not a substitute for inspecting commits.
4. Compare the incoming BÔNG code against the existing AIRI fork. Submit it on a feature branch and review the exact diff. Do not overwrite `main` wholesale.
5. Expected BÔNG source paths include:
   - `apps/stage-tamagotchi/src/main/services/electron/bong-zero-tts.ts`
   - `apps/stage-tamagotchi/src/main/services/electron/bong-piper-tts.ts`
   - `apps/stage-tamagotchi/src/renderer/utils/bong-transcript.ts`
   - `packages/provider-inference/src/providers/local/bong-zerotts/index.ts`
   - relevant changes to `packages/stage-ui/src/components/scenes/Stage.vue` and the associated tests.
6. The locally installed Mai Chi model and Python worker are **not** part of this GitHub repository today. Plan and verify a legal, size-aware installer/first-run download flow. Do not claim the Windows installer can speak offline until this is implemented and tested.
7. Add `apps/stage-tamagotchi/build/bong-bundle-ready.json` **only after** Windows runtime packaging and BÔNG smoke tests really work. The gated installer workflow requires explicit `windowsRuntimeBundled`, `maiChiModelHandled`, and `sherpaModelHandled` boolean fields set to `true`.
8. Do not merge changes, publish a GitHub Release, or install over the current Windows copy without explicit owner review and successful QA.

## GitHub Actions

- Existing `.github/workflows/ci.yml` already runs automatically for Pull Requests and exercises the AIRI monorepo.
- `.github/workflows/bong-source-readiness.yml` reports whether the BÔNG-specific source is present; it is a **status check, not proof of functional correctness**.
- `.github/workflows/build-windows-oneclick.yml` is changed on this branch into a **manual, source-gated preview builder**. It uploads an Actions artifact and does not publish or overwrite a GitHub Release.
- GitHub-hosted CI does **not** verify the actual speaker output, microphone, model speed, or Live2D lip-sync on the user's laptop. Those still require final acceptance testing.
- Never pass Gemini credentials through build logs or artifacts. BÔNG should use user-side configuration at runtime.

## No-CMD use after migration is complete

1. Open the repository **Actions** tab on GitHub.
2. Select the reviewed **BÔNG Windows Preview (manual only)** workflow and **Run workflow** on the approved branch.
3. Once all source and packaging gates pass, open its successful run and download the `BONG-Windows-x64-PREVIEW` artifact.
4. In the browser, choose **Save as** to a folder on **E:** and extract there. Do not automatically install over the existing BÔNG.
5. After owner approval, test a separate Windows installation and compare speech against the Mai Chi C reference. Only then adopt the new build.

## Current blocker

This chat can edit files hosted on GitHub, but cannot read the current `E:\AIRI` workspace without the authorized desktop connection. That connection is currently unavailable. A fresh source-only archive or another authorized file path is needed to transfer the current BÔNG changes. Do not upload a full drive backup or secrets.
