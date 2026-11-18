---
user-invocable: false
name: native-release
description: Builds and releases a MOBILE app from chat — a test APK, an AAB, an iOS build, a release to Google Play or the App Store, or an over-the-air update — and guides a person through release management the first time. It always offers the app icon, splash screen and push notifications first, then confirms the build and asks, in order and with the reason for each, only for what it is missing (app name and bundle identifier, signing keys auto-generated or the team's own, a store account existing or new, the App Store app id for iOS, a sent store release before an update), starts the build and follows it to a download link. Use when the person asks for an APK, AAB, IPA, a build, a release, Google Play, the App Store, TestFlight, an over-the-air or OTA update, signing keys or a keystore, or to set up release management.
---

# Builds and releases of a mobile app

A UnifyApps mobile app is built and sent to the stores by the release service, the same one the app
builder's Releases tab uses. Release management is confusing the first time, so this skill
**guides**, it does not just ask:

- Every question says what the thing is, why this build needs it, and what each choice leads to.
- A choice that cannot work yet is never offered as if it could; say what is missing and the ways forward.
- After each answer, show where the build stands with the checklist from `plan` (✓ done, ☐ still needed).
- Use the plain words in [references/release-guide.md](references/release-guide.md) the first time
  an idea comes up.
- Every step, its order and what each build needs follow the app builder's Releases tab, so a person
  meets the same steps in chat as in the builder, even where the release service would take less.

The main session runs this skill; no builder agent does. Every command below runs from the solution
folder as
`bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-release/scripts/release.mjs" <command> ...`.
Work in `.sessions/<sessionId>/drafts/release/` (the work folder below).

## What each build needs

| Build (`--goal`) | Needs |
|---|---|
| Test APK (Android) `apk` | a published app, its app name and bundle identifier |
| AAB (Android) `aab` | the above, plus Android signing keys (auto-generated or the team's own; no store account needed) |
| iOS build `ipa` | the above, plus iOS signing keys (auto-generated through an App Store Connect account, or the team's own certificate and profile), plus the App Store app id |
| Release to Google Play `store-android` | the AAB's needs, plus a Google Play account |
| Release to the App Store `store-ios` | the iOS build's needs, plus an App Store Connect account |
| Over-the-air update `update-android`, `update-ios` | an earlier store release on that platform that was sent, plus a message |

Only one build runs per platform at a time. Why each need is there, in words to say:
release-guide.md § Why each step.

## Steps

Ask in this order, one step at a time, and skip a step only when the build does not need it. Each
question first says what the thing is and why this build needs it (release-guide.md § Why each
step).

1. **The app.** It must be a MOBILE app. Take its id from `solution context` or `cache app`; ask
   which app only when the solution has more than one mobile app.
2. **What it has.** Run `status --app-id <id>`. When `firstBuild` is true, open with the three
   lines in release-guide.md § The first build. `code: "TOOLS_MISSING"` means this tenant cannot
   build from chat yet: give the person the `message` and stop.
3. **Icon, splash screen and push notifications, always first.** Whatever the person asked for (set
   up release management, a test file, a store release), ask before anything else, with
   AskUserQuestion, `multiSelect`, all three every time: "Brand assets (app icon)", "Splash screen",
   "Push notifications", plus "None, go to the build". Mark each with its state from `extras`
   ("not set yet", or "set; pick it to change it"). Say why: all three are built into the app, so
   they go in before a build, and an over-the-air update can never add or change them later; a
   store version without them needs a new store release to get them. Run the `app-brand-assets`
   skill for the first two (one logo makes both) and the `native-push-notifications` skill for the
   third, then run `status` again. When `pushNotifications` is `unknown`, this tenant cannot set up
   push notifications from chat: say so in one line and leave it out.
4. **Go on to the build.** When the person already named a build, ask with AskUserQuestion: "Go on
   to the <build> now?", with "Yes, continue" and "Pick another build". Otherwise show, as text,
   every row of `menu` with its `label`, its `about` and, under it, what it still needs (`needs`, in
   plain words), and add: "You can also ask me to check, list, cancel or retry a build, or to
   download your signing keys." Then ask which build: the three rows that fit best (fewest needs
   first) plus Other. "Set up release management" with no build named is this menu.
5. **App name and bundle identifier, for every build, the test APK too.** When `status.identity`
   has both, confirm them in one line ("This app is <name>, `<bundle id>`.") and go on. When
   either is missing (the plan refuses `IDENTITY_MISSING`), ask for both in one AskUserQuestion,
   offering `suggestedName` as the name. Say the name is what people see under the icon and on the
   store listing, up to 30 characters (over 12 may be cut off under the icon), and the bundle
   identifier is reverse-domain with at least three parts (`com.yourcompany.appname`),
   letters, numbers and underscores only, and the same string as the package name in Play Console
   and the Bundle ID at Apple. Both are hard to change later: a change makes it a different app on
   the stores and clears its store setup (release-guide.md § App name and bundle identifier). For a
   UAT and a production app that both go to the stores, suggest a separate identifier each, such as
   `com.acme.fieldops.uat`.
6. **Signing keys, for every build but the test APK.** First say what signing keys are, then
   whether this app has them (`status.platforms.<platform>.signing`: `none` means not set). When
   set, say how (auto-generated or the team's own) and go on. When not set:
   - **Android (AAB, Google Play):** ask "Auto-generate (recommended)" or "Upload my own keystore".
     Say auto-generating needs no store account: UnifyApps makes the upload keystore itself.
   - **iOS (iOS build, App Store) with an App Store Connect account bound:** ask "Auto-generate
     (recommended)" or "Upload my own certificate and profile".
   - **iOS with no account bound:** do not offer auto-generate as if it works. Say: "Apple issues
     iOS signing keys, so to auto-generate them UnifyApps signs in to your Apple developer account
     through an App Store Connect account. This app has none yet." Then ask "Connect an App Store
     Connect account (recommended)", which runs step 7 and comes back to auto-generate, or "Upload my
     own certificate and profile". Do the same when the person asks for iOS auto-generate directly,
     and on `IOS_GENERATE_NEEDS_ACCOUNT`.
   - **Own keys:** run `signing-template --platform <android|ios> --work <work folder>`, and ask the
     person to fill the file it names in their own editor and to save the key files in the solution
     folder. **Never Read, cat or print a key file or the passwords file.**
7. **Store account, for a store release, an update, and iOS auto-generate.** A release to Google
   Play needs a Google Play account, a release to the App Store an App Store Connect account; for a
   release to both stores, ask for both, one store at a time. First say what a store account is
   (release-guide.md). Then always ask with AskUserQuestion, even when only one exists:
   - "Use an existing account": list each from `status.accounts.<platform>` by name and status, and
     mark the one with `bound: true` as the one this app uses. An account whose status is not
     `active` (expired, or waiting for authorization) is listed and marked: say it must be
     authorized again before it can upload, in the app builder (Releases > Stores, **Change** on the
     store's connection, then select it to open its authorize form). Never add a new account to
     replace it: one made the same way fails the same way.
   - "Add a new account": walk through [references/store-guide.md](references/store-guide.md) for
     that store, one item at a time. The person saves the key file in the solution folder and gives
     its name; run `check-file --file <path>` to confirm it is the right kind.

   With no existing account, say so in one line and go straight to adding one.
8. **App Store app id, for every iOS build and release to the App Store.** When
   `status.platforms.ios.ascAppId` is empty, ask for it after the signing keys and the account, as
   the builder's Apple setup does. Say it is the number Apple gives the app's record (about ten
   digits, not the Bundle ID and not the Key ID), found in App Store Connect under **Apps > the app >
   App Information > Apple ID**, and that the record must exist first (store-guide.md § App Store
   app id; making the record is stages 1 and 2 of § App Store Connect account).
9. **Version, name and message.**
   - A build: `plan` suggests the next free version and the builder's name ("First build", then
     "Test build <version>"; "Store release <version>"); say both and let the person change
     them. A version is up to three numbers of up to three digits (`1.4.0`), and each one sent to a
     store must be higher than the last one sent there.
   - An over-the-air update needs a store release on that platform that was sent: without one,
     there is nothing installed from a store for it to reach, so offer the store release first
     (`STORE_RELEASE_MISSING`). It goes to a version phones already run, not a new one. List the
     versions in `status.updateTargets.<platform>`, newest first, and say: everyone on that store
     version gets the update the next time they fully close and reopen the app; people on other
     versions do not. Ask which (the newest is the usual choice) and pass it as `--version`. Then
     ask for a short message saying what it changes. Its name is "OTA update <version>". Say an update carries pages, logic and content
     only (release-guide.md § Over-the-air updates).
10. **Plan and one yes.** Run `plan --app-id <id> --goal <goal> --work <work folder>` with the
   answers so far: `--app-name`, `--bundle-id`, `--store-account <id>` or `--store-key <file>`
   (`--issuer-id`, `--key-id` for Apple), `--asc-app-id`, `--signing generate|own`, `--keystore` or
   `--certificate` and `--profile`, `--version`, `--name`, `--message`. A refusal has a `code` and a
   `message`: act on it (table below), then run `plan` again. When it answers `ok: true`, show the
   `steps`, the `notes` and the `checklist`. With `offerPublish: true`, offer to publish first, as
   `ua-change` § Releases says. A note that asks a question (such as whether a new Google Play app's
   first upload is done) is asked before the build: if the answer is no, offer the AAB build first
   and the upload steps in store-guide.md. Then ask with AskUserQuestion: "Start this build?", with
   the options to start it or change something.
11. **Start it.** Run the same command as `apply`. `CONFIRM_REQUIRED` means a step removes the
    auto-generated keys to make room for the team's own. First offer `download-keys` so the team
    keeps a copy. Then ask with AskUserQuestion, with the reply's `question` in the question text
    exactly as written, "Yes, go ahead" first and "No" second; on the yes, run `apply` again. On
    `ok: true`, tell the person every line of `notes` (the version can move at the start when the
    suggested one was taken meanwhile), then run `watch --app-id <id>
    --build-id <buildIds[0]>` as a background Bash command, and tell the person a build usually
    takes 15 to 30 minutes (up to 40 when the queue is busy) and you will report when it ends.
12. **Tell the person** when `watch` ends:
    - a test APK: the `links.apk` or `links.install` link, and how to install it
      (release-guide.md § Installing a test APK). A download link expires; a new build gives a
      fresh one. An APK never gets over-the-air updates;
    - an AAB: the link, and that it is uploaded in Play Console (a new app's first upload);
    - an iOS build: the link, and that an iPhone installs it only through TestFlight after someone
      uploads it, so a release to the App Store is the way to test on iPhones;
    - a store release: it is sent, not public. It waits in TestFlight (App Store) or on the Internal
      testing track (Google Play). Offer the tester steps and the steps to go public from
      release-guide.md § After a store release. It has no file to download: the build lives in the
      store;
    - an over-the-air update: everyone on that version gets it the next time they fully close and
      reopen the app; if someone does not, use release-guide.md § Over-the-air updates;
    - after auto-generating keys, offer `download-keys` so the team keeps its own copy;
    - `ok: false` with `BUILD_FAILED`: find the cause in release-guide.md § When a build fails, say
      it and its fix, and offer `retry` only once the cause is fixed or when the guide says to try
      again;
    - `done: false`: the build is still running (or its status could not be read); offer to keep
      following it.

## Refusals

| `code` | What to do |
|---|---|
| `NOT_MOBILE` | This app is a web app; only a mobile app gets builds. Ask which mobile app is meant, or say a web app goes live by publishing it. |
| `GOAL_UNKNOWN` | Show the menu again (step 4) and use one of its goals. |
| `TOOLS_MISSING` | Give the `message` (the builder steps) and stop. |
| `PUBLISH_NEEDED` | A build carries the published version, and this app has never been published. Offer to publish it. |
| `IDENTITY_MISSING`, `IDENTITY_INVALID` | Ask for the app name and bundle identifier (step 5); read out every rule the `message` lists. |
| `IDENTITY_CONFLICT` | Use the stored value. To change it, read out what a change clears (the `message`), offer `download-keys` for both platforms first, and point to the builder's Releases tab. |
| `BUILD_RUNNING` | Say which build is running; offer to follow it (`watch --build-id <buildId>`) or cancel it. |
| `STORE_ACCOUNT_MISSING` | Ask existing or new (step 7). |
| `ASC_APP_ID_MISSING` | Ask for the App Store app id and say where it is (step 8). |
| `IOS_GENERATE_NEEDS_ACCOUNT` | Explain and offer both ways forward (step 6). |
| `SIGNING_CHOICE_MISSING` | Ask how to sign (step 6). |
| `SIGNING_FILE_WRONG` | Say what the file is and which file is needed (store-guide.md). |
| `SIGNING_SECRETS_MISSING` | Ask the person to fill the fields the `message` names, in their own editor. |
| `STORE_KEY_WRONG` | Say what the file is and which key is needed (store-guide.md). |
| `STORE_RELEASE_MISSING` | An update reaches only phones that installed a store version, and this platform has had no store release sent. Offer a store release first. |
| `VERSION_INVALID` | Ask for a version as the `message` says: up to three numbers of up to three digits, or, for an update, one of the versions it lists. |
| `MESSAGE_MISSING` | Ask what the update changes. |
| `SIGNING_FAILED` | The signing keys were not set; say what `message` names, fix it with the person, run `apply` again. |
| `CONFIRM_REQUIRED` | Offer `download-keys`, then ask with AskUserQuestion with the reply's `question` exactly as written; on the yes, run `apply` again. |
| `NOT_SAVED` | A write did not hold, so nothing was started. Run `apply` again once; if it repeats, say what `message` names and point to the builder's Releases tab. |
| `BUILD_REFUSED` | The build did not start and nothing was queued. Find the `message` in release-guide.md § When a build fails and give its fix. |
| `BUILD_FAILED` | The build ended in failure. Find the cause in release-guide.md § When a build fails; offer `retry --build-id <id>` only once it is fixed, or when the guide says to try again. |
| `CONNECTION_FAILED` | The store refused the account. Find the store's message in the tables "When Google refuses" or "When Apple refuses" (store-guide.md), give the fix, and run `apply` again once it is done. |
| `BIND_FAILED` | Run `apply` again once. If it repeats, the account was made but not linked to the app: link it in the app builder (Releases > Stores, **Set up** on the store, then select the account). |
| `KEYS_NOT_DOWNLOADED` | Nothing was saved; give the builder steps in the `message`. |

## Other things the person can ask

- **Check or list builds:** `status` lists recent builds in `builds`; `watch --build-id <id>` follows one.
- **Cancel a build:** confirm with the person first, then `cancel --app-id <id> --build-id <id>`.
- **Retry a failed build:** `retry --app-id <id> --build-id <id>`, tell the person every line of `notes`, then run its `next` (the `watch` of the new build).
- **Download signing keys:** `download-keys --app-id <id> --platform <android|ios> --work <work folder>`
  saves the archive and prints its path. Tell the person to keep it, with its passwords, somewhere
  safe outside the solution folder.

## What is not covered

- **Store listing text, screenshots and review answers.** Use Play Console and App Store Connect.
- **Moving a build between Google Play tracks, or submitting a TestFlight build for review.** Use
  Play Console and App Store Connect.
- **Changing a stored app name or bundle identifier.** Use the builder's Releases tab, after
  `download-keys` for both platforms: the change clears both stores' setup and the Firebase files.
