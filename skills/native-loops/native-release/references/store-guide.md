# Getting what a store release needs

Quote the part the person needs, one stage at a time, as numbered steps with each console's menu
path in bold. Name the console and its link in the first step of each stage. Wait for "done" before
the next stage. Skip a stage the person says is already done.

Every key file is saved in the solution folder and given by its file name. Tell the person how:
"In Finder, choose **Go > Go to Folder**, paste the folder path, and drag the file in from
Downloads." Say once: "Don't paste the key or attach it with @. It can upload releases of your
app." Never ask for a key's contents in the chat, and never open a key file. `check-file` reads only
what kind of file it is.

## Contents

- Before you start
- Google Play account
- App Store Connect account
- App Store app id
- Your own Android keystore
- Your own iOS certificate and profile
- Keeping keys safe

## Before you start

- **Whose accounts.** An app is listed under the developer account that publishes it, so a
  customer's app is usually published from the customer's own Apple and Google accounts. Ask the
  customer to invite you (Apple: **Users and Access > +**, role **Admin**; Play Console: **Users and
  permissions > Invite new users**). Never sign in with their password.
- **What they cost.** Apple Developer Program: 99 USD a year; an organisation enrols with a D-U-N-S
  number, which can take days to weeks. Google Play Console: 25 USD once.
- **One identifier everywhere.** The app's bundle identifier here, the package name in Play Console
  and the Bundle ID at Apple are the same string, for example `com.acme.fieldops`.
- **Who can do what.** Only the Apple **Account Holder** can turn on App Store Connect API access
  and accept Apple's agreements. Registering the Bundle ID, creating the app record and making a
  team key need the Account Holder or an **Admin**. In Google, creating a service account key needs
  a Cloud user allowed to make keys; some organisations block keys by policy.

## Google Play account

A Google Play account is a **service account**: a Google account for software, not a person, that
UnifyApps uploads builds as. Its key is a JSON file. Five stages, all outside UnifyApps.

**1. The app in Play Console** (skip if it is there)

1. In Play Console (https://play.google.com/console/), click **Create app**.
2. Enter the **App name** (up to 30 characters, as shown on Google Play), the default language,
   and **App**, not Game. Choose **Free** or **Paid** (a free app can never become paid).
3. Tick the two declarations and click **Create app**.
4. On the app's **Dashboard**, open **Set up your app > View tasks** and finish each task (app
   access, content rating, target audience, data safety). Google takes no release until they are
   done.

The package name is set by the first upload and can never change, which is why it must match the
bundle identifier.

**2. A Cloud project with the two Google Play APIs**

