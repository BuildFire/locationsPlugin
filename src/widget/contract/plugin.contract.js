/* eslint-disable no-undef */
/* eslint-disable max-len */
/**
 * Locations contract — runtime implementation.
 *
 * This file only implements the operations declared with "type": "function" in plugin.contract.json. Operations typed publicData / datastore / userData / appData / firebase are declarative: their platform call is built on the fly from context.query, so they intentionally have no counterpart here (searchCategories).
 *
 * Each function operation is dispatched by its context.functionName, receives (options, callback), may nest any number of buildfire.* calls, and may run its own logic between them. Each one declares a context.hosts in plugin.contract.json, which is what the `hosts:` tag on the JSDoc below refers to. An operation lists every place it can run: at most one widget host, at most one control host, and headlessSdk when it is server-safe (generic always stands alone):
 *
 *   generic            no buildfire at all — pure logic, evaluated anywhere.
 *   headlessSdk        uses buildfire and is server-safe; runs on the server.
 *   widgetForeground   runs in the iframe under the app; never on the server.
 *   widgetBackground   Foreground when someone has to be watching it run — it
 *                      surfaces UI, or reaches real people so unattended is
 *                      itself a problem; Background otherwise.
 *   controlForeground  runs in the iframe under the control panel; never on
 *   controlBackground  the server. Foreground/Background by the same rule.
 *
 * headlessSdk is left out when the operation needs frame state (device, localStorage, bookmarks, the actual signed-in session, UI) or handles user-sensitive data / critical behavior that must not be reachable remotely.
 *
 * Only operations whose hosts include generic or headlessSdk are exposed to the MCP.
 *
 * `buildfire` is resolved as a global: in the widget/control hosts it comes from the injected SDK, and on the server the headless SDK provides it. `widgetContract`, `controlContract` and `frameId` are assigned as implicit globals for the same reason — the consumer reaches them without importing this file. The widget frame (widget/contract.html) and the server dispatch to widgetContract; the control panel's frame (control/contract.html) loads this same file and dispatches to controlContract.
 *
 * Every function is Node-style: callback(error, result), invoked exactly once, never with both error and result populated. Invalid input is reported through the callback rather than thrown synchronously.
 *
 * Every option a function reads here must be declared in that operation's `parameters` block, or a caller cannot pass it: the MCP server refuses any param the contract does not declare.
 *
 * Not covered here, on purpose: every write to a location (adding, editing, deleting, pinning, reordering pinned locations, adding photos, filling location field values) also re-indexes the location in buildfire.services.searchEngine, which the contract frames do not load, so none of those actions can run completely on any host and they are left out of the contract rather than declared without their search index.
 */

const LOCATIONS_TAG = 'locations'; // must match the collection names in plugin.contract.json
const CATEGORIES_TAG = 'categories';
const SETTINGS_TAG = 'settings';
// Mirrors src/shared/strings.js: `$bfLanguageSettings_${language.toLowerCase()}`, and the plugin only ever uses 'en-us'.
const STRINGS_TAG = '$bfLanguageSettings_en-us';
const BATCH_LIMIT = 50;
// Mirrors src/control/settings/js/pages/locationFields.js: the add buttons are disabled at 10 fields in total.
const MAX_LOCATION_FIELDS = 10;
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// Mirrors src/widget/js/global/constants/index.js (QuickActionsOptions, ContentOptions).
const LOCATION_FIELD_TYPES = {
  quickActions: ['EMAIL', 'PHONE', 'URL'],
  content: ['EMAIL', 'PHONE', 'URL', 'TEXT', 'RICH_TEXT']
};

