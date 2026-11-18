// The background services a pool simulator does not need, turned off by lib/slim.mjs. With them
// off, an iOS 18.6 simulator running the Preview app settles at about 1.4 GB and 66 processes
// instead of 3.4–5.2 GB and 180–260, and uses about half the CPU while an agent drives it.
//
// What stops working on a slim simulator: Siri, Spotlight and in-Settings search, iCloud and the
// Apple Account, remote push notifications (apsd), StoreKit testing, universal links (swcd), Mail,
// Calendar and Contacts sync, Health and Home, Wallet and App Clips. The photo library stays on, so
// the photo picker and `simctl addmedia` work. Every service a simulator needs to boot and run apps,
// the local keychain (securityd) and the share sheet (sharingd) are not in the list.
//
// The list is simslim's, without its Photos category: https://github.com/MobAI-App/simslim
//
// Copyright (c) 2026 Interlap. Used under the MIT License:
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
// associated documentation files (the "Software"), to deal in the Software without restriction,
// including without limitation the rights to use, copy, modify, merge, publish, distribute,
// sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions: The above copyright notice and this
// permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
// NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
// OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
// CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

export const SLIM_SERVICES = Object.freeze([
  // Widgets & Wallpaper
  'com.apple.PosterBoard', 'com.apple.chronod', 'com.apple.liveactivitiesd', 'com.apple.navd',
  // Siri & Intelligence
  'com.apple.assistant_cdmd', 'com.apple.assistant_service', 'com.apple.siriactionsd',
  'com.apple.siriinferenced', 'com.apple.siriknowledged', 'com.apple.sirittsd',
  'com.apple.siri.context.service', 'com.apple.siri.acousticsignature', 'com.apple.corespeechd',
  'com.apple.voiced', 'com.apple.voicebankingd', 'com.apple.speechmodeltrainingd',
  'com.apple.intelligenceplatformd', 'com.apple.intelligencecontextd',
  'com.apple.intelligenceflowd', 'com.apple.intelligencetasksd',
  'com.apple.generativeexperiencesd', 'com.apple.knowledgeconstructiond',
  'com.apple.naturallanguaged', 'com.apple.textunderstandingd', 'com.apple.modelcatalogd',
  'com.apple.modelmanagerd', 'com.apple.mlhostd', 'com.apple.mlruntimed', 'com.apple.suggestd',
  'com.apple.parsecd', 'com.apple.parsec-fbf', 'com.apple.proactiveeventtrackerd',
  // Spotlight & Search
  'com.apple.searchd', 'com.apple.searchtoold', 'com.apple.spotlightknowledged',
  'com.apple.spotlightknowledged.updater', 'com.apple.corespotlightservice',
  // iCloud & Apple Account
  'com.apple.appleaccountd', 'com.apple.appleaccounttransparencyd', 'com.apple.appleidsetupd',
  'com.apple.akd', 'com.apple.amsaccountsd', 'com.apple.amsengagementd',
  'com.apple.amsondevicestoraged', 'com.apple.cloudd', 'com.apple.cloudphotod',
  'com.apple.ckdiscretionaryd', 'com.apple.cloudsettingssyncagent', 'com.apple.bird',
  'com.apple.syncdefaultsd', 'com.apple.cdpd', 'com.apple.sosd', 'com.apple.SecureBackupDaemon',
  'com.apple.TrustedPeersHelper', 'com.apple.protectedcloudstorage.protectedcloudkeysyncing',
  'com.apple.icloudmailagent', 'com.apple.icloudsubscriptionoptimizerd',
  'com.apple.communicationtrustd',
  // App Store, Push & Media
  'com.apple.appstored', 'com.apple.appstorecomponentsd', 'com.apple.apsd',
  'com.apple.itunescloudd', 'com.apple.itunesstored', 'com.apple.storekitd', 'com.apple.passd',
  'com.apple.financed', 'com.apple.videosubscriptionsd', 'com.apple.assetsubscriptiond',
  'com.apple.musicd',
  // Mail, Calendar & Contacts
  'com.apple.email.maild', 'com.apple.exchangesyncd', 'com.apple.dataaccess.dataaccessd',
  'com.apple.calaccessd', 'com.apple.remindd', 'com.apple.contactsd',
  'com.apple.contacts.postersyncd', 'com.apple.peopled',
  // Safari Sync & Web Services
  'com.apple.SafariBookmarksSyncAgent', 'com.apple.Safari.History',
  'com.apple.Safari.passwordbreachd', 'com.apple.Safari.SafeBrowsing.Service',
  'com.apple.safarifetcherd', 'com.apple.WebBookmarks.webbookmarksd',
  'com.apple.webkit.adattributiond', 'com.apple.webkit.webpushd', 'com.apple.webprivacyd',
  'com.apple.swcd',
  // Family & Screen Time
  'com.apple.familycircled', 'com.apple.FamilyControlsAgent', 'com.apple.familynotification',
  'com.apple.askpermissiond', 'com.apple.asktod', 'com.apple.ScreenTimeAgent',
  'com.apple.ScreenTimeSettingsAgent', 'com.apple.UsageTrackingAgent',
  // Health, Home & Fitness
  'com.apple.healthd', 'com.apple.healthappd', 'com.apple.healthcontentd',
  'com.apple.healtheventsd', 'com.apple.healthrecordsd', 'com.apple.finhealthd', 'com.apple.homed',
  'com.apple.homeeventsd', 'com.apple.fitcore', 'com.apple.fitcore.session',
  'com.apple.fitnesscoachingd', 'com.apple.fitnessintelligenced', 'com.apple.activityawardsd',
  'com.apple.activitysharingd',
  // News, Weather, Maps & Games
  'com.apple.newsd', 'com.apple.weatherd', 'com.apple.Maps.mapssyncd', 'com.apple.Maps.mapspushd',
  'com.apple.Maps.geocorrectiond', 'com.apple.maps.destinationd',
  'com.apple.MapKit.SnapshotService', 'com.apple.jetpackassetd', 'com.apple.tipsd',
  'com.apple.gamesaved', 'com.apple.GameController.gamecontrollerd',
  // Messaging & FaceTime
  'com.apple.identityservicesd', 'com.apple.ids_simd', 'com.apple.imautomatichistorydeletionagent',
  'com.apple.imcore.imtransferagent', 'com.apple.imdpersistence.IMDPersistenceAgent',
  'com.apple.facetimemessagestored', 'com.apple.telephonyutilities.callservicesd',
  // Sharing & Device Connectivity
  'com.apple.rapportd', 'com.apple.companiond', 'com.apple.carkitd', 'com.apple.wcd',
  'com.apple.tvremoted', 'com.apple.avatarsd', 'com.apple.stickersd', 'com.apple.sociallayerd',
  'com.apple.announced', 'com.apple.findmy.findmylocated',
  // Ads, Diagnostics & Telemetry
  'com.apple.ap.adprivacyd', 'com.apple.ap.promotedcontentd', 'com.apple.diagnosticextensionsd',
  'com.apple.feedbackd', 'com.apple.rtcreportingd', 'com.apple.securityuploadd',
  'com.apple.geoanalyticsd', 'com.apple.triald', 'com.apple.followupd',
  'com.apple.purplebuddy.budd', 'com.apple.devicecheckd',
  // Device Management
  'com.apple.remotemanagementd', 'com.apple.RemoteManagementAgent', 'com.apple.managedassetsd',
  // Other Background Services
  'com.apple.merchantd', 'com.apple.coreidvd', 'com.apple.businessservicesd',
  'com.apple.deviceaccessd', 'com.apple.replicatord', 'com.apple.linkd', 'com.apple.ind',
  'com.apple.storagedatad', 'com.apple.StatusKitAgent', 'com.apple.countryd',
  'com.apple.mobileassetd', 'com.apple.managedconfiguration.passcodenagd',
  'com.apple.accessibility.axassetsd', 'com.apple.ClipServices.clipserviced',
]);
