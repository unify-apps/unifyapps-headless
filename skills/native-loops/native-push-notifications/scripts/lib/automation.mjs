// The platform automation that registers the app in Firebase and returns its two config files,
// called the way the app builder's Push Notifications setup calls it. Pure: building the request
// and reading the answer.

/** The platform automation registry's name for it. */
export const AUTOMATION_TYPE = 'Firebase_App_Setup';
export const AUTOMATION_OBJECT = 'platform_automation';

/**
 * The run. `projectId` here is the numeric Firebase project NUMBER, not the service account's
 * project_id, which named the connection. Always synchronous: an asynchronous run only starts the
 * automation and answers before the files exist, whatever the registry row says.
 */
export function runRequest({ automationId, connectionId, bundleId, applicationName, projectNumber, createApps }) {
  return {
    context: { appName: 'callables', resourceName: 'callables_call_automation' },
    inputs: {
      automationId,
      runtimeConnections: { firebase: connectionId },
      version: '-1',
      parameters: { bundleId, applicationName, projectId: projectNumber, createApps },
      synchronous: true,
    },
  };
}

function invalid(message) {
  return Object.assign(new Error(message), { code: 'INVALID_RESPONSE' });
}

/** The two file locations sit flat on `response`; anything else is a failed run. */
export function readRunResponse(json) {
  const response = json?.response;
  const android = response?.androidConfigLocation;
  const ios = response?.iosConfigLocation;
  if (typeof android !== 'string' || !android || typeof ios !== 'string' || !ios) {
    throw invalid('The Firebase setup finished without the Android and iOS config files.');
  }
  return { androidConfigLocation: android, iosConfigLocation: ios };
}

/**
 * A generated config file as the app's build info stores it, the shape the app builder saves: the
 * location is an extension-less download path, so its last part is both id and name.
 */
export function configFile(location) {
  const last = location.split('/').filter(Boolean).at(-1) ?? location;
  return { id: last, name: last, url: location, isUploaded: true, sourceType: 'URL' };
}

/** The lookup that finds this tenant's id for the automation. */
export function lookupRequest() {
  return { type: 'ByQuery', lookupType: 'ENTITY', options: { entity_type: AUTOMATION_OBJECT },
    filter: { op: 'EQUAL', field: 'properties_type', values: [AUTOMATION_TYPE] } };
}

/** The automation id out of a lookup answer, or undefined when this tenant has none. */
export function readLookup(json) {
  const objects = json?.response?.objects ?? json?.objects ?? [];
  const id = objects[0]?.properties?.automationId;
  return typeof id === 'string' && id ? id : undefined;
}

/**
 * Firebase refuses to register an app twice. The automation then stops; run again with
 * createApps: false, which fetches the config files of the apps that exist.
 */
export function isAlreadyExists(text) {
  return /already exists|ALREADY_EXISTS|\b409\b/iu.test(String(text ?? ''));
}