// Generated from src/shared/stringsConfig.js: every label the Language tab edits, keyed "<section>.<label>".
const LANGUAGE_STRINGS = {
  "general.search": { title: "Search", defaultValue: "Search", required: false, isPlaceHolder: true, maxLength: 25 },
  "general.price": { title: "Price", defaultValue: "Price", required: true, isPlaceHolder: false, maxLength: 10 },
  "general.currency": { title: "Currency", defaultValue: "Currency", required: true, isPlaceHolder: false, maxLength: 10 },
  "general.reset": { title: "Reset", defaultValue: "Reset", required: true, isPlaceHolder: false, maxLength: 10 },
  "general.notAvailable": { title: "N/A", defaultValue: "N/A", required: false, isPlaceHolder: false, maxLength: 10 },
  "general.open": { title: "Open", defaultValue: "Open", required: true, isPlaceHolder: false, maxLength: 8 },
  "general.closed": { title: "Closed", defaultValue: "Closed", required: true, isPlaceHolder: false, maxLength: 8 },
  "general.bookmark": { title: "Bookmark", defaultValue: "Bookmark", required: true, isPlaceHolder: false, maxLength: 9 },
  "general.bookmarks": { title: "Bookmarks", defaultValue: "Bookmarks", required: true, isPlaceHolder: false, maxLength: 12 },
  "general.bookmarkResults": { title: "Bookmark Results", defaultValue: "Bookmark Results", required: false, isPlaceHolder: false, maxLength: 16 },
  "general.enterBookmarkTitleHere": { title: "Enter bookmark title here", defaultValue: "Enter bookmark title here", required: false, isPlaceHolder: false, maxLength: 50 },
  "general.rateThisLocation": { title: "Rate This Location", defaultValue: "Rate This Location", required: true, isPlaceHolder: false, maxLength: 40 },
  "general.findWithinThisArea": { title: "Find Within This Area", defaultValue: "Find within this area", required: true, isPlaceHolder: false, maxLength: 25 },
  "general.findMore": { title: "Find More", defaultValue: "Find More", required: true, isPlaceHolder: false, maxLength: 20 },
  "general.nearYou": { title: "Near You", defaultValue: "Near You", required: true, isPlaceHolder: false, maxLength: 40 },
  "general.otherLocations": { title: "Other Locations", defaultValue: "Other Locations", required: true, isPlaceHolder: false, maxLength: 40 },
  "general.distanceUnitKm": { title: "KM", defaultValue: "KM", required: true, isPlaceHolder: false, maxLength: 2 },
  "general.distanceUnitMi": { title: "mi", defaultValue: "mi", required: true, isPlaceHolder: false, maxLength: 2 },
  "general.distanceUnitFt": { title: "ft", defaultValue: "ft", required: true, isPlaceHolder: false, maxLength: 2 },
  "general.openHours": { title: "Open Hours", defaultValue: "Open Hours", required: false, isPlaceHolder: false, maxLength: 25 },
  "general.monday": { title: "Monday", defaultValue: "Monday", required: true, isPlaceHolder: false, maxLength: 25 },
  "general.sunday": { title: "Sunday", defaultValue: "Sunday", required: true, isPlaceHolder: false, maxLength: 25 },
  "general.tuesday": { title: "Tuesday", defaultValue: "Tuesday", required: true, isPlaceHolder: false, maxLength: 25 },
  "general.wednesday": { title: "Wednesday", defaultValue: "Wednesday", required: true, isPlaceHolder: false, maxLength: 25 },
  "general.thursday": { title: "Thursday", defaultValue: "Thursday", required: true, isPlaceHolder: false, maxLength: 25 },
  "general.friday": { title: "Friday", defaultValue: "Friday", required: true, isPlaceHolder: false, maxLength: 25 },
  "general.saturday": { title: "Saturday", defaultValue: "Saturday", required: true, isPlaceHolder: false, maxLength: 25 },
  "general.follow": { title: "Follow", defaultValue: "follow", required: true, isPlaceHolder: false, maxLength: 25 },
  "general.following": { title: "Following", defaultValue: "Following", required: true, isPlaceHolder: false, maxLength: 25 },
  "general.purchaseSuccessful": { title: "Purchase Successful", defaultValue: "Congratulations! You can add a location now.", required: true, isPlaceHolder: false, maxLength: 50 },
  "general.purchaseCancelled": { title: "Purchase Cancelled", defaultValue: "Purchase cancelled. No charges were made.", required: true, isPlaceHolder: false, maxLength: 50 },
  "general.genericError": { title: "Generic Error", defaultValue: "Something went wrong. Please try again.", required: true, isPlaceHolder: false, maxLength: 50 },
  "general.pwaUnsupported": { title: "PWA Unsupported", defaultValue: "Subscriptions are not supported on PWA. Please use the mobile app to add a new location.", required: true, isPlaceHolder: false, maxLength: 100 },
  "general.appStoreNotAccessible": { title: "App Store Not Accessible", defaultValue: "App store is not accessible.", required: true, isPlaceHolder: false, maxLength: 50 },
  "general.promotionalOffersNotSupported": { title: "Promotional Offers Not Supported", defaultValue: "Promotional offers are not supported", required: true, isPlaceHolder: false, maxLength: 50 },
  "general.noSubscriptionsFound": { title: "No Subscriptions Found", defaultValue: "No subscriptions were found", required: true, isPlaceHolder: false, maxLength: 50 },
  "sortingOptions.alphabeticalAsc": { title: "Title (A-Z)", defaultValue: "Title (A-Z)", required: true, isPlaceHolder: false, maxLength: 12 },
  "sortingOptions.alphabeticalDsc": { title: "Title (Z-A)", defaultValue: "Title (Z-A)", required: true, isPlaceHolder: false, maxLength: 12 },
  "sortingOptions.distance": { title: "Distance", defaultValue: "Distance", required: true, isPlaceHolder: false, maxLength: 12 },
  "sortingOptions.recommended": { title: "Recommended", defaultValue: "Recommended", required: true, isPlaceHolder: false, maxLength: 12 },
  "sortingOptions.priceDsc": { title: "$$$ - $", defaultValue: "$$$ - $", required: true, isPlaceHolder: false, maxLength: 12 },
  "sortingOptions.priceAsc": { title: "$ - $$$", defaultValue: "$ - $$$", required: true, isPlaceHolder: false, maxLength: 12 },
  "sortingOptions.recent": { title: "Recent", defaultValue: "Recent", required: true, isPlaceHolder: false, maxLength: 12 },
  "sortingOptions.mostViewed": { title: "Most Viewed", defaultValue: "Most Viewed", required: true, isPlaceHolder: false, maxLength: 12 },
  "locationEditing.controlNote": { title: "For full customization options go to the admin Control Panel.", defaultValue: "For full customization options go to the admin Control Panel.", required: true, isPlaceHolder: false, maxLength: 100 },
  "locationEditing.locationDetails": { title: "Location Details", defaultValue: "Location Details", required: false, isPlaceHolder: false, maxLength: 25 },
  "locationEditing.locationName": { title: "Location Title", defaultValue: "Location Title", required: true, isPlaceHolder: false, maxLength: 35 },
  "locationEditing.locationAddress": { title: "Location Address", defaultValue: "Location Address", required: true, isPlaceHolder: false, maxLength: 35 },
  "locationEditing.additionalDetails": { title: "Additional Details", defaultValue: "Additional Details", required: true, isPlaceHolder: false, maxLength: 35 },
  "locationEditing.locationCustomLabel": { title: "Location Custom Label", defaultValue: "Label (optional)", required: true, isPlaceHolder: false, maxLength: 35 },
  "locationEditing.locationStreetNameAndNumber": { title: "Street Name and Number", defaultValue: "Street Name and Number", required: true, isPlaceHolder: false, maxLength: 35 },
  "locationEditing.locationCustomName": { title: "Location Custom Name", defaultValue: "Location Custom Name", required: true, isPlaceHolder: false, maxLength: 35 },
  "locationEditing.locationSubtitle": { title: "Location Subtitle", defaultValue: "Location Subtitle", required: true, isPlaceHolder: false, maxLength: 35 },
  "locationEditing.locationDescription": { title: "Location Description", defaultValue: "Location Description", required: true, isPlaceHolder: false, maxLength: 300 },
  "locationEditing.descriptionDialogPlaceholder": { title: "Enter your description here", defaultValue: "Enter your description here", required: true, isPlaceHolder: false, maxLength: 30 },
  "locationEditing.descriptionDialogSave": { title: "Save", defaultValue: "Save", required: true, isPlaceHolder: false, maxLength: 9 },
  "locationEditing.descriptionDialogCancel": { title: "Cancel", defaultValue: "Cancel", required: true, isPlaceHolder: false, maxLength: 9 },
  "locationEditing.categories": { title: "Categories", defaultValue: "Categories", required: false, isPlaceHolder: false, maxLength: 25 },
  "locationEditing.chooseCategory": { title: "Choose Category", defaultValue: "Choose Category", required: false, isPlaceHolder: false, maxLength: 30 },
  "locationEditing.starRating": { title: "Star Rating", defaultValue: "Star Rating", required: true, isPlaceHolder: false, maxLength: 25 },
  "locationEditing.showCategory": { title: "Show Category on Location Screen", defaultValue: "Show Category on Location Screen", required: true, isPlaceHolder: false, maxLength: 25 },
  "locationEditing.enableEditing": { title: "Enable Editing", defaultValue: "Enable Editing", required: true, isPlaceHolder: false, maxLength: 25 },
  "locationEditing.priceRange": { title: "Price Range", defaultValue: "Price Range", required: true, isPlaceHolder: false, maxLength: 25 },
  "locationEditing.listImage": { title: "List Image", defaultValue: "List Image", required: true, isPlaceHolder: false, maxLength: 25 },
  "locationEditing.listImageNote": { title: "This is the main location image displayed next to the location info in a list view.", defaultValue: "This is the main location image displayed next to the location info in a list view.", required: true, isPlaceHolder: false, maxLength: 110 },
  "locationEditing.mapNote": { title: "If you need adjustments, drag the map so the pin matches the exact location of your place.", defaultValue: "If you need adjustments, drag the map so the pin matches the exact location of your place.", required: true, isPlaceHolder: false, maxLength: 110 },
  "locationEditing.locationImages": { title: "Location Images", defaultValue: "Location Images", required: true, isPlaceHolder: false, maxLength: 25 },
  "locationEditing.locationImagesNote": { title: "These are the location details images. First image in the list will be displayed as location’s main image.", defaultValue: "These are the location details images. First image in the list will be displayed as location’s main image.", required: true, isPlaceHolder: false, maxLength: 110 },
  "locationEditing.monday": { title: "Mon", defaultValue: "Mon", required: true, isPlaceHolder: false, maxLength: 10 },
  "locationEditing.tuesday": { title: "Tue", defaultValue: "Tue", required: true, isPlaceHolder: false, maxLength: 10 },
  "locationEditing.wednesday": { title: "Wed", defaultValue: "Wed", required: true, isPlaceHolder: false, maxLength: 10 },
  "locationEditing.thursday": { title: "Thu", defaultValue: "Thu", required: true, isPlaceHolder: false, maxLength: 10 },
  "locationEditing.friday": { title: "Fri", defaultValue: "Fri", required: true, isPlaceHolder: false, maxLength: 10 },
  "locationEditing.saturday": { title: "Sat", defaultValue: "Sat", required: true, isPlaceHolder: false, maxLength: 10 },
  "locationEditing.sunday": { title: "Sun", defaultValue: "Sun", required: true, isPlaceHolder: false, maxLength: 10 },
  "locationEditing.fieldRequired": { title: "This field is required", defaultValue: "This field is required", required: true, isPlaceHolder: false, maxLength: 25 },
  "locationEditing.required": { title: "Required", defaultValue: "Required", required: true, isPlaceHolder: false, maxLength: 25 },
  "locationEditing.invalidTime": { title: "Choose an end time later than the start time.", defaultValue: "Choose an end time later than the start time.", required: true, isPlaceHolder: false, maxLength: 45 },
  "locationEditing.overlappingHours": { title: "Opening hours are overlapping for this day.", defaultValue: "Opening hours are overlapping for this day.", required: true, isPlaceHolder: false, maxLength: 50 },
  "locationEditing.confirmEditingTitle": { title: "Enable Editing", defaultValue: "Enable Editing", required: true, isPlaceHolder: false, maxLength: 25 },
  "locationEditing.confirmEditingMessage": { title: "The location description currently cannot be edited in the app. If you enable editing, the existing description will be deleted and can be replaced with a new description. Are you sure you want to proceed?", defaultValue: "The location description currently cannot be edited in the app. If you enable editing, the existing description will be deleted and can be replaced with a new description. Are you sure you want to proceed?", required: true, isPlaceHolder: false, maxLength: 210 },
  "locationEditing.confirmEditingConfirm": { title: "Confirm", defaultValue: "Confirm", required: true, isPlaceHolder: false, maxLength: 15 },
  "locationEditing.confirmEditingCancel": { title: "Cancel", defaultValue: "Cancel", required: true, isPlaceHolder: false, maxLength: 15 },
  "locationEditing.enterEmailAddress": { title: "Enter email address", defaultValue: "Enter email address", required: true, isPlaceHolder: false, maxLength: 50 },
  "locationEditing.enterPhoneNumber": { title: "Enter phone number", defaultValue: "Enter phone number", required: true, isPlaceHolder: false, maxLength: 50 },
  "locationEditing.enterURL": { title: "Enter URL", defaultValue: "Enter URL", required: true, isPlaceHolder: false, maxLength: 50 },
  "locationEditing.addDescription": { title: "Add description", defaultValue: "Add description", required: true, isPlaceHolder: false, maxLength: 50 },
  "locationEditing.enterDetails": { title: "Enter details", defaultValue: "Enter details", required: true, isPlaceHolder: false, maxLength: 50 },
  "locationEditing.validEmail": { title: "Enter a valid email address", defaultValue: "Enter a valid email address", required: true, isPlaceHolder: false, maxLength: 50 },
  "locationEditing.validPhone": { title: "Enter a valid phone number", defaultValue: "Enter a valid phone number", required: true, isPlaceHolder: false, maxLength: 50 },
  "locationEditing.validURL": { title: "Enter a valid URL", defaultValue: "Enter a valid URL", required: true, isPlaceHolder: false, maxLength: 50 },
  "toast.bookmarksRemoved": { title: "Bookmark Removed", defaultValue: "Bookmark removed", required: true, isPlaceHolder: false, maxLength: 50 },
  "toast.bookmarksAdded": { title: "Bookmark Added", defaultValue: "Bookmark added", required: true, isPlaceHolder: false, maxLength: 50 },
  "toast.bookmarksError": { title: "Couldn't bookmark", defaultValue: "Couldn't bookmark", required: true, isPlaceHolder: false, maxLength: 50 },
  "toast.uploadingImages": { title: "Uploading Images", defaultValue: "Uploading images", required: true, isPlaceHolder: false, maxLength: 50 },
  "toast.uploadingComplete": { title: "Uploading Images is Complete", defaultValue: "Uploading Images is Complete", required: true, isPlaceHolder: false, maxLength: 50 },
  "toast.uploadingFailed": { title: "Uploading Images Failed", defaultValue: "Uploading Images Failed", required: true, isPlaceHolder: false, maxLength: 50 },
  "toast.locationSaved": { title: "Location Saved", defaultValue: "Location Saved", required: true, isPlaceHolder: false, maxLength: 50 },
  "toast.alreadyReported": { title: "This item is already reported", defaultValue: "This item is already reported", required: true, isPlaceHolder: false, maxLength: 50 },
  "toast.reportedSuccessfully": { title: "Reported successfully", defaultValue: "Reported successfully", required: true, isPlaceHolder: false, maxLength: 50 },
  "toast.uploadedSuccessfully": { title: "Thanks for sharing your photos", defaultValue: "Thanks for sharing your photos", required: true, isPlaceHolder: false, maxLength: 50 },
  "toast.subscribeToLocationUpdates": { title: "You'll now get notifications for location updates.", defaultValue: "You'll now get notifications for location updates.", required: true, isPlaceHolder: false, maxLength: 75 },
  "toast.unSubscribeFromLocationUpdates": { title: "You'll no longer get notifications for location updates.", defaultValue: "You'll no longer get notifications for location updates.", required: true, isPlaceHolder: false, maxLength: 75 },
  "toast.sendNotificationSuccess": { title: "Notification sent successfully", defaultValue: "Notification sent successfully.", required: true, isPlaceHolder: false, maxLength: 75 },
  "toast.sendNotificationFailed": { title: "Notification failed", defaultValue: "Failed to send notification. Please try again later.", required: true, isPlaceHolder: false, maxLength: 75 },
  "toast.locationHasNoSubscribers": { title: "Location has no subscribers", defaultValue: "This location has no subscribers to notify", required: true, isPlaceHolder: false, maxLength: 75 },
  "toast.locationDeleted": { title: "Location Deleted", defaultValue: "This location has been deleted.", required: true, isPlaceHolder: false, maxLength: 75 },
  "toast.somethingWentWrong": { title: "Something went wrong", defaultValue: "Something went wrong", required: true, isPlaceHolder: false, maxLength: 50 },
  "details.bookmark": { title: "Bookmark", defaultValue: "Bookmark", required: true, isPlaceHolder: false, maxLength: 25 },
  "details.reportAbuse": { title: "Report Abuse", defaultValue: "Report Abuse", required: true, isPlaceHolder: false, maxLength: 25 },
  "details.share": { title: "Share", defaultValue: "Share", required: true, isPlaceHolder: false, maxLength: 25 },
  "details.edit": { title: "Edit", defaultValue: "Edit", required: true, isPlaceHolder: false, maxLength: 25 },
  "details.notifySubscribers": { title: "Notify Subscribers", defaultValue: "Notify Subscribers", required: true, isPlaceHolder: false, maxLength: 50 },
  "details.addPhotos": { title: "Add Photos", defaultValue: "Add Photos", required: true, isPlaceHolder: false, maxLength: 25 },
  "details.contributorPrefix": { title: "Contributor Name Prefix", defaultValue: "by", required: true, isPlaceHolder: false, maxLength: 15 },
  "details.unknownContributor": { title: "Unknown Contributor", defaultValue: "Someone", required: true, isPlaceHolder: false, maxLength: 25 },
  "details.newPushNotification": { title: "New Push Notification Title", defaultValue: "New Push Notification", required: true, isPlaceHolder: false, maxLength: 50 },
  "details.notificationWarningNote": { title: "Notification Note", defaultValue: "Notify users about changes to this location. Only users who have subscribed to this location will receive this notification.", required: true, isPlaceHolder: false, maxLength: 150 },
  "details.notificationTitlePlaceholder": { title: "Notification Title Placeholder", defaultValue: "Title", required: true, isPlaceHolder: false, maxLength: 50 },
  "details.notificationMessagePlaceholder": { title: "Notification Message Placeholder", defaultValue: "Message", required: true, isPlaceHolder: false, maxLength: 50 },
  "details.done": { title: "Done", defaultValue: "Done", required: true, isPlaceHolder: false, maxLength: 9 },
  "details.cancel": { title: "Cancel", defaultValue: "Cancel", required: true, isPlaceHolder: false, maxLength: 9 },
  "details.notificationSend": { title: "Send", defaultValue: "Send", required: true, isPlaceHolder: false, maxLength: 15 },
  "emptyState.emptyCategories": { title: "No Categories Added", defaultValue: "No Categories Added", required: false, isPlaceHolder: false, maxLength: 30 },
  "emptyState.locationsListBeforeSearch": { title: "Start your search", defaultValue: "Start your search", required: false, isPlaceHolder: false, maxLength: 40 },
  "emptyState.locationsListAfterSearch": { title: "No locations found within this area", defaultValue: "No locations found within this area", required: false, isPlaceHolder: false, maxLength: 40 }
};

/**
 * Assert that every named option is a non-empty string.
 * @returns {boolean} true when valid; false when the callback has already fired.
 */
const requireStringParams = (options, names, callback) => {
  if (typeof callback !== 'function') {
    // Nothing to report through; fail loudly only in this one unrecoverable case.
    throw new TypeError('callback must be a function');
  }
  if (options === null || typeof options !== 'object') {
    callback(new Error('options must be an object'), undefined);
    return false;
  }
  const missing = names.find((name) => typeof options[name] !== 'string' || !options[name]);
  if (missing) {
    callback(new Error(`Missing required parameter: ${missing}`), undefined);
    return false;
  }
  return true;
};

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Assert that options, when passed at all, is an object, for operations whose parameters are all optional.
 * @returns {boolean} true when valid; false when the callback has already fired.
 */
