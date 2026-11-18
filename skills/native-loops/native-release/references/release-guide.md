# Release management in plain words

Most people meet these ideas for the first time when they ask for their first build. Quote the
part that matters the first time it comes up, in these words or close to them, and skip what the
person already knows.

## Contents

- The first build: three lines to open with
- Why each step
- What each build is
- App name and bundle identifier
- Signing keys
- Store account
- App Store app id
- Version
- Installing a test APK
- After a store release
- UAT and production
- Over-the-air updates
- When a build fails
- Getting the app to people without a store listing

## The first build: three lines to open with

- I can make a test file of your app, the files the app stores take, a release to Google Play or
  the App Store, or an update to the app people already have.
- I only ask for what the build you pick still needs, and I explain each thing as we go.
- Nothing is saved or started until you say yes to the full plan.

## Why each step

Say the reason with the question, the first time each comes up.

| Step | Why |
|---|---|
| App icon, splash screen and push notifications, before any build | They are built into the app file. A build made without them keeps going without them: an over-the-air update can never add or change them, so a store version needs a new store release to get them. |
| App name and bundle identifier, every build, the test APK too | The name is what people see under the icon; the bundle identifier is the app's permanent id, the one Google and Apple know it by and the one a phone installs it under. Both go into every build, and changing them later makes it a different app on the stores and clears its setup. |
| Signing keys, for an AAB, an iOS build and every store release | They are the app's signature: the stores take only signed builds, and take an update only when it is signed with the same keys as before. A test APK is signed by the build itself. |
| Android keys auto-generated without a store account | UnifyApps makes the Android upload keystore itself, so nothing is asked of Google. Download a copy and keep it: an app on Google Play cannot be updated without it. |
| iOS keys: a store account, or the team's own | Apple issues iOS certificates and profiles, so to auto-generate them UnifyApps signs in to the Apple developer account through an App Store Connect account. Without one, the team uploads its own certificate and profile. |
| Store account, for a store release | It is the sign-in to the store account the build is uploaded to: a Google Play account for Google Play, an App Store Connect account for the App Store, both for a release to both. |
| App Store app id, for every iOS build | It names the app's record in App Store Connect, the one the build and its keys belong to. The builder's Apple setup asks for it before the signing keys, and a release to the App Store uploads into that record. |
| A store release before an over-the-air update | An update rides on a store version: it reaches only phones that installed the app from a store. Before a store release is sent on that platform, there is nothing for it to reach. A test APK never gets one. |

## What each build is

