# Getting what Firebase setup needs

Push notifications on a UnifyApps mobile app go through Firebase Cloud Messaging. The person needs
a Firebase project (a new or existing one, at https://console.firebase.google.com/) and gives two
things from it: the **project number** and the **service-account key**. Quote the steps below to
them as written.

## Project number

A number of about 12 digits that names the Firebase project, such as `55628048280`.

1. Open https://console.firebase.google.com/ and pick the project.
2. Click the gear icon beside **Project Overview**, then **Project settings**.
3. On the **General** tab, copy **Project number**. It sits under **Project ID**.

The Project ID (letters and dashes, such as `acme-push-1a2b3`) is a different value; the setup
reads that one from the key file by itself.

When the person has `google-services.json` from an earlier setup, its `project_info.project_number`
is the same number: `check-service-file` reads it out.

## Service-account key

A JSON file that lets UnifyApps register the app in the Firebase project and create its config
files.

1. In the same **Project settings**, open the **Service accounts** tab.
2. Under **Firebase Admin SDK**, click **Generate new private key**, then **Generate key**.
3. A `.json` file downloads, named like `acme-push-1a2b3-firebase-adminsdk-xxxxx.json`.

This key can act for the whole Firebase project. Tell the person never to paste its contents into
the chat, and to keep it out of email and shared drives.

## Saving the key file

Write the folder's full path in place of `<folder>` (`solutionFolder` from `status`, such as
`/Users/priya/acme-app`), never "this folder".

1. Open **Finder**, then in the menu bar choose **Go > Go to Folder** (Shift + Command + G).
2. Paste `<folder>` and press Return.
3. Drag the downloaded `…-firebase-adminsdk-….json` from **Downloads** into that window.
4. Type its file name in the chat, such as `acme-push-1a2b3-firebase-adminsdk-xxxxx.json`. It is
   now at `<folder>/acme-push-1a2b3-firebase-adminsdk-xxxxx.json`. Do not attach the file with @
   or drag it into the chat: that puts the private key into the conversation.

## Which file is which

| The person has | What it is | Use it for |
|---|---|---|
| `…-firebase-adminsdk-….json` with `"type": "service_account"` | The service-account key | This setup |
| `google-services.json` | The Android config file | Nothing: the setup makes it |
| `GoogleService-Info.plist` | The iOS config file | Nothing: the setup makes it |
| `AuthKey_XXXXXXXXXX.p8` | Apple's APNs key | Firebase's Cloud Messaging settings, after the setup (below) |

## iOS: the APNs key

Firebase can send to iPhones only once it holds an Apple Push Notification service (APNs) key.
Without it, Android notifications work and iOS ones never arrive. The person does this once per
Apple developer account, after the setup has run.

**Make the key** (needs an Apple Developer account):

1. Sign in at https://developer.apple.com/account and open **Certificates, Identifiers & Profiles**.
2. Choose **Keys**, then the **+** button.
3. Name it (for example "Firebase APNs Key"), tick **Apple Push Notifications service (APNs)**,
   then **Continue** and **Register**.
4. **Download** the `.p8` file. Apple allows one download only, so keep it safe.
5. Note the **Key ID** on that page, and the **Team ID** shown at the top right of the account.

**Give it to Firebase:**

1. In the Firebase console, open **Project settings**, then the **Cloud Messaging** tab.
2. Under **Apple app configuration**, find the app by its bundle identifier.
3. In **APNs Authentication Key**, click **Upload**, choose the `.p8` file, enter the Key ID and
   Team ID, and click **Upload**.