const requireOptions = (options, callback) => {
  if (typeof callback !== 'function') throw new TypeError('callback must be a function');
  if (options !== undefined && !isPlainObject(options)) {
    callback(new Error('options must be an object'), undefined);
    return false;
  }
  return true;
};

/**
 * An image param, checked against its declared count. Image params are always arrays, even for a single image, so a bare string is refused rather than wrapped: it means the caller misread the contract.
 * @param {*} value - the param as passed
 * @param {{ name: string, minValue: number, maxValue?: number }} bounds - exactly as declared
 * @returns {{ images?: string[], error?: string }}
 */
const readImageList = (value, { name, minValue, maxValue }) => {
  const range = maxValue === undefined ? `at least ${minValue}`
    : (minValue === maxValue ? `exactly ${minValue}` : (minValue === 0 ? `up to ${maxValue}` : `${minValue} to ${maxValue}`));
  if (!Array.isArray(value)) return { error: `${name} must be a list of image URLs (${range}), even for one image` };
  if (value.length < minValue || (maxValue !== undefined && value.length > maxValue)) {
    return { error: `${name} must hold ${range} image${maxValue === 1 ? '' : 's'}; got ${value.length}` };
  }
  if (value.some((url) => typeof url !== 'string' || !url)) return { error: `${name} must contain only image URLs` };
  return { images: value };
};

// Mirrors src/widget/js/global/helpers.js generateUUID, so new subcategory, field and carousel ids look like the plugin's own.
const generateUUID = () => {
  let dt = new Date().getTime();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const replace = (dt + Math.random() * 16) % 16 | 0; // eslint-disable-line no-bitwise
    dt = Math.floor(dt / 16);
    return (c === 'x' ? replace : (replace & 0x3) | 0x8).toString(16); // eslint-disable-line no-bitwise
  });
};

// Mirrors src/utils/datetime.js convertDateToTime: times of day are stored as dates on 1970-01-01 UTC.
const toTimeOfDay = (date) => {
  const time = new Date(date);
  if (Number.isNaN(time.getTime())) return null;
  const hour = time.getUTCHours();
  const mins = time.getUTCMinutes();
  return `${hour < 10 ? `0${hour}` : hour}:${mins < 10 ? `0${mins}` : mins}`;
};

/**
 * Mirrors src/UserAccessControl/authManager.js sanitizedCurrentUser: who is recorded as having made a change, without their credentials or contact details.
 */
const sanitizeUser = (user) => {
  if (!user) return null;
  const sanitizedUser = { ...user };
  if (typeof sanitizedUser._cpUser !== 'undefined') sanitizedUser.isCPUser = true;
  [
    'email', 'username', 'accessToken', 'accessTokenExpiresIn',
    'externalApps', 'lastUsedIPAddress', 'userToken', 'loginProviderType',
    'failedAttemptCount', '_cpUser',
  ].forEach((prop) => {
    if (Object.prototype.hasOwnProperty.call(sanitizedUser, prop)) delete sanitizedUser[prop];
  });
  return sanitizedUser;
};

/**
 * The signed-in user to record as createdBy / lastUpdatedBy / deletedBy, as the control panel records it. Nobody signed in (the server, an unattended frame) records null, which the plugin already handles for records it imports.
 * @param {function(object|null)} callback
 */
const withCurrentUser = (callback) => {
  buildfire.auth.getCurrentUser((err, user) => callback(err ? null : sanitizeUser(user)));
};

/**
 * The control panel's own refresh message to an open widget after each save. Messaging only exists in the frames; on the server there is no widget to refresh, so it is skipped there.
 */
const notifyWidget = (scope) => {
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') {
    buildfire.messaging.sendMessageToWidget({ cmd: 'sync', scope });
  }
};

/**
 * Runs a batch the way every batch here must: validates every entry, refuses a record listed twice, resolves every target before any write, then applies each entry through the single operation's own implementation and reports each outcome. A failed write is reported per entry and does not stop the rest.
 * @param {object} options - the operation's options
 * @param {string} listName - the list param, also the result's list key
 * @param {{ validate: function(object): (string|null), idKey?: string, resolve?: function(object, function), apply: function(*, object, function), idOf: function(object): string }} steps
 * @param {function(Error=, object=)} callback - (error, { <listName>, succeeded, failed })
 */
const runBatch = (options, listName, steps, callback) => {
  if (typeof callback !== 'function') throw new TypeError('callback must be a function');
  const entries = options && options[listName];
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > BATCH_LIMIT) {
    return callback(new Error(`${listName} must be a list of 1 to ${BATCH_LIMIT} entries`), undefined);
  }

  // 1. Validate every entry with the single operation's own checks; nothing is written if any is invalid.
  const invalid = entries.map((entry, index) => {
    if (!isPlainObject(entry)) return `entry ${index}: must be an object`;
    const error = steps.validate(entry);
    return error ? `entry ${index}: ${error}` : null;
  }).filter(Boolean);
  if (invalid.length) return callback(new Error(`Invalid entries: ${invalid.join('; ')}`), undefined);
  if (steps.idKey && new Set(entries.map((entry) => entry[steps.idKey])).size !== entries.length) {
    return callback(new Error(`The same record is listed more than once in ${listName}`), undefined);
  }

  // 3. Apply each entry in turn, recording every outcome.
  const targets = [];
  const applyNext = (index, results) => {
    if (index === entries.length) {
      const failed = results.filter((result) => result.error).length;
      return callback(null, { [listName]: results, succeeded: results.length - failed, failed });
    }
    steps.apply(targets[index], entries[index], (err, result) => {
      results.push({ index, id: err ? null : steps.idOf(result), error: err ? err.message : null });
      applyNext(index + 1, results);
    });
  };

  // 2. Resolve every target before any write; an unknown one fails the whole call.
  const unknown = [];
  const resolveNext = (index) => {
    if (index === entries.length) {
      if (unknown.length) return callback(new Error(`Not found: ${unknown.join('; ')}`), undefined);
      return applyNext(0, []);
    }
    if (!steps.resolve) return resolveNext(index + 1);
    steps.resolve(entries[index], (err, target) => {
      if (err) unknown.push(`entry ${index}: ${err.message}`);
      else targets[index] = target;
      resolveNext(index + 1);
    });
  };
  resolveNext(0);
};

// ---------------------------------------------------------------------------
// Categories and subcategories (publicData "categories")
// ---------------------------------------------------------------------------

// Mirrors src/widget/js/global/data/Category.js (constructor defaults and toJSON index), so records look exactly like the control panel's.
const categoryToJSON = (data) => {
  const title = data.title || '';
  const quickAccess = [0, 1].includes(data.quickAccess) ? data.quickAccess : 0;
  const deletedOn = data.deletedOn || null;
  return {
    id: data.id || undefined,
    title,
    iconUrl: data.iconUrl || null,
    iconClassName: data.iconClassName || null,
    subcategories: data.subcategories || [],
    quickAccess,
    createdOn: data.createdOn || new Date(),
    createdBy: data.createdBy || null,
    lastUpdatedOn: data.lastUpdatedOn || new Date(),
    lastUpdatedBy: data.lastUpdatedBy || null,
    deletedOn,
    deletedBy: data.deletedBy || null,
    isActive: [0, 1].includes(data.isActive) ? data.isActive : 1,
    _buildfire: {
      index: {
        string1: title.toLowerCase(),
        date1: deletedOn,
        number1: quickAccess
      }
    }
  };
};

const subcategoryResult = (subcategory) => ({
  id: subcategory.id,
  title: subcategory.title,
  iconUrl: subcategory.iconUrl || null,
  iconClassName: subcategory.iconClassName || null
});

const categoryResult = (id, data) => ({
  id,
  title: data.title,
  iconUrl: data.iconUrl || null,
  iconClassName: data.iconClassName || null,
  subcategories: (data.subcategories || []).map(subcategoryResult)
});

// Deleted categories keep their record with deletedOn set, mirrored in _buildfire.index.date1; the plugin lists only those whose date1 is null ($type 10).
const ACTIVE_CATEGORY_FILTER = { '_buildfire.index.date1': { $type: 10 } };

/**
 * Every category the app shows, the way the control panel's getAllCategories pages through them, 50 at a time (the most a search returns). Whether another page exists is told by the search's own totalRecord, never by a full page.
 * @param {function(Error=, Array=)} callback - (error, [{ id, data }])
 */
const fetchAllCategories = (callback) => {
  const all = [];
  let seen = 0;
  const fetchPage = (page) => {
    buildfire.publicData.search({
      filter: { ...ACTIVE_CATEGORY_FILTER }, sort: { '_buildfire.index.string1': 1 }, page, pageSize: 50, recordCount: true
    }, CATEGORIES_TAG, (err, response) => {
      if (err) return callback(err, undefined);
      const records = (response && response.result) || [];
      all.push(...records.filter((record) => record && record.data));
      seen += records.length;
      const total = (response && response.totalRecord) || 0;
      if (!records.length || seen >= total) return callback(null, all);
      fetchPage(page + 1);
    });
  };
  fetchPage(0);
};

/**
 * The category a caller named by its exact title — the only handle a caller actually has. A title matching several categories is refused rather than resolved to one of them.
 * @param {function(Error=, {id: string, data: object}=)} callback
 */
const resolveCategory = (title, callback) => {
  buildfire.publicData.search({ filter: { ...ACTIVE_CATEGORY_FILTER, '$json.title': title } }, CATEGORIES_TAG, (err, records) => {
    if (err) return callback(err, undefined);
    const found = (records || []).filter((record) => record && record.data && Object.keys(record.data).length);
    if (!found.length) return callback(new Error(`No category titled "${title}"`), undefined);
    if (found.length > 1) return callback(new Error(`${found.length} categories are titled "${title}"`), undefined);
    callback(null, { id: found[0].id, data: found[0].data });
  });
};

/**
 * The category id an advanced operation was given, checked to exist and not to be deleted.
 * @param {function(Error=, {id: string, data: object}=)} callback
 */
const requireCategoryById = (categoryId, callback) => {
  buildfire.publicData.getById(categoryId, CATEGORIES_TAG, (err, record) => {
    if (err) return callback(err, undefined);
    if (!record || !record.data || !Object.keys(record.data).length || record.data.deletedOn) {
      return callback(new Error(`No category with id "${categoryId}"`), undefined);
    }
    callback(null, { id: record.id || categoryId, data: record.data });
  });
};

/**
 * Saves a category the way the control panel's CategoriesController.updateCategory does: the whole record rebuilt through the model, stamped lastUpdatedOn / lastUpdatedBy, then the widget told to refresh its categories.
 * @param {function(Error=, object=)} callback - (error, saved category data)
 */
const saveCategory = (id, data, callback) => {
  withCurrentUser((user) => {
    const category = { ...data, id, lastUpdatedOn: new Date(), lastUpdatedBy: user };
    buildfire.publicData.update(id, categoryToJSON(category), CATEGORIES_TAG, (err, result) => {
      if (err) return callback(err, undefined);
      notifyWidget('category');
      callback(null, (result && result.data && Object.keys(result.data).length) ? result.data : categoryToJSON(category));
    });
  });
};

/**
 * The icon a new category or subcategory gets: a picture (icon) or a font icon (iconName), never both, as the control panel's icon picker sets one and clears the other.
 * @returns {{ fields?: object, error?: string }}
 */
const collectNewIcon = (options) => {
  const fields = { iconUrl: null, iconClassName: null };
  if (options.icon !== undefined) {
    const { images, error } = readImageList(options.icon, { name: 'icon', minValue: 0, maxValue: 1 });
    if (error) return { error };
    fields.iconUrl = images.length ? images[0] : null;
  }
  if (options.iconName !== undefined) {
    if (typeof options.iconName !== 'string' || !options.iconName) return { error: 'iconName must be the name of a font icon' };
    if (fields.iconUrl) return { error: 'Pass either icon or iconName, not both' };
    fields.iconClassName = options.iconName;
  }
  return { fields };
};