| Build | What it is for | Reaches people how |
|---|---|---|
| Test APK (Android) | Trying the app on an Android phone, fastest of all | Anyone with the link or QR code installs it. It never gets over-the-air updates: build a new APK for new changes |
| AAB (Android) | The file Google Play takes, such as a new app's first upload by hand | Uploaded in Play Console. It cannot be installed on a phone |
| iOS build (IPA) | The iOS app file, for a team that uploads it to App Store Connect itself | Through TestFlight once uploaded (Apple's Transporter app on a Mac). An iPhone cannot install it from a link |
| Release to Google Play | Building the AAB and uploading it to Play in one go | Lands on the **Internal testing** track; testers join by a link. Going public is done in Play Console |
| Release to the App Store | Building the iOS app and uploading it to App Store Connect | Lands in **TestFlight**; testers you add install it. Going public is done in App Store Connect |
| Over-the-air update | Sending page changes to phones that already have a store version | Phones pick it up the next time the app opens, with no store review |

To test on iPhones, make a release to the App Store and add testers in TestFlight: there is no link
or QR install on iOS.

An over-the-air update can change pages, content and their logic. It can never change the app
icon, the splash screen, the app name, the bundle identifier or the push notification setup: those
are built into the app, so they need a new store build. See § Over-the-air updates.

A build carries the **published** version of the app. Changes that are saved but not published are
not in it.

## App name and bundle identifier

The app's identity in both stores. The name is what people see under the icon. The bundle
identifier is a reverse-domain id such as `com.yourcompany.appname`, and the same string is the
package name in Play Console and the Bundle ID at Apple. Once the app is in a store, the bundle
identifier can never change.

Changing either one later, in the app builder (Releases > Stores, App details), makes it a
different app on the stores. It clears both stores' accounts, the App Store app id, the signing keys
and the Android and iOS Firebase files; the accounts themselves, past builds and the app's pages
stay. Download the signing keys first: an app already on Google Play cannot get updates without its
upload keystore.

## Signing keys

The app's proof that each new version comes from the same publisher. A store refuses an update
signed with different keys.

- **Auto-generate (recommended).** UnifyApps makes and keeps the keys. Right for almost every new
  app. On iOS, UnifyApps makes them through the team's Apple developer account, so it needs an
  App Store Connect account first.
- **Upload your own.** For an app already in a store under keys the team holds: an Android keystore
  (`.jks` or `.keystore`) with its alias and passwords, or an iOS distribution certificate (`.p12`)
  with its password and an App Store provisioning profile (`.mobileprovision`).

A test APK needs no signing keys.

## Store account

The connection that lets UnifyApps upload builds to Google Play or App Store Connect for the team:
a Google Play service-account key, or an App Store Connect API key. One account can serve every app
the team publishes, so an existing one is usually the right choice. How to make a new one is in
[store-guide.md](store-guide.md).

## App Store app id

The number Apple gives the app's record in App Store Connect (its **Apple ID**, about ten digits).
It is not the bundle identifier and not the Key ID. Every iOS build asks for it, as the builder's
Apple setup does before its signing keys, so the record has to exist first: the person creates it in
App Store Connect with the same bundle identifier (store-guide.md § App Store Connect account,
stages 1 and 2). A release to the App Store uploads into that record. Each record, so each bundle
identifier, has its own id.

## Version

The version people see in the store: up to three numbers of up to three digits, such as `1.4.0`.
Each version is built once, so a new build takes the next free one; I suggest it. A failed build
does not use its version up. Each version sent to a store must be higher than the last one sent
there. The stores also need a build number, which UnifyApps sets by itself. An over-the-air update
goes to a version phones already run, so it reuses that version.

## Installing a test APK

1. Open the link on the phone, or scan its QR code with the phone's camera.
2. Tap the downloaded file. If Android says installs from this source are not allowed, tap
   **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**, then **Open**.

A newer test build installs over an older one. "App not installed" means the copy on the phone was
signed with other keys (a Play Store copy, say): uninstall it first. Download links expire; a new
build gives a fresh one. An APK never gets over-the-air updates: build a new APK to test new
changes.

## After a store release

"Sent" means the build reached the store. It is not public yet: it waits where testers can install
it, and the store owns review and the listing from there.

**Testers on iPhone (TestFlight).**

1. In App Store Connect, open the app and the **TestFlight** tab. Apple processes the build first,
   usually a few minutes, up to about half an hour.
2. If the build shows **Missing Compliance**, click **Manage** and answer the encryption question.
   Nobody can install it until then.
3. Quickest: click **+** next to **Internal Testing**, make a group, add testers and turn on
   automatic distribution. Internal testers must be App Store Connect users (add them under **Users
   and Access**). No review, up to 100 people.
4. For anyone else: **+** next to **External Testing**, add emails or a public link, add the build,
   and fill in **Test Information**. Each version's first build goes through Apple's Beta App
   Review, usually within a day. Up to 10,000 people.
5. Each tester installs Apple's **TestFlight** app, opens the invite on the iPhone, and taps
   **Install**. A TestFlight build stops working 90 days after upload.

**Testers on Android (Internal testing).**

1. In Play Console, open the app, **Test and release > Testing > Internal testing**.
2. On **Testers**, click **Create email list**, add each tester's Play Store Google account, save,
   and tick the list. Up to 100 people.
3. Under **How testers join your test**, click **Copy link** and send it.
4. Each tester opens the link signed in with that same account, taps **Accept invite**, then
   installs from Google Play. "App not available" means a different account or an invite not
   accepted yet.

**Going public**, done in the store consoles, usually by or with the customer:

- **App Store:** on the app's **App Store** tab, fill in screenshots, description, privacy policy
  URL, **App Privacy**, age rating and pricing; under **Build** add the tested build; under **App
  Review Information** give a working demo login; then **Add for Review** and **Submit for
  Review**.
- **Google Play:** finish **Set up your app** (with a test login under **App access**) and the main
  store listing; in **Internal testing**, **Promote release > Production**; then **Publishing
  overview > Send changes for review**. A personal Play account made after November 2023 must first
  run a closed test with 12 testers for 14 days; an organisation account does not.

Common reasons a store refuses the app: no working demo login (a UAT server reachable only on a VPN
or allow-list counts), no way to delete an account made in the app, a missing privacy policy, and
screenshots that are not the real app. The reason is in App Store Connect **App Review**, or Play
Console **Inbox** and **Publishing overview**.

## UAT and production

The release setup is saved per environment: a change set moves pages, logic and brand assets, but
production needs its own app name and bundle identifier, store accounts, App Store app id, signing
keys and Firebase files. A store account there can use the same Google key and Apple team key.

Separate bundle identifiers per environment (`com.acme.fieldops.uat` and `com.acme.fieldops`) are
the usual choice: two store apps, two App Store app ids, and both install side by side. Two
environments sending to one store app collide, because each keeps its own build number count. If
they must share one Google Play app, production uses UAT's upload keystore.

## Over-the-air updates

An update goes on top of one store version. Everyone running that version, on that platform, gets
it the next time they open the app, with no store review and nothing for them to do. People on other
versions do not: push to each version to reach, or send a new store release. An APK never gets one.

When someone does not see it:

| What they see | What to do |
|---|---|
| The old screens | Close the app fully (swipe it away) and open it again; it can take one more reopen. |
| Still old, after that | Check their app version: the update reaches only the version picked. Push to theirs too. |
| They test with an APK | An APK never gets updates. Build a new APK, or test through the store's testing track. |
| They are on the other platform | Push the update to that platform as well. |
| The change is not in it | An update carries the last published version. Publish, then push a new update. |

An update cannot carry the app name, icon, splash screen, bundle identifier or push setup, nor a
change that needs new native code in the app (a new device feature, a newly supported block): those
need a store release first, or the update can break the app on phones without that code. When
unsure, ask the developer who made the change.

## When a build fails

| What the build says | What it means | What to do |
|---|---|---|
| Could not start the build: the build service refused it. Nothing was queued. | A passing refusal. | Try again in a moment. |
| Build timed out, or stopped reporting | Nothing was produced and nothing reached a store. | Retry. |
| Build could not be dispatched (UNAUTHORIZED or NOT_FOUND), or the release service is unavailable | This environment's release service is not set up. The app is fine. | Nothing to fix in the app: send the message to the platform team for this environment. |
| … registers the app's push-notification plugin but … no google-services.json and no GoogleService-Info.plist | The app uses push notifications and this environment has no Firebase files (each environment needs its own). | Set up push notifications for this environment (the `native-push-notifications` skill), then build again. |
| Google Play refuses the upload for permissions | The service account has no release access to this app. | Play Console **Users and permissions**: the app under **App permissions**, with the release permissions (store-guide.md). New permissions can take a while. |
| Google Play cannot find the app | The package name differs, or the app never had a build uploaded. | Match the identifiers, or upload the first AAB by hand to Internal testing. |
| Google Play refuses the version code or version | That version or build number was already used in this store app, often from another environment. | Send a higher version. Give each environment its own bundle identifier. |
| Apple refuses with a 403 about an agreement | The Account Holder has not accepted Apple's updated agreement. | They accept it at https://developer.apple.com/account, then retry. |
| The iOS build fails at signing | The certificate or profile does not match the app. | Check the team's own files (store-guide.md § Your own iOS certificate and profile). |
| Anything else in the build log | A build error. | Send the message to the developers on the mobile team. A retry repeats it. |

Retry only once the cause is fixed, or where the table says to: a retry sends the same build again.

## Getting the app to people without a store listing

| Platform | Option | Limits |
|---|---|---|
| Android | A test APK, by link or QR code, or pushed by the customer's device management (MDM) | No updates from Google Play or over the air: a new APK for each change |
| iOS | TestFlight external testing with a public link (a release to the App Store first) | Up to 10,000 testers, each build stops after 90 days, Apple's beta review applies |
| iOS | Nothing else | An iPhone installs apps only from the App Store or TestFlight, so an Apple developer account is needed |

TestFlight and IPA files work only on real iPhones and iPads, never on the iOS Simulator.

**When the customer uploads the build themselves:** make an AAB (Google Play) or iOS build (they
upload it with Apple's Transporter app on a Mac). It must be signed with the customer's own keys, so
upload their keystore or certificate and profile first.