1. In Google Cloud Console (https://console.cloud.google.com/), pick the project the service
   account will live in, or create one under **IAM & Admin > Manage resources > Create project**.
   An app that already uses Firebase can use its Firebase project.
2. Open **APIs & Services > Library**, search **Google Play Android Developer API**, open it and
   click **Enable**. It uploads the builds.
3. Back in the Library, search **Google Play Developer Reporting API** and click **Enable**. Google
   tests the account through it when the account is added.

A newly enabled API can take a minute or two to start working.

**3. The service account and its JSON key**

1. In the same project, open **IAM & Admin > Service accounts** and click **+ Create service
   account**.
2. Name it after the app, such as `field-ops-play-publisher`. Its email appears below, ending in
   `iam.gserviceaccount.com`. Click **Create and continue**, leave **Permissions** and **Principals
   with access** empty (Play access is given in Play Console, not here), and click **Done**.
3. Copy the account's address from the **Email** column. Stage 4 needs it.
4. On the account's row, open **⋮ > Manage keys**, then **Add key > Create new key**, choose
   **JSON** and click **Create**. A `.json` file downloads. Google gives it only once.

If **Add key** is greyed out, the organisation's policy blocks service account keys: their Google
Cloud administrator has to allow one for this account.

**4. Release access in Play Console**

1. In Play Console, open **Users and permissions** and click **Invite new users**.
2. Paste the service account's email. Leave **Access expiry** unset.
3. On **App permissions**, click **Add app**, tick only this app and click **Apply**.
4. Tick these permissions, then **Apply**:
   - **Release apps to testing tracks**: uploads builds to internal, closed and open testing.
   - **Manage testing tracks and edit tester lists**.
   - **Edit and delete draft apps**: lets a release reach an app that is not live yet.
   - **Release to production, exclude devices, and use Play App Signing**: only to release straight
     to production.

   Leave financial data and orders unticked.
5. Click **Invite user**, then **Send invite**. The account shows **Active** at once; it accepts
   nothing. A new permission can take a while to apply, so a refusal straight after is retried
   later.

**5. The file here**

Save the `.json` file in the solution folder and give its name. One service account serves every
app it is invited to: for another app, add that app under the account's **App permissions** and
reuse the same account here.

**The first upload of a new app.** Google lets no tool upload a brand-new app's very first build.
Make an **AAB** here, download it, and in Play Console upload it once by hand to a testing track
such as **Internal testing**. Every later release goes up from here.

`check-file` tells a Play key from a Firebase key: the push notifications key (often named
`…firebase-adminsdk….json`) is not this one. Use a new key, even when it is the same Cloud project.

**When Google refuses the account**

| Google's message | Cause | Fix |
|---|---|---|
| `unauthorized_client` | The account was added with a person's email as the user email. | The user email is the service account's own email; add the account again. |
| Google Play Developer Reporting API … disabled | The Reporting API is off in the key's project. | Enable it (stage 2), wait a minute, try again. Check the Android Developer API too. |
| The release is refused for permissions | Stage 4 is missing or still applying. | Check the app is under **App permissions** with the release permissions; wait and retry. |
| Google cannot find the app | No app with this package name, or no first upload. | Check the package name; upload the first AAB by hand. |
| Any other refusal | The key is cut short, or from another service account. | Download a new JSON key for this same account. |

## App Store Connect account

An App Store Connect account is an **API key**: a `.p8` file plus two IDs, the **Issuer ID** and
the **Key ID**. Before the key, Apple needs the app's Bundle ID and its app record. Four stages.

**1. The Bundle ID** (skip if registered)

1. At https://developer.apple.com/account, open **Certificates, Identifiers & Profiles >
   Identifiers** and click **+**.
2. Choose **App IDs**, **Continue**, then **App**, **Continue**.
3. Enter a description. Under **Bundle ID**, choose **Explicit** and enter the bundle identifier
   exactly.
4. Tick the capabilities the app uses, such as **Push Notifications**, then **Continue** and
   **Register**.

**2. The app record** (skip if the app is in App Store Connect)

1. In App Store Connect (https://appstoreconnect.apple.com/), open **Apps**, click **+ > New App**.
2. Tick **iOS**, enter the **Name** (up to 30 characters), the **Primary Language**, the **Bundle
   ID** from stage 1, a **SKU** (any internal code, such as `FIELDOPS001`) and **User Access**.
   Click **Create**.

If App Store Connect shows **Agreement Update** and blocks **New App**, the Account Holder accepts
the updated agreement at https://developer.apple.com/account first.

**3. The team key**

1. In App Store Connect, open **Users and Access > Integrations > App Store Connect API > Team
   Keys**. Use a **Team Key**, not an Individual Key.
2. On a team that never used the API, the page shows **Request Access**: only the Account Holder
   can click it (an Admin sees it greyed out). They request access and accept the terms, once.
3. Copy the **Issuer ID** above the key list. Every key on the team shares it.
4. Click **Generate API Key** (or **+**), name it such as `Field Ops Releases`, choose **App
   Manager** under **Access**, and click **Generate**.
5. Hover the key's row and click **Copy Key ID**: 10 characters, such as `2X9R4HXF34`.
6. Click **Download** on the row. The file is `AuthKey_<Key ID>.p8`, and Apple lets you download it
   **once**. A lost `.p8` cannot be fetched again: revoke the key and make a new one.

Auto-generating iOS signing keys makes certificates and profiles through this key. If Apple refuses
that, the key's role is too narrow: make a key with the **Admin** role, or upload the team's own
certificate and profile.

**4. The file here**

Save the `.p8` in the solution folder and give its name, the Issuer ID and the Key ID. One team key
serves every app on the Apple team.

**When Apple refuses the account**

| Apple's message | Cause | Fix |
|---|---|---|
| 403, a required agreement is missing or has expired | Apple updated its agreement. The key is fine. | The Account Holder accepts it at https://developer.apple.com/account; then try again with the same key. |
| **Request Access** is greyed out | Only the Account Holder can turn API access on. | Ask the Account Holder. |
| Any other refusal | The Issuer ID, Key ID and `.p8` are not one key, or the key was revoked. | Copy both IDs again from **Team Keys** and use that key's `.p8`. |

## App Store app id

The **Apple ID** of the app record: a number of about ten digits. It is not the Bundle ID and not
the Key ID. Every iOS build asks for it, the iOS build file as well as a release to the App
Store, so make the app record (stages 1 and 2 above) before the first iOS build.

1. In App Store Connect, open **Apps** and the app (make it first, stage 2 above).
2. Open **App Information**. Under **General Information**, copy **Apple ID**.

Each app record, so each bundle identifier, has its own. UAT and production share one only when
they share a bundle identifier. A wrong id can let a release show as sent while nothing reaches
TestFlight.

## Your own Android keystore

For an app already on Google Play, signed with an upload keystore the team holds. Google takes an
update only when it is signed with that same upload key.

- The keystore file, saved in the solution folder. Its name must end in `.jks` or `.keystore`: the
  release service takes a keystore by that ending only, so a keystore exported as `.p12` is renamed
  first (the content stays the same).
- Its key alias, keystore password and key password, written into `signing-android.json` in the
  person's own editor (run `signing-template` to make the file).

When UAT and production send to the same Google Play app, production uses the keystore UAT made:
download it in UAT with `download-keys`, then upload it here as the team's own.

## Your own iOS certificate and profile

For a team that manages its own Apple signing.

- **The distribution certificate as `.p12`.** Apple gives a `.cer`; the `.p12` adds the private key,
  which lives only on the Mac that made the certificate request. On that Mac: double-click the
  `.cer`, open Keychain Access **login > My Certificates**, find **Apple Distribution: <team>**,
  check a private key shows under its arrow, right-click **Export**, choose **Personal Information
  Exchange (.p12)** and set a password. If no Mac has the key, make a new certificate request
  (**Keychain Access > Certificate Assistant > Request a Certificate from a Certificate
  Authority**) and a new Apple Distribution certificate from it.
- **The provisioning profile.** At https://developer.apple.com/account/resources/profiles/list,
  create an **App Store** profile (under Distribution) for the app's Bundle ID with that certificate,
  and download the `.mobileprovision`. A profile made before the certificate does not include it:
  edit it, select the certificate and download it again.
- The certificate's password, written into `signing-ios.json` in the person's own editor.

The certificate's file name must end in `.p12` and the profile's in `.mobileprovision`; the
release service takes them by that ending only.

A distribution certificate belongs to the whole Apple team, and Apple allows only a few. Never
revoke one in a customer's account without asking: their other apps' builds stop. Reuse an existing
certificate when the team is at the limit. It expires after a year; with auto-generate UnifyApps
renews it.

**When an iOS build fails at signing with the team's own files:** the profile must be **App
Store** (not Development or Ad Hoc), for this exact Bundle ID, include the certificate in the
`.p12`; the password must be the one set at export; the certificate must not be expired or revoked.

## Keeping keys safe

After auto-generating keys, offer `download-keys` so the team keeps its own copy, stored with the
passwords somewhere safe outside the solution folder. A store refuses an update signed with
different keys. Once a key file is added, the copy in Downloads can be deleted.