/**
 * The changes a category or subcategory update asks for. Left out (undefined) skips a field. The title is required by the plugin's form, so it can be changed but never cleared; the icon picker always swaps one icon for another and has no way to remove it, so neither icon param can be cleared either. A picture clears the font icon and a font icon clears the picture, as the picker does.
 * @returns {{ changes?: object, error?: string }}
 */
const collectIconTitleChanges = (options) => {
  const changes = {};
  if (options.newTitle !== undefined) {
    if (typeof options.newTitle !== 'string' || !options.newTitle) return { error: 'newTitle cannot be removed; pass a non-empty title' };
    changes.title = options.newTitle;
  }
  if (options.newIcon !== undefined) {
    const { images, error } = readImageList(options.newIcon, { name: 'newIcon', minValue: 1, maxValue: 1 });
    if (error) return { error };
    changes.iconUrl = images[0];
    changes.iconClassName = null;
  }
  if (options.newIconName !== undefined) {
    if (typeof options.newIconName !== 'string' || !options.newIconName) return { error: 'newIconName cannot be removed; pass the name of a font icon' };
    if (changes.iconUrl) return { error: 'Pass either newIcon or newIconName, not both' };
    changes.iconClassName = options.newIconName;
    changes.iconUrl = null;
  }
  if (!Object.keys(changes).length) return { error: 'Pass at least one of newTitle, newIcon or newIconName' };
  return { changes };
};

const validateNewCategory = (options) => {
  if (typeof options.title !== 'string' || !options.title) return 'Missing required parameter: title';
  return collectNewIcon(options).error || null;
};

/**
 * Adds a category the way the control panel's CategoriesController.createCategory does: stamped createdOn / createdBy, inserted, its "Category Selected" analytics event registered, and the widget told to refresh. Shared by createCategory and createCategoriesAdvanced.
 */
const applyCreateCategory = (options, callback) => {
  const { fields } = collectNewIcon(options);
  withCurrentUser((user) => {
    const category = {
      title: options.title, ...fields, subcategories: [], createdOn: new Date(), createdBy: user
    };
    buildfire.publicData.insert(categoryToJSON(category), CATEGORIES_TAG, (err, result) => {
      if (err) return callback(err, undefined);
      const data = (result && result.data) || categoryToJSON(category);
      // Mirrors src/utils/analytics.js registerCategoryEvent, so the category's selections show in the plugin's reports.
      buildfire.analytics.registerEvent({ title: `${data.title} (Category Selected)`, key: `categories_${result.id}_selected`, description: '' }, { silentNotification: true });
      notifyWidget('category');
      callback(null, categoryResult(result.id, data));
    });
  });
};

const applyUpdateCategory = (target, options, callback) => {
  const { changes, error } = collectIconTitleChanges(options);
  if (error) return callback(new Error(error), undefined);
  saveCategory(target.id, { ...target.data, ...changes }, (err, data) => {
    if (err) return callback(err, undefined);
    callback(null, categoryResult(target.id, data));
  });
};

/**
 * Removes a category the way the control panel's CategoriesController.deleteCategory does: a soft delete, the record kept with deletedOn / deletedBy set (and so its index date1), which hides it everywhere the plugin lists categories.
 */
const applyDeleteCategory = (target, options, callback) => {
  withCurrentUser((user) => {
    const category = { ...target.data, id: target.id, deletedOn: new Date(), deletedBy: user };
    buildfire.publicData.update(target.id, categoryToJSON(category), CATEGORIES_TAG, (err) => {
      if (err) return callback(err, undefined);
      notifyWidget('category');
      callback(null, { id: target.id, title: target.data.title, deleted: true });
    });
  });
};

/**
 * The subcategory a caller named by its exact title, inside a category already resolved. Several with that title are refused.
 * @returns {{ index?: number, error?: string }}
 */
const findSubcategoryByTitle = (category, title) => {
  const matches = (category.data.subcategories || [])
    .map((subcategory, index) => ({ subcategory, index }))
    .filter(({ subcategory }) => subcategory && subcategory.title === title);
  if (!matches.length) return { error: `No subcategory titled "${title}" in "${category.data.title}"` };
  if (matches.length > 1) return { error: `${matches.length} subcategories are titled "${title}" in "${category.data.title}"` };
  return { index: matches[0].index };
};

const findSubcategoryById = (category, subcategoryId) => {
  const index = (category.data.subcategories || []).findIndex((subcategory) => subcategory && subcategory.id === subcategoryId);
  if (index === -1) return { error: `No subcategory with id "${subcategoryId}" in that category` };
  return { index };
};

const applyCreateSubcategory = (category, options, callback) => {
  if (typeof options.title !== 'string' || !options.title) return callback(new Error('Missing required parameter: title'), undefined);
  // Mirrors the control panel's add-subcategory dialog: a new id, the title, and no icon yet.
  const subcategory = {
    id: generateUUID(), title: options.title, iconUrl: null, iconClassName: null
  };
  const subcategories = [...(category.data.subcategories || []), subcategory];
  saveCategory(category.id, { ...category.data, subcategories }, (err) => {
    if (err) return callback(err, undefined);
    callback(null, { categoryId: category.id, ...subcategoryResult(subcategory) });
  });
};

const applyUpdateSubcategory = (category, index, options, callback) => {
  const { changes, error } = collectIconTitleChanges(options);
  if (error) return callback(new Error(error), undefined);
  const subcategories = [...category.data.subcategories];
  subcategories[index] = { ...subcategories[index], ...changes };
  saveCategory(category.id, { ...category.data, subcategories }, (err) => {
    if (err) return callback(err, undefined);
    callback(null, { categoryId: category.id, ...subcategoryResult(subcategories[index]) });
  });
};

const applyDeleteSubcategory = (category, index, callback) => {
  const removed = category.data.subcategories[index];
  const subcategories = category.data.subcategories.filter((item, position) => position !== index);
  saveCategory(category.id, { ...category.data, subcategories }, (err) => {
    if (err) return callback(err, undefined);
    callback(null, { categoryId: category.id, id: removed.id, title: removed.title, deleted: true });
  });
};

// Mirrors the control panel's subcategory drag-to-reorder: the moved subcategory is spliced into its new place.
const applySubcategoryOrder = (category, index, options, callback) => {
  const count = category.data.subcategories.length;
  if (!Number.isInteger(options.position) || options.position < 1 || options.position > count) {
    return callback(new Error(`position must be a whole number from 1 to ${count}`), undefined);
  }
  const subcategories = [...category.data.subcategories];
  const [moved] = subcategories.splice(index, 1);
  subcategories.splice(options.position - 1, 0, moved);
  saveCategory(category.id, { ...category.data, subcategories }, (err) => {
    if (err) return callback(err, undefined);
    callback(null, { categoryId: category.id, subcategories: subcategories.map(subcategoryResult) });
  });
};

// ---------------------------------------------------------------------------
// Settings (datastore "settings")
// ---------------------------------------------------------------------------

// Mirrors src/widget/js/global/repository/Settings.js migrateFieldSettings.
const migrateFieldSettings = (data) => {
  if (data.globalEntries) {
    if (data.globalEntries.allowPriceRange != null) {
      data.globalEntries.priceRange = {
        enabled: data.globalEntries.allowPriceRange,
        inAppEnabled: data.globalEntries.allowPriceRange ? 'all' : 'none',
        tags: [],
      };
      delete data.globalEntries.allowPriceRange;
    }
    if (data.globalEntries.allowOpenHours != null) {
      data.globalEntries.openHours = {
        enabled: data.globalEntries.allowOpenHours,
        inAppEnabled: data.globalEntries.allowOpenHours ? 'all' : 'none',
        tags: [],
      };
      delete data.globalEntries.allowOpenHours;
    }
  }
  return data;
};

// Mirrors the CustomField class in src/widget/js/global/data/Settings.js.
const toLocationField = (field = {}) => ({
  id: field.id || null,
  label: field.label || null,
  type: field.type || null,
  required: field.required || false,
  enableCustomLabel: field.enableCustomLabel || false,
  visibility: field.visibility || { value: 'ALL', tags: [] }
});

/**
 * Mirrors src/widget/js/global/data/Settings.js (constructor defaults, then toJSON), so a settings document read or saved here has exactly the shape and defaults the plugin's own pages give it.
 */
const buildSettings = (data = {}) => {
  const introductoryListView = data.introductoryListView || {
    images: [],
    description: null,
    sorting: 'distance',
    searchOptions: { mode: 'UserPosition', areaRadiusOptions: {} },
  };
  if (!data.introductoryListView || !data.introductoryListView.visibilityOptions) {
    introductoryListView.visibilityOptions = {
      tags: [],
      value: (data.showIntroductoryListView === true || typeof data.showIntroductoryListView === 'undefined') ? 'ALL' : 'NONE'
    };
  } else {
    const { visibilityOptions } = data.introductoryListView;
    introductoryListView.visibilityOptions = { tags: visibilityOptions.tags || [], value: visibilityOptions.value || 'ALL' };
  }
  const globalEntries = data.globalEntries || {
    locations: { allowAdding: 'none', tags: [] },
    photos: { allowAdding: 'none', tags: [] },
    openHours: { enabled: true, inAppEnabled: 'all', tags: [] },
    priceRange: { enabled: true, inAppEnabled: 'all', tags: [] },
    charging: {
      enabled: 'none', tags: [], description: '', subscriptionOptions: []
    },
  };
  if (!globalEntries.charging) {
    globalEntries.charging = {
      enabled: 'none', tags: [], description: '', subscriptionOptions: []
    };
  }
  const globalEditors = data.globalEditors || {
    enabled: true, allowLocationCreatorsToEdit: true, tags: [], users: []
  };
  if (typeof globalEditors.allowLocationCreatorsToEdit === 'undefined') globalEditors.allowLocationCreatorsToEdit = true;
  return {
    subscription: data.subscription || { enabled: false, allowCustomNotifications: false },
    measurementUnit: data.measurementUnit || 'metric',
    introductoryListView,
    sorting: data.sorting || {
      defaultSorting: 'distance',
      hideSorting: false,
      allowSortByReverseAlphabetical: true,
      allowSortByNearest: true,
      allowSortByPriceLowToHigh: true,
      allowSortByPriceHighToLow: true,
      allowSortByDate: true,
      allowSortByRating: true,
      allowSortByViews: true,
    },
    filter: data.filter || {
      allowFilterByArea: true,
      allowFilterByBookmarks: false,
      hideOpeningHoursFilter: false,
      hidePriceFilter: false,
    },
    map: data.map || {
      distanceUnit: 'metric',
      showPointsOfInterest: false,
      initialArea: true,
      offlineAreaSelection: true,
      initialAreaCoordinates: { lat: null, lng: null },
      initialAreaDisplayAddress: null
    },
    bookmarks: data.bookmarks || { enabled: true, allowForLocations: true, allowForFilters: true },
    customFields: {
      quickActions: ((data.customFields && data.customFields.quickActions) || []).map(toLocationField),
      content: ((data.customFields && data.customFields.content) || []).map(toLocationField)
    },
    design: data.design || {
      listViewPosition: 'collapsed',
      listViewStyle: 'backgroundImage',
      defaultMapStyle: 'light',
      defaultMapType: 'streets',
      enableMapTerrainView: false,
      hideQuickFilter: false,
      allowStyleSelection: true,
      detailsMapPosition: 'top',
      showDetailsCategory: true,
      showContributorName: false,
    },
    globalEntries,
    globalEditors,
    locationEditors: data.locationEditors || { enabled: true, time: '12H' },
    categoriesSortBy: data.categoriesSortBy || 'Asc',
    createdOn: data.createdOn || new Date(),
    createdBy: data.createdBy || null,
    lastUpdatedOn: data.lastUpdatedOn || new Date(),
    lastUpdatedBy: data.lastUpdatedBy || null,
    deletedOn: data.deletedOn || null,
    deletedBy: data.deletedBy || null,
    isActive: [0, 1].includes(data.isActive) ? data.isActive : 1,
    _buildfire: { index: {} }
  };
};

/**
 * The settings as the plugin's pages load them (Settings.get): new instances default subscriptions on, older records are migrated and filled with defaults. isNew tells a write that nothing is saved yet, so it saves the whole document (the control panel's tabs save these defaults when they first open, Settings.get(true)) rather than patching a document that does not exist. Nothing is written here, so a refused call writes nothing.
 * @param {function(Error=, object=, boolean=)} callback - (error, settings document, isNew)
 */
