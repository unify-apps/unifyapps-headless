---
user-invocable: false
name: native-push-notifications
description: Sets up push notifications on a MOBILE app through Firebase Cloud Messaging. It collects what the app is missing — the app name and bundle identifier, the notification icon and colour, the Firebase project number and the Firebase service-account key, and whether the app asks its users for notification permission — guiding the person to each one in the Firebase console, then uploads the key privately, creates the Firebase connection, has Firebase register the Android and iOS apps and make their config files, stores everything on the app and reads it back. Use when the person asks in chat to set up, turn on, connect or fix push notifications, Firebase, FCM, the notification icon or the notification colour on a mobile app.
---

# Push notifications on a mobile app

Push notifications on a UnifyApps mobile app go through Firebase Cloud Messaging. Setting them up
takes five things from the person and one run of the Firebase setup. This skill asks for what the
app does not have yet, checks each answer before the tenant sees it, and on the person's yes makes
every write and reads it back. The main session runs it; no builder agent does.

Every command below runs from the solution folder as
`bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-push-notifications/scripts/push-notifications.mjs" <command> ...`.
Work in `.sessions/<sessionId>/drafts/push-notifications/` (the work folder below).

## What it sets

| What | Where it is stored | Asked for when |
|---|---|---|
| App name, bundle identifier | the app's build info | the app has none (they are permanent once the app is in a store) |
| Notification icon, colour | Brand Assets settings | the app has none |
| Firebase project number | Push Notifications settings | always |
| Service-account key | uploaded readable by this app only; its link in Push Notifications settings | always |
| Firebase connection | the tenant's connections, named after the app | made from the key |
| `google-services.json`, `GoogleService-Info.plist` | the app's build info | made by the Firebase setup |
| Prompt User for Push Notifications Permission | Push Notifications settings | always |

The phone build reads the bundle identifier, the two config files, the icon and the colour. The
running app reads the permission prompt.

## Asking for a file

Whenever you ask the person to save a file for this setup (the logo, the icon, the service-account
key), write out the folder's full path from `status`'s `solutionFolder`, such as
`/Users/priya/acme-app`, never "this folder" or "the solution folder", and the full path the file
should end up at. Say how to put it there on a Mac: in Finder, **Go > Go to Folder**, paste the
path, then drag the file in from Downloads. Repeat the path in every later message that asks for
the file again, and in an AskUserQuestion option that asks for it. Ask them to type the file's
name, never to attach the file with @ or drop it into the chat: that puts the whole file, a
private key included, into the conversation.

## Steps

1. **The app.** It must be a MOBILE app. Take its id from `solution context` or `cache app`, and
   ask which app only when the solution has more than one mobile app.
2. **What it has.** Run `status --app-id <id>`. Read `missing` and `solutionFolder`.
   `code: "TOOLS_MISSING"` means this tenant cannot do this from chat yet: give the person the
   builder steps (Settings > Advanced > Push Notifications) and stop. Otherwise tell the person,
   as one list, every item push notifications need, marking each one already set or still needed:
   app name and bundle identifier, notification icon, notification colour, Firebase project number,
   Firebase service-account key, and the permission prompt. A person new to push notifications
   does not know the list, so name every item, the set ones too, with what it is for in a few words.
3. **App name and bundle identifier**, only when `missing` names them. Ask for both in one
   AskUserQuestion. Say the bundle identifier is reverse-domain with at least three parts
   (`com.yourcompany.appname`), letters, numbers and underscores only, and cannot change once the
   app is in a store. When `identity.issues` lists problems with a stored identifier, read them out
   and send the person to the app builder's Releases tab to fix it: a change there resets the
   app's store setup, so this skill never changes a stored one.
4. **The choices, in one AskUserQuestion.** Before asking for any file, ask these questions
   together in one AskUserQuestion, each question saying what the setting is and what it does on
   the phone, each option saying what happens if picked. Never turn them into a list in a text
   message, and never put one off until after Firebase.
   - **Notification icon**, only when `missing` names it. "Android shows a small icon in the status
     bar for every notification: a PNG, 96 x 96 px, a white shape on a transparent background.
     Where should it come from?" Options: **I have the icon** (save it as
     `<solutionFolder>/notification-icon.png`) and **Make it from my logo** (save the logo in
     `<solutionFolder>`; the `app-brand-assets` skill makes the icon, shown for a yes, and its
     `icons/notification-icon.png` is used).
   - **Notification colour**, only when `missing` names it. "Android draws this colour behind the
     icon in the notification. Which colour?" Options: **#383838 (Recommended)**, a grey that shows
     on light and dark trays, and **My brand colour**, typed as `#RRGGBB` under Other. When the
     answer is "My brand colour" with no value, ask for the value in step 5.
   - **The permission prompt**, always. "Turn on 'Prompt User for Push Notifications Permission'?
     It decides whether the app asks people to allow notifications." Options:
     - **On (Recommended):** when someone signs in to the app, it asks them to allow
       notifications, and their phone starts receiving them.
     - **Off:** the app never asks, and no phone receives push notifications from it, not even
       from a page that asks for permission itself. Choose this to set Firebase up now and switch
       notifications on later.

     `status` reports the current setting as `firebase.promptPermission`; say it in the question
     when it is already on. An app anyone can use without signing in gets no push notifications
     either way.