const readSettings = (callback) => {
  buildfire.datastore.get(SETTINGS_TAG, (err, res) => {
    if (err) return callback(err, undefined);
    if (!res || !res.data || !Object.keys(res.data).length) {
      // For new instances subscriptions are enabled by default, unlike old instances (backward compatible).
      return callback(null, buildSettings({ subscription: { enabled: true, allowCustomNotifications: true } }), true);
    }
    callback(null, buildSettings(migrateFieldSettings(res.data)), false);
  });
};

// What a caller gets back: the stored shape, without the index block or the records of who saved it.
const settingsResult = (settings) => {
  const result = { ...settings };
  delete result._buildfire;
  delete result.createdBy;
  delete result.lastUpdatedBy;
  delete result.deletedBy;
  return result;
};

const setPath = (target, path, value) => {
  let node = target;
  path.slice(0, -1).forEach((key) => {
    if (!isPlainObject(node[key])) node[key] = {};
    node = node[key];
  });
  node[path[path.length - 1]] = value;
};

// One updateSettings param per switch the settings, design and content tabs show, mapped to where the plugin stores it.
const BOOLEAN_SETTINGS = {
  allowSubscriptions: ['subscription', 'enabled'],
  hideSorting: ['sorting', 'hideSorting'],
  allowSortByReverseAlphabetical: ['sorting', 'allowSortByReverseAlphabetical'],
  allowSortByNearest: ['sorting', 'allowSortByNearest'],
  allowSortByPriceLowToHigh: ['sorting', 'allowSortByPriceLowToHigh'],
  allowSortByPriceHighToLow: ['sorting', 'allowSortByPriceHighToLow'],
  allowSortByDate: ['sorting', 'allowSortByDate'],
  allowSortByRating: ['sorting', 'allowSortByRating'],
  allowSortByViews: ['sorting', 'allowSortByViews'],
  allowFilterByArea: ['filter', 'allowFilterByArea'],
  allowFilterByBookmarks: ['filter', 'allowFilterByBookmarks'],
  hideOpeningHoursFilter: ['filter', 'hideOpeningHoursFilter'],
  hidePriceFilter: ['filter', 'hidePriceFilter'],
  enableInitialArea: ['map', 'initialArea'],
  enableBookmarks: ['bookmarks', 'enabled'],
  allowBookmarkLocations: ['bookmarks', 'allowForLocations'],
  allowBookmarkSearch: ['bookmarks', 'allowForFilters'],
  enableOpenHours: ['globalEntries', 'openHours', 'enabled'],
  enablePriceRange: ['globalEntries', 'priceRange', 'enabled'],
  enableMapTerrainView: ['design', 'enableMapTerrainView'],
  hideQuickFilter: ['design', 'hideQuickFilter'],
  allowMapStyleSelection: ['design', 'allowStyleSelection'],
  showDetailsCategory: ['design', 'showDetailsCategory'],
  showContributorName: ['design', 'showContributorName'],
};

// Radio groups and dropdowns, with exactly the values their templates offer.
const SELECT_SETTINGS = {
  timeFormat: { path: ['locationEditors', 'time'], values: ['12H', '24H'] },
  defaultSorting: { path: ['sorting', 'defaultSorting'], values: ['distance', 'alphabetical'] },
  distanceUnit: { path: ['measurementUnit'], values: ['metric', 'imperial'] },
  chargeForNewLocations: { path: ['globalEntries', 'charging', 'enabled'], values: ['none', 'limited', 'all'] },
  listViewPosition: { path: ['design', 'listViewPosition'], values: ['expanded', 'collapsed', 'halfExpanded'] },
  listViewStyle: { path: ['design', 'listViewStyle'], values: ['backgroundImage', 'smallImage'] },
  defaultMapType: { path: ['design', 'defaultMapType'], values: ['streets', 'satellite'] },
  detailsMapPosition: { path: ['design', 'detailsMapPosition'], values: ['top', 'bottom'] },
  introVisibility: { path: ['introductoryListView', 'visibilityOptions', 'value'], values: ['NONE', 'TAGS', 'ALL'] },
  introSorting: { path: ['introductoryListView', 'sorting'], values: ['distance', 'alphabetical', 'newest'] },
  introLocationSource: { path: ['introductoryListView', 'searchOptions', 'mode'], values: ['All', 'UserPosition', 'AreaRadius', 'MyLocations'] },
};

// TinyMCE editors; the control panel lets both be emptied.
const RICH_TEXT_SETTINGS = {
  introDescription: ['introductoryListView', 'description'],
  paymentDetails: ['globalEntries', 'charging', 'description'],
};

const OTHER_SETTINGS = [
  'initialAreaLatitude', 'initialAreaLongitude', 'initialAreaAddress',
  'introAreaLatitude', 'introAreaLongitude', 'introAreaAddress', 'introAreaRadius', 'introImages'
];

/**
 * A latitude / longitude pair: both or neither, each within range (mirrors isLatitude / isLongitude in src/control/content/utils/helpers.js).
 * @returns {{ pair?: {lat: number, lng: number}, error?: string }}
 */
const readCoordinates = (options, latName, lngName) => {
  const lat = options[latName];
  const lng = options[lngName];
  if (lat === undefined && lng === undefined) return {};
  if (lat === undefined || lng === undefined) return { error: `Pass ${latName} and ${lngName} together` };
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) return { error: `${latName} must be a number from -90 to 90` };
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) return { error: `${lngName} must be a number from -180 to 180` };
  return { pair: { lat, lng } };
};

/**
 * Applies every updateSettings param passed to the settings document, with the same rules the settings, design and content tabs apply. Left out skips; the two rich-text settings clear with null or ''.
 * @returns {{ error?: string }}
 */
const applySettingsChanges = (settings, options) => {
  const given = (name) => options[name] !== undefined;
  const known = [...Object.keys(BOOLEAN_SETTINGS), ...Object.keys(SELECT_SETTINGS), ...Object.keys(RICH_TEXT_SETTINGS), ...OTHER_SETTINGS];
  if (!known.some(given)) return { error: 'Pass at least one setting to change' };

  const booleanError = Object.keys(BOOLEAN_SETTINGS).find((name) => given(name) && typeof options[name] !== 'boolean');
  if (booleanError) return { error: `${booleanError} must be true or false` };
  const selectError = Object.keys(SELECT_SETTINGS).find((name) => given(name) && !SELECT_SETTINGS[name].values.includes(options[name]));
  if (selectError) return { error: `${selectError} must be one of: ${SELECT_SETTINGS[selectError].values.join(', ')}` };
  const richTextError = Object.keys(RICH_TEXT_SETTINGS).find((name) => given(name) && options[name] !== null && typeof options[name] !== 'string');
  if (richTextError) return { error: `${richTextError} must be text, null or an empty string` };

  const initialArea = readCoordinates(options, 'initialAreaLatitude', 'initialAreaLongitude');
  if (initialArea.error) return { error: initialArea.error };
  const introArea = readCoordinates(options, 'introAreaLatitude', 'introAreaLongitude');
  if (introArea.error) return { error: introArea.error };
  const addressError = ['initialAreaAddress', 'introAreaAddress'].find((name) => given(name) && (typeof options[name] !== 'string' || !options[name]));
  if (addressError) return { error: `${addressError} must be a non-empty address` };
  // Mirrors src/control/content/js/listView/introMap.js: the radius input is clamped to 1-200 miles.
  if (given('introAreaRadius') && (typeof options.introAreaRadius !== 'number' || !Number.isFinite(options.introAreaRadius) || options.introAreaRadius < 1 || options.introAreaRadius > 200)) {
    return { error: 'introAreaRadius must be a number of miles from 1 to 200' };
  }
  if (given('introImages')) {
    if (!Array.isArray(options.introImages)) return { error: 'introImages must be a list of carousel items' };
    if (options.introImages.some((item) => !isPlainObject(item) || typeof item.iconUrl !== 'string' || !item.iconUrl)) {
      return { error: 'introImages must hold carousel items, each with an iconUrl image' };
    }
  }

  Object.keys(BOOLEAN_SETTINGS).filter(given).forEach((name) => setPath(settings, BOOLEAN_SETTINGS[name], options[name]));
  Object.keys(SELECT_SETTINGS).filter(given).forEach((name) => setPath(settings, SELECT_SETTINGS[name].path, options[name]));
  Object.keys(RICH_TEXT_SETTINGS).filter(given).forEach((name) => setPath(settings, RICH_TEXT_SETTINGS[name], options[name]));

  // Mirrors handleDisableSortByNearest in src/control/settings/settings.js: without nearest-first sorting the default falls back to alphabetical, and distance cannot be picked.
  if (settings.sorting.allowSortByNearest === false) {
    if (options.defaultSorting === 'distance') return { error: 'defaultSorting cannot be distance while allowSortByNearest is off' };
    settings.sorting.defaultSorting = 'alphabetical';
  }
  // Mirrors src/control/settings/js/pages/locationSettings.js: switching a field off also takes away in-app access to it.
  if (options.enableOpenHours === false) {
    settings.globalEntries.openHours.inAppEnabled = 'none';
    settings.globalEntries.openHours.tags = [];
  }
  if (options.enablePriceRange === false) {
    settings.globalEntries.priceRange.inAppEnabled = 'none';
    settings.globalEntries.priceRange.tags = [];
  }
  // The charging radios are disabled while adding new locations is off.
  if (given('chargeForNewLocations') && options.chargeForNewLocations !== 'none'
    && settings.globalEntries.locations && settings.globalEntries.locations.allowAdding === 'none') {
    return { error: 'chargeForNewLocations needs adding new locations to be allowed first' };
  }

  if (initialArea.pair) settings.map.initialAreaCoordinates = initialArea.pair;
  if (given('initialAreaAddress')) settings.map.initialAreaDisplayAddress = options.initialAreaAddress;

  const searchOptions = settings.introductoryListView.searchOptions || {};
  settings.introductoryListView.searchOptions = searchOptions;
  const areaRadiusOptions = { ...(searchOptions.areaRadiusOptions || {}) };
  if (introArea.pair) {
    areaRadiusOptions.lat = introArea.pair.lat;
    areaRadiusOptions.lng = introArea.pair.lng;
  }
  if (given('introAreaAddress')) areaRadiusOptions.formattedLocation = options.introAreaAddress;
  if (given('introAreaRadius')) areaRadiusOptions.radius = options.introAreaRadius;
  searchOptions.areaRadiusOptions = areaRadiusOptions;

  // The carousel editor gives each item its own id; a passed list replaces the stored one.
  if (given('introImages')) settings.introductoryListView.images = options.introImages.map((item) => ({ ...item, id: generateUUID() }));
  return {};
};

// ---------------------------------------------------------------------------
// Location fields (settings.customFields)
// ---------------------------------------------------------------------------

const locationFieldResult = (field, section) => ({
  id: field.id,
  label: field.label,
  section,
  type: field.type,
  required: !!field.required,
  allowCustomLabel: !!field.enableCustomLabel
});

const allLocationFields = (settings) => [
  ...settings.customFields.quickActions.map((field, index) => ({ field, index, section: 'quickActions' })),
  ...settings.customFields.content.map((field, index) => ({ field, index, section: 'content' }))
];

const findLocationField = (settings, { label, fieldId }) => {
  const matches = allLocationFields(settings).filter(({ field }) => (fieldId ? field.id === fieldId : field.label === label));
  if (!matches.length) return { error: fieldId ? `No location field with id "${fieldId}"` : `No location field labeled "${label}"` };
  if (matches.length > 1) return { error: `${matches.length} location fields are labeled "${label}"` };
  return { match: matches[0] };
};

/**
 * Saves the location fields the way the Location Fields page does (updateCustomFieldsWithDeilay): fields without a label or type are dropped, the lists are written with $set, and the widget is told to refresh them. On an instance with nothing saved yet the whole document is saved instead, as the settings tab saves its defaults when it opens before any field can be added.
 */
const saveLocationFields = (settings, isNew, callback) => {
  const { customFields } = settings;
  const updatedCustomFields = {
    quickActions: customFields.quickActions.filter((item) => item.label && item.type),
    content: customFields.content.filter((item) => item.label && item.type)
  };
  const document = isNew ? { ...settings, customFields: updatedCustomFields } : { $set: { customFields: updatedCustomFields } };
  buildfire.datastore.save(document, SETTINGS_TAG, (err) => {
    if (err) return callback(err, undefined);
    notifyWidget('customFields');
    callback(null, updatedCustomFields);
  });
};

/**
 * The changes a location field update asks for. The label is required by the page (a field without one is dropped), so it can be changed but not cleared; the type must be one its section offers.
 * @returns {{ changes?: object, error?: string }}
 */
const collectLocationFieldChanges = (options, section) => {
  const changes = {};
  if (options.newLabel !== undefined) {
    if (typeof options.newLabel !== 'string' || !options.newLabel) return { error: 'newLabel cannot be removed; pass a non-empty label' };
    changes.label = options.newLabel;
  }
  if (options.newType !== undefined) {
    if (!LOCATION_FIELD_TYPES[section].includes(options.newType)) return { error: `newType must be one of: ${LOCATION_FIELD_TYPES[section].join(', ')}` };
    changes.type = options.newType;
  }
  if (options.required !== undefined) {
    if (typeof options.required !== 'boolean') return { error: 'required must be true or false' };
    changes.required = options.required;
  }
  if (options.allowCustomLabel !== undefined) {
    if (typeof options.allowCustomLabel !== 'boolean') return { error: 'allowCustomLabel must be true or false' };
    changes.enableCustomLabel = options.allowCustomLabel;
  }
  if (!Object.keys(changes).length) return { error: 'Pass at least one of newLabel, newType, required or allowCustomLabel' };
  return { changes };
};

const withLocationField = (handle, callback, then) => {
  readSettings((err, settings, isNew) => {
    if (err) return callback(err, undefined);
    const { match, error } = findLocationField(settings, handle);
    if (error) return callback(new Error(error), undefined);
    then(settings, isNew, match);
  });
};

const applyUpdateLocationField = (settings, isNew, match, options, callback) => {
  const { changes, error } = collectLocationFieldChanges(options, match.section);
  if (error) return callback(new Error(error), undefined);
  const updated = { ...match.field, ...changes };
  settings.customFields[match.section][match.index] = updated;
  saveLocationFields(settings, isNew, (err) => {
    if (err) return callback(err, undefined);
    callback(null, locationFieldResult(updated, match.section));
  });
};

const applyDeleteLocationField = (settings, isNew, match, callback) => {
  settings.customFields[match.section].splice(match.index, 1);
  saveLocationFields(settings, isNew, (err) => {
    if (err) return callback(err, undefined);
    callback(null, { id: match.field.id, label: match.field.label, section: match.section, deleted: true });
  });
};

const applyLocationFieldOrder = (settings, isNew, match, options, callback) => {
  const list = settings.customFields[match.section];
  if (!Number.isInteger(options.position) || options.position < 1 || options.position > list.length) {
    return callback(new Error(`position must be a whole number from 1 to ${list.length}`), undefined);
  }
  const [moved] = list.splice(match.index, 1);
  list.splice(options.position - 1, 0, moved);
  saveLocationFields(settings, isNew, (err) => {
    if (err) return callback(err, undefined);
    callback(null, { section: match.section, fields: list.map((field) => locationFieldResult(field, match.section)) });
  });
};

// ---------------------------------------------------------------------------
// Language strings (datastore "$bfLanguageSettings_en-us")
// ---------------------------------------------------------------------------

/**
 * The saved language record's data, read the way src/shared/strings.js refresh() does (a search with limit 1, because get has an edge-case bug there). Nothing saved yet reads as {}.
 */
const readSavedStrings = (callback) => {
  buildfire.datastore.search({ limit: 1 }, STRINGS_TAG, (err, records) => {
    if (err) return callback(err, undefined);
    callback(null, (records && records[0] && records[0].data) || {});
  });
};

const savedStringValue = (saved, key) => {
  const [section, label] = key.split('.');
  return saved[section] && saved[section][label] ? saved[section][label].value : undefined;
};

// Mirrors Strings.get in src/shared/strings.js: a saved value shows, an empty one only when the label is optional, else the default.
const shownStringValue = (key, value) => {
  const config = LANGUAGE_STRINGS[key];
  if (value || (value === '' && !config.required)) return value;
  return config.defaultValue || '';
};

// ---------------------------------------------------------------------------
// Locations (publicData "locations"), read only
// ---------------------------------------------------------------------------

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * One location as a caller sees it: what the app shows for it, with category and field names instead of ids. Read from the stored record with the same defaults the Location model applies.
 */
const locationResult = (record, categoriesById, settings) => {
  const data = record.data || {};
  const categories = data.categories || { main: [], subcategories: [] };
  const mainCategories = (categories.main || []).map((id) => categoriesById[id]).filter(Boolean);
  const subcategoryIds = categories.subcategories || [];
  const subcategoryTitles = [];
  mainCategories.forEach((category) => (category.subcategories || []).forEach((subcategory) => {
    if (subcategory && subcategoryIds.includes(subcategory.id)) subcategoryTitles.push(subcategory.title);
  }));
  const coordinates = data.coordinates || {};
  const marker = data.marker || { type: 'pin', image: null, color: null };
  const locationSettings = data.settings || {
    showCategory: true, showOpeningHours: false, showPriceRange: false, showStarRating: false
  };
  const days = (data.openingHours && data.openingHours.days) || {};
  const openingHours = {};
  DAYS.forEach((day) => {
    if (!days[day]) return;
    openingHours[day] = {
      isOpen: !!days[day].active,
      hours: (days[day].intervals || []).filter(Boolean).map((interval) => ({ from: toTimeOfDay(interval.from), to: toTimeOfDay(interval.to) }))
    };
  });
  const fieldsById = {};
  allLocationFields(settings).forEach(({ field }) => { fieldsById[field.id] = field; });
  const additionalFields = data.additionalFields || {};
  const customFields = [...(additionalFields.quickActions || []), ...(additionalFields.content || [])]
    .filter((value) => value && fieldsById[value.id])
    .map((value) => ({
      fieldId: value.id, label: fieldsById[value.id].label, value: value.value || null, customLabel: value.customLabel || null
    }));
  const price = data.price || { range: 1, currency: '$' };
  const rating = data.rating || { total: 0, count: 0, average: 0 };
  return {
    id: record.id,
    title: data.title || null,
    subtitle: data.subtitle || null,
    address: data.address || null,
    formattedAddress: data.formattedAddress || null,
    addressAlias: data.addressAlias || null,
    latitude: typeof coordinates.lat === 'number' ? coordinates.lat : null,
    longitude: typeof coordinates.lng === 'number' ? coordinates.lng : null,
    categories: mainCategories.map((category) => category.title),
    subcategories: subcategoryTitles,
    listImage: data.listImage || null,
    images: (data.images || []).map((image) => (image && image.imageUrl) || image).filter((url) => typeof url === 'string'),
    description: data.description || null,
    markerType: marker.type || 'pin',
    markerImage: marker.image || null,
    markerColor: (marker.color && marker.color.color) || null,
    showCategory: !!locationSettings.showCategory,
    showOpeningHours: !!locationSettings.showOpeningHours,
    showPriceRange: !!locationSettings.showPriceRange,
    showStarRating: !!locationSettings.showStarRating,
    openingHours,
    priceRange: typeof price.range === 'number' ? price.range : Number(price.range) || null,
    priceCurrency: price.currency || null,
    rating: { average: rating.average || 0, count: rating.count || 0 },
    pinPosition: data.pinIndex || null,
    actionItems: data.actionItems || [],
    customFields,
    views: Number.isNaN(parseInt(data.views, 10)) ? 0 : parseInt(data.views, 10),
    createdOn: data.createdOn || null,
    lastUpdatedOn: data.lastUpdatedOn || null
  };
};

/**
 * The location search, resolved once its category (if any) is known. Filters mirror the plugin's own index: exact titles in array1 as "title_<lowercase title>" (what the widget's search-engine fallback matches), free text in the text index (the control panel's search box), categories in array1 as "c_<id>", pinned locations by number1 1-3 (getPinnedLocation).
 */
const runLocationSearch = (options, categoryId, callback) => {
  const page = options.page === undefined ? 0 : options.page;
  const pageSize = options.pageSize === undefined ? 50 : options.pageSize;
  const conditions = [];
  if (options.title !== undefined) conditions.push({ '_buildfire.index.array1.string1': `title_${options.title.toLowerCase()}` });
  if (options.search !== undefined) conditions.push({ '_buildfire.index.text': { $regex: escapeRegex(options.search), $options: 'i' } });
  if (categoryId) conditions.push({ '_buildfire.index.array1.string1': `c_${categoryId}` });
  if (options.pinnedOnly === true) conditions.push({ '_buildfire.index.number1': { $in: [1, 2, 3] } });
  const searchOptions = {
    filter: conditions.length ? { $and: conditions } : {},
    sort: options.pinnedOnly === true ? { '_buildfire.index.number1': 1 } : { '_buildfire.index.string1': 1 },
    page,
    pageSize,
    recordCount: true
  };
  buildfire.publicData.search(searchOptions, LOCATIONS_TAG, (err, response) => {
    if (err) return callback(err, undefined);
    const records = ((response && response.result) || []).filter((record) => record && record.data);
    const total = (response && response.totalRecord) || 0;
    fetchAllCategories((categoriesErr, categories) => {
      if (categoriesErr) return callback(categoriesErr, undefined);
      const categoriesById = {};
      categories.forEach((category) => { categoriesById[category.id] = category.data; });
      readSettings((settingsErr, settings) => {
        if (settingsErr) return callback(settingsErr, undefined);
        callback(null, {
          locations: records.map((record) => locationResult(record, categoriesById, settings)),
          total,
          page,
          hasMore: (page + 1) * pageSize < total
        });
      });
    });
  });
};