5. **Files and Firebase, in one plain message**, after the answers. Ask for what step 4's answers
   need first: the icon or the logo file, as § Asking for a file says, and the brand colour's
   value when it is still missing. Then ask for the Firebase project number and the
   service-account key, in the same message, never in AskUserQuestion: both answers are typed, and
   the question box hides the text written before it. Quote § Project number, § Service-account
   key and § Saving the key file of [references/firebase-guide.md](references/firebase-guide.md)
   in full, every click from opening the console to the file landing in the folder, so a person
   who has never opened Firebase can follow it alone. Never shorten it to "from Project settings"
   or point at "the steps above", and quote the steps again in any later message that still asks
   for these two. Ask them to save the key file in the folder and give its name, and never to
   paste it into the chat. **Never Read, cat or print the key file yourself.** Run
   `check-service-file --file <path>`: it answers `kind` and `is`, what the file is. Anything but
   `service-account` means the wrong file: say what it is, and for `google-services` take the
   project number it reports. A logo goes through `app-brand-assets` before the dry run.
6. **Check what came back.** Every answer from steps 3 to 5 is in hand before the dry run; ask
   again, in the same way, only for what is missing or refused.
7. **Dry run and ask once.** Run `setup --app-id <id> --key-file <path> --project-number <n>
   --work <work folder> --prompt-permission on|off`, adding `--app-name` and `--bundle-id` from
   step 3 and `--icon` and `--colour` from steps 4 and 5. A refusal has a `code` and a `message`: act on it (table below) and run
   again. When it answers `ok: true`, show the person the `plan` and the `notes`, then ask with
   AskUserQuestion: "Set up push notifications on <app> with Firebase project <firebaseProjectId>?",
   with the options to set it up or change something. The icon upload is public, like every app
   icon; the key upload is readable by this app only.
8. **Set it up.** Run the same command with `--apply`. `ok: true` with `readBack: "every key
   matches"` is the proof; anything else, say what `readBack.mismatched` or the `message` names. A
   rerun with the same key file reuses its upload and its connection, and an app Firebase already
   knows gets its existing config files. The permission prompt is written last, after Firebase is
   set up.
9. **Tell the person**, from `push-result.json`:
   - what is set now, with the read-back;
   - the permission prompt: `promptPermission` is `on`, `off`, or `not set:` followed by the builder
     steps to switch it, because this tenant cannot set it from chat yet. Quote those steps;
   - **iOS needs one more step in Firebase**: an APNs key uploaded under Cloud Messaging. Until
     then Android notifications work and iOS ones never arrive. Quote § iOS in the guide;
   - the config files and the icon are built into the app: phones get them only after a publish
     and a new store build. Offer the publish as `ua-change` § Releases says; a store build is
     started by the person in the builder's release screen.

## Refusals

| `code` | What to do |
|---|---|
| `KEY_FILE_WRONG` | The file is not the service-account key; `message` says what it is. Ask for the key (guide § Service-account key). |
| `PROJECT_NUMBER_INVALID` | The project number is digits only; a value with letters is the Project ID. Ask again (guide § Project number). |
| `IDENTITY_MISSING` | Ask for what `missing` names (step 3). |
| `IDENTITY_INVALID` | Read out the rules `message` lists; ask for another identifier, or for a stored one, send the person to the Releases tab. |
| `IDENTITY_CONFLICT` | The app already has a different name or identifier. Use the stored one, or the person changes it in the Releases tab. |
| `ICON_MISSING`, `ICON_INVALID`, `COLOUR_INVALID` | Ask again (steps 4 and 5). |
| `PROMPT_PERMISSION_MISSING` | Ask about the permission prompt (step 4). |
| `PROMPT_PERMISSION_FAILED` | Firebase is set up; only the permission prompt was not saved. Say what `message` names and run `--apply` again: the upload and connection are reused. |
| `NOT_MOBILE` | Push notifications are for mobile apps only. |
| `AUTOMATION_MISSING` | This tenant cannot make the config files. Nothing was written. Tell the person what `message` says. |
| `AUTOMATION_FAILED` | Usually the project number and the key belong to two different Firebase projects, or the key's account is not a Firebase admin. Check both with the person, then run `--apply` again: the upload and connection are reused. |
| `UPLOAD_FAILED`, `CONNECTION_FAILED` | Say what `message` names and run `--apply` again. |

## What is not covered

- **Disconnecting Firebase.** Use the builder: Settings > Advanced > Push Notifications >
  Disconnect. To stop notifications and keep the Firebase setup, run `setup` again with
  `--prompt-permission off`.
- **Changing a stored app name or bundle identifier.** Use the builder's Releases tab.
- **Sending a notification.** That is an automation's job, through the Firebase connection this
  setup creates.