widgetContract = {
  /**
   * Bind this contract to a plugin instance. Called by the consumer; resolves the iframe window that widget/control-hosted operations are proxied into.
   * @param {string} instanceId - the plugin instance to contract with.
   */
  init(instanceId) {
    buildfire.services.contract.use({ instanceId }, (err, data) => {
      if (err) return console.error('Failed to initialize Locations contract', err);
      frameId = data.fid;
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Lists locations the way the plugin finds them, with every optional filter the plugin's own lists use (exact title, free text, category, pinned), alphabetically or in pin order, a page at a time. Uses only buildfire.publicData and buildfire.datastore reads, which behave the same in both frames and on the server; nothing about it needs to be watched, so Background in both frames. A function rather than a declarative search because the category is named by its title (resolved first) and the result turns category, subcategory and location field ids into the names the app shows (two more reads). The free text is escaped before it goes into the regex, where the control panel passes it raw: a caller's text is matched literally.
   * @param {{ title?: string, search?: string, category?: string, pinnedOnly?: boolean, page?: number, pageSize?: number }} options
   * @param {function(Error=, object=)} callback - (error, { locations, total, page, hasMore })
   */
  searchLocations(options, callback) {
    if (!requireOptions(options, callback)) return;
    options = options || {};
    const textError = ['title', 'search', 'category'].find((name) => options[name] !== undefined && (typeof options[name] !== 'string' || !options[name]));
    if (textError) return callback(new Error(`${textError} must be non-empty text`), undefined);
    if (options.pinnedOnly !== undefined && typeof options.pinnedOnly !== 'boolean') return callback(new Error('pinnedOnly must be true or false'), undefined);
    if (options.page !== undefined && (!Number.isInteger(options.page) || options.page < 0)) return callback(new Error('page must be a whole number from 0'), undefined);
    // The platform returns at most 50 records a page, which is also the widget's own page size.
    if (options.pageSize !== undefined && (!Number.isInteger(options.pageSize) || options.pageSize < 1 || options.pageSize > 50)) {
      return callback(new Error('pageSize must be a whole number from 1 to 50'), undefined);
    }
    if (options.category === undefined) return runLocationSearch(options, null, callback);
    resolveCategory(options.category, (err, category) => {
      if (err) return callback(err, undefined);
      runLocationSearch(options, category.id, callback);
    });
  },

  /**
   * hosts: controlBackground. Adds a category the way the control panel's Categories page does, with its "Category Selected" analytics event registered. Background: it changes the owner's content and contacts no one. No widget host: only the control panel manages categories, and app users must not change them. Kept off the server (excluded from the MCP) for a mechanical reason: buildfire.analytics, which registers the category's analytics event, only exists in the frames, and without it the category's selections would never show in the plugin's reports.
   * @param {{ title: string, icon?: string[], iconName?: string }} options
   * @param {function(Error=, object=)} callback - (error, the new category)
   */
  createCategory(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    const error = validateNewCategory(options);
    if (error) return callback(new Error(error), undefined);
    applyCreateCategory(options, callback);
  },

  /**
   * hosts: controlBackground. usage: advanced (batches are never basic). The batch form of createCategory: validates every entry with createCategory's own checks before adding any, then adds each through applyCreateCategory, so each gets its analytics event. Same hosts as createCategory, for the same reasons.
   * @param {{ categories: Array<{ title: string, icon?: string[], iconName?: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  createCategoriesAdvanced(options, callback) {
    runBatch(options, 'categories', {
      validate: validateNewCategory,
      apply: (target, entry, done) => applyCreateCategory(entry, done),
      idOf: (result) => result.id
    }, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. Changes a category, named by its exact title, the way the control panel's category form and icon picker do. Uses only buildfire.publicData (and messaging, skipped on the server), so it runs the same in the control panel and on the server; Background: it changes content and contacts no one. No widget host: only the control panel manages categories. Resolving the title is a search, which is why this is a function. usage: basic; its advanced alternative is updateCategoryAdvanced.
   * @param {{ title: string, newTitle?: string, newIcon?: string[], newIconName?: string }} options
   * @param {function(Error=, object=)} callback - (error, the category as saved)
   */
  updateCategory(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    const { error } = collectIconTitleChanges(options);
    if (error) return callback(new Error(error), undefined);
    resolveCategory(options.title, (err, category) => {
      if (err) return callback(err, undefined);
      applyUpdateCategory(category, options, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateCategory, taking the category's id. Same hosts, checks and effect through applyUpdateCategory; it checks the id exists (and is not deleted) instead of searching.
   * @param {{ categoryId: string, newTitle?: string, newIcon?: string[], newIconName?: string }} options
   * @param {function(Error=, object=)} callback - (error, the category as saved)
   */
  updateCategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId'], callback)) return;
    const { error } = collectIconTitleChanges(options);
    if (error) return callback(new Error(error), undefined);
    requireCategoryById(options.categoryId, (err, category) => {
      if (err) return callback(err, undefined);
      applyUpdateCategory(category, options, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced (batches are never basic). The batch form of updateCategoryAdvanced: validates every entry and checks every id before writing, then applies each through applyUpdateCategory.
   * @param {{ categories: Array<{ categoryId: string, newTitle?: string, newIcon?: string[], newIconName?: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  updateCategoriesAdvanced(options, callback) {
    runBatch(options, 'categories', {
      validate: (entry) => ((typeof entry.categoryId !== 'string' || !entry.categoryId) ? 'Missing required parameter: categoryId' : collectIconTitleChanges(entry).error || null),
      idKey: 'categoryId',
      resolve: (entry, done) => requireCategoryById(entry.categoryId, done),
      apply: applyUpdateCategory,
      idOf: (result) => result.id
    }, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. Removes a category, named by its exact title, the way the control panel does: a soft delete that keeps the record with deletedOn set, so the plugin stops listing it; there is no way back in the plugin, hence dangerous. Uses only buildfire.publicData, so it also runs on the server; Background. No widget host: only the control panel manages categories. usage: basic; its advanced alternative is deleteCategoryAdvanced.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, title, deleted })
   */
  deleteCategory(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    resolveCategory(options.title, (err, category) => {
      if (err) return callback(err, undefined);
      applyDeleteCategory(category, options, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of deleteCategory, taking the category's id, checked to exist first.
   * @param {{ categoryId: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, title, deleted })
   */
  deleteCategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId'], callback)) return;
    requireCategoryById(options.categoryId, (err, category) => {
      if (err) return callback(err, undefined);
      applyDeleteCategory(category, options, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced (batches are never basic). The batch form of deleteCategoryAdvanced: checks every id before removing any, then removes each through applyDeleteCategory.
   * @param {{ categories: Array<{ categoryId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  deleteCategoriesAdvanced(options, callback) {
    runBatch(options, 'categories', {
      validate: (entry) => ((typeof entry.categoryId !== 'string' || !entry.categoryId) ? 'Missing required parameter: categoryId' : null),
      idKey: 'categoryId',
      resolve: (entry, done) => requireCategoryById(entry.categoryId, done),
      apply: applyDeleteCategory,
      idOf: (result) => result.id
    }, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. Adds a subcategory to a category named by its exact title, the way the category form's add-subcategory dialog does, then saves the category as the form's Save does. Uses only buildfire.publicData, so it also runs on the server; Background. No widget host: only the control panel manages categories. usage: basic; its advanced alternative is createSubcategoryAdvanced. Subcategories live inside their category's record, so they have no batch operation of their own.
   * @param {{ categoryTitle: string, title: string }} options
   * @param {function(Error=, object=)} callback - (error, the new subcategory)
   */
  createSubcategory(options, callback) {
    if (!requireStringParams(options, ['categoryTitle', 'title'], callback)) return;
    resolveCategory(options.categoryTitle, (err, category) => {
      if (err) return callback(err, undefined);
      applyCreateSubcategory(category, options, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of createSubcategory, taking the category's id, checked to exist first.
   * @param {{ categoryId: string, title: string }} options
   * @param {function(Error=, object=)} callback - (error, the new subcategory)
   */
  createSubcategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId', 'title'], callback)) return;
    requireCategoryById(options.categoryId, (err, category) => {
      if (err) return callback(err, undefined);
      applyCreateSubcategory(category, options, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Renames a subcategory or changes its icon, naming it and its category by their exact titles, the way the category form's subcategory list does. Same hosts and reasons as createSubcategory. usage: basic; its advanced alternative is updateSubcategoryAdvanced.
   * @param {{ categoryTitle: string, title: string, newTitle?: string, newIcon?: string[], newIconName?: string }} options
   * @param {function(Error=, object=)} callback - (error, the subcategory as saved)
   */
  updateSubcategory(options, callback) {
    if (!requireStringParams(options, ['categoryTitle', 'title'], callback)) return;
    const { error } = collectIconTitleChanges(options);
    if (error) return callback(new Error(error), undefined);
    resolveCategory(options.categoryTitle, (err, category) => {
      if (err) return callback(err, undefined);
      const found = findSubcategoryByTitle(category, options.title);
      if (found.error) return callback(new Error(found.error), undefined);
      applyUpdateSubcategory(category, found.index, options, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateSubcategory, taking the category's and the subcategory's ids, both checked to exist first.
   * @param {{ categoryId: string, subcategoryId: string, newTitle?: string, newIcon?: string[], newIconName?: string }} options
   * @param {function(Error=, object=)} callback - (error, the subcategory as saved)
   */
  updateSubcategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId', 'subcategoryId'], callback)) return;
    const { error } = collectIconTitleChanges(options);
    if (error) return callback(new Error(error), undefined);
    requireCategoryById(options.categoryId, (err, category) => {
      if (err) return callback(err, undefined);
      const found = findSubcategoryById(category, options.subcategoryId);
      if (found.error) return callback(new Error(found.error), undefined);
      applyUpdateSubcategory(category, found.index, options, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Removes a subcategory from its category, naming both by their exact titles, the way the category form's delete does; the subcategory is gone for good, hence dangerous. Same hosts and reasons as createSubcategory. usage: basic; its advanced alternative is deleteSubcategoryAdvanced.
   * @param {{ categoryTitle: string, title: string }} options
   * @param {function(Error=, object=)} callback - (error, { categoryId, id, title, deleted })
   */
  deleteSubcategory(options, callback) {
    if (!requireStringParams(options, ['categoryTitle', 'title'], callback)) return;
    resolveCategory(options.categoryTitle, (err, category) => {
      if (err) return callback(err, undefined);
      const found = findSubcategoryByTitle(category, options.title);
      if (found.error) return callback(new Error(found.error), undefined);
      applyDeleteSubcategory(category, found.index, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of deleteSubcategory, taking the category's and the subcategory's ids, both checked to exist first.
   * @param {{ categoryId: string, subcategoryId: string }} options
   * @param {function(Error=, object=)} callback - (error, { categoryId, id, title, deleted })
   */
  deleteSubcategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId', 'subcategoryId'], callback)) return;
    requireCategoryById(options.categoryId, (err, category) => {
      if (err) return callback(err, undefined);
      const found = findSubcategoryById(category, options.subcategoryId);
      if (found.error) return callback(new Error(found.error), undefined);
      applyDeleteSubcategory(category, found.index, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Moves a subcategory to a new place in its category's list, naming both by their exact titles, the way the category form's drag-to-reorder does. Same hosts and reasons as createSubcategory. usage: basic; its advanced alternative is updateSubcategoryOrderAdvanced.
   * @param {{ categoryTitle: string, title: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, { categoryId, subcategories })
   */
  updateSubcategoryOrder(options, callback) {
    if (!requireStringParams(options, ['categoryTitle', 'title'], callback)) return;
    if (!Number.isInteger(options.position) || options.position < 1) return callback(new Error('position must be a whole number from 1'), undefined);
    resolveCategory(options.categoryTitle, (err, category) => {
      if (err) return callback(err, undefined);
      const found = findSubcategoryByTitle(category, options.title);
      if (found.error) return callback(new Error(found.error), undefined);
      applySubcategoryOrder(category, found.index, options, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateSubcategoryOrder, taking the category's and the subcategory's ids, both checked to exist first.
   * @param {{ categoryId: string, subcategoryId: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, { categoryId, subcategories })
   */
  updateSubcategoryOrderAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId', 'subcategoryId'], callback)) return;
    if (!Number.isInteger(options.position) || options.position < 1) return callback(new Error('position must be a whole number from 1'), undefined);
    requireCategoryById(options.categoryId, (err, category) => {
      if (err) return callback(err, undefined);
      const found = findSubcategoryById(category, options.subcategoryId);
      if (found.error) return callback(new Error(found.error), undefined);
      applySubcategoryOrder(category, found.index, options, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Adds a location field the way the Location Fields page's add buttons do (a new id, everyone can see it), with up to 10 fields in total. Uses only buildfire.datastore (and messaging, skipped on the server), so it also runs on the server; Background: it changes the owner's configuration. No widget host: app users must not change the owner's configuration (and the widget cannot write the datastore). Who can see a field (its tags) is an access setting and stays in the control panel. Fields live inside the settings record, so they have no batch operation of their own.
   * @param {{ label: string, section: string, type?: string, required?: boolean, allowCustomLabel?: boolean }} options
   * @param {function(Error=, object=)} callback - (error, the new field)
   */
  createLocationField(options, callback) {
    if (!requireStringParams(options, ['label'], callback)) return;
    if (!Object.keys(LOCATION_FIELD_TYPES).includes(options.section)) return callback(new Error('section must be one of: quickActions, content'), undefined);
    // The page adds a new field as an email field until another type is picked.
    const type = options.type === undefined ? 'EMAIL' : options.type;
    if (!LOCATION_FIELD_TYPES[options.section].includes(type)) return callback(new Error(`type must be one of: ${LOCATION_FIELD_TYPES[options.section].join(', ')}`), undefined);
    const flagError = ['required', 'allowCustomLabel'].find((name) => options[name] !== undefined && typeof options[name] !== 'boolean');
    if (flagError) return callback(new Error(`${flagError} must be true or false`), undefined);
    readSettings((err, settings, isNew) => {
      if (err) return callback(err, undefined);
      if (allLocationFields(settings).length >= MAX_LOCATION_FIELDS) return callback(new Error(`There are already ${MAX_LOCATION_FIELDS} location fields, the most allowed`), undefined);
      const field = {
        id: generateUUID(),
        label: options.label,
        type,
        required: options.required === true,
        enableCustomLabel: options.allowCustomLabel === true,
        visibility: { value: 'ALL', tags: [] }
      };
      settings.customFields[options.section].push(field);
      saveLocationFields(settings, isNew, (saveErr) => {
        if (saveErr) return callback(saveErr, undefined);
        callback(null, locationFieldResult(field, options.section));
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Changes a location field, named by its exact label, the way the Location Fields page's row does. Same hosts and reasons as createLocationField. usage: basic; its advanced alternative is updateLocationFieldAdvanced.
   * @param {{ label: string, newLabel?: string, newType?: string, required?: boolean, allowCustomLabel?: boolean }} options
   * @param {function(Error=, object=)} callback - (error, the field as saved)
   */
  updateLocationField(options, callback) {
    if (!requireStringParams(options, ['label'], callback)) return;
    if (!['newLabel', 'newType', 'required', 'allowCustomLabel'].some((name) => options[name] !== undefined)) {
      return callback(new Error('Pass at least one of newLabel, newType, required or allowCustomLabel'), undefined);
    }
    withLocationField({ label: options.label }, callback, (settings, isNew, match) => applyUpdateLocationField(settings, isNew, match, options, callback));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateLocationField, taking the field's id, checked to exist first.
   * @param {{ fieldId: string, newLabel?: string, newType?: string, required?: boolean, allowCustomLabel?: boolean }} options
   * @param {function(Error=, object=)} callback - (error, the field as saved)
   */
  updateLocationFieldAdvanced(options, callback) {
    if (!requireStringParams(options, ['fieldId'], callback)) return;
    if (!['newLabel', 'newType', 'required', 'allowCustomLabel'].some((name) => options[name] !== undefined)) {
      return callback(new Error('Pass at least one of newLabel, newType, required or allowCustomLabel'), undefined);
    }
    withLocationField({ fieldId: options.fieldId }, callback, (settings, isNew, match) => applyUpdateLocationField(settings, isNew, match, options, callback));
  },

  /**
   * hosts: controlBackground, headlessSdk. Removes a location field, named by its exact label, the way the Location Fields page's delete does; values locations held for it no longer show, hence dangerous. Same hosts and reasons as createLocationField. usage: basic; its advanced alternative is deleteLocationFieldAdvanced.
   * @param {{ label: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, label, section, deleted })
   */
  deleteLocationField(options, callback) {
    if (!requireStringParams(options, ['label'], callback)) return;
    withLocationField({ label: options.label }, callback, (settings, isNew, match) => applyDeleteLocationField(settings, isNew, match, callback));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of deleteLocationField, taking the field's id, checked to exist first.
   * @param {{ fieldId: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, label, section, deleted })
   */
  deleteLocationFieldAdvanced(options, callback) {
    if (!requireStringParams(options, ['fieldId'], callback)) return;
    withLocationField({ fieldId: options.fieldId }, callback, (settings, isNew, match) => applyDeleteLocationField(settings, isNew, match, callback));
  },

  /**
   * hosts: controlBackground, headlessSdk. Moves a location field, named by its exact label, to a new place within its own section, the way the Location Fields page's drag-to-reorder does. Same hosts and reasons as createLocationField. usage: basic; its advanced alternative is updateLocationFieldOrderAdvanced.
   * @param {{ label: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, { section, fields })
   */
  updateLocationFieldOrder(options, callback) {
    if (!requireStringParams(options, ['label'], callback)) return;
    if (!Number.isInteger(options.position) || options.position < 1) return callback(new Error('position must be a whole number from 1'), undefined);
    withLocationField({ label: options.label }, callback, (settings, isNew, match) => applyLocationFieldOrder(settings, isNew, match, options, callback));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateLocationFieldOrder, taking the field's id, checked to exist first.
   * @param {{ fieldId: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, { section, fields })
   */
  updateLocationFieldOrderAdvanced(options, callback) {
    if (!requireStringParams(options, ['fieldId'], callback)) return;
    if (!Number.isInteger(options.position) || options.position < 1) return callback(new Error('position must be a whole number from 1'), undefined);
    withLocationField({ fieldId: options.fieldId }, callback, (settings, isNew, match) => applyLocationFieldOrder(settings, isNew, match, options, callback));
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. The plugin's settings as its pages load them (Settings.get, without the control panel's first-load save): defaults for anything never saved, older records migrated. Uses only a buildfire.datastore read, which works in both frames and on the server; Background in both frames.
   * @param {object} options - no parameters
   * @param {function(Error=, object=)} callback - (error, settings)
   */
  getSettings(options, callback) {
    if (!requireOptions(options, callback)) return;
    readSettings((err, settings) => {
      if (err) return callback(err, undefined);
      callback(null, settingsResult(settings));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Changes the owner's settings the way the Settings, Design and Content (introduction screen) tabs do: only the settings passed change, the rest keep their stored value. The tabs save the whole document with datastore.save (stamped lastUpdatedOn / lastUpdatedBy), so this reads it (with the defaults the tabs save when they first open, on an instance that has none), applies the same rules the tabs apply, saves it through the same call, then tells the widget to reload its settings (one 'settings' sync, which reloads the widget, where each tab sends its own scope). Uses only buildfire.datastore (and messaging, skipped on the server), so it also runs on the server. No widget host: app users must not change the owner's configuration (and the widget cannot write the datastore). Background: it changes configuration and contacts no one. Left out on purpose: who can add locations or photos, who can set hours or prices, who is charged by tag, global and per-location editors, the editors' notification permission and field visibility tags (permission and access settings), and the subscription options (they are picked from the app's in-app purchases, which the contract frames do not load).
   * @param {object} options - any of the settings declared in plugin.contract.json
   * @param {function(Error=, object=)} callback - (error, settings as saved)
   */
  updateSettings(options, callback) {
    if (!requireOptions(options, callback)) return;
    options = options || {};
    readSettings((err, settings) => {
      if (err) return callback(err, undefined);
      const { error } = applySettingsChanges(settings, options);
      if (error) return callback(new Error(error), undefined);
      withCurrentUser((user) => {
        settings.lastUpdatedOn = new Date();
        settings.lastUpdatedBy = user;
        buildfire.datastore.save(settings, SETTINGS_TAG, (saveErr) => {
          if (saveErr) return callback(saveErr, undefined);
          notifyWidget('settings');
          callback(null, settingsResult(settings));
        });
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Every text label the Language tab lets the owner change, with what the app shows for it now. Uses only a buildfire.datastore read, which works in both frames and on the server; Background in both frames.
   * @param {object} options - no parameters
   * @param {function(Error=, object=)} callback - (error, { strings })
   */
  getLanguageStrings(options, callback) {
    if (!requireOptions(options, callback)) return;
    readSavedStrings((err, saved) => {
      if (err) return callback(err, undefined);
      callback(null, {
        strings: Object.keys(LANGUAGE_STRINGS).map((key) => ({
          key,
          title: LANGUAGE_STRINGS[key].title,
          value: shownStringValue(key, savedStringValue(saved, key)),
          defaultValue: LANGUAGE_STRINGS[key].defaultValue
        }))
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Changes one text label the way the Language tab does: the label must exist, stay within its length limit, and a required label cannot be left empty; null clears the saved text so the default shows again (the tab never stores null, but Strings.get treats it as unset). Saved like Strings.save: the whole language record (every label's default, required and placeholder flags, plus saved values) through datastore.save, then the widget told to reload its strings. Uses only buildfire.datastore (and messaging, skipped on the server), so it also runs on the server. No widget host: app users must not change the owner's texts (and the widget cannot write the datastore). Background. A single document, so there is no batch operation.
   * @param {{ key: string, value: string|null }} options
   * @param {function(Error=, object=)} callback - (error, { key, value, defaultValue })
   */
  updateLanguageString(options, callback) {
    if (!requireStringParams(options, ['key'], callback)) return;
    const config = LANGUAGE_STRINGS[options.key];
    if (!config) return callback(new Error(`key must be one of the labels the Language tab offers; "${options.key}" is not one`), undefined);
    const { value } = options;
    if (value === undefined) return callback(new Error('Missing required parameter: value'), undefined);
    if (value !== null && typeof value !== 'string') return callback(new Error('value must be text or null'), undefined);
    if (value === '' && config.required) return callback(new Error(`value cannot be empty: "${options.key}" is required`), undefined);
    if (typeof value === 'string' && value.length > config.maxLength) return callback(new Error(`value must be at most ${config.maxLength} characters for "${options.key}"`), undefined);
    readSavedStrings((err, saved) => {
      if (err) return callback(err, undefined);
      // Mirrors the Strings constructor and refresh(): every configured label with its flags, then whatever was saved.
      const data = {};
      Object.keys(LANGUAGE_STRINGS).forEach((key) => {
        const [section, label] = key.split('.');
        if (!data[section]) data[section] = {};
        data[section][label] = { defaultValue: LANGUAGE_STRINGS[key].defaultValue, required: LANGUAGE_STRINGS[key].required, isPlaceHolder: LANGUAGE_STRINGS[key].isPlaceHolder };
      });
      Object.keys(saved).forEach((section) => {
        if (!isPlainObject(saved[section])) return;
        if (!data[section]) data[section] = {};
        Object.keys(saved[section]).forEach((label) => {
          if (!data[section][label]) data[section][label] = {};
          if (isPlainObject(saved[section][label])) data[section][label].value = saved[section][label].value;
        });
      });
      const [section, label] = options.key.split('.');
      data[section][label].value = value;
      buildfire.datastore.save(data, STRINGS_TAG, (saveErr) => {
        if (saveErr) return callback(saveErr, undefined);
        notifyWidget('strings');
        callback(null, { key: options.key, value: shownStringValue(options.key, value), defaultValue: config.defaultValue });
      });
    });
  }
};

/**
 * What the control panel's frame (control/contract.html) dispatches to: init plus every function whose hosts include controlForeground or controlBackground, in plugin.contract.json order. The implementations are widgetContract's own.
 */
controlContract = {
  init: widgetContract.init,
  searchLocations: widgetContract.searchLocations,
  createCategory: widgetContract.createCategory,
  createCategoriesAdvanced: widgetContract.createCategoriesAdvanced,
  updateCategory: widgetContract.updateCategory,
  updateCategoryAdvanced: widgetContract.updateCategoryAdvanced,
  updateCategoriesAdvanced: widgetContract.updateCategoriesAdvanced,
  deleteCategory: widgetContract.deleteCategory,
  deleteCategoryAdvanced: widgetContract.deleteCategoryAdvanced,
  deleteCategoriesAdvanced: widgetContract.deleteCategoriesAdvanced,
  createSubcategory: widgetContract.createSubcategory,
  createSubcategoryAdvanced: widgetContract.createSubcategoryAdvanced,
  updateSubcategory: widgetContract.updateSubcategory,
  updateSubcategoryAdvanced: widgetContract.updateSubcategoryAdvanced,
  deleteSubcategory: widgetContract.deleteSubcategory,
  deleteSubcategoryAdvanced: widgetContract.deleteSubcategoryAdvanced,
  updateSubcategoryOrder: widgetContract.updateSubcategoryOrder,
  updateSubcategoryOrderAdvanced: widgetContract.updateSubcategoryOrderAdvanced,
  createLocationField: widgetContract.createLocationField,
  updateLocationField: widgetContract.updateLocationField,
  updateLocationFieldAdvanced: widgetContract.updateLocationFieldAdvanced,
  deleteLocationField: widgetContract.deleteLocationField,
  deleteLocationFieldAdvanced: widgetContract.deleteLocationFieldAdvanced,
  updateLocationFieldOrder: widgetContract.updateLocationFieldOrder,
  updateLocationFieldOrderAdvanced: widgetContract.updateLocationFieldOrderAdvanced,
  getSettings: widgetContract.getSettings,
  updateSettings: widgetContract.updateSettings,
  getLanguageStrings: widgetContract.getLanguageStrings,
  updateLanguageString: widgetContract.updateLanguageString
};
