/* eslint-disable no-undef */
/* eslint-disable max-len */
/**
 * Locations contract — runtime implementation.
 *
 * This file only implements the operations declared with "type": "function" in plugin.contract.json. Operations typed publicData / datastore / userData / appData / firebase are declarative: their platform call is built on the fly from context.query, so they intentionally have no counterpart here (searchCategories is one).
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
 * Side effects the plugin's own save paths make next to every write are made here too: deep link registration (utils/deeplink.js), the search engine entry (widget/js/global/repository/searchEngine.js), analytics event registration (utils/analytics.js), the refresh message to the widget, and the contract events. The plugin fires the deep link, analytics and refresh calls without waiting for them, and so does this file; the search engine service is only loaded where the plugin's own pages load it (its script is not part of a contract frame or the server), so its entry is kept in step where the service exists and skipped elsewhere — it only feeds the widget's fallback title suggestions, never the locations themselves.
 */

// Must match the collection names in plugin.contract.json and the plugin's repositories (widget/js/global/repository).
const LOCATIONS_TAG = 'locations';
const CATEGORIES_TAG = 'categories';
const SETTINGS_TAG = 'settings';
// Mirrors shared/strings.js: `$bfLanguageSettings_${language}`, with the only language the plugin loads (control/strings/strings.js).
const LANGUAGE_TAG = '$bfLanguageSettings_en-us';

const PAGE_SIZE = 50; // the platform returns at most 50 records a search
const BATCH_LIMIT = 50;
const MAX_LOCATION_FIELDS = 10; // control/settings/js/pages/locationFields.js disables adding at 10
const MAX_PINNED = 3; // control/content/js/locations/index.js: "of 3 Pinned"
const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const FIELD_GROUPS = ['quickActions', 'content'];
// widget/js/global/constants: QuickActionsOptions and ContentOptions.
const FIELD_TYPES = {
  quickActions: ['EMAIL', 'PHONE', 'URL'],
  content: ['EMAIL', 'PHONE', 'URL', 'TEXT', 'RICH_TEXT']
};
// control/content/js/locations/index.js state.defaultCircleMarkerColor
const DEFAULT_CIRCLE_MARKER_COLOR = {
  backgroundCSS: 'background: rgba(253,35,5,1)',
  color: 'rgba(253,35,5,1)',
  colorCSS: 'color: rgba(253,35,5,1)',
  colorHex: '#fd2305',
  opacity: '100'
};

// Mirrors shared/stringsConfig.js: every text the language tab edits, with its default, whether it is required, and its longest length.
const LANGUAGE_TEXTS = {
  general: {
    title: "General",
    labels: {
      search: { title: 'Search', defaultValue: 'Search', required: false, isPlaceHolder: true, maxLength: 25 },
      price: { title: 'Price', defaultValue: 'Price', required: true, isPlaceHolder: false, maxLength: 10 },
      currency: { title: 'Currency', defaultValue: 'Currency', required: true, isPlaceHolder: false, maxLength: 10 },
      reset: { title: 'Reset', defaultValue: 'Reset', required: true, isPlaceHolder: false, maxLength: 10 },
      notAvailable: { title: 'N/A', defaultValue: 'N/A', required: false, isPlaceHolder: false, maxLength: 10 },
      open: { title: 'Open', defaultValue: 'Open', required: true, isPlaceHolder: false, maxLength: 8 },
      closed: { title: 'Closed', defaultValue: 'Closed', required: true, isPlaceHolder: false, maxLength: 8 },
      bookmark: { title: 'Bookmark', defaultValue: 'Bookmark', required: true, isPlaceHolder: false, maxLength: 9 },
      bookmarks: { title: 'Bookmarks', defaultValue: 'Bookmarks', required: true, isPlaceHolder: false, maxLength: 12 },
      bookmarkResults: { title: 'Bookmark Results', defaultValue: 'Bookmark Results', required: false, isPlaceHolder: false, maxLength: 16 },
      enterBookmarkTitleHere: { title: 'Enter bookmark title here', defaultValue: 'Enter bookmark title here', required: false, isPlaceHolder: false, maxLength: 50 },
      rateThisLocation: { title: 'Rate This Location', defaultValue: 'Rate This Location', required: true, isPlaceHolder: false, maxLength: 40 },
      findWithinThisArea: { title: 'Find Within This Area', defaultValue: 'Find within this area', required: true, isPlaceHolder: false, maxLength: 25 },
      findMore: { title: 'Find More', defaultValue: 'Find More', required: true, isPlaceHolder: false, maxLength: 20 },
      nearYou: { title: 'Near You', defaultValue: 'Near You', required: true, isPlaceHolder: false, maxLength: 40 },
      otherLocations: { title: 'Other Locations', defaultValue: 'Other Locations', required: true, isPlaceHolder: false, maxLength: 40 },
      distanceUnitKm: { title: 'KM', defaultValue: 'KM', required: true, isPlaceHolder: false, maxLength: 2 },
      distanceUnitMi: { title: 'mi', defaultValue: 'mi', required: true, isPlaceHolder: false, maxLength: 2 },
      distanceUnitFt: { title: 'ft', defaultValue: 'ft', required: true, isPlaceHolder: false, maxLength: 2 },
      openHours: { title: 'Open Hours', defaultValue: 'Open Hours', required: false, isPlaceHolder: false, maxLength: 25 },
      monday: { title: 'Monday', defaultValue: 'Monday', required: true, isPlaceHolder: false, maxLength: 25 },
      sunday: { title: 'Sunday', defaultValue: 'Sunday', required: true, isPlaceHolder: false, maxLength: 25 },
      tuesday: { title: 'Tuesday', defaultValue: 'Tuesday', required: true, isPlaceHolder: false, maxLength: 25 },
      wednesday: { title: 'Wednesday', defaultValue: 'Wednesday', required: true, isPlaceHolder: false, maxLength: 25 },
      thursday: { title: 'Thursday', defaultValue: 'Thursday', required: true, isPlaceHolder: false, maxLength: 25 },
      friday: { title: 'Friday', defaultValue: 'Friday', required: true, isPlaceHolder: false, maxLength: 25 },
      saturday: { title: 'Saturday', defaultValue: 'Saturday', required: true, isPlaceHolder: false, maxLength: 25 },
      follow: { title: 'Follow', defaultValue: 'follow', required: true, isPlaceHolder: false, maxLength: 25 },
      following: { title: 'Following', defaultValue: 'Following', required: true, isPlaceHolder: false, maxLength: 25 },
      purchaseSuccessful: { title: 'Purchase Successful', defaultValue: 'Congratulations! You can add a location now.', required: true, isPlaceHolder: false, maxLength: 50 },
      purchaseCancelled: { title: 'Purchase Cancelled', defaultValue: 'Purchase cancelled. No charges were made.', required: true, isPlaceHolder: false, maxLength: 50 },
      genericError: { title: 'Generic Error', defaultValue: 'Something went wrong. Please try again.', required: true, isPlaceHolder: false, maxLength: 50 },
      pwaUnsupported: { title: 'PWA Unsupported', defaultValue: 'Subscriptions are not supported on PWA. Please use the mobile app to add a new location.', required: true, isPlaceHolder: false, maxLength: 100 },
      appStoreNotAccessible: { title: 'App Store Not Accessible', defaultValue: 'App store is not accessible.', required: true, isPlaceHolder: false, maxLength: 50 },
      promotionalOffersNotSupported: { title: 'Promotional Offers Not Supported', defaultValue: 'Promotional offers are not supported', required: true, isPlaceHolder: false, maxLength: 50 },
      noSubscriptionsFound: { title: 'No Subscriptions Found', defaultValue: 'No subscriptions were found', required: true, isPlaceHolder: false, maxLength: 50 }
    }
  },
  sortingOptions: {
    title: "Sorting Options",
    labels: {
      alphabeticalAsc: { title: 'Title (A-Z)', defaultValue: 'Title (A-Z)', required: true, isPlaceHolder: false, maxLength: 12 },
      alphabeticalDsc: { title: 'Title (Z-A)', defaultValue: 'Title (Z-A)', required: true, isPlaceHolder: false, maxLength: 12 },
      distance: { title: 'Distance', defaultValue: 'Distance', required: true, isPlaceHolder: false, maxLength: 12 },
      recommended: { title: 'Recommended', defaultValue: 'Recommended', required: true, isPlaceHolder: false, maxLength: 12 },
      priceDsc: { title: '$$$ - $', defaultValue: '$$$ - $', required: true, isPlaceHolder: false, maxLength: 12 },
      priceAsc: { title: '$ - $$$', defaultValue: '$ - $$$', required: true, isPlaceHolder: false, maxLength: 12 },
      recent: { title: 'Recent', defaultValue: 'Recent', required: true, isPlaceHolder: false, maxLength: 12 },
      mostViewed: { title: 'Most Viewed', defaultValue: 'Most Viewed', required: true, isPlaceHolder: false, maxLength: 12 }
    }
  },
  locationEditing: {
    title: "Location Creating/Editing",
    labels: {
      controlNote: { title: 'For full customization options go to the admin Control Panel.', defaultValue: 'For full customization options go to the admin Control Panel.', required: true, isPlaceHolder: false, maxLength: 100 },
      locationDetails: { title: 'Location Details', defaultValue: 'Location Details', required: false, isPlaceHolder: false, maxLength: 25 },
      locationName: { title: 'Location Title', defaultValue: 'Location Title', required: true, isPlaceHolder: false, maxLength: 35 },
      locationAddress: { title: 'Location Address', defaultValue: 'Location Address', required: true, isPlaceHolder: false, maxLength: 35 },
      additionalDetails: { title: 'Additional Details', defaultValue: 'Additional Details', required: true, isPlaceHolder: false, maxLength: 35 },
      locationCustomLabel: { title: 'Location Custom Label', defaultValue: 'Label (optional)', required: true, isPlaceHolder: false, maxLength: 35 },
      locationStreetNameAndNumber: { title: 'Street Name and Number', defaultValue: 'Street Name and Number', required: true, isPlaceHolder: false, maxLength: 35 },
      locationCustomName: { title: 'Location Custom Name', defaultValue: 'Location Custom Name', required: true, isPlaceHolder: false, maxLength: 35 },
      locationSubtitle: { title: 'Location Subtitle', defaultValue: 'Location Subtitle', required: true, isPlaceHolder: false, maxLength: 35 },
      locationDescription: { title: 'Location Description', defaultValue: 'Location Description', required: true, isPlaceHolder: false, maxLength: 300 },
      descriptionDialogPlaceholder: { title: 'Enter your description here', defaultValue: 'Enter your description here', required: true, isPlaceHolder: false, maxLength: 30 },
      descriptionDialogSave: { title: 'Save', defaultValue: 'Save', required: true, isPlaceHolder: false, maxLength: 9 },
      descriptionDialogCancel: { title: 'Cancel', defaultValue: 'Cancel', required: true, isPlaceHolder: false, maxLength: 9 },
      categories: { title: 'Categories', defaultValue: 'Categories', required: false, isPlaceHolder: false, maxLength: 25 },
      chooseCategory: { title: 'Choose Category', defaultValue: 'Choose Category', required: false, isPlaceHolder: false, maxLength: 30 },
      starRating: { title: 'Star Rating', defaultValue: 'Star Rating', required: true, isPlaceHolder: false, maxLength: 25 },
      showCategory: { title: 'Show Category on Location Screen', defaultValue: 'Show Category on Location Screen', required: true, isPlaceHolder: false, maxLength: 25 },
      enableEditing: { title: 'Enable Editing', defaultValue: 'Enable Editing', required: true, isPlaceHolder: false, maxLength: 25 },
      priceRange: { title: 'Price Range', defaultValue: 'Price Range', required: true, isPlaceHolder: false, maxLength: 25 },
      listImage: { title: 'List Image', defaultValue: 'List Image', required: true, isPlaceHolder: false, maxLength: 25 },
      listImageNote: { title: 'This is the main location image displayed next to the location info in a list view.', defaultValue: 'This is the main location image displayed next to the location info in a list view.', required: true, isPlaceHolder: false, maxLength: 110 },
      mapNote: { title: 'If you need adjustments, drag the map so the pin matches the exact location of your place.', defaultValue: 'If you need adjustments, drag the map so the pin matches the exact location of your place.', required: true, isPlaceHolder: false, maxLength: 110 },
      locationImages: { title: 'Location Images', defaultValue: 'Location Images', required: true, isPlaceHolder: false, maxLength: 25 },
      locationImagesNote: { title: 'These are the location details images. First image in the list will be displayed as location’s main image.', defaultValue: 'These are the location details images. First image in the list will be displayed as location’s main image.', required: true, isPlaceHolder: false, maxLength: 110 },
      monday: { title: 'Mon', defaultValue: 'Mon', required: true, isPlaceHolder: false, maxLength: 10 },
      tuesday: { title: 'Tue', defaultValue: 'Tue', required: true, isPlaceHolder: false, maxLength: 10 },
      wednesday: { title: 'Wed', defaultValue: 'Wed', required: true, isPlaceHolder: false, maxLength: 10 },
      thursday: { title: 'Thu', defaultValue: 'Thu', required: true, isPlaceHolder: false, maxLength: 10 },
      friday: { title: 'Fri', defaultValue: 'Fri', required: true, isPlaceHolder: false, maxLength: 10 },
      saturday: { title: 'Sat', defaultValue: 'Sat', required: true, isPlaceHolder: false, maxLength: 10 },
      sunday: { title: 'Sun', defaultValue: 'Sun', required: true, isPlaceHolder: false, maxLength: 10 },
      fieldRequired: { title: 'This field is required', defaultValue: 'This field is required', required: true, isPlaceHolder: false, maxLength: 25 },
      required: { title: 'Required', defaultValue: 'Required', required: true, isPlaceHolder: false, maxLength: 25 },
      invalidTime: { title: 'Choose an end time later than the start time.', defaultValue: 'Choose an end time later than the start time.', required: true, isPlaceHolder: false, maxLength: 45 },
      overlappingHours: { title: 'Opening hours are overlapping for this day.', defaultValue: 'Opening hours are overlapping for this day.', required: true, isPlaceHolder: false, maxLength: 50 },
      confirmEditingTitle: { title: 'Enable Editing', defaultValue: 'Enable Editing', required: true, isPlaceHolder: false, maxLength: 25 },
      confirmEditingMessage: { title: 'The location description currently cannot be edited in the app. If you enable editing, the existing description will be deleted and can be replaced with a new description. Are you sure you want to proceed?', defaultValue: 'The location description currently cannot be edited in the app. If you enable editing, the existing description will be deleted and can be replaced with a new description. Are you sure you want to proceed?', required: true, isPlaceHolder: false, maxLength: 210 },
      confirmEditingConfirm: { title: 'Confirm', defaultValue: 'Confirm', required: true, isPlaceHolder: false, maxLength: 15 },
      confirmEditingCancel: { title: 'Cancel', defaultValue: 'Cancel', required: true, isPlaceHolder: false, maxLength: 15 },
      enterEmailAddress: { title: 'Enter email address', defaultValue: 'Enter email address', required: true, isPlaceHolder: false, maxLength: 50 },
      enterPhoneNumber: { title: 'Enter phone number', defaultValue: 'Enter phone number', required: true, isPlaceHolder: false, maxLength: 50 },
      enterURL: { title: 'Enter URL', defaultValue: 'Enter URL', required: true, isPlaceHolder: false, maxLength: 50 },
      addDescription: { title: 'Add description', defaultValue: 'Add description', required: true, isPlaceHolder: false, maxLength: 50 },
      enterDetails: { title: 'Enter details', defaultValue: 'Enter details', required: true, isPlaceHolder: false, maxLength: 50 },
      validEmail: { title: 'Enter a valid email address', defaultValue: 'Enter a valid email address', required: true, isPlaceHolder: false, maxLength: 50 },
      validPhone: { title: 'Enter a valid phone number', defaultValue: 'Enter a valid phone number', required: true, isPlaceHolder: false, maxLength: 50 },
      validURL: { title: 'Enter a valid URL', defaultValue: 'Enter a valid URL', required: true, isPlaceHolder: false, maxLength: 50 }
    }
  },
  toast: {
    title: "Toast Messages",
    labels: {
      bookmarksRemoved: { title: 'Bookmark Removed', defaultValue: 'Bookmark removed', required: true, isPlaceHolder: false, maxLength: 50 },
      bookmarksAdded: { title: 'Bookmark Added', defaultValue: 'Bookmark added', required: true, isPlaceHolder: false, maxLength: 50 },
      bookmarksError: { title: 'Couldn\'t bookmark', defaultValue: 'Couldn\'t bookmark', required: true, isPlaceHolder: false, maxLength: 50 },
      uploadingImages: { title: 'Uploading Images', defaultValue: 'Uploading images', required: true, isPlaceHolder: false, maxLength: 50 },
      uploadingComplete: { title: 'Uploading Images is Complete', defaultValue: 'Uploading Images is Complete', required: true, isPlaceHolder: false, maxLength: 50 },
      uploadingFailed: { title: 'Uploading Images Failed', defaultValue: 'Uploading Images Failed', required: true, isPlaceHolder: false, maxLength: 50 },
      locationSaved: { title: 'Location Saved', defaultValue: 'Location Saved', required: true, isPlaceHolder: false, maxLength: 50 },
      alreadyReported: { title: 'This item is already reported', defaultValue: 'This item is already reported', required: true, isPlaceHolder: false, maxLength: 50 },
      reportedSuccessfully: { title: 'Reported successfully', defaultValue: 'Reported successfully', required: true, isPlaceHolder: false, maxLength: 50 },
      uploadedSuccessfully: { title: 'Thanks for sharing your photos', defaultValue: 'Thanks for sharing your photos', required: true, isPlaceHolder: false, maxLength: 50 },
      subscribeToLocationUpdates: { title: 'You\'ll now get notifications for location updates.', defaultValue: 'You\'ll now get notifications for location updates.', required: true, isPlaceHolder: false, maxLength: 75 },
      unSubscribeFromLocationUpdates: { title: 'You\'ll no longer get notifications for location updates.', defaultValue: 'You\'ll no longer get notifications for location updates.', required: true, isPlaceHolder: false, maxLength: 75 },
      sendNotificationSuccess: { title: 'Notification sent successfully', defaultValue: 'Notification sent successfully.', required: true, isPlaceHolder: false, maxLength: 75 },
      sendNotificationFailed: { title: 'Notification failed', defaultValue: 'Failed to send notification. Please try again later.', required: true, isPlaceHolder: false, maxLength: 75 },
      locationHasNoSubscribers: { title: 'Location has no subscribers', defaultValue: 'This location has no subscribers to notify', required: true, isPlaceHolder: false, maxLength: 75 },
      locationDeleted: { title: 'Location Deleted', defaultValue: 'This location has been deleted.', required: true, isPlaceHolder: false, maxLength: 75 },
      somethingWentWrong: { title: 'Something went wrong', defaultValue: 'Something went wrong', required: true, isPlaceHolder: false, maxLength: 50 }
    }
  },
  details: {
    title: "Details Page",
    labels: {
      bookmark: { title: 'Bookmark', defaultValue: 'Bookmark', required: true, isPlaceHolder: false, maxLength: 25 },
      reportAbuse: { title: 'Report Abuse', defaultValue: 'Report Abuse', required: true, isPlaceHolder: false, maxLength: 25 },
      share: { title: 'Share', defaultValue: 'Share', required: true, isPlaceHolder: false, maxLength: 25 },
      edit: { title: 'Edit', defaultValue: 'Edit', required: true, isPlaceHolder: false, maxLength: 25 },
      notifySubscribers: { title: 'Notify Subscribers', defaultValue: 'Notify Subscribers', required: true, isPlaceHolder: false, maxLength: 50 },
      addPhotos: { title: 'Add Photos', defaultValue: 'Add Photos', required: true, isPlaceHolder: false, maxLength: 25 },
      contributorPrefix: { title: 'Contributor Name Prefix', defaultValue: 'by', required: true, isPlaceHolder: false, maxLength: 15 },
      unknownContributor: { title: 'Unknown Contributor', defaultValue: 'Someone', required: true, isPlaceHolder: false, maxLength: 25 },
      newPushNotification: { title: 'New Push Notification Title', defaultValue: 'New Push Notification', required: true, isPlaceHolder: false, maxLength: 50 },
      notificationWarningNote: { title: 'Notification Note', defaultValue: 'Notify users about changes to this location. Only users who have subscribed to this location will receive this notification.', required: true, isPlaceHolder: false, maxLength: 150 },
      notificationTitlePlaceholder: { title: 'Notification Title Placeholder', defaultValue: 'Title', required: true, isPlaceHolder: false, maxLength: 50 },
      notificationMessagePlaceholder: { title: 'Notification Message Placeholder', defaultValue: 'Message', required: true, isPlaceHolder: false, maxLength: 50 },
      done: { title: 'Done', defaultValue: 'Done', required: true, isPlaceHolder: false, maxLength: 9 },
      cancel: { title: 'Cancel', defaultValue: 'Cancel', required: true, isPlaceHolder: false, maxLength: 9 },
      notificationSend: { title: 'Send', defaultValue: 'Send', required: true, isPlaceHolder: false, maxLength: 15 }
    }
  },
  emptyState: {
    title: "Empty State",
    labels: {
      emptyCategories: { title: 'No Categories Added', defaultValue: 'No Categories Added', required: false, isPlaceHolder: false, maxLength: 30 },
      locationsListBeforeSearch: { title: 'Start your search', defaultValue: 'Start your search', required: false, isPlaceHolder: false, maxLength: 40 },
      locationsListAfterSearch: { title: 'No locations found within this area', defaultValue: 'No locations found within this area', required: false, isPlaceHolder: false, maxLength: 40 }
    }
  }
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const requireCallback = (callback) => {
  if (typeof callback !== 'function') {
    // Nothing to report through; fail loudly only in this one unrecoverable case.
    throw new TypeError('callback must be a function');
  }
};

/**
 * Assert that options is an object and every named option is a non-empty string.
 * @returns {boolean} true when valid; false when the callback has already fired.
 */
const requireStringParams = (options, names, callback) => {
  requireCallback(callback);
  if (options === null || typeof options !== 'object') {
    callback(new Error('options must be an object'), undefined);
    return false;
  }
  const missing = names.find((name) => typeof options[name] !== 'string' || !options[name].trim());
  if (missing) {
    callback(new Error(`Missing required parameter: ${missing}`), undefined);
    return false;
  }
  return true;
};

const isGiven = (value) => value !== undefined;
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * An image param, checked against its declared count. Image params are always arrays, even for a single image, so a bare string is refused rather than wrapped: it means the caller misread the contract.
 * @returns {{ images?: string[], error?: string }}
 */
const readImageList = (value, { name, minValue, maxValue }) => {
  let range = `${minValue} to ${maxValue}`;
  if (maxValue === undefined) range = `at least ${minValue}`;
  else if (minValue === maxValue) range = `exactly ${minValue}`;
  else if (minValue === 0) range = `up to ${maxValue}`;
  if (!Array.isArray(value)) return { error: `${name} must be a list of image URLs (${range}), even for one image` };
  if (value.length < minValue || (maxValue !== undefined && value.length > maxValue)) {
    return { error: `${name} must hold ${range} image${maxValue === 1 ? '' : 's'}; got ${value.length}` };
  }
  if (value.some((url) => typeof url !== 'string' || !url.trim())) return { error: `${name} must contain only image URLs` };
  return { images: value.map((url) => url.trim()) };
};

const readString = (value, name, { allowEmpty = false, maxLength } = {}) => {
  if (typeof value !== 'string') return { error: `${name} must be text` };
  if (!allowEmpty && !value.trim()) return { error: `${name} cannot be empty` };
  if (maxLength && value.length > maxLength) return { error: `${name} must be at most ${maxLength} characters` };
  return { value };
};

const readBoolean = (value, name) => (typeof value === 'boolean' ? { value } : { error: `${name} must be true or false` });

const readNumber = (value, name, minValue, maxValue) => {
  if (!isNumber(value)) return { error: `${name} must be a number` };
  if ((minValue !== undefined && value < minValue) || (maxValue !== undefined && value > maxValue)) {
    return { error: `${name} must be between ${minValue} and ${maxValue}` };
  }
  return { value };
};

const readSelect = (value, name, allowed) => (allowed.indexOf(value) > -1
  ? { value } : { error: `${name} must be one of: ${allowed.join(', ')}` });

const readListParam = (options, name, maxValue, callback) => {
  requireCallback(callback);
  if (options === null || typeof options !== 'object') {
    callback(new Error('options must be an object'), undefined);
    return null;
  }
  const entries = options[name];
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > maxValue) {
    callback(new Error(`${name} must be a list of 1 to ${maxValue} entries`), undefined);
    return null;
  }
  if (entries.some((entry) => entry === null || typeof entry !== 'object' || Array.isArray(entry))) {
    callback(new Error(`every entry of ${name} must be an object`), undefined);
    return null;
  }
  return entries;
};

// Mirrors widget/js/global/helpers.js generateUUID.
const generateUUID = () => {
  let dt = new Date().getTime();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const replace = (dt + Math.random() * 16) % 16 | 0; // eslint-disable-line no-bitwise, no-mixed-operators
    dt = Math.floor(dt / 16);
    return (c === 'x' ? replace : (replace & 0x3) | 0x8).toString(16); // eslint-disable-line no-bitwise, no-mixed-operators
  });
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toIso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

// ---------------------------------------------------------------------------
// Side effects the plugin makes next to its writes (fired without waiting, as the plugin does)
// ---------------------------------------------------------------------------

const hasFunction = (owner, name) => !!owner && typeof owner[name] === 'function';

const sendEvent = (eventName, data) => {
  const contractService = buildfire.services && buildfire.services.contract;
  if (contractService && contractService.events && hasFunction(contractService.events, 'send')) {
    contractService.events.send(eventName, data);
  }
};

// The control panel's pages refresh the widget after each save with { cmd: 'sync', scope }; the server has no widget to tell.
const syncWidget = (scope) => {
  if (hasFunction(buildfire.messaging, 'sendMessageToWidget')) {
    buildfire.messaging.sendMessageToWidget({ cmd: 'sync', scope });
  }
};

// Mirrors utils/deeplink.js registerDeeplink / unregisterDeeplink.
const registerDeeplink = (location) => {
  if (!hasFunction(buildfire.deeplink, 'registerDeeplink')) return;
  buildfire.deeplink.registerDeeplink({
    id: `location-${location.id}`,
    name: location.title,
    deeplinkData: { locationId: location.id },
    imageUrl: location.listImage
  }, () => {});
};
const unregisterDeeplink = (locationId) => {
  if (!hasFunction(buildfire.deeplink, 'unregisterDeeplink')) return;
  buildfire.deeplink.unregisterDeeplink(`location-${locationId}`, () => {});
};

// Mirrors widget/js/global/repository/searchEngine.js add/update and delete.
const searchEngineService = () => (buildfire.services && buildfire.services.searchEngine) || null;
const saveSearchEngineEntry = (location) => {
  const service = searchEngineService();
  if (!hasFunction(service, 'save')) return;
  service.save({
    tag: LOCATIONS_TAG,
    key: location.id,
    data: { locationId: location.id },
    title: location.title,
    description: location.description ? location.description.replace(/(<([^>]+)>)/gi, '') : '',
    imageUrl: location.listImage,
    keywords: [location.address, location.formattedAddress, location.addressAlias, location.subtitle].join(',')
  }, () => {});
};
const deleteSearchEngineEntry = (locationId) => {
  const service = searchEngineService();
  if (!hasFunction(service, 'delete')) return;
  service.delete({ id: locationId, tag: LOCATIONS_TAG }, () => {});
};

// Mirrors utils/analytics.js registerEvent.
const registerAnalyticsEvent = (title, key) => {
  if (!hasFunction(buildfire.analytics, 'registerEvent')) return;
  buildfire.analytics.registerEvent({ title, key, description: '' }, { silentNotification: true });
};

/**
 * The user recorded as createdBy / lastUpdatedBy, sanitized the way UserAccessControl/authManager.js sanitizedCurrentUser does. Nobody signed in (or no auth on this host) records null, as the plugin's model does.
 * @param {function(object|null)} callback
 */
const getRecordingUser = (callback) => {
  if (!buildfire.auth || !hasFunction(buildfire.auth, 'getCurrentUser')) return callback(null);
  buildfire.auth.getCurrentUser((err, currentUser) => {
    if (err || !currentUser) return callback(null);
    const sanitizedUser = { ...currentUser };
    if (typeof sanitizedUser._cpUser !== 'undefined') sanitizedUser.isCPUser = true;
    ['email', 'username', 'accessToken', 'accessTokenExpiresIn', 'externalApps', 'lastUsedIPAddress', 'userToken', 'loginProviderType', 'failedAttemptCount', '_cpUser']
      .forEach((prop) => { delete sanitizedUser[prop]; });
    callback(sanitizedUser);
  });
};

const eventUser = (user) => (user ? { userId: user._id || null, displayName: user.displayName || null } : null);

// ---------------------------------------------------------------------------
// Store helpers
// ---------------------------------------------------------------------------

/**
 * Every record matching a publicData filter, page by page: at most 50 records come back a call, and recordCount's totalRecord tells when the last page is reached.
 */
const searchAllPublicData = (filter, sort, tag, callback) => {
  const records = [];
  const next = (page) => {
    buildfire.publicData.search({ filter, sort, page, pageSize: PAGE_SIZE, recordCount: true }, tag, (err, response) => {
      if (err) return callback(err, undefined);
      const result = ((response && response.result) || []).filter(Boolean);
      records.push(...result);
      const total = (response && response.totalRecord) || 0;
      if (!result.length || records.length >= total) return callback(null, records);
      next(page + 1);
    });
  };
  next(0);
};

const isEmptyRecord = (record) => !record || !record.data || !Object.keys(record.data).length;

// ---------------------------------------------------------------------------
// Models — mirror widget/js/global/data/*.js so stored records match the plugin's own
// ---------------------------------------------------------------------------

// Mirrors widget/js/global/data/Location.js constructor (CustomField included).
const normalizeLocation = (data = {}) => {
  const customField = (field = {}) => ({ id: field.id || null, customLabel: field.customLabel || null, value: field.value || null });
  const additional = data.additionalFields || {};
  return {
    id: data.id || undefined,
    clientId: data.clientId || undefined,
    title: data.title || null,
    subtitle: data.subtitle || null,
    pinIndex: data.pinIndex || null,
    address: data.address || null,
    formattedAddress: data.formattedAddress || null,
    addressAlias: data.addressAlias || null,
    subscribers: data.subscribers || [],
    coordinates: data.coordinates || { lat: null, lng: null },
    marker: data.marker || { type: 'pin', image: null, color: null, base64Image: null },
    categories: data.categories || { main: [], subcategories: [] },
    settings: data.settings || {
      showCategory: true, showOpeningHours: false, showPriceRange: false, showStarRating: false
    },
    openingHours: data.openingHours || { timezone: null, days: {} },
    editingPermissions: data.editingPermissions || { active: false, editors: [], tags: [] },
    images: data.images || [],
    listImage: data.listImage || null,
    description: data.description || null,
    wysiwygSource: data.wysiwygSource || 'control',
    views: Number.isNaN(parseInt(data.views, 10)) ? 0 : parseInt(data.views, 10),
    price: data.price || { range: 1, currency: '$' },
    rating: data.rating || { total: 0, count: 0, average: 0 },
    bookmarksCount: data.bookmarksCount || 0,
    actionItems: data.actionItems || [],
    createdOn: data.createdOn || new Date(),
    createdBy: data.createdBy || null,
    lastUpdatedOn: data.lastUpdatedOn || new Date(),
    lastUpdatedBy: data.lastUpdatedBy || null,
    deletedOn: data.deletedOn || null,
    deletedBy: data.deletedBy || null,
    isActive: [0, 1].indexOf(data.isActive) > -1 ? data.isActive : 1,
    additionalFields: {
      quickActions: (additional.quickActions || []).map(customField),
      content: (additional.content || []).map(customField)
    }
  };
};

// Mirrors Location.toJSON, including the _buildfire index and geo the widget's searches rely on.
const locationToJSON = (loc) => ({
  id: loc.id,
  clientId: loc.clientId,
  title: loc.title,
  subtitle: loc.subtitle,
  pinIndex: loc.pinIndex,
  address: loc.address,
  formattedAddress: loc.formattedAddress,
  addressAlias: loc.addressAlias,
  subscribers: loc.subscribers,
  coordinates: loc.coordinates,
  marker: loc.marker,
  categories: loc.categories,
  settings: loc.settings,
  openingHours: loc.openingHours,
  images: loc.images,
  listImage: loc.listImage,
  description: loc.description,
  wysiwygSource: loc.wysiwygSource,
  views: loc.views,
  price: loc.price,
  rating: loc.rating,
  bookmarksCount: loc.bookmarksCount,
  actionItems: loc.actionItems,
  editingPermissions: loc.editingPermissions,
  createdOn: loc.createdOn,
  createdBy: loc.createdBy,
  lastUpdatedOn: loc.lastUpdatedOn,
  lastUpdatedBy: loc.lastUpdatedBy,
  deletedOn: loc.deletedOn,
  deletedBy: loc.deletedBy,
  isActive: loc.isActive,
  additionalFields: loc.additionalFields,
  _buildfire: {
    index: {
      text: `${loc.title.toLowerCase()} ${loc.subtitle ? loc.subtitle : ''} ${loc.address} ${loc.formattedAddress} ${loc.addressAlias ? loc.addressAlias : ''}`,
      string1: loc.title.toLowerCase(),
      date1: loc.createdOn,
      array1: [
        ...loc.categories.main.map((elemId) => ({ string1: `c_${elemId}` })),
        ...loc.categories.subcategories.map((elemId) => ({ string1: `s_${elemId}` })),
        { string1: `v_${loc.views}` },
        { string1: `pr_${loc.price.range}` },
        { string1: `cid_${loc.clientId}` },
        { string1: `title_${loc.title.toLowerCase()}` }
      ],
      number1: loc.pinIndex
    },
    geo: {
      type: 'Point',
      coordinates: [loc.coordinates.lng, loc.coordinates.lat]
    }
  }
});

// Mirrors widget/js/global/data/Category.js constructor.
const normalizeCategory = (data = {}) => ({
  id: data.id || undefined,
  title: data.title || '',
  iconUrl: data.iconUrl || null,
  iconClassName: data.iconClassName || null,
  subcategories: data.subcategories || [],
  quickAccess: [0, 1].indexOf(data.quickAccess) > -1 ? data.quickAccess : 0,
  createdOn: data.createdOn || new Date(),
  createdBy: data.createdBy || null,
  lastUpdatedOn: data.lastUpdatedOn || new Date(),
  lastUpdatedBy: data.lastUpdatedBy || null,
  deletedOn: data.deletedOn || null,
  deletedBy: data.deletedBy || null,
  isActive: [0, 1].indexOf(data.isActive) > -1 ? data.isActive : 1
});

// Mirrors Category.toJSON.
const categoryToJSON = (cat) => ({
  id: cat.id,
  title: cat.title,
  iconUrl: cat.iconUrl,
  iconClassName: cat.iconClassName,
  subcategories: cat.subcategories,
  quickAccess: cat.quickAccess,
  createdOn: cat.createdOn,
  createdBy: cat.createdBy,
  lastUpdatedOn: cat.lastUpdatedOn,
  lastUpdatedBy: cat.lastUpdatedBy,
  deletedOn: cat.deletedOn,
  deletedBy: cat.deletedBy,
  isActive: cat.isActive,
  _buildfire: {
    index: {
      string1: cat.title.toLowerCase(),
      date1: cat.deletedOn,
      number1: cat.quickAccess
    }
  }
});

// Mirrors widget/js/global/repository/Settings.js migrateFieldSettings.
const migrateFieldSettings = (data) => {
  if (data.globalEntries) {
    if (data.globalEntries.allowPriceRange != null) {
      data.globalEntries.priceRange = {
        enabled: data.globalEntries.allowPriceRange,
        inAppEnabled: data.globalEntries.allowPriceRange ? 'all' : 'none',
        tags: []
      };
      delete data.globalEntries.allowPriceRange;
    }
    if (data.globalEntries.allowOpenHours != null) {
      data.globalEntries.openHours = {
        enabled: data.globalEntries.allowOpenHours,
        inAppEnabled: data.globalEntries.allowOpenHours ? 'all' : 'none',
        tags: []
      };
      delete data.globalEntries.allowOpenHours;
    }
  }
  return data;
};

// Mirrors widget/js/global/data/Settings.js constructor.
const normalizeSettings = (data = {}) => {
  const customField = (field = {}) => ({
    id: field.id || null,
    label: field.label || null,
    type: field.type || null,
    required: field.required || false,
    enableCustomLabel: field.enableCustomLabel || false,
    visibility: field.visibility || { value: 'ALL', tags: [] }
  });
  const settings = {};
  settings.subscription = data.subscription || { enabled: false, allowCustomNotifications: false };
  settings.measurementUnit = data.measurementUnit || 'metric';
  settings.introductoryListView = data.introductoryListView || {
    images: [],
    description: null,
    sorting: 'distance',
    searchOptions: { mode: 'UserPosition', areaRadiusOptions: {} }
  };
  const intro = data.introductoryListView;
  if (!intro || !intro.visibilityOptions) {
    settings.introductoryListView.visibilityOptions = {
      tags: [],
      value: (data.showIntroductoryListView === true || typeof data.showIntroductoryListView === 'undefined') ? 'ALL' : 'NONE'
    };
  } else {
    settings.introductoryListView.visibilityOptions = {
      tags: intro.visibilityOptions.tags || [],
      value: intro.visibilityOptions.value || 'ALL'
    };
  }
  settings.sorting = data.sorting || {
    defaultSorting: 'distance',
    hideSorting: false,
    allowSortByReverseAlphabetical: true,
    allowSortByNearest: true,
    allowSortByPriceLowToHigh: true,
    allowSortByPriceHighToLow: true,
    allowSortByDate: true,
    allowSortByRating: true,
    allowSortByViews: true
  };
  const customFields = data.customFields || {};
  settings.customFields = {
    quickActions: (customFields.quickActions || []).map(customField),
    content: (customFields.content || []).map(customField)
  };
  settings.filter = data.filter || {
    allowFilterByArea: true, allowFilterByBookmarks: false, hideOpeningHoursFilter: false, hidePriceFilter: false
  };
  settings.map = data.map || {
    distanceUnit: 'metric',
    showPointsOfInterest: false,
    initialArea: true,
    offlineAreaSelection: true,
    initialAreaCoordinates: { lat: null, lng: null },
    initialAreaDisplayAddress: null
  };
  settings.bookmarks = data.bookmarks || { enabled: true, allowForLocations: true, allowForFilters: true };
  settings.design = data.design || {
    listViewPosition: 'collapsed',
    listViewStyle: 'backgroundImage',
    defaultMapStyle: 'light',
    defaultMapType: 'streets',
    enableMapTerrainView: false,
    hideQuickFilter: false,
    allowStyleSelection: true,
    detailsMapPosition: 'top',
    showDetailsCategory: true,
    showContributorName: false
  };
  settings.globalEntries = data.globalEntries || {
    locations: { allowAdding: 'none', tags: [] },
    photos: { allowAdding: 'none', tags: [] },
    openHours: { enabled: true, inAppEnabled: 'all', tags: [] },
    priceRange: { enabled: true, inAppEnabled: 'all', tags: [] },
    charging: { enabled: 'none', tags: [], description: '', subscriptionOptions: [] }
  };
  if (!settings.globalEntries.charging) {
    settings.globalEntries.charging = { enabled: 'none', tags: [], description: '', subscriptionOptions: [] };
  }
  settings.globalEditors = data.globalEditors || { enabled: true, allowLocationCreatorsToEdit: true, tags: [], users: [] };
  settings.locationEditors = data.locationEditors || { enabled: true, time: '12H' };
  settings.categoriesSortBy = data.categoriesSortBy || 'Asc';
  settings.createdOn = data.createdOn || new Date();
  settings.createdBy = data.createdBy || null;
  settings.lastUpdatedOn = data.lastUpdatedOn || new Date();
  settings.lastUpdatedBy = data.lastUpdatedBy || null;
  settings.deletedOn = data.deletedOn || null;
  settings.deletedBy = data.deletedBy || null;
  settings.isActive = [0, 1].indexOf(data.isActive) > -1 ? data.isActive : 1;
  if (typeof settings.globalEditors.allowLocationCreatorsToEdit === 'undefined') {
    settings.globalEditors.allowLocationCreatorsToEdit = true;
  }
  return settings;
};

// Mirrors Settings.toJSON.
const settingsToJSON = (settings) => ({
  subscription: settings.subscription,
  measurementUnit: settings.measurementUnit,
  introductoryListView: settings.introductoryListView,
  sorting: settings.sorting,
  filter: settings.filter,
  map: settings.map,
  bookmarks: settings.bookmarks,
  customFields: settings.customFields,
  design: settings.design,
  globalEntries: settings.globalEntries,
  globalEditors: settings.globalEditors,
  locationEditors: settings.locationEditors,
  categoriesSortBy: settings.categoriesSortBy,
  createdOn: settings.createdOn,
  createdBy: settings.createdBy,
  lastUpdatedOn: settings.lastUpdatedOn,
  lastUpdatedBy: settings.lastUpdatedBy,
  deletedOn: settings.deletedOn,
  deletedBy: settings.deletedBy,
  isActive: settings.isActive,
  _buildfire: { index: {} }
});

/**
 * The settings the way the control panel loads them (widget/js/global/repository/Settings.js get): new instances default subscriptions on; saved ones are migrated and filled with the model's defaults. Reading never saves — the control panel's own load writes the migration back, which is bookkeeping.
 */
const loadSettings = (callback) => {
  buildfire.datastore.get(SETTINGS_TAG, (err, res) => {
    if (err) return callback(err, undefined);
    if (isEmptyRecord(res)) {
      // For the new instances, subscription is enabled by default, unlike old instances (backward compatible).
      return callback(null, normalizeSettings({ subscription: { enabled: true, allowCustomNotifications: true } }));
    }
    callback(null, normalizeSettings(migrateFieldSettings(res.data)));
  });
};

// The control panel saves the whole document (Settings.save(settings.toJSON())), stamping who and when.
const saveSettings = (settings, user, callback) => {
  settings.lastUpdatedOn = new Date();
  settings.lastUpdatedBy = user;
  buildfire.datastore.save(settingsToJSON(settings), SETTINGS_TAG, (err, res) => {
    if (err || !res) return callback(err || new Error('The settings could not be saved'), undefined);
    callback(null, normalizeSettings(res.data));
  });
};

const publicField = (field, group) => ({
  id: field.id,
  group,
  label: field.label,
  type: field.type,
  required: !!field.required,
  allowCustomLabel: !!field.enableCustomLabel
});

// The settings as the contract shows them: permission and access settings (editors, tags, who may add or pay) stay out.
const publicSettings = (settings) => {
  const intro = settings.introductoryListView || {};
  const searchOptions = intro.searchOptions || {};
  return {
    subscription: { enabled: !!(settings.subscription && settings.subscription.enabled) },
    measurementUnit: settings.measurementUnit,
    introductoryListView: {
      images: intro.images || [],
      description: intro.description === undefined ? null : intro.description,
      sorting: intro.sorting,
      searchOptions: {
        mode: searchOptions.mode || 'UserPosition',
        areaRadiusOptions: searchOptions.areaRadiusOptions || {}
      }
    },
    sorting: settings.sorting,
    filter: settings.filter,
    map: {
      initialArea: settings.map.initialArea,
      initialAreaCoordinates: settings.map.initialAreaCoordinates || { lat: null, lng: null },
      initialAreaDisplayAddress: settings.map.initialAreaDisplayAddress || null
    },
    bookmarks: settings.bookmarks,
    customFields: {
      quickActions: settings.customFields.quickActions.map((field) => publicField(field, 'quickActions')),
      content: settings.customFields.content.map((field) => publicField(field, 'content'))
    },
    design: settings.design,
    globalEntries: {
      openHours: { enabled: !!(settings.globalEntries.openHours && settings.globalEntries.openHours.enabled) },
      priceRange: { enabled: !!(settings.globalEntries.priceRange && settings.globalEntries.priceRange.enabled) },
      charging: { description: (settings.globalEntries.charging && settings.globalEntries.charging.description) || '' }
    },
    locationEditors: { time: (settings.locationEditors && settings.locationEditors.time) || '12H' }
  };
};

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

// Not deleted: the plugin soft-deletes categories and indexes deletedOn as date1 ($type 10 = null), as every list of it does.
const ACTIVE_CATEGORY_FILTER = { '_buildfire.index.date1': { $type: 10 } };

const loadActiveCategories = (callback) => {
  searchAllPublicData(ACTIVE_CATEGORY_FILTER, { '_buildfire.index.string1': 1 }, CATEGORIES_TAG, (err, records) => {
    if (err) return callback(err, undefined);
    callback(null, records.map((record) => normalizeCategory({ ...record.data, id: record.id })));
  });
};

const publicCategory = (cat) => ({
  id: cat.id,
  title: cat.title,
  iconUrl: cat.iconUrl || null,
  iconClassName: cat.iconClassName || null,
  subcategories: (cat.subcategories || []).map((sub) => ({
    id: sub.id, title: sub.title, iconUrl: sub.iconUrl || null, iconClassName: sub.iconClassName || null
  })),
  createdOn: toIso(cat.createdOn),
  lastUpdatedOn: toIso(cat.lastUpdatedOn)
});

/**
 * The category a caller named by its exact title, among the categories not deleted. A title several categories share is refused rather than resolved to one of them.
 */
const resolveCategoryByTitle = (title, callback) => {
  buildfire.publicData.search({ filter: { ...ACTIVE_CATEGORY_FILTER, '$json.title': title }, page: 0, pageSize: PAGE_SIZE }, CATEGORIES_TAG, (err, records) => {
    if (err) return callback(err, undefined);
    const found = (records || []).filter(Boolean);
    if (!found.length) return callback(new Error(`No category titled "${title}"`), undefined);
    if (found.length > 1) return callback(new Error(`${found.length} categories are titled "${title}"`), undefined);
    callback(null, normalizeCategory({ ...found[0].data, id: found[0].id }));
  });
};

// The advanced counterpart: an id that matches nothing, or a deleted category, is refused.
const requireCategoryById = (categoryId, callback) => {
  buildfire.publicData.getById(categoryId, CATEGORIES_TAG, (err, record) => {
    if (err) return callback(err, undefined);
    if (isEmptyRecord(record) || record.data.deletedOn) return callback(new Error(`No category with id "${categoryId}"`), undefined);
    callback(null, normalizeCategory({ ...record.data, id: record.id }));
  });
};

// Mirrors CategoriesController.updateCategory / deleteCategory: the whole category is written back, stamped.
const writeCategory = (cat, user, callback) => {
  cat.lastUpdatedOn = new Date();
  cat.lastUpdatedBy = user;
  buildfire.publicData.update(cat.id, categoryToJSON(cat), CATEGORIES_TAG, (err, result) => {
    if (err) return callback(err, undefined);
    syncWidget('category');
    callback(null, normalizeCategory({ ...result.data, id: result.id }));
  });
};

const readIconParams = (options, imageName, classNameName, isUpdate) => {
  const changes = {};
  if (isGiven(options[imageName]) && isGiven(options[classNameName])
    && options[imageName] !== null && options[classNameName] !== null
    && !(Array.isArray(options[imageName]) && !options[imageName].length) && options[classNameName] !== '') {
    return { error: `Give either ${imageName} or ${classNameName}, not both` };
  }
  if (isGiven(options[imageName])) {
    if (options[imageName] === null) {
      if (!isUpdate) return { error: `${imageName} must be a list of image URLs` };
      changes.iconUrl = null;
    } else {
      const { images, error } = readImageList(options[imageName], { name: imageName, minValue: 0, maxValue: 1 });
      if (error) return { error };
      changes.iconUrl = images.length ? images[0] : null;
      // The image library replaces a library icon with a picture (control/content/js/categories/index.js).
      if (changes.iconUrl) changes.iconClassName = null;
    }
  }
  if (isGiven(options[classNameName])) {
    if (options[classNameName] === null || options[classNameName] === '') {
      if (!isUpdate && options[classNameName] === null) return { error: `${classNameName} must be text` };
      changes.iconClassName = null;
    } else {
      const { value, error } = readString(options[classNameName], classNameName);
      if (error) return { error };
      changes.iconClassName = value.trim();
      changes.iconUrl = null;
    }
  }
  return { changes };
};

const prepareCategoryCreate = (options) => {
  const title = readString(options.title, 'title');
  if (title.error) return { error: options.title === undefined ? 'Missing required parameter: title' : title.error };
  const icon = readIconParams(options, 'icon', 'iconClassName', false);
  if (icon.error) return { error: icon.error };
  let subcategories = [];
  if (isGiven(options.subcategories)) {
    const text = readString(options.subcategories, 'subcategories', { allowEmpty: true });
    if (text.error) return { error: text.error };
    // The categories import's "subcategories" column: titles separated by commas.
    subcategories = text.value.split(',').map((sub) => sub.trim()).filter(Boolean)
      .map((subTitle) => ({ id: generateUUID(), title: subTitle, iconUrl: null, iconClassName: null }));
  }
  return {
    category: normalizeCategory({
      title: title.value.trim(), iconUrl: icon.changes.iconUrl || null, iconClassName: icon.changes.iconClassName || null, subcategories
    })
  };
};

// Mirrors CategoriesController.createCategory: stamped, inserted, analytics events registered for it and each subcategory.
const insertCategory = (cat, user, callback) => {
  cat.createdOn = new Date();
  cat.createdBy = user;
  buildfire.publicData.insert(categoryToJSON(cat), CATEGORIES_TAG, (err, result) => {
    if (err) return callback(err, undefined);
    const saved = normalizeCategory({ ...result.data, id: result.id });
    registerAnalyticsEvent(`${saved.title} (Category Selected)`, `categories_${saved.id}_selected`);
    saved.subcategories.forEach((sub) => registerAnalyticsEvent(`${sub.title} (Subcategory Selected)`, `subcategories_${sub.id}_selected`));
    syncWidget('category');
    sendEvent('categoryCreated', {
      categoryId: saved.id,
      title: saved.title,
      iconUrl: saved.iconUrl || null,
      subcategories: saved.subcategories.map((sub) => sub.title),
      createdOn: toIso(saved.createdOn),
      createdBy: eventUser(saved.createdBy)
    });
    callback(null, saved);
  });
};

const collectCategoryChanges = (options) => {
  const changes = {};
  if (isGiven(options.newTitle)) {
    if (options.newTitle === null || options.newTitle === '') return { error: 'newTitle cannot be removed; pass a non-empty title' };
    const { value, error } = readString(options.newTitle, 'newTitle');
    if (error) return { error };
    changes.title = value.trim();
  }
  const icon = readIconParams(options, 'newIcon', 'newIconClassName', true);
  if (icon.error) return { error: icon.error };
  Object.assign(changes, icon.changes);
  if (!Object.keys(changes).length) return { error: 'Pass at least one of newTitle, newIcon or newIconClassName' };
  return { changes };
};

const applyCategoryUpdate = (cat, options, user, callback) => {
  const { changes, error } = collectCategoryChanges(options);
  if (error) return callback(new Error(error), undefined);
  Object.assign(cat, changes);
  writeCategory(cat, user, callback);
};

// Soft delete, as CategoriesController.deleteCategory: deletedOn (indexed as date1) hides it everywhere; the record is kept.
const applyCategoryDelete = (cat, user, callback) => {
  cat.deletedOn = new Date();
  cat.deletedBy = user;
  writeCategory(cat, user, (err, saved) => {
    if (err) return callback(err, undefined);
    callback(null, { id: saved.id, deletedOn: toIso(saved.deletedOn) });
  });
};

// ---- subcategories (kept inside their category) ----

const findSubcategory = (cat, { title, id }) => {
  const matches = cat.subcategories.filter((sub) => (id ? sub.id === id : sub.title === title));
  if (!matches.length) return { error: id ? `No subcategory with id "${id}" in "${cat.title}"` : `No subcategory titled "${title}" in "${cat.title}"` };
  if (matches.length > 1) return { error: `${matches.length} subcategories of "${cat.title}" are titled "${title}"` };
  return { subcategory: matches[0] };
};

const publicSubcategory = (cat, sub) => ({
  categoryId: cat.id, id: sub.id, title: sub.title, iconUrl: sub.iconUrl || null, iconClassName: sub.iconClassName || null
});

const prepareSubcategoryCreate = (options) => {
  if (!isGiven(options.subcategoryTitle)) return { error: 'Missing required parameter: subcategoryTitle' };
  const title = readString(options.subcategoryTitle, 'subcategoryTitle');
  if (title.error) return { error: title.error };
  const icon = readIconParams(options, 'icon', 'iconClassName', false);
  if (icon.error) return { error: icon.error };
  return {
    subcategory: {
      id: generateUUID(), title: title.value.trim(), iconUrl: icon.changes.iconUrl || null, iconClassName: icon.changes.iconClassName || null
    }
  };
};

const collectSubcategoryChanges = (options) => {
  const changes = {};
  if (isGiven(options.newTitle)) {
    if (options.newTitle === null || options.newTitle === '') return { error: 'newTitle cannot be removed; pass a non-empty title' };
    const { value, error } = readString(options.newTitle, 'newTitle');
    if (error) return { error };
    changes.title = value.trim();
  }
  const icon = readIconParams(options, 'newIcon', 'newIconClassName', true);
  if (icon.error) return { error: icon.error };
  Object.assign(changes, icon.changes);
  if (!Object.keys(changes).length) return { error: 'Pass at least one of newTitle, newIcon or newIconClassName' };
  return { changes };
};

const readPosition = (options, max) => {
  if (!isGiven(options.position) || options.position === null) return { error: 'Missing required parameter: position' };
  if (!Number.isInteger(options.position) || options.position < 1) return { error: 'position must be a whole number from 1' };
  if (options.position > max) return { error: `position must be between 1 and ${max}` };
  return { value: options.position };
};

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

// Mirrors utils/datetime.js convertTimeToDate / convertDateToTime: times of day are stored as dates on 1970-01-01 UTC.
const convertTimeToDate = (hour, min) => new Date(Date.UTC(1970, 0, 1, hour, min));
const convertDateToTime = (date) => {
  const time = new Date(date);
  const hour = time.getUTCHours();
  const mins = time.getUTCMinutes();
  return `${hour < 10 ? `0${hour}` : hour}:${mins < 10 ? `0${mins}` : mins}`;
};

// Mirrors control/content/utils/helpers.js getDefaultOpeningHours.
const defaultOpeningHours = () => {
  const days = {};
  WEEK_DAYS.forEach((day, index) => {
    days[day] = { index, active: true, intervals: [{ from: convertTimeToDate(8, 0), to: convertTimeToDate(20, 0) }] };
  });
  return { timezone: null, days };
};

/**
 * One day's hours as the caller writes them: "08:00-12:00, 13:00-20:00", or "closed" / empty for a closed day. Checks what the location form checks: an end no earlier than its start (validateTimeInterval) and no two intervals starting or ending in the same hour (shared/utils/validateOpeningHoursDuplication.js).
 * @returns {{ closed?: boolean, intervals?: object[], error?: string }}
 */
const parseDayHours = (text, name) => {
  if (typeof text !== 'string') return { error: `${name} must be text such as 08:00-20:00, or closed` };
  const trimmed = text.trim();
  if (!trimmed || trimmed.toLowerCase() === 'closed') return { closed: true };
  const intervals = [];
  const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) {
    const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(parts[i]);
    if (!match) return { error: `${name} must look like 08:00-20:00, several separated by commas, or closed` };
    const [fromH, fromM, toH, toM] = match.slice(1).map(Number);
    if (fromH > 23 || toH > 23 || fromM > 59 || toM > 59) return { error: `${name} has a time that is not a time of day` };
    const from = convertTimeToDate(fromH, fromM);
    const to = convertTimeToDate(toH, toM);
    if (from.getTime() > to.getTime()) return { error: `${name}: choose an end time later than the start time` };
    intervals.push({ from, to });
  }
  const fromHours = intervals.map((interval) => interval.from.getUTCHours());
  const toHours = intervals.map((interval) => interval.to.getUTCHours());
  if (new Set(fromHours).size !== fromHours.length || new Set(toHours).size !== toHours.length) {
    return { error: `${name}: opening hours are duplicated for the same day` };
  }
  return { intervals };
};

const formatDayHours = (day) => {
  if (!day || !day.active) return 'closed';
  return (day.intervals || []).filter(Boolean).map((interval) => `${convertDateToTime(interval.from)}-${convertDateToTime(interval.to)}`).join(', ');
};

// Mirrors control/content/utils/helpers.js isValidRGBColor, rgbaToHex, getOpacityFromRGBA and locations/index.js applyMarkerColors.
const isValidRGBColor = (color) => {
  const rgbMatch = color.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgbMatch) return rgbMatch.slice(1, 4).map(Number).every((v) => v >= 0 && v <= 255);
  const rgbaMatch = color.match(/^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|1|0?\.\d+)\s*\)$/i);
  if (rgbaMatch) {
    const [r, g, b, a] = rgbaMatch.slice(1, 5).map(Number);
    return [r, g, b].every((v) => v >= 0 && v <= 255) && a >= 0 && a <= 1;
  }
  return false;
};
const applyMarkerColors = (color) => {
  const [r, g, b] = color.match(/\d+/g).map(Number);
  const opacityMatch = color.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(\d?\.?\d+)\s*\)/);
  return {
    backgroundCSS: `background: ${color}`,
    color,
    colorCSS: `color: ${color}`,
    colorHex: `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`,
    opacity: opacityMatch ? String(Math.round(parseFloat(opacityMatch[1]) * 100)) : '100'
  };
};

/**
 * Categories as the plugin's location import writes them (control/content/js/locations/index.js insertLocations): "Food -> Pizza, Shops" — categories separated by commas, a subcategory after an arrow. Unlike the import, a title no category has is refused rather than created: the location form only picks existing ones.
 */
const parseCategoriesText = (text, categories, name) => {
  if (typeof text !== 'string') return { error: `${name} must be text such as Food -> Pizza, Shops` };
  const main = [];
  const subcategories = [];
  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) {
    const [categoryTitle, subcategoryTitle] = parts[i].split('->').map((piece) => (piece || '').trim());
    const matches = categories.filter((cat) => cat.title === categoryTitle);
    if (!matches.length) return { error: `${name}: no category titled "${categoryTitle}"` };
    if (matches.length > 1) return { error: `${name}: ${matches.length} categories are titled "${categoryTitle}"` };
    const category = matches[0];
    if (main.indexOf(category.id) < 0) main.push(category.id);
    if (subcategoryTitle) {
      const subs = category.subcategories.filter((sub) => sub.title === subcategoryTitle);
      if (!subs.length) return { error: `${name}: no subcategory titled "${subcategoryTitle}" in "${categoryTitle}"` };
      if (subs.length > 1) return { error: `${name}: ${subs.length} subcategories of "${categoryTitle}" are titled "${subcategoryTitle}"` };
      if (subcategories.indexOf(subs[0].id) < 0) subcategories.push(subs[0].id);
    }
  }
  return { categories: { main, subcategories } };
};

// The categories export's format (exportLocations): one entry per chosen subcategory, or the category alone.
const formatCategoriesText = (locationCategories, categoriesById) => {
  const entries = [];
  ((locationCategories && locationCategories.main) || []).forEach((categoryId) => {
    const category = categoriesById[categoryId];
    if (!category) return;
    const subs = (category.subcategories || []).filter((sub) => locationCategories.subcategories.indexOf(sub.id) > -1);
    if (subs.length) subs.forEach((sub) => entries.push(`${category.title} -> ${sub.title}`));
    else entries.push(category.title);
  });
  return entries.join(', ');
};

/**
 * What every location result needs besides the record: the categories (to show their titles) and the settings (to label the location fields).
 */
const loadLocationContext = (callback) => {
  loadActiveCategories((err, categories) => {
    if (err) return callback(err, undefined);
    loadSettings((settingsErr, settings) => {
      if (settingsErr) return callback(settingsErr, undefined);
      const categoriesById = {};
      categories.forEach((cat) => { categoriesById[cat.id] = cat; });
      callback(null, { categories, categoriesById, settings });
    });
  });
};

const configuredFields = (settings) => FIELD_GROUPS.reduce((all, group) => all.concat(
  settings.customFields[group].map((field) => ({ field, group }))
), []);

const publicLocation = (loc, ctx) => {
  const days = (loc.openingHours && loc.openingHours.days) || {};
  const values = [...loc.additionalFields.quickActions, ...loc.additionalFields.content];
  return {
    id: loc.id,
    title: loc.title,
    subtitle: loc.subtitle,
    address: loc.address,
    formattedAddress: loc.formattedAddress,
    customName: loc.addressAlias,
    latitude: loc.coordinates.lat,
    longitude: loc.coordinates.lng,
    description: loc.description,
    listImage: loc.listImage,
    images: loc.images.map((image) => (typeof image === 'string' ? image : image.imageUrl)),
    categories: formatCategoriesText(loc.categories, ctx.categoriesById),
    categoryIds: loc.categories.main,
    subcategoryIds: loc.categories.subcategories,
    markerType: loc.marker.type,
    markerImage: loc.marker.image || null,
    markerColor: (loc.marker.color && loc.marker.color.color) || null,
    showCategory: !!loc.settings.showCategory,
    showOpeningHours: !!loc.settings.showOpeningHours,
    showPriceRange: !!loc.settings.showPriceRange,
    showStarRating: !!loc.settings.showStarRating,
    priceRange: loc.price.range,
    priceCurrency: loc.price.currency,
    openingHours: WEEK_DAYS.reduce((hours, day) => ({ ...hours, [day]: formatDayHours(days[day]) }), {}),
    actionItems: loc.actionItems,
    pinPosition: loc.pinIndex,
    rating: { average: loc.rating.average || 0, count: loc.rating.count || 0 },
    views: loc.views,
    bookmarksCount: loc.bookmarksCount,
    fields: configuredFields(ctx.settings).map(({ field }) => {
      const stored = values.find((value) => value.id === field.id) || {};
      return { fieldId: field.id, label: field.label, value: stored.value || null, customLabel: stored.customLabel || null };
    }),
    createdOn: toIso(loc.createdOn),
    lastUpdatedOn: toIso(loc.lastUpdatedOn)
  };
};

const recordToLocation = (record) => normalizeLocation({ ...record.data, id: record.id });

/**
 * The location a caller named by its exact title. A title several locations share is refused rather than resolved to one of them.
 */
const resolveLocationByTitle = (title, callback) => {
  buildfire.publicData.search({ filter: { '$json.title': title }, page: 0, pageSize: PAGE_SIZE }, LOCATIONS_TAG, (err, records) => {
    if (err) return callback(err, undefined);
    const found = (records || []).filter(Boolean);
    if (!found.length) return callback(new Error(`No location titled "${title}"`), undefined);
    if (found.length > 1) return callback(new Error(`${found.length} locations are titled "${title}"`), undefined);
    callback(null, recordToLocation(found[0]));
  });
};

// The advanced counterpart of resolveLocationByTitle: no search, but an id that matches nothing is still refused.
const requireLocationById = (locationId, callback) => {
  buildfire.publicData.getById(locationId, LOCATIONS_TAG, (err, record) => {
    if (err) return callback(err, undefined);
    if (isEmptyRecord(record)) return callback(new Error(`No location with id "${locationId}"`), undefined);
    callback(null, recordToLocation(record));
  });
};

const readActionItems = (value, name) => {
  if (!Array.isArray(value)) return { error: `${name} must be a list of actions` };
  const items = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.action !== 'string' || !item.action) {
      return { error: `${name}: every action needs its kind, such as linkToWeb or callNumber` };
    }
    // The location form stamps each action item with an id and drops repeated ids.
    const copy = { ...item, id: item.id || generateUUID() };
    if (!items.find((existing) => existing.id === copy.id)) items.push(copy);
  }
  return { items };
};

/**
 * The location details a create or an update passes, checked the way the location form checks them (control/content/js/locations/index.js locationInputValidation). Create names have no prefix; update names start with "new". Returns the changes to apply on the model, by model path.
 * @returns {{ apply?: function(object), error?: string }}
 */
const collectLocationFields = (options, ctx, isUpdate) => {
  const key = (name) => (isUpdate ? `new${name.charAt(0).toUpperCase()}${name.slice(1)}` : name);
  const steps = [];
  const given = (name) => isGiven(options[key(name)]);
  const value = (name) => options[key(name)];
  const fail = (error) => ({ error });

  const requiredText = (name, onSet) => {
    if (!given(name)) return null;
    if (value(name) === null || value(name) === '') return `${key(name)} cannot be removed; pass a non-empty value`;
    const read = readString(value(name), key(name));
    if (read.error) return read.error;
    steps.push((loc) => onSet(loc, read.value.trim()));
    return null;
  };
  const optionalText = (name, onSet) => {
    if (!given(name)) return null;
    if (value(name) === null || value(name) === '') {
      if (!isUpdate && value(name) === null) return `${key(name)} must be text`;
      steps.push((loc) => onSet(loc, null));
      return null;
    }
    const read = readString(value(name), key(name));
    if (read.error) return read.error;
    steps.push((loc) => onSet(loc, read.value.trim()));
    return null;
  };
  const flag = (name, setting) => {
    if (!given(name)) return null;
    const read = readBoolean(value(name), key(name));
    if (read.error) return read.error;
    steps.push((loc) => { loc.settings[setting] = read.value; });
    return null;
  };

  let error = requiredText('title', (loc, v) => { loc.title = v; })
    || optionalText('subtitle', (loc, v) => { loc.subtitle = v; })
    || optionalText('customName', (loc, v) => { loc.addressAlias = v; });
  if (error) return fail(error);

  // The address comes from the map picker with its coordinates, so the three always travel together.
  const addressNames = ['address', 'latitude', 'longitude'];
  const givenAddress = addressNames.filter(given);
  if (givenAddress.length && givenAddress.length < 3) {
    return fail(`Pass ${addressNames.map(key).join(', ')} together`);
  }
  if (givenAddress.length === 3) {
    if (value('address') === null || value('address') === '') return fail(`${key('address')} cannot be removed; pass a non-empty value`);
    const address = readString(value('address'), key('address'));
    if (address.error) return fail(address.error);
    const lat = readNumber(value('latitude'), key('latitude'), -90, 90);
    if (lat.error) return fail(lat.error);
    const lng = readNumber(value('longitude'), key('longitude'), -180, 180);
    if (lng.error) return fail(lng.error);
    // As the plugin's own imports do, the address given is also the address shown on the map.
    steps.push((loc) => {
      loc.address = address.value.trim();
      loc.formattedAddress = address.value.trim();
      loc.coordinates = { lat: lat.value, lng: lng.value };
    });
  }

  if (given('description')) {
    if (value('description') === null || value('description') === '') return fail(`${key('description')} cannot be removed; pass a non-empty description`);
    if (typeof value('description') !== 'string' || !value('description').trim()) return fail(`${key('description')} must be formatted text`);
    const description = value('description').trim();
    steps.push((loc) => { loc.description = description; });
  }

  if (given('listImage')) {
    if (value('listImage') === null) return fail(`${key('listImage')} cannot be removed; pass a list holding one image`);
    const read = readImageList(value('listImage'), { name: key('listImage'), minValue: 1, maxValue: 1 });
    if (read.error) return fail(read.error);
    steps.push((loc) => { loc.listImage = read.images[0]; });
  }

  if (given('images')) {
    if (value('images') === null) {
      if (!isUpdate) return fail(`${key('images')} must be a list of image URLs`);
      steps.push((loc) => { loc.images = []; });
    } else {
      const read = readImageList(value('images'), { name: key('images'), minValue: 0 });
      if (read.error) return fail(read.error);
      // Stored as the location form stores pictures: each with its own id.
      steps.push((loc) => { loc.images = read.images.map((imageUrl) => ({ id: generateUUID(), imageUrl })); });
    }
  }

  if (given('categories')) {
    if (value('categories') === null || value('categories') === '') {
      if (!isUpdate && value('categories') === null) return fail(`${key('categories')} must be text such as Food -> Pizza, Shops`);
      steps.push((loc) => { loc.categories = { main: [], subcategories: [] }; });
    } else {
      const parsed = parseCategoriesText(value('categories'), ctx.categories, key('categories'));
      if (parsed.error) return fail(parsed.error);
      steps.push((loc) => { loc.categories = parsed.categories; });
    }
  }

  if (given('markerType')) {
    const read = readSelect(value('markerType'), key('markerType'), ['pin', 'circle', 'image']);
    if (read.error) return fail(read.error);
    steps.push((loc) => { loc.marker = { ...loc.marker, type: read.value }; });
  }
  if (given('markerImage')) {
    if (value('markerImage') === null) {
      if (!isUpdate) return fail(`${key('markerImage')} must be a list of image URLs`);
      steps.push((loc) => { loc.marker = { ...loc.marker, image: null }; });
    } else {
      const read = readImageList(value('markerImage'), { name: key('markerImage'), minValue: 0, maxValue: 1 });
      if (read.error) return fail(read.error);
      steps.push((loc) => { loc.marker = { ...loc.marker, image: read.images.length ? read.images[0] : null }; });
    }
  }
  if (given('markerColor')) {
    if (value('markerColor') === null || value('markerColor') === '') {
      if (!isUpdate && value('markerColor') === null) return fail(`${key('markerColor')} must be a color such as rgba(253,35,5,1)`);
      steps.push((loc) => { loc.marker = { ...loc.marker, color: null }; });
    } else {
      if (typeof value('markerColor') !== 'string' || !isValidRGBColor(value('markerColor').trim())) {
        return fail(`${key('markerColor')} must be a color such as rgba(253,35,5,1)`);
      }
      const color = applyMarkerColors(value('markerColor').trim());
      steps.push((loc) => { loc.marker = { ...loc.marker, color }; });
    }
  }

  error = flag('showCategory', 'showCategory') || flag('showOpeningHours', 'showOpeningHours')
    || flag('showPriceRange', 'showPriceRange') || flag('showStarRating', 'showStarRating');
  if (error) return fail(error);

  if (given('priceRange')) {
    const read = readSelect(value('priceRange'), key('priceRange'), [1, 2, 3, 4]);
    if (read.error) return fail(read.error);
    steps.push((loc) => { loc.price = { ...loc.price, range: read.value }; });
  }
  if (given('priceCurrency')) {
    const read = readSelect(value('priceCurrency'), key('priceCurrency'), ['€', '$']);
    if (read.error) return fail(read.error);
    steps.push((loc) => { loc.price = { ...loc.price, currency: read.value }; });
  }

  for (let i = 0; i < WEEK_DAYS.length; i += 1) {
    const day = WEEK_DAYS[i];
    const name = `${day}Hours`;
    if (given(name)) {
      const raw = value(name);
      let parsed;
      if (raw !== null) parsed = parseDayHours(raw, key(name));
      else if (isUpdate) parsed = { closed: true };
      else parsed = { error: `${key(name)} must be text such as 08:00-20:00, or closed` };
      if (parsed.error) return fail(parsed.error);
      steps.push((loc) => {
        const current = loc.openingHours.days[day] || { index: i, active: true, intervals: [] };
        // A closed day keeps its hours, as the form's day checkbox does.
        loc.openingHours.days[day] = parsed.closed
          ? { ...current, index: i, active: false }
          : { ...current, index: i, active: true, intervals: parsed.intervals };
      });
    }
  }

  if (given('actionItems')) {
    if (value('actionItems') === null) {
      if (!isUpdate) return fail(`${key('actionItems')} must be a list of actions`);
      steps.push((loc) => { loc.actionItems = []; });
    } else {
      const read = readActionItems(value('actionItems'), key('actionItems'));
      if (read.error) return fail(read.error);
      steps.push((loc) => { loc.actionItems = read.items; });
    }
  }

  return { steps };
};

// The marker checks of locationInputValidation, on the location as it will be stored.
const checkMarker = (loc) => {
  if (loc.marker.type === 'circle' && !loc.marker.color) {
    // Picking the circle marker in the form fills in the default red when no color was chosen.
    loc.marker = { ...loc.marker, color: { ...DEFAULT_CIRCLE_MARKER_COLOR } };
  }
  if (loc.marker.type === 'image' && !loc.marker.image) return 'An image marker needs a marker image';
  return null;
};

const CREATE_REQUIRED = ['title', 'address', 'description'];

/**
 * A new location built from create options, checked first. Mirrors the location form's add path (renderAddLocationsPage + saveLocation): the model's defaults, the default opening hours, then the given details.
 * @returns {{ location?: object, error?: string }}
 */
const prepareLocationCreate = (options, ctx) => {
  const missing = CREATE_REQUIRED.find((name) => typeof options[name] !== 'string' || !options[name].trim());
  if (missing) return { error: `Missing required parameter: ${missing}` };
  if (!isGiven(options.latitude) || options.latitude === null) return { error: 'Missing required parameter: latitude' };
  if (!isGiven(options.longitude) || options.longitude === null) return { error: 'Missing required parameter: longitude' };
  if (!isGiven(options.listImage) || options.listImage === null) return { error: 'Missing required parameter: listImage' };
  const { steps, error } = collectLocationFields(options, ctx, false);
  if (error) return { error };
  const loc = normalizeLocation({ openingHours: defaultOpeningHours() });
  steps.forEach((step) => step(loc));
  const markerError = checkMarker(loc);
  if (markerError) return { error: markerError };
  // Every location field the settings define gets its (empty) value, as the form's getCustomFieldsValues does.
  loc.additionalFields = {
    quickActions: ctx.settings.customFields.quickActions.map((field) => ({ id: field.id, customLabel: null, value: null })),
    content: ctx.settings.customFields.content.map((field) => ({ id: field.id, customLabel: null, value: null }))
  };
  return { location: loc };
};

const locationEventData = (loc) => ({
  locationId: loc.id,
  title: loc.title,
  subtitle: loc.subtitle || null,
  address: loc.address,
  latitude: loc.coordinates.lat,
  longitude: loc.coordinates.lng,
  listImage: loc.listImage
});

/**
 * Mirrors LocationsController.createLocation (control) and WidgetController.createLocation (widget): a client id and creation stamp, the insert, then the viewed-analytics event, the deep link and the search engine entry, and the widget refresh.
 */
const insertLocation = (loc, user, ctx, callback) => {
  loc.clientId = generateUUID();
  loc.createdOn = new Date();
  loc.createdBy = user;
  buildfire.publicData.insert(locationToJSON(loc), LOCATIONS_TAG, (err, record) => {
    if (err) return callback(err, undefined);
    const saved = recordToLocation(record);
    registerAnalyticsEvent(`${saved.title} (Viewed)`, `locations_${saved.id}_viewed`);
    registerDeeplink(saved);
    saveSearchEngineEntry(saved);
    syncWidget('locations');
    sendEvent('locationCreated', { ...locationEventData(saved), createdOn: toIso(saved.createdOn), createdBy: eventUser(saved.createdBy) });
    callback(null, publicLocation(saved, ctx));
  });
};

/**
 * Mirrors LocationsController.updateLocation: the whole location written back with its update stamp, its deep link and search engine entry refreshed, and the widget told.
 */
const writeLocation = (loc, user, ctx, callback) => {
  loc.lastUpdatedOn = new Date();
  loc.lastUpdatedBy = user;
  buildfire.publicData.update(loc.id, locationToJSON(loc), LOCATIONS_TAG, (err, record) => {
    if (err) return callback(err, undefined);
    const saved = recordToLocation(record);
    registerDeeplink(saved);
    saveSearchEngineEntry(saved);
    syncWidget('locations');
    sendEvent('locationUpdated', { ...locationEventData(saved), lastUpdatedOn: toIso(saved.lastUpdatedOn), lastUpdatedBy: eventUser(saved.lastUpdatedBy) });
    callback(null, saved);
  });
};

const prepareLocationUpdate = (loc, options, ctx) => {
  const { steps, error } = collectLocationFields(options, ctx, true);
  if (error) return { error };
  if (!steps.length) return { error: 'Pass at least one detail to change' };
  const updated = normalizeLocation(JSON.parse(JSON.stringify(loc)));
  updated.id = loc.id;
  updated.openingHours = { ...updated.openingHours, days: { ...updated.openingHours.days } };
  steps.forEach((step) => step(updated));
  const markerError = checkMarker(updated);
  if (markerError) return { error: markerError };
  return { location: updated };
};

const applyLocationUpdate = (loc, options, user, ctx, callback) => {
  const { location, error } = prepareLocationUpdate(loc, options, ctx);
  if (error) return callback(new Error(error), undefined);
  writeLocation(location, user, ctx, (err, saved) => {
    if (err) return callback(err, undefined);
    callback(null, publicLocation(saved, ctx));
  });
};

/**
 * Mirrors LocationsController.deleteLocation: the location is removed for good, then its deep link and search engine entry, and the widget told.
 */
const removeLocation = (locationId, callback) => {
  buildfire.publicData.delete(locationId, LOCATIONS_TAG, (err) => {
    if (err) return callback(err, undefined);
    unregisterDeeplink(locationId);
    deleteSearchEngineEntry(locationId);
    syncWidget('locations');
    sendEvent('locationDeleted', { locationId });
    callback(null, { id: locationId });
  });
};

// ---- pins ----

const PINNED_FILTER = { '_buildfire.index.number1': { $in: [1, 2, 3] } };

const loadPinnedLocations = (callback) => {
  searchAllPublicData(PINNED_FILTER, { '_buildfire.index.number1': 1 }, LOCATIONS_TAG, (err, records) => {
    if (err) return callback(err, undefined);
    callback(null, records.map(recordToLocation));
  });
};

const writeSequentially = (locations, user, ctx, callback) => {
  const next = (index) => {
    if (index === locations.length) return callback(null);
    writeLocation(locations[index], user, ctx, (err) => {
      if (err) return callback(err);
      next(index + 1);
    });
  };
  next(0);
};

/**
 * Pins, moves or unpins one location. Pinning mirrors the list view's reorder (control/content/js/listView/index.js): every pinned location is renumbered 1..n in its new order, so two never share a place; unpinning mirrors its delete-pin, clearing only this location's place.
 */
const applyLocationPin = (loc, options, user, ctx, callback) => {
  const pinned = readBoolean(options.pinned, 'pinned');
  if (!isGiven(options.pinned) || options.pinned === null) return callback(new Error('Missing required parameter: pinned'), undefined);
  if (pinned.error) return callback(new Error(pinned.error), undefined);
  if (isGiven(options.position) && !pinned.value) return callback(new Error('position is only for pinning a location'), undefined);
  loadPinnedLocations((err, pinnedLocations) => {
    if (err) return callback(err, undefined);
    const others = pinnedLocations.filter((other) => other.id !== loc.id);
    const wasPinned = others.length !== pinnedLocations.length;
    const finish = (writeErr) => {
      if (writeErr) return callback(writeErr, undefined);
      loadPinnedLocations((reloadErr, nowPinned) => {
        if (reloadErr) return callback(reloadErr, undefined);
        callback(null, { locations: nowPinned.map((pinnedLoc) => publicLocation(pinnedLoc, ctx)) });
      });
    };
    if (!pinned.value) {
      if (!wasPinned && !loc.pinIndex) return finish(null);
      loc.pinIndex = null;
      return writeSequentially([loc], user, ctx, finish);
    }
    if (!wasPinned && others.length >= MAX_PINNED) return callback(new Error(`${MAX_PINNED} locations are pinned already`), undefined);
    let position = wasPinned ? pinnedLocations.findIndex((other) => other.id === loc.id) + 1 : others.length + 1;
    if (isGiven(options.position)) {
      const read = readPosition(options, others.length + 1);
      if (read.error) return callback(new Error(read.error), undefined);
      position = read.value;
    }
    const ordered = [...others];
    ordered.splice(position - 1, 0, loc);
    const changed = ordered.filter((pinnedLoc, index) => {
      const changes = pinnedLoc.pinIndex !== index + 1;
      pinnedLoc.pinIndex = index + 1;
      return changes;
    });
    writeSequentially(changed, user, ctx, finish);
  });
};

// ---- location field values ----

// Mirrors control/content/js/locations/customFields.js _validateFieldValue (phone, email, URL; a URL without its scheme gets https://).
const validateFieldValue = (value, fieldType) => {
  let parsedValue = value.trim();
  if (fieldType === 'PHONE') {
    if (!/^[0-9\s+\-()]+$/.test(parsedValue)) return { error: 'Enter a valid phone number' };
  } else if (fieldType === 'EMAIL') {
    const atIndex = parsedValue.indexOf('@');
    if (parsedValue.indexOf(' ') !== -1 || atIndex === -1 || parsedValue.indexOf('.', atIndex) === -1) return { error: 'Enter a valid email address' };
  } else if (fieldType === 'URL') {
    if (parsedValue.indexOf(' ') !== -1 || parsedValue.indexOf('.') === -1) return { error: 'Enter a valid URL' };
    if (!/^https?:\/\//i.test(parsedValue)) parsedValue = `https://${parsedValue}`;
  }
  return { value: parsedValue };
};

const findLocationField = (settings, { label, id }) => {
  const matches = configuredFields(settings).filter(({ field }) => (id ? field.id === id : field.label === label));
  if (!matches.length) return { error: id ? `No location field with id "${id}"` : `No location field labelled "${label}"` };
  if (matches.length > 1) return { error: `${matches.length} location fields are labelled "${label}"` };
  return matches[0];
};

/**
 * The value change for one location field, checked as the location form checks it: a required field can't be emptied, the value is checked for its type (text inputs take up to 150 characters), and a custom label (up to 50) only where the field allows one.
 */
const collectFieldValueChange = (options, field) => {
  const change = {};
  if (isGiven(options.value)) {
    if (options.value === null || options.value === '') {
      if (field.required) return { error: `"${field.label}" is required, so its value cannot be removed` };
      change.value = null;
    } else {
      if (typeof options.value !== 'string') return { error: 'value must be text' };
      if (field.type !== 'RICH_TEXT' && options.value.length > 150) return { error: 'value must be at most 150 characters' };
      const checked = field.type === 'RICH_TEXT' ? { value: options.value } : validateFieldValue(options.value, field.type);
      if (checked.error) return { error: checked.error };
      if (!checked.value.trim()) {
        if (field.required) return { error: `"${field.label}" is required, so its value cannot be removed` };
        change.value = null;
      } else change.value = checked.value;
    }
  }
  if (isGiven(options.customLabel)) {
    if (!field.enableCustomLabel) return { error: `"${field.label}" does not allow a custom label` };
    if (options.customLabel === null || options.customLabel === '') change.customLabel = null;
    else {
      const read = readString(options.customLabel, 'customLabel', { maxLength: 50 });
      if (read.error) return { error: read.error };
      change.customLabel = read.value;
    }
  }
  if (!Object.keys(change).length) return { error: 'Pass value or customLabel' };
  return { change };
};

/**
 * Sets one field's value on a location. The form rebuilds every location's values from the fields the settings define, in their order, so this does the same and changes only the one field.
 */
const applyFieldValue = (loc, match, change, user, ctx, callback) => {
  const { field, group } = match;
  const existing = [...loc.additionalFields.quickActions, ...loc.additionalFields.content];
  const rebuild = (fieldGroup) => ctx.settings.customFields[fieldGroup].map((configField) => {
    const stored = existing.find((value) => value.id === configField.id) || { id: configField.id, customLabel: null, value: null };
    if (configField.id !== field.id) return { id: stored.id, customLabel: stored.customLabel || null, value: stored.value || null };
    return {
      id: field.id,
      customLabel: isGiven(change.customLabel) ? change.customLabel : (stored.customLabel || null),
      value: isGiven(change.value) ? change.value : (stored.value || null)
    };
  });
  loc.additionalFields = { quickActions: rebuild('quickActions'), content: rebuild('content') };
  writeLocation(loc, user, ctx, (err, saved) => {
    if (err) return callback(err, undefined);
    const stored = saved.additionalFields[group].find((value) => value.id === field.id) || {};
    callback(null, {
      locationId: saved.id, fieldId: field.id, label: field.label, value: stored.value || null, customLabel: stored.customLabel || null
    });
  });
};

// ---------------------------------------------------------------------------
// Location fields (settings.customFields)
// ---------------------------------------------------------------------------

const readFieldType = (group, type, name) => {
  const read = readSelect(type, name, FIELD_TYPES.content);
  if (read.error) return read;
  if (FIELD_TYPES[group].indexOf(type) < 0) return { error: `${name}: quick action fields take only ${FIELD_TYPES.quickActions.join(', ')}` };
  return read;
};

/**
 * A new field, shaped as the location fields page adds it (initLocationFields): a new id, visible to everyone (who sees a field is an access setting, left to the control panel).
 */
const prepareFieldCreate = (options) => {
  if (!isGiven(options.group) || options.group === null) return { error: 'Missing required parameter: group' };
  const group = readSelect(options.group, 'group', FIELD_GROUPS);
  if (group.error) return { error: group.error };
  if (!isGiven(options.label) || options.label === null || options.label === '') return { error: 'Missing required parameter: label' };
  const label = readString(options.label, 'label');
  if (label.error) return { error: label.error };
  let type = 'EMAIL';
  if (isGiven(options.type)) {
    const read = readFieldType(group.value, options.type, 'type');
    if (read.error) return { error: read.error };
    type = read.value;
  }
  let required = false;
  if (isGiven(options.required)) {
    const read = readBoolean(options.required, 'required');
    if (read.error) return { error: read.error };
    required = read.value;
  }
  let enableCustomLabel = false;
  if (isGiven(options.allowCustomLabel)) {
    const read = readBoolean(options.allowCustomLabel, 'allowCustomLabel');
    if (read.error) return { error: read.error };
    enableCustomLabel = read.value;
  }
  return {
    group: group.value,
    field: {
      id: generateUUID(), label: label.value.trim(), type, required, enableCustomLabel, visibility: { value: 'ALL', tags: [] }
    }
  };
};

const collectFieldChanges = (options, group) => {
  const changes = {};
  if (isGiven(options.newLabel)) {
    if (options.newLabel === null || options.newLabel === '') return { error: 'newLabel cannot be removed; pass a non-empty label' };
    const read = readString(options.newLabel, 'newLabel');
    if (read.error) return { error: read.error };
    changes.label = read.value.trim();
  }
  if (isGiven(options.newType)) {
    const read = readFieldType(group, options.newType, 'newType');
    if (read.error) return { error: read.error };
    changes.type = read.value;
  }
  if (isGiven(options.newRequired)) {
    const read = readBoolean(options.newRequired, 'newRequired');
    if (read.error) return { error: read.error };
    changes.required = read.value;
  }
  if (isGiven(options.newAllowCustomLabel)) {
    const read = readBoolean(options.newAllowCustomLabel, 'newAllowCustomLabel');
    if (read.error) return { error: read.error };
    changes.enableCustomLabel = read.value;
  }
  if (!Object.keys(changes).length) return { error: 'Pass at least one of newLabel, newType, newRequired or newAllowCustomLabel' };
  return { changes };
};

/**
 * Saves the settings after a location field change, the way the location fields page does: fields without a label or type are dropped, and the widget is told to reload its custom fields. The page writes { $set: { customFields } }; the whole settings document is saved here, with the same customFields, which stores the same result.
 */
const saveFieldSettings = (settings, user, callback) => {
  settings.customFields = {
    quickActions: settings.customFields.quickActions.filter((item) => item.label && item.type),
    content: settings.customFields.content.filter((item) => item.label && item.type)
  };
  saveSettings(settings, user, (err, saved) => {
    if (err) return callback(err, undefined);
    syncWidget('customFields');
    callback(null, saved);
  });
};

// ---------------------------------------------------------------------------
// Settings update
// ---------------------------------------------------------------------------

/**
 * The changes an updateSettings call asks for, each checked like its control in the control panel, as functions applied to the settings model. Groups record which widget sync scopes the save must announce.
 */
const collectSettingsChanges = (options, current) => {
  const steps = [];
  const scopes = new Set(['settings']);
  const failures = [];
  const bool = (name, apply, scope) => {
    if (!isGiven(options[name])) return;
    const read = readBoolean(options[name], name);
    if (read.error) return failures.push(read.error);
    steps.push((s) => apply(s, read.value));
    if (scope) scopes.add(scope);
  };
  const select = (name, allowed, apply, scope) => {
    if (!isGiven(options[name])) return;
    const read = readSelect(options[name], name, allowed);
    if (read.error) return failures.push(read.error);
    steps.push((s) => apply(s, read.value));
    if (scope) scopes.add(scope);
  };

  bool('subscriptionEnabled', (s, v) => { s.subscription = { ...s.subscription, enabled: v }; });
  select('measurementUnit', ['metric', 'imperial'], (s, v) => { s.measurementUnit = v; });
  bool('initialArea', (s, v) => { s.map = { ...s.map, initialArea: v }; });

  const trio = (names, apply, scope) => {
    const given = names.filter((name) => isGiven(options[name]));
    if (!given.length) return;
    if (given.length < names.length) return failures.push(`Pass ${names.join(', ')} together`);
    const address = readString(options[names[0]], names[0]);
    if (address.error) return failures.push(address.error);
    const lat = readNumber(options[names[1]], names[1], -90, 90);
    if (lat.error) return failures.push(lat.error);
    const lng = readNumber(options[names[2]], names[2], -180, 180);
    if (lng.error) return failures.push(lng.error);
    steps.push((s) => apply(s, address.value.trim(), lat.value, lng.value));
    if (scope) scopes.add(scope);
  };
  trio(['initialAreaAddress', 'initialAreaLatitude', 'initialAreaLongitude'], (s, address, lat, lng) => {
    s.map = { ...s.map, initialAreaDisplayAddress: address, initialAreaCoordinates: { lat, lng } };
  });

  ['hideSorting', 'allowSortByReverseAlphabetical', 'allowSortByNearest', 'allowSortByPriceLowToHigh', 'allowSortByPriceHighToLow', 'allowSortByDate', 'allowSortByRating', 'allowSortByViews']
    .forEach((name) => bool(name, (s, v) => { s.sorting = { ...s.sorting, [name]: v }; }));
  select('defaultSorting', ['distance', 'alphabetical'], (s, v) => { s.sorting = { ...s.sorting, defaultSorting: v }; });

  ['allowFilterByArea', 'allowFilterByBookmarks', 'hideOpeningHoursFilter', 'hidePriceFilter']
    .forEach((name) => bool(name, (s, v) => { s.filter = { ...s.filter, [name]: v }; }));

  bool('bookmarksEnabled', (s, v) => { s.bookmarks = { ...s.bookmarks, enabled: v }; });
  bool('allowBookmarkLocations', (s, v) => { s.bookmarks = { ...s.bookmarks, allowForLocations: v }; });
  bool('allowBookmarkSearch', (s, v) => { s.bookmarks = { ...s.bookmarks, allowForFilters: v }; });

  // Turning a location detail off also stops people adding it in the app (control/settings/js/pages/locationSettings.js).
  const entryToggle = (name, entry) => bool(name, (s, v) => {
    const next = { ...s.globalEntries[entry], enabled: v };
    if (!v) { next.inAppEnabled = 'none'; next.tags = []; }
    s.globalEntries = { ...s.globalEntries, [entry]: next };
  }, 'locationSettings');
  entryToggle('openHoursEnabled', 'openHours');
  entryToggle('priceRangeEnabled', 'priceRange');

  if (isGiven(options.paymentDetails)) {
    if (options.paymentDetails !== null && typeof options.paymentDetails !== 'string') failures.push('paymentDetails must be formatted text');
    else {
      // The payment details editor stores an emptied editor as ''.
      const description = options.paymentDetails === null ? '' : options.paymentDetails;
      steps.push((s) => { s.globalEntries = { ...s.globalEntries, charging: { ...s.globalEntries.charging, description } }; });
      scopes.add('paymentDetailsUpdated');
    }
  }
  select('timeFormat', ['12H', '24H'], (s, v) => { s.locationEditors = { ...s.locationEditors, time: v }; });

  const design = (name, field, allowed) => (allowed
    ? select(name, allowed, (s, v) => { s.design = { ...s.design, [field]: v }; }, 'design')
    : bool(name, (s, v) => { s.design = { ...s.design, [field]: v }; }, 'design'));
  design('listViewPosition', 'listViewPosition', ['expanded', 'collapsed', 'halfExpanded']);
  design('listViewStyle', 'listViewStyle', ['backgroundImage', 'smallImage']);
  design('mapType', 'defaultMapType', ['streets', 'satellite']);
  design('detailsMapPosition', 'detailsMapPosition', ['top', 'bottom']);
  ['enableMapTerrainView', 'hideQuickFilter', 'allowStyleSelection', 'showDetailsCategory', 'showContributorName']
    .forEach((name) => design(name, name));

  const intro = (apply) => (s) => { s.introductoryListView = apply({ ...s.introductoryListView }); };
  if (isGiven(options.introImages)) {
    if (options.introImages === null) {
      steps.push(intro((i) => ({ ...i, images: [] })));
      scopes.add('intro');
    } else if (!Array.isArray(options.introImages)) failures.push('introImages must be a list of pictures with their actions');
    else {
      const bad = options.introImages.findIndex((item) => !item || typeof item !== 'object' || typeof item.iconUrl !== 'string' || !item.iconUrl || typeof item.action !== 'string' || !item.action);
      if (bad > -1) failures.push(`introImages: entry ${bad} needs a picture (iconUrl) and an action`);
      else {
        // The carousel editor's onAddItems stamps each picture with an id.
        const images = options.introImages.map((item) => ({ ...item, id: item.id || generateUUID() }));
        steps.push(intro((i) => ({ ...i, images })));
        scopes.add('intro');
      }
    }
  }
  if (isGiven(options.introDescription)) {
    if (options.introDescription !== null && typeof options.introDescription !== 'string') failures.push('introDescription must be formatted text');
    else {
      steps.push(intro((i) => ({ ...i, description: options.introDescription })));
      scopes.add('intro');
    }
  }
  select('introSorting', ['distance', 'alphabetical', 'newest'], (s, v) => { s.introductoryListView = { ...s.introductoryListView, sorting: v }; }, 'intro');
  select('introLocationSource', ['All', 'UserPosition', 'AreaRadius', 'MyLocations'], (s, v) => {
    s.introductoryListView = { ...s.introductoryListView, searchOptions: { ...(s.introductoryListView.searchOptions || {}), mode: v } };
  }, 'intro');
  const withArea = (s, apply) => {
    const searchOptions = { ...(s.introductoryListView.searchOptions || { mode: 'UserPosition' }) };
    searchOptions.areaRadiusOptions = apply({ ...(searchOptions.areaRadiusOptions || {}) });
    s.introductoryListView = { ...s.introductoryListView, searchOptions };
  };
  trio(['introAreaAddress', 'introAreaLatitude', 'introAreaLongitude'], (s, address, lat, lng) => {
    withArea(s, (area) => ({ ...area, formattedLocation: address, lat, lng }));
  }, 'intro');
  if (isGiven(options.introAreaRadius)) {
    const read = readNumber(options.introAreaRadius, 'introAreaRadius', 1, 200);
    if (read.error) failures.push(read.error);
    else {
      steps.push((s) => withArea(s, (area) => ({ ...area, radius: read.value })));
      scopes.add('intro');
    }
  }

  if (failures.length) return { error: failures[0] };
  if (!steps.length) return { error: 'Pass at least one setting to change' };

  // The sorting page: without nearest first, distance can't be the default and alphabetical takes its place.
  const nearest = isGiven(options.allowSortByNearest) ? options.allowSortByNearest : current.sorting.allowSortByNearest;
  if (nearest === false && options.defaultSorting === 'distance') {
    return { error: 'defaultSorting can be distance only while allowSortByNearest is on' };
  }
  if (nearest === false) steps.push((s) => { s.sorting = { ...s.sorting, defaultSorting: 'alphabetical' }; });
  return { steps, scopes };
};

// ---------------------------------------------------------------------------
// Language texts
// ---------------------------------------------------------------------------

const textDefinition = (key) => {
  if (typeof key !== 'string') return null;
  const [section, label] = key.split('.');
  return (LANGUAGE_TEXTS[section] && LANGUAGE_TEXTS[section].labels[label]) ? { section, label, def: LANGUAGE_TEXTS[section].labels[label] } : null;
};

// Mirrors the Strings constructor's data (shared/strings.js): every label with its default, required and placeholder marks.
const buildLanguageData = (stored) => {
  const data = {};
  Object.keys(LANGUAGE_TEXTS).forEach((section) => {
    data[section] = {};
    Object.keys(LANGUAGE_TEXTS[section].labels).forEach((label) => {
      const def = LANGUAGE_TEXTS[section].labels[label];
      data[section][label] = { defaultValue: def.defaultValue, required: def.required, isPlaceHolder: def.isPlaceHolder };
      const storedLabel = stored && stored[section] && stored[section][label];
      if (storedLabel && storedLabel.value !== undefined) data[section][label].value = storedLabel.value;
    });
  });
  return data;
};

// Mirrors Strings.refresh: the language's one record, read with search because get has an edge-case bug.
const loadLanguageRecord = (callback) => {
  buildfire.datastore.search({ limit: 1 }, LANGUAGE_TAG, (err, records) => {
    if (err) return callback(err, undefined);
    callback(null, (records && records.length) ? records[0] : null);
  });
};

// Mirrors Strings.get: a set value shows; an empty one only where the text may be empty; otherwise the default.
const publicText = (section, label, data) => {
  const def = LANGUAGE_TEXTS[section].labels[label];
  const l = (data && data[section] && data[section][label]) || {};
  const shown = (l.value || (l.value === '' && !def.required)) ? l.value : (def.defaultValue || '');
  return {
    key: `${section}.${label}`,
    section,
    title: def.title,
    value: shown,
    defaultValue: def.defaultValue || '',
    customized: l.value !== undefined && l.value !== null,
    required: !!def.required,
    maxLength: def.maxLength
  };
};

const listTexts = (data, onlySection) => {
  const texts = [];
  Object.keys(LANGUAGE_TEXTS).filter((section) => !onlySection || section === onlySection).forEach((section) => {
    Object.keys(LANGUAGE_TEXTS[section].labels).forEach((label) => texts.push(publicText(section, label, data)));
  });
  return texts;
};

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

/**
 * Applies each prepared entry in turn through the single operation's own implementation, recording every outcome; a failed write does not stop the rest.
 */
const runBatch = (count, applyEntry, resultKey, callback) => {
  const results = [];
  const next = (index) => {
    if (index === count) {
      const failed = results.filter((r) => r.error).length;
      return callback(null, { [resultKey]: results, succeeded: results.length - failed, failed });
    }
    applyEntry(index, (err, id) => {
      results.push({ index, id: err ? null : id, error: err ? (err.message || String(err)) : null });
      next(index + 1);
    });
  };
  next(0);
};

// Checks every id before any write: unknown ids fail the whole call, naming each entry.
const requireAllById = (ids, requireById, callback) => {
  const found = [];
  const unknown = [];
  let pending = ids.length;
  ids.forEach((id, index) => {
    requireById(id, (err, record) => {
      if (err) unknown.push(`entry ${index}: ${err.message || err}`);
      else found[index] = record;
      pending -= 1;
      if (pending === 0) {
        if (unknown.length) return callback(new Error(`Not found: ${unknown.join('; ')}`), undefined);
        callback(null, found);
      }
    });
  });
};

const refuseDuplicates = (values, what) => (new Set(values).size !== values.length ? `The same ${what} is listed more than once` : null);

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

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

  // ======================= Locations =======================

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Uses only buildfire.publicData and buildfire.datastore, which behave the same in both frames and on the server; a read, so nothing needs watching. Multi-step: a category title is resolved to its id before the location search (the widget filters on "c_<id>" / "s_<id>" in _buildfire.index.array1, widget/services/search/shared.js), which is why it is not declarative. Text search mirrors the control panel's ($regex on _buildfire.index.text, case-insensitive, with the text escaped so it matches literally); title order is _buildfire.index.string1; pinned order is _buildfire.index.number1. One page of 50, with recordCount's totalRecord telling whether another exists.
   * @param {{ searchText?: string, title?: string, categoryTitle?: string, subcategoryTitle?: string, pinnedOnly?: boolean, page?: number }} options
   * @param {function(Error=, object=)} callback - (error, { locations, total, page, hasMore })
   */
  searchLocations(options, callback) {
    requireCallback(callback);
    if (options === null || typeof options !== 'object') return callback(new Error('options must be an object'), undefined);
    const textParams = ['searchText', 'title', 'categoryTitle', 'subcategoryTitle'];
    const badText = textParams.find((name) => isGiven(options[name]) && (typeof options[name] !== 'string' || !options[name].trim()));
    if (badText) return callback(new Error(`${badText} must be non-empty text`), undefined);
    if (isGiven(options.pinnedOnly) && typeof options.pinnedOnly !== 'boolean') return callback(new Error('pinnedOnly must be true or false'), undefined);
    if (isGiven(options.page) && (!Number.isInteger(options.page) || options.page < 0)) return callback(new Error('page must be a whole number from 0'), undefined);
    if (isGiven(options.subcategoryTitle) && !isGiven(options.categoryTitle)) return callback(new Error('subcategoryTitle needs categoryTitle'), undefined);
    const page = options.page || 0;

    loadLocationContext((ctxErr, ctx) => {
      if (ctxErr) return callback(ctxErr, undefined);
      const filter = {};
      if (options.searchText) filter['_buildfire.index.text'] = { $regex: escapeRegex(options.searchText.trim()), $options: 'i' };
      if (options.title) filter['$json.title'] = options.title;
      if (options.pinnedOnly) Object.assign(filter, PINNED_FILTER);
      if (options.categoryTitle) {
        const categories = ctx.categories.filter((cat) => cat.title === options.categoryTitle);
        if (!categories.length) return callback(new Error(`No category titled "${options.categoryTitle}"`), undefined);
        if (categories.length > 1) return callback(new Error(`${categories.length} categories are titled "${options.categoryTitle}"`), undefined);
        let indexKey = `c_${categories[0].id}`;
        if (options.subcategoryTitle) {
          const found = findSubcategory(categories[0], { title: options.subcategoryTitle });
          if (found.error) return callback(new Error(found.error), undefined);
          indexKey = `s_${found.subcategory.id}`;
        }
        filter['_buildfire.index.array1.string1'] = indexKey;
      }
      const sort = options.pinnedOnly ? { '_buildfire.index.number1': 1 } : { '_buildfire.index.string1': 1 };
      buildfire.publicData.search({
        filter, sort, page, pageSize: PAGE_SIZE, recordCount: true
      }, LOCATIONS_TAG, (err, response) => {
        if (err) return callback(err, undefined);
        const result = ((response && response.result) || []).filter(Boolean);
        const total = (response && response.totalRecord) || 0;
        callback(null, {
          locations: result.map((record) => publicLocation(recordToLocation(record), ctx)),
          total,
          page,
          hasMore: (page + 1) * PAGE_SIZE < total
        });
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Shows one location, named by its exact title; a title several locations share is refused. Uses only buildfire.publicData and buildfire.datastore (for the category titles and field labels it shows), the same in both frames and on the server; a read, nothing to watch. Resolving the title is a search, which is why this is a function. usage: basic; its advanced alternative is getLocationAdvanced.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, location)
   */
  getLocation(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    resolveLocationByTitle(options.title, (err, loc) => {
      if (err) return callback(err, undefined);
      loadLocationContext((ctxErr, ctx) => {
        if (ctxErr) return callback(ctxErr, undefined);
        callback(null, publicLocation(loc, ctx));
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of getLocation, taking the location's id; an id that matches nothing is refused. Same hosts and reasons as getLocation.
   * @param {{ locationId: string }} options
   * @param {function(Error=, object=)} callback - (error, location)
   */
  getLocationAdvanced(options, callback) {
    if (!requireStringParams(options, ['locationId'], callback)) return;
    requireLocationById(options.locationId, (err, loc) => {
      if (err) return callback(err, undefined);
      loadLocationContext((ctxErr, ctx) => {
        if (ctxErr) return callback(ctxErr, undefined);
        callback(null, publicLocation(loc, ctx));
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Adds a location as the control panel's location form and the app's create view do (LocationsController.createLocation / WidgetController.createLocation): the form's checks (title, address with its coordinates, description and list image required; an image marker needs its image; opening hours valid and not duplicated), the default opening hours, a client id and stamp, the insert, then the analytics event, deep link, search engine entry, widget refresh and the locationCreated event. Categories are named as the plugin's import names them and must exist. The recorded creator is whoever the frame has signed in (null on the server), as the plugin records the current user. Location field values are set with updateLocationFieldValue: the form asks for them on the same page, so a required field is not enforced here. Pinning is updateLocationPin. Uses only the SDK's stores and fire-and-forget calls, so it also runs on the server; it adds content, it does not publish or contact anyone, so Background in both frames.
   * @param {object} options - the location's details, as declared.
   * @param {function(Error=, object=)} callback - (error, new location)
   */
  createLocation(options, callback) {
    requireCallback(callback);
    if (options === null || typeof options !== 'object') return callback(new Error('options must be an object'), undefined);
    loadLocationContext((ctxErr, ctx) => {
      if (ctxErr) return callback(ctxErr, undefined);
      const { location, error } = prepareLocationCreate(options, ctx);
      if (error) return callback(new Error(error), undefined);
      getRecordingUser((user) => insertLocation(location, user, ctx, callback));
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced (batches are never basic). The batch form of createLocation: validates every entry with createLocation's own checks before adding anything, then adds each through the same insertLocation, so every location gets every side effect and event. A failed insert is reported per entry; it does not stop the rest. The plugin's import uses bulkInsert, but registers the deep links and search entries by re-reading the newest locations afterwards; one insert per entry gives each its own, which is why this does not bulk insert.
   * @param {{ locations: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  createLocationsAdvanced(options, callback) {
    const entries = readListParam(options, 'locations', BATCH_LIMIT, callback);
    if (!entries) return;
    loadLocationContext((ctxErr, ctx) => {
      if (ctxErr) return callback(ctxErr, undefined);
      const prepared = entries.map((entry) => prepareLocationCreate(entry, ctx));
      const invalid = prepared.map((p, index) => (p.error ? `entry ${index}: ${p.error}` : null)).filter(Boolean);
      if (invalid.length) return callback(new Error(`Invalid entries: ${invalid.join('; ')}`), undefined);
      getRecordingUser((user) => {
        runBatch(prepared.length, (index, done) => insertLocation(prepared[index].location, user, ctx, (err, loc) => done(err, loc && loc.id)), 'locations', callback);
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Edits one location, named by its exact current title, changing only the details passed (left out keeps, null or '' clears a removable one), with the location form's checks. Writes the whole location back as LocationsController.updateLocation does, refreshing its deep link and search engine entry, the widget and firing locationUpdated. Uses only the SDK's stores, so it also runs on the server; an edit, nothing to watch, so Background. Resolving the title is a search, which is why this is a function. usage: basic; its advanced alternative is updateLocationAdvanced.
   * @param {object} options - title plus the new* details, as declared.
   * @param {function(Error=, object=)} callback - (error, changed location)
   */
  updateLocation(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    resolveLocationByTitle(options.title, (err, loc) => {
      if (err) return callback(err, undefined);
      loadLocationContext((ctxErr, ctx) => {
        if (ctxErr) return callback(ctxErr, undefined);
        getRecordingUser((user) => applyLocationUpdate(loc, options, user, ctx, callback));
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of updateLocation, taking the location's id instead of its title. Same hosts, checks and effects, via the same applyLocationUpdate; it checks the id exists instead of searching.
   * @param {object} options - locationId plus the new* details, as declared.
   * @param {function(Error=, object=)} callback - (error, changed location)
   */
  updateLocationAdvanced(options, callback) {
    if (!requireStringParams(options, ['locationId'], callback)) return;
    requireLocationById(options.locationId, (err, loc) => {
      if (err) return callback(err, undefined);
      loadLocationContext((ctxErr, ctx) => {
        if (ctxErr) return callback(ctxErr, undefined);
        getRecordingUser((user) => applyLocationUpdate(loc, options, user, ctx, callback));
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced. The batch form of updateLocationAdvanced: checks every entry and every id before writing anything (an unknown id or a location listed twice fails the whole call), then applies each through the same prepare/write path, so every location gets every side effect and event. A failed write is reported per entry.
   * @param {{ locations: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  updateLocationsAdvanced(options, callback) {
    const entries = readListParam(options, 'locations', BATCH_LIMIT, callback);
    if (!entries) return;
    const missing = entries.map((entry, index) => ((typeof entry.locationId !== 'string' || !entry.locationId) ? `entry ${index}: missing locationId` : null)).filter(Boolean);
    if (missing.length) return callback(new Error(`Invalid entries: ${missing.join('; ')}`), undefined);
    const duplicate = refuseDuplicates(entries.map((entry) => entry.locationId), 'location');
    if (duplicate) return callback(new Error(duplicate), undefined);
    loadLocationContext((ctxErr, ctx) => {
      if (ctxErr) return callback(ctxErr, undefined);
      requireAllById(entries.map((entry) => entry.locationId), requireLocationById, (idErr, locations) => {
        if (idErr) return callback(idErr, undefined);
        const prepared = entries.map((entry, index) => prepareLocationUpdate(locations[index], entry, ctx));
        const invalid = prepared.map((p, index) => (p.error ? `entry ${index}: ${p.error}` : null)).filter(Boolean);
        if (invalid.length) return callback(new Error(`Invalid entries: ${invalid.join('; ')}`), undefined);
        getRecordingUser((user) => {
          runBatch(prepared.length, (index, done) => writeLocation(prepared[index].location, user, ctx, (err, saved) => done(err, saved && saved.id)), 'locations', callback);
        });
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Removes one location for good, named by its exact title, as the control panel's delete and the app's report handling do (LocationsController.deleteLocation / WidgetController.deleteLocation): the hard delete, then its deep link and search engine entry, the widget refresh and locationDeleted. Uses only the SDK's stores, so it also runs on the server, where the dangerous flag makes the MCP ask first; it removes content, it does not contact anyone, so Background. usage: basic; its advanced alternative is deleteLocationAdvanced.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, { id })
   */
  deleteLocation(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    resolveLocationByTitle(options.title, (err, loc) => {
      if (err) return callback(err, undefined);
      removeLocation(loc.id, callback);
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of deleteLocation, taking the location's id; an id that matches nothing is refused. Same hosts and effects via the same removeLocation.
   * @param {{ locationId: string }} options
   * @param {function(Error=, object=)} callback - (error, { id })
   */
  deleteLocationAdvanced(options, callback) {
    if (!requireStringParams(options, ['locationId'], callback)) return;
    requireLocationById(options.locationId, (err, loc) => {
      if (err) return callback(err, undefined);
      removeLocation(loc.id, callback);
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced. The batch form of deleteLocationAdvanced: every id is checked before anything is removed (an unknown id or a location listed twice fails the whole call), then each goes through removeLocation. A failed delete is reported per entry.
   * @param {{ locations: Array<{ locationId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  deleteLocationsAdvanced(options, callback) {
    const entries = readListParam(options, 'locations', BATCH_LIMIT, callback);
    if (!entries) return;
    const missing = entries.map((entry, index) => ((typeof entry.locationId !== 'string' || !entry.locationId) ? `entry ${index}: missing locationId` : null)).filter(Boolean);
    if (missing.length) return callback(new Error(`Invalid entries: ${missing.join('; ')}`), undefined);
    const duplicate = refuseDuplicates(entries.map((entry) => entry.locationId), 'location');
    if (duplicate) return callback(new Error(duplicate), undefined);
    requireAllById(entries.map((entry) => entry.locationId), requireLocationById, (idErr, locations) => {
      if (idErr) return callback(idErr, undefined);
      runBatch(locations.length, (index, done) => removeLocation(locations[index].id, (err) => done(err, locations[index].id)), 'locations', callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Pins a location (named by its exact title) to the top of the list, moves it among the pinned ones, or unpins it: the list view tab's pins (up to 3). Pinning renumbers every pinned location 1..n in the new order, as the tab's reorder does; unpinning clears only this location's place, as the tab's delete-pin does. Each changed location is written through the same path as updateLocation. No widget host: only the control panel pins. Uses only the SDK's stores, so it also runs on the server; an edit, nothing to watch, so Background. usage: basic; its advanced alternative is updateLocationPinAdvanced.
   * @param {{ title: string, pinned: boolean, position?: number }} options
   * @param {function(Error=, object=)} callback - (error, { locations })
   */
  updateLocationPin(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    resolveLocationByTitle(options.title, (err, loc) => {
      if (err) return callback(err, undefined);
      loadLocationContext((ctxErr, ctx) => {
        if (ctxErr) return callback(ctxErr, undefined);
        getRecordingUser((user) => applyLocationPin(loc, options, user, ctx, callback));
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateLocationPin, taking the location's id; an id that matches nothing is refused. Same hosts and effects via the same applyLocationPin.
   * @param {{ locationId: string, pinned: boolean, position?: number }} options
   * @param {function(Error=, object=)} callback - (error, { locations })
   */
  updateLocationPinAdvanced(options, callback) {
    if (!requireStringParams(options, ['locationId'], callback)) return;
    requireLocationById(options.locationId, (err, loc) => {
      if (err) return callback(err, undefined);
      loadLocationContext((ctxErr, ctx) => {
        if (ctxErr) return callback(ctxErr, undefined);
        getRecordingUser((user) => applyLocationPin(loc, options, user, ctx, callback));
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Sets one location field's value (and custom label, where the field allows one) on a location named by its exact title, the field named by its exact label; the location form's checks apply (required fields can't be emptied, email / phone / URL values checked, a URL without its scheme gets https://). Written through the same path as updateLocation. Both the control panel's form and the app's create/edit views fill these values, and only the SDK's stores are used, so all three hosts; nothing to watch, so Background. usage: basic; its advanced alternative is updateLocationFieldValueAdvanced.
   * @param {{ title: string, fieldLabel: string, value?: string|null, customLabel?: string|null }} options
   * @param {function(Error=, object=)} callback - (error, field value)
   */
  updateLocationFieldValue(options, callback) {
    if (!requireStringParams(options, ['title', 'fieldLabel'], callback)) return;
    resolveLocationByTitle(options.title, (err, loc) => {
      if (err) return callback(err, undefined);
      loadLocationContext((ctxErr, ctx) => {
        if (ctxErr) return callback(ctxErr, undefined);
        const match = findLocationField(ctx.settings, { label: options.fieldLabel });
        if (match.error) return callback(new Error(match.error), undefined);
        const { change, error } = collectFieldValueChange(options, match.field);
        if (error) return callback(new Error(error), undefined);
        getRecordingUser((user) => applyFieldValue(loc, match, change, user, ctx, callback));
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of updateLocationFieldValue, taking the location's and the field's ids; unknown ids are refused. Same hosts and effects via the same applyFieldValue.
   * @param {{ locationId: string, fieldId: string, value?: string|null, customLabel?: string|null }} options
   * @param {function(Error=, object=)} callback - (error, field value)
   */
  updateLocationFieldValueAdvanced(options, callback) {
    if (!requireStringParams(options, ['locationId', 'fieldId'], callback)) return;
    requireLocationById(options.locationId, (err, loc) => {
      if (err) return callback(err, undefined);
      loadLocationContext((ctxErr, ctx) => {
        if (ctxErr) return callback(ctxErr, undefined);
        const match = findLocationField(ctx.settings, { id: options.fieldId });
        if (match.error) return callback(new Error(match.error), undefined);
        const { change, error } = collectFieldValueChange(options, match.field);
        if (error) return callback(new Error(error), undefined);
        getRecordingUser((user) => applyFieldValue(loc, match, change, user, ctx, callback));
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced. The batch form of updateLocationFieldValueAdvanced: every entry's field and value are checked and every location id is checked before anything is written (unknown ids, or the same location listed twice, fail the whole call), then each is applied through the same applyFieldValue. A failed write is reported per entry.
   * @param {{ locations: Array<{ locationId: string, fieldId: string, value?: string|null, customLabel?: string|null }> }} options
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  updateLocationsFieldValueAdvanced(options, callback) {
    const entries = readListParam(options, 'locations', BATCH_LIMIT, callback);
    if (!entries) return;
    const missing = entries.map((entry, index) => {
      if (typeof entry.locationId !== 'string' || !entry.locationId) return `entry ${index}: missing locationId`;
      if (typeof entry.fieldId !== 'string' || !entry.fieldId) return `entry ${index}: missing fieldId`;
      return null;
    }).filter(Boolean);
    if (missing.length) return callback(new Error(`Invalid entries: ${missing.join('; ')}`), undefined);
    const duplicate = refuseDuplicates(entries.map((entry) => entry.locationId), 'location');
    if (duplicate) return callback(new Error(duplicate), undefined);
    loadLocationContext((ctxErr, ctx) => {
      if (ctxErr) return callback(ctxErr, undefined);
      const prepared = entries.map((entry) => {
        const match = findLocationField(ctx.settings, { id: entry.fieldId });
        if (match.error) return { error: match.error };
        const { change, error } = collectFieldValueChange(entry, match.field);
        return error ? { error } : { match, change };
      });
      const invalid = prepared.map((p, index) => (p.error ? `entry ${index}: ${p.error}` : null)).filter(Boolean);
      if (invalid.length) return callback(new Error(`Invalid entries: ${invalid.join('; ')}`), undefined);
      requireAllById(entries.map((entry) => entry.locationId), requireLocationById, (idErr, locations) => {
        if (idErr) return callback(idErr, undefined);
        getRecordingUser((user) => {
          runBatch(prepared.length, (index, done) => applyFieldValue(locations[index], prepared[index].match, prepared[index].change, user, ctx, (err) => done(err, locations[index].id)), 'locations', callback);
        });
      });
    });
  },

  // ======================= Categories =======================

  /**
   * hosts: controlBackground, headlessSdk. Adds a category as the categories tab does (CategoriesController.createCategory): a title, a picture or library icon (not both), and any subcategories, titled as the categories import writes them; then the analytics events for it and its subcategories, the widget refresh and categoryCreated. No widget host: only the control panel manages categories. Uses only buildfire.publicData plus fire-and-forget calls, so it also runs on the server; content, nothing to watch, so Background.
   * @param {{ title: string, icon?: string[], iconClassName?: string, subcategories?: string }} options
   * @param {function(Error=, object=)} callback - (error, new category)
   */
  createCategory(options, callback) {
    requireCallback(callback);
    if (options === null || typeof options !== 'object') return callback(new Error('options must be an object'), undefined);
    const { category, error } = prepareCategoryCreate(options);
    if (error) return callback(new Error(error), undefined);
    getRecordingUser((user) => insertCategory(category, user, (err, saved) => callback(err, err ? undefined : publicCategory(saved))));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of createCategory (as the categories import adds several): every entry is checked with createCategory's own checks before anything is added, then each goes through insertCategory, so each gets its analytics events and categoryCreated. A failed insert is reported per entry.
   * @param {{ categories: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  createCategoriesAdvanced(options, callback) {
    const entries = readListParam(options, 'categories', BATCH_LIMIT, callback);
    if (!entries) return;
    const prepared = entries.map(prepareCategoryCreate);
    const invalid = prepared.map((p, index) => (p.error ? `entry ${index}: ${p.error}` : null)).filter(Boolean);
    if (invalid.length) return callback(new Error(`Invalid entries: ${invalid.join('; ')}`), undefined);
    getRecordingUser((user) => {
      runBatch(prepared.length, (index, done) => insertCategory(prepared[index].category, user, (err, saved) => done(err, saved && saved.id)), 'categories', callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Changes a category's title or icon, named by its exact title among the categories not deleted, changing only what is passed; a picture replaces a library icon and the other way round, as the image library does. Writes the whole category back as CategoriesController.updateCategory does and refreshes the widget. Control panel only; server-safe; Background. usage: basic; its advanced alternative is updateCategoryAdvanced.
   * @param {{ title: string, newTitle?: string, newIcon?: string[]|null, newIconClassName?: string|null }} options
   * @param {function(Error=, object=)} callback - (error, changed category)
   */
  updateCategory(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    resolveCategoryByTitle(options.title, (err, cat) => {
      if (err) return callback(err, undefined);
      getRecordingUser((user) => applyCategoryUpdate(cat, options, user, (updateErr, saved) => callback(updateErr, updateErr ? undefined : publicCategory(saved))));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateCategory, taking the category's id; an id that matches nothing (or a deleted category) is refused. Same hosts and effects via the same applyCategoryUpdate.
   * @param {{ categoryId: string, newTitle?: string, newIcon?: string[]|null, newIconClassName?: string|null }} options
   * @param {function(Error=, object=)} callback - (error, changed category)
   */
  updateCategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId'], callback)) return;
    requireCategoryById(options.categoryId, (err, cat) => {
      if (err) return callback(err, undefined);
      getRecordingUser((user) => applyCategoryUpdate(cat, options, user, (updateErr, saved) => callback(updateErr, updateErr ? undefined : publicCategory(saved))));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of updateCategoryAdvanced: every entry's changes and every id are checked before anything is written (unknown ids, or the same category twice, fail the whole call), then each goes through applyCategoryUpdate. A failed write is reported per entry.
   * @param {{ categories: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  updateCategoriesAdvanced(options, callback) {
    const entries = readListParam(options, 'categories', BATCH_LIMIT, callback);
    if (!entries) return;
    const invalid = entries.map((entry, index) => {
      if (typeof entry.categoryId !== 'string' || !entry.categoryId) return `entry ${index}: missing categoryId`;
      const { error } = collectCategoryChanges(entry);
      return error ? `entry ${index}: ${error}` : null;
    }).filter(Boolean);
    if (invalid.length) return callback(new Error(`Invalid entries: ${invalid.join('; ')}`), undefined);
    const duplicate = refuseDuplicates(entries.map((entry) => entry.categoryId), 'category');
    if (duplicate) return callback(new Error(duplicate), undefined);
    requireAllById(entries.map((entry) => entry.categoryId), requireCategoryById, (idErr, categories) => {
      if (idErr) return callback(idErr, undefined);
      getRecordingUser((user) => {
        runBatch(categories.length, (index, done) => applyCategoryUpdate(categories[index], entries[index], user, (err) => done(err, categories[index].id)), 'categories', callback);
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Removes a category named by its exact title the way the categories tab does (CategoriesController.deleteCategory): a soft delete stamping deletedOn / deletedBy (deletedOn is indexed as date1, which hides it from every list); the record and the locations' references to it are kept. Control panel only; server-safe; Background. usage: basic; its advanced alternative is deleteCategoryAdvanced.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, deletedOn })
   */
  deleteCategory(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    resolveCategoryByTitle(options.title, (err, cat) => {
      if (err) return callback(err, undefined);
      getRecordingUser((user) => applyCategoryDelete(cat, user, callback));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of deleteCategory, taking the category's id; an id that matches nothing, or an already deleted category, is refused. Same hosts and effects via the same applyCategoryDelete.
   * @param {{ categoryId: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, deletedOn })
   */
  deleteCategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId'], callback)) return;
    requireCategoryById(options.categoryId, (err, cat) => {
      if (err) return callback(err, undefined);
      getRecordingUser((user) => applyCategoryDelete(cat, user, callback));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of deleteCategoryAdvanced: every id is checked before anything is removed (unknown ids, or the same category twice, fail the whole call), then each goes through applyCategoryDelete. A failed write is reported per entry.
   * @param {{ categories: Array<{ categoryId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  deleteCategoriesAdvanced(options, callback) {
    const entries = readListParam(options, 'categories', BATCH_LIMIT, callback);
    if (!entries) return;
    const missing = entries.map((entry, index) => ((typeof entry.categoryId !== 'string' || !entry.categoryId) ? `entry ${index}: missing categoryId` : null)).filter(Boolean);
    if (missing.length) return callback(new Error(`Invalid entries: ${missing.join('; ')}`), undefined);
    const duplicate = refuseDuplicates(entries.map((entry) => entry.categoryId), 'category');
    if (duplicate) return callback(new Error(duplicate), undefined);
    requireAllById(entries.map((entry) => entry.categoryId), requireCategoryById, (idErr, categories) => {
      if (idErr) return callback(idErr, undefined);
      getRecordingUser((user) => {
        runBatch(categories.length, (index, done) => applyCategoryDelete(categories[index], user, (err) => done(err, categories[index].id)), 'categories', callback);
      });
    });
  },

  // ---- subcategories ----

  /**
   * hosts: controlBackground, headlessSdk. Adds a subcategory at the end of a category named by its exact title, as the category form's "add subcategory" does (a new id, a title, optionally a picture or library icon), then writes the category back as its save does. Control panel only; server-safe; Background. usage: basic; its advanced alternative is createSubcategoryAdvanced.
   * @param {{ categoryTitle: string, subcategoryTitle: string, icon?: string[], iconClassName?: string }} options
   * @param {function(Error=, object=)} callback - (error, new subcategory)
   */
  createSubcategory(options, callback) {
    if (!requireStringParams(options, ['categoryTitle', 'subcategoryTitle'], callback)) return;
    const { subcategory, error } = prepareSubcategoryCreate(options);
    if (error) return callback(new Error(error), undefined);
    resolveCategoryByTitle(options.categoryTitle, (err, cat) => {
      if (err) return callback(err, undefined);
      cat.subcategories = [...cat.subcategories, subcategory];
      getRecordingUser((user) => writeCategory(cat, user, (writeErr, saved) => callback(writeErr, writeErr ? undefined : publicSubcategory(saved, subcategory))));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of createSubcategory, taking the category's id; an unknown id is refused. Same hosts and effects.
   * @param {{ categoryId: string, subcategoryTitle: string, icon?: string[], iconClassName?: string }} options
   * @param {function(Error=, object=)} callback - (error, new subcategory)
   */
  createSubcategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId', 'subcategoryTitle'], callback)) return;
    const { subcategory, error } = prepareSubcategoryCreate(options);
    if (error) return callback(new Error(error), undefined);
    requireCategoryById(options.categoryId, (err, cat) => {
      if (err) return callback(err, undefined);
      cat.subcategories = [...cat.subcategories, subcategory];
      getRecordingUser((user) => writeCategory(cat, user, (writeErr, saved) => callback(writeErr, writeErr ? undefined : publicSubcategory(saved, subcategory))));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of createSubcategoryAdvanced (as the subcategories import adds several): every entry and every category id are checked before anything is written, then each is added through the same read-modify-write of its category, one after the other so entries for the same category all land. A failed write is reported per entry.
   * @param {{ subcategories: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { subcategories, succeeded, failed })
   */
  createSubcategoriesAdvanced(options, callback) {
    const entries = readListParam(options, 'subcategories', BATCH_LIMIT, callback);
    if (!entries) return;
    const prepared = entries.map((entry) => {
      if (typeof entry.categoryId !== 'string' || !entry.categoryId) return { error: 'missing categoryId' };
      return prepareSubcategoryCreate(entry);
    });
    const invalid = prepared.map((p, index) => (p.error ? `entry ${index}: ${p.error}` : null)).filter(Boolean);
    if (invalid.length) return callback(new Error(`Invalid entries: ${invalid.join('; ')}`), undefined);
    requireAllById(entries.map((entry) => entry.categoryId), requireCategoryById, (idErr) => {
      if (idErr) return callback(idErr, undefined);
      getRecordingUser((user) => {
        runBatch(prepared.length, (index, done) => requireCategoryById(entries[index].categoryId, (err, cat) => {
          if (err) return done(err);
          cat.subcategories = [...cat.subcategories, prepared[index].subcategory];
          writeCategory(cat, user, (writeErr) => done(writeErr, prepared[index].subcategory.id));
        }), 'subcategories', callback);
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Changes a subcategory's title or icon (named by its category's and its own exact titles), changing only what is passed, then writes the category back. Control panel only; server-safe; Background. usage: basic; its advanced alternative is updateSubcategoryAdvanced.
   * @param {{ categoryTitle: string, subcategoryTitle: string, newTitle?: string, newIcon?: string[]|null, newIconClassName?: string|null }} options
   * @param {function(Error=, object=)} callback - (error, changed subcategory)
   */
  updateSubcategory(options, callback) {
    if (!requireStringParams(options, ['categoryTitle', 'subcategoryTitle'], callback)) return;
    const { changes, error } = collectSubcategoryChanges(options);
    if (error) return callback(new Error(error), undefined);
    resolveCategoryByTitle(options.categoryTitle, (err, cat) => {
      if (err) return callback(err, undefined);
      const found = findSubcategory(cat, { title: options.subcategoryTitle });
      if (found.error) return callback(new Error(found.error), undefined);
      Object.assign(found.subcategory, changes);
      getRecordingUser((user) => writeCategory(cat, user, (writeErr, saved) => callback(writeErr, writeErr ? undefined : publicSubcategory(saved, found.subcategory))));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateSubcategory, taking the category's and the subcategory's ids; unknown ids are refused. Same hosts and effects.
   * @param {{ categoryId: string, subcategoryId: string, newTitle?: string, newIcon?: string[]|null, newIconClassName?: string|null }} options
   * @param {function(Error=, object=)} callback - (error, changed subcategory)
   */
  updateSubcategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId', 'subcategoryId'], callback)) return;
    const { changes, error } = collectSubcategoryChanges(options);
    if (error) return callback(new Error(error), undefined);
    requireCategoryById(options.categoryId, (err, cat) => {
      if (err) return callback(err, undefined);
      const found = findSubcategory(cat, { id: options.subcategoryId });
      if (found.error) return callback(new Error(found.error), undefined);
      Object.assign(found.subcategory, changes);
      getRecordingUser((user) => writeCategory(cat, user, (writeErr, saved) => callback(writeErr, writeErr ? undefined : publicSubcategory(saved, found.subcategory))));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of updateSubcategoryAdvanced: every entry's changes, category id and subcategory id are checked before anything is written (unknown ids, or the same subcategory twice, fail the whole call), then each is applied by re-reading its category and writing it back, one after the other. A failed write is reported per entry.
   * @param {{ subcategories: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { subcategories, succeeded, failed })
   */
  updateSubcategoriesAdvanced(options, callback) {
    const entries = readListParam(options, 'subcategories', BATCH_LIMIT, callback);
    if (!entries) return;
    const prepared = entries.map((entry) => {
      if (typeof entry.categoryId !== 'string' || !entry.categoryId) return { error: 'missing categoryId' };
      if (typeof entry.subcategoryId !== 'string' || !entry.subcategoryId) return { error: 'missing subcategoryId' };
      return collectSubcategoryChanges(entry);
    });
    const invalid = prepared.map((p, index) => (p.error ? `entry ${index}: ${p.error}` : null)).filter(Boolean);
    if (invalid.length) return callback(new Error(`Invalid entries: ${invalid.join('; ')}`), undefined);
    const duplicate = refuseDuplicates(entries.map((entry) => `${entry.categoryId}/${entry.subcategoryId}`), 'subcategory');
    if (duplicate) return callback(new Error(duplicate), undefined);
    requireAllById(entries.map((entry) => entry.categoryId), requireCategoryById, (idErr, categories) => {
      if (idErr) return callback(idErr, undefined);
      const unknown = entries.map((entry, index) => {
        const found = findSubcategory(categories[index], { id: entry.subcategoryId });
        return found.error ? `entry ${index}: ${found.error}` : null;
      }).filter(Boolean);
      if (unknown.length) return callback(new Error(`Not found: ${unknown.join('; ')}`), undefined);
      getRecordingUser((user) => {
        runBatch(entries.length, (index, done) => requireCategoryById(entries[index].categoryId, (err, cat) => {
          if (err) return done(err);
          const found = findSubcategory(cat, { id: entries[index].subcategoryId });
          if (found.error) return done(new Error(found.error));
          Object.assign(found.subcategory, prepared[index].changes);
          writeCategory(cat, user, (writeErr) => done(writeErr, found.subcategory.id));
        }), 'subcategories', callback);
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Removes a subcategory from its category for good (named by its category's and its own exact titles), as the category form's delete does, then writes the category back; locations keep any reference to it, as in the plugin. Control panel only; server-safe, flagged dangerous; Background. usage: basic; its advanced alternative is deleteSubcategoryAdvanced.
   * @param {{ categoryTitle: string, subcategoryTitle: string }} options
   * @param {function(Error=, object=)} callback - (error, { categoryId, id })
   */
  deleteSubcategory(options, callback) {
    if (!requireStringParams(options, ['categoryTitle', 'subcategoryTitle'], callback)) return;
    resolveCategoryByTitle(options.categoryTitle, (err, cat) => {
      if (err) return callback(err, undefined);
      const found = findSubcategory(cat, { title: options.subcategoryTitle });
      if (found.error) return callback(new Error(found.error), undefined);
      cat.subcategories = cat.subcategories.filter((sub) => sub.id !== found.subcategory.id);
      getRecordingUser((user) => writeCategory(cat, user, (writeErr) => callback(writeErr, writeErr ? undefined : { categoryId: cat.id, id: found.subcategory.id })));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of deleteSubcategory, taking the category's and the subcategory's ids; unknown ids are refused. Same hosts and effects.
   * @param {{ categoryId: string, subcategoryId: string }} options
   * @param {function(Error=, object=)} callback - (error, { categoryId, id })
   */
  deleteSubcategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId', 'subcategoryId'], callback)) return;
    requireCategoryById(options.categoryId, (err, cat) => {
      if (err) return callback(err, undefined);
      const found = findSubcategory(cat, { id: options.subcategoryId });
      if (found.error) return callback(new Error(found.error), undefined);
      cat.subcategories = cat.subcategories.filter((sub) => sub.id !== found.subcategory.id);
      getRecordingUser((user) => writeCategory(cat, user, (writeErr) => callback(writeErr, writeErr ? undefined : { categoryId: cat.id, id: found.subcategory.id })));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of deleteSubcategoryAdvanced: every category id and subcategory id is checked before anything is removed (unknown ids, or the same subcategory twice, fail the whole call), then each is removed by re-reading its category and writing it back, one after the other. A failed write is reported per entry.
   * @param {{ subcategories: Array<{ categoryId: string, subcategoryId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { subcategories, succeeded, failed })
   */
  deleteSubcategoriesAdvanced(options, callback) {
    const entries = readListParam(options, 'subcategories', BATCH_LIMIT, callback);
    if (!entries) return;
    const missing = entries.map((entry, index) => {
      if (typeof entry.categoryId !== 'string' || !entry.categoryId) return `entry ${index}: missing categoryId`;
      if (typeof entry.subcategoryId !== 'string' || !entry.subcategoryId) return `entry ${index}: missing subcategoryId`;
      return null;
    }).filter(Boolean);
    if (missing.length) return callback(new Error(`Invalid entries: ${missing.join('; ')}`), undefined);
    const duplicate = refuseDuplicates(entries.map((entry) => `${entry.categoryId}/${entry.subcategoryId}`), 'subcategory');
    if (duplicate) return callback(new Error(duplicate), undefined);
    requireAllById(entries.map((entry) => entry.categoryId), requireCategoryById, (idErr, categories) => {
      if (idErr) return callback(idErr, undefined);
      const unknown = entries.map((entry, index) => {
        const found = findSubcategory(categories[index], { id: entry.subcategoryId });
        return found.error ? `entry ${index}: ${found.error}` : null;
      }).filter(Boolean);
      if (unknown.length) return callback(new Error(`Not found: ${unknown.join('; ')}`), undefined);
      getRecordingUser((user) => {
        runBatch(entries.length, (index, done) => requireCategoryById(entries[index].categoryId, (err, cat) => {
          if (err) return done(err);
          cat.subcategories = cat.subcategories.filter((sub) => sub.id !== entries[index].subcategoryId);
          writeCategory(cat, user, (writeErr) => done(writeErr, entries[index].subcategoryId));
        }), 'subcategories', callback);
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Moves a subcategory (named by its category's and its own exact titles) to a new place, as the category form's drag-to-reorder does, then writes the category back. Control panel only; server-safe; Background. usage: basic; its advanced alternative is updateSubcategoryOrderAdvanced.
   * @param {{ categoryTitle: string, subcategoryTitle: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, category)
   */
  updateSubcategoryOrder(options, callback) {
    if (!requireStringParams(options, ['categoryTitle', 'subcategoryTitle'], callback)) return;
    if (!isGiven(options.position) || options.position === null) return callback(new Error('Missing required parameter: position'), undefined);
    resolveCategoryByTitle(options.categoryTitle, (err, cat) => {
      if (err) return callback(err, undefined);
      const found = findSubcategory(cat, { title: options.subcategoryTitle });
      if (found.error) return callback(new Error(found.error), undefined);
      // eslint-disable-next-line no-use-before-define
      moveSubcategory(cat, found.subcategory, options, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateSubcategoryOrder, taking the category's and the subcategory's ids; unknown ids are refused. Same hosts and effects.
   * @param {{ categoryId: string, subcategoryId: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, category)
   */
  updateSubcategoryOrderAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId', 'subcategoryId'], callback)) return;
    if (!isGiven(options.position) || options.position === null) return callback(new Error('Missing required parameter: position'), undefined);
    requireCategoryById(options.categoryId, (err, cat) => {
      if (err) return callback(err, undefined);
      const found = findSubcategory(cat, { id: options.subcategoryId });
      if (found.error) return callback(new Error(found.error), undefined);
      // eslint-disable-next-line no-use-before-define
      moveSubcategory(cat, found.subcategory, options, callback);
    });
  },

  // ======================= Location fields =======================

  /**
   * hosts: controlBackground, headlessSdk. Adds a location field as the location fields page does (a new id, a label, a type its section accepts, required and custom-label switches, visible to everyone), refusing an 11th field as the page disables adding at 10; saves the settings and tells the widget, as the page does. No widget host: only the control panel defines fields (and the widget cannot write the datastore). Uses only buildfire.datastore, so it also runs on the server; configuration, nothing to watch, so Background.
   * @param {{ group: string, label: string, type?: string, required?: boolean, allowCustomLabel?: boolean }} options
   * @param {function(Error=, object=)} callback - (error, new field)
   */
  createLocationField(options, callback) {
    requireCallback(callback);
    if (options === null || typeof options !== 'object') return callback(new Error('options must be an object'), undefined);
    const prepared = prepareFieldCreate(options);
    if (prepared.error) return callback(new Error(prepared.error), undefined);
    loadSettings((err, settings) => {
      if (err) return callback(err, undefined);
      if (configuredFields(settings).length >= MAX_LOCATION_FIELDS) return callback(new Error(`${MAX_LOCATION_FIELDS} location fields exist already`), undefined);
      settings.customFields[prepared.group] = [...settings.customFields[prepared.group], prepared.field];
      getRecordingUser((user) => saveFieldSettings(settings, user, (saveErr) => callback(saveErr, saveErr ? undefined : publicField(prepared.field, prepared.group))));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of createLocationField: every entry is checked with its own checks, and the total against the 10-field limit, before anything is saved. The fields all live in the one settings document, so they are added and saved in one write (each entry's outcome reported); one write keeps the batch from racing itself.
   * @param {{ fields: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { fields, succeeded, failed })
   */
  createLocationFieldsAdvanced(options, callback) {
    const entries = readListParam(options, 'fields', MAX_LOCATION_FIELDS, callback);
    if (!entries) return;
    const prepared = entries.map(prepareFieldCreate);
    const invalid = prepared.map((p, index) => (p.error ? `entry ${index}: ${p.error}` : null)).filter(Boolean);
    if (invalid.length) return callback(new Error(`Invalid entries: ${invalid.join('; ')}`), undefined);
    loadSettings((err, settings) => {
      if (err) return callback(err, undefined);
      if (configuredFields(settings).length + prepared.length > MAX_LOCATION_FIELDS) {
        return callback(new Error(`At most ${MAX_LOCATION_FIELDS} location fields in all; ${configuredFields(settings).length} exist already`), undefined);
      }
      prepared.forEach((p) => { settings.customFields[p.group] = [...settings.customFields[p.group], p.field]; });
      getRecordingUser((user) => saveFieldSettings(settings, user, (saveErr) => {
        const results = prepared.map((p, index) => ({ index, id: saveErr ? null : p.field.id, error: saveErr ? (saveErr.message || String(saveErr)) : null }));
        callback(null, { fields: results, succeeded: saveErr ? 0 : results.length, failed: saveErr ? results.length : 0 });
      }));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Changes a location field named by its exact label, changing only what is passed; a quick action field keeps to email, phone or URL, as the page's type dropdown does. Saves as the page does. Control panel only; server-safe; Background. usage: basic; its advanced alternative is updateLocationFieldAdvanced.
   * @param {{ label: string, newLabel?: string, newType?: string, newRequired?: boolean, newAllowCustomLabel?: boolean }} options
   * @param {function(Error=, object=)} callback - (error, changed field)
   */
  updateLocationField(options, callback) {
    if (!requireStringParams(options, ['label'], callback)) return;
    // eslint-disable-next-line no-use-before-define
    changeLocationField({ label: options.label }, options, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateLocationField, taking the field's id; an unknown id is refused. Same hosts and effects.
   * @param {{ fieldId: string, newLabel?: string, newType?: string, newRequired?: boolean, newAllowCustomLabel?: boolean }} options
   * @param {function(Error=, object=)} callback - (error, changed field)
   */
  updateLocationFieldAdvanced(options, callback) {
    if (!requireStringParams(options, ['fieldId'], callback)) return;
    // eslint-disable-next-line no-use-before-define
    changeLocationField({ id: options.fieldId }, options, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of updateLocationFieldAdvanced: every entry's id and changes are checked before anything is saved (unknown ids, or the same field twice, fail the whole call); the fields share one settings document, so all changes are saved in one write.
   * @param {{ fields: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { fields, succeeded, failed })
   */
  updateLocationFieldsAdvanced(options, callback) {
    const entries = readListParam(options, 'fields', MAX_LOCATION_FIELDS, callback);
    if (!entries) return;
    const missing = entries.map((entry, index) => ((typeof entry.fieldId !== 'string' || !entry.fieldId) ? `entry ${index}: missing fieldId` : null)).filter(Boolean);
    if (missing.length) return callback(new Error(`Invalid entries: ${missing.join('; ')}`), undefined);
    const duplicate = refuseDuplicates(entries.map((entry) => entry.fieldId), 'field');
    if (duplicate) return callback(new Error(duplicate), undefined);
    loadSettings((err, settings) => {
      if (err) return callback(err, undefined);
      const matches = entries.map((entry) => findLocationField(settings, { id: entry.fieldId }));
      const unknown = matches.map((m, index) => (m.error ? `entry ${index}: ${m.error}` : null)).filter(Boolean);
      if (unknown.length) return callback(new Error(`Not found: ${unknown.join('; ')}`), undefined);
      const changes = entries.map((entry, index) => collectFieldChanges(entry, matches[index].group));
      const invalid = changes.map((c, index) => (c.error ? `entry ${index}: ${c.error}` : null)).filter(Boolean);
      if (invalid.length) return callback(new Error(`Invalid entries: ${invalid.join('; ')}`), undefined);
      matches.forEach((m, index) => Object.assign(m.field, changes[index].changes));
      getRecordingUser((user) => saveFieldSettings(settings, user, (saveErr) => {
        const results = matches.map((m, index) => ({ index, id: saveErr ? null : m.field.id, error: saveErr ? (saveErr.message || String(saveErr)) : null }));
        callback(null, { fields: results, succeeded: saveErr ? 0 : results.length, failed: saveErr ? results.length : 0 });
      }));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Removes a location field named by its exact label for good, as the page's delete does, and saves; values locations hold for it are dropped the next time each location is saved, as in the plugin. Control panel only; server-safe, flagged dangerous; Background. usage: basic; its advanced alternative is deleteLocationFieldAdvanced.
   * @param {{ label: string }} options
   * @param {function(Error=, object=)} callback - (error, { id })
   */
  deleteLocationField(options, callback) {
    if (!requireStringParams(options, ['label'], callback)) return;
    // eslint-disable-next-line no-use-before-define
    removeLocationFields([{ label: options.label }], (err, result) => callback(err, err ? undefined : { id: result[0] }));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of deleteLocationField, taking the field's id; an unknown id is refused. Same hosts and effects.
   * @param {{ fieldId: string }} options
   * @param {function(Error=, object=)} callback - (error, { id })
   */
  deleteLocationFieldAdvanced(options, callback) {
    if (!requireStringParams(options, ['fieldId'], callback)) return;
    // eslint-disable-next-line no-use-before-define
    removeLocationFields([{ id: options.fieldId }], (err, result) => callback(err, err ? undefined : { id: result[0] }));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of deleteLocationFieldAdvanced: every id is checked before anything is removed (unknown ids, or the same field twice, fail the whole call); the fields share one settings document, so they are removed in one write.
   * @param {{ fields: Array<{ fieldId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { fields, succeeded, failed })
   */
  deleteLocationFieldsAdvanced(options, callback) {
    const entries = readListParam(options, 'fields', MAX_LOCATION_FIELDS, callback);
    if (!entries) return;
    const missing = entries.map((entry, index) => ((typeof entry.fieldId !== 'string' || !entry.fieldId) ? `entry ${index}: missing fieldId` : null)).filter(Boolean);
    if (missing.length) return callback(new Error(`Invalid entries: ${missing.join('; ')}`), undefined);
    const duplicate = refuseDuplicates(entries.map((entry) => entry.fieldId), 'field');
    if (duplicate) return callback(new Error(duplicate), undefined);
    // eslint-disable-next-line no-use-before-define
    removeLocationFields(entries.map((entry) => ({ id: entry.fieldId })), (err, ids) => {
      if (err) return callback(err, undefined);
      const results = ids.map((id, index) => ({ index, id, error: null }));
      callback(null, { fields: results, succeeded: results.length, failed: 0 });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Moves a location field (named by its exact label) to a new place within its section, as the page's drag-to-reorder does, and saves. Control panel only; server-safe; Background. usage: basic; its advanced alternative is updateLocationFieldOrderAdvanced.
   * @param {{ label: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, { fields })
   */
  updateLocationFieldOrder(options, callback) {
    if (!requireStringParams(options, ['label'], callback)) return;
    // eslint-disable-next-line no-use-before-define
    moveLocationField({ label: options.label }, options, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateLocationFieldOrder, taking the field's id; an unknown id is refused. Same hosts and effects.
   * @param {{ fieldId: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, { fields })
   */
  updateLocationFieldOrderAdvanced(options, callback) {
    if (!requireStringParams(options, ['fieldId'], callback)) return;
    // eslint-disable-next-line no-use-before-define
    moveLocationField({ id: options.fieldId }, options, callback);
  },

  // ======================= Settings =======================

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. The settings the way the plugin loads them (Settings.get: defaults for a new instance, migration of old field settings), without the permission and access settings (editors, tags, who may add or pay). Uses only buildfire.datastore reads, which every host may make; a read, nothing to watch, so Background.
   * @param {object} options - none.
   * @param {function(Error=, object=)} callback - (error, settings)
   */
  getSettings(options, callback) {
    requireCallback(callback);
    loadSettings((err, settings) => callback(err, err ? undefined : publicSettings(settings)));
  },

  /**
   * hosts: controlBackground, headlessSdk. Changes only the settings passed, each checked like its control in the settings, design and content tabs (sorting: without nearest first, alphabetical becomes the default and distance is refused; turning off open hours or price range also turns off adding them in the app). The tabs save the whole document (Settings.save(settings.toJSON())), so this reads, merges and saves through the same call, then sends the refresh message each tab sends ('settings', 'design', 'intro', 'locationSettings', 'paymentDetailsUpdated'). No widget host: app users must not change the owner's configuration, and the widget cannot write the datastore. Background: it changes configuration, it does not publish to or contact anyone. Permission and access settings (editors, tags, who may add locations or photos, who pays, who sees the introduction screen, who sees a field) are left out.
   * @param {object} options - the settings to change, as declared.
   * @param {function(Error=, object=)} callback - (error, saved settings)
   */
  updateSettings(options, callback) {
    requireCallback(callback);
    if (options === null || typeof options !== 'object') return callback(new Error('options must be an object'), undefined);
    loadSettings((err, settings) => {
      if (err) return callback(err, undefined);
      const { steps, scopes, error } = collectSettingsChanges(options, settings);
      if (error) return callback(new Error(error), undefined);
      steps.forEach((step) => step(settings));
      getRecordingUser((user) => saveSettings(settings, user, (saveErr, saved) => {
        if (saveErr) return callback(saveErr, undefined);
        scopes.forEach((scope) => syncWidget(scope));
        callback(null, publicSettings(saved));
      }));
    });
  },

  // ======================= Language texts =======================

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Every text of the language tab (shared/stringsConfig.js), as the app shows it (Strings.get: a set text, an empty one only where allowed, else the default). Reads the language's one datastore record, which every host may read; a read, nothing to watch.
   * @param {{ section?: string }} options
   * @param {function(Error=, object=)} callback - (error, { texts })
   */
  listLanguageTexts(options, callback) {
    requireCallback(callback);
    const section = options && options.section;
    if (isGiven(section) && !LANGUAGE_TEXTS[section]) return callback(new Error(`section must be one of: ${Object.keys(LANGUAGE_TEXTS).join(', ')}`), undefined);
    loadLanguageRecord((err, record) => {
      if (err) return callback(err, undefined);
      callback(null, { texts: listTexts(record && record.data, section) });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Changes one text, as the language tab's save does (Strings.set + Strings.save: the whole language record saved, then the widget told to reload its strings). The tab's input limits the length and marks required texts; null clears the change so the original shows (Strings.get falls back to the default), '' shows nothing where the text may be empty. With no record yet, it is created the way the tab creates it (Strings.createLanguage: an insert of every label). No widget host: the widget cannot write the datastore and app users must not change the owner's texts. Server-safe; Background.
   * @param {{ key: string, value: string|null }} options
   * @param {function(Error=, object=)} callback - (error, text)
   */
  updateLanguageText(options, callback) {
    if (!requireStringParams(options, ['key'], callback)) return;
    const found = textDefinition(options.key);
    if (!found) return callback(new Error('key must be one of the listed texts'), undefined);
    if (!isGiven(options.value)) return callback(new Error('Missing required parameter: value'), undefined);
    const { value } = options;
    if (value !== null && typeof value !== 'string') return callback(new Error('value must be text'), undefined);
    if (value === '' && found.def.required) return callback(new Error(`"${found.def.title}" cannot be left empty`), undefined);
    if (typeof value === 'string' && value.length > found.def.maxLength) return callback(new Error(`value must be at most ${found.def.maxLength} characters`), undefined);
    loadLanguageRecord((err, record) => {
      if (err) return callback(err, undefined);
      const data = buildLanguageData(record && record.data);
      data[found.section][found.label].value = value;
      const done = (writeErr) => {
        if (writeErr) return callback(writeErr, undefined);
        syncWidget('strings');
        callback(null, publicText(found.section, found.label, data));
      };
      if (!record) return buildfire.datastore.insert(data, LANGUAGE_TAG, done);
      buildfire.datastore.save(data, LANGUAGE_TAG, done);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Goes back to the original texts, as the language tab's delete does (Strings.deleteLanguage: the language record removed; the tab re-creates it with the defaults the next time it opens). No widget host: the widget cannot write the datastore. Server-safe, flagged dangerous because every change is lost; Background.
   * @param {object} options - none.
   * @param {function(Error=, object=)} callback - (error, { texts })
   */
  resetLanguageTexts(options, callback) {
    requireCallback(callback);
    loadLanguageRecord((err, record) => {
      if (err) return callback(err, undefined);
      const done = (deleteErr) => {
        if (deleteErr) return callback(deleteErr, undefined);
        syncWidget('strings');
        callback(null, { texts: listTexts(null) });
      };
      if (!record) return done(null);
      buildfire.datastore.delete(record.id, LANGUAGE_TAG, done);
    });
  }
};

// ---- helpers used by the contract above that need its siblings ----

function moveSubcategory(cat, subcategory, options, callback) {
  const read = readPosition(options, cat.subcategories.length);
  if (read.error) return callback(new Error(read.error), undefined);
  const others = cat.subcategories.filter((sub) => sub.id !== subcategory.id);
  others.splice(read.value - 1, 0, subcategory);
  cat.subcategories = others;
  getRecordingUser((user) => writeCategory(cat, user, (err, saved) => callback(err, err ? undefined : publicCategory(saved))));
}

function changeLocationField(handle, options, callback) {
  loadSettings((err, settings) => {
    if (err) return callback(err, undefined);
    const match = findLocationField(settings, handle);
    if (match.error) return callback(new Error(match.error), undefined);
    const { changes, error } = collectFieldChanges(options, match.group);
    if (error) return callback(new Error(error), undefined);
    Object.assign(match.field, changes);
    getRecordingUser((user) => saveFieldSettings(settings, user, (saveErr) => callback(saveErr, saveErr ? undefined : publicField(match.field, match.group))));
  });
}

function removeLocationFields(handles, callback) {
  loadSettings((err, settings) => {
    if (err) return callback(err, undefined);
    const matches = handles.map((handle) => findLocationField(settings, handle));
    const unknown = matches.map((m, index) => (m.error ? `entry ${index}: ${m.error}` : null)).filter(Boolean);
    if (unknown.length === 1 && handles.length === 1) return callback(new Error(matches[0].error), undefined);
    if (unknown.length) return callback(new Error(`Not found: ${unknown.join('; ')}`), undefined);
    const ids = matches.map((m) => m.field.id);
    FIELD_GROUPS.forEach((group) => {
      settings.customFields[group] = settings.customFields[group].filter((field) => ids.indexOf(field.id) < 0);
    });
    getRecordingUser((user) => saveFieldSettings(settings, user, (saveErr) => callback(saveErr, saveErr ? undefined : ids)));
  });
}

function moveLocationField(handle, options, callback) {
  if (!isGiven(options.position) || options.position === null) return callback(new Error('Missing required parameter: position'), undefined);
  loadSettings((err, settings) => {
    if (err) return callback(err, undefined);
    const match = findLocationField(settings, handle);
    if (match.error) return callback(new Error(match.error), undefined);
    const list = settings.customFields[match.group];
    const read = readPosition(options, list.length);
    if (read.error) return callback(new Error(read.error), undefined);
    const others = list.filter((field) => field.id !== match.field.id);
    others.splice(read.value - 1, 0, match.field);
    settings.customFields[match.group] = others;
    getRecordingUser((user) => saveFieldSettings(settings, user, (saveErr, saved) => callback(saveErr, saveErr ? undefined : {
      fields: saved.customFields[match.group].map((field) => publicField(field, match.group))
    })));
  });
}

/**
 * What the control panel's frame (control/contract.html) dispatches to: init plus every function whose hosts include controlForeground or controlBackground, in plugin.contract.json order — here every function, since each one runs in the control panel. The implementations are widgetContract's own.
 */
controlContract = {
  init: widgetContract.init,
  searchLocations: widgetContract.searchLocations,
  getLocation: widgetContract.getLocation,
  getLocationAdvanced: widgetContract.getLocationAdvanced,
  createLocation: widgetContract.createLocation,
  createLocationsAdvanced: widgetContract.createLocationsAdvanced,
  updateLocation: widgetContract.updateLocation,
  updateLocationAdvanced: widgetContract.updateLocationAdvanced,
  updateLocationsAdvanced: widgetContract.updateLocationsAdvanced,
  deleteLocation: widgetContract.deleteLocation,
  deleteLocationAdvanced: widgetContract.deleteLocationAdvanced,
  deleteLocationsAdvanced: widgetContract.deleteLocationsAdvanced,
  updateLocationPin: widgetContract.updateLocationPin,
  updateLocationPinAdvanced: widgetContract.updateLocationPinAdvanced,
  updateLocationFieldValue: widgetContract.updateLocationFieldValue,
  updateLocationFieldValueAdvanced: widgetContract.updateLocationFieldValueAdvanced,
  updateLocationsFieldValueAdvanced: widgetContract.updateLocationsFieldValueAdvanced,
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
  createSubcategoriesAdvanced: widgetContract.createSubcategoriesAdvanced,
  updateSubcategory: widgetContract.updateSubcategory,
  updateSubcategoryAdvanced: widgetContract.updateSubcategoryAdvanced,
  updateSubcategoriesAdvanced: widgetContract.updateSubcategoriesAdvanced,
  deleteSubcategory: widgetContract.deleteSubcategory,
  deleteSubcategoryAdvanced: widgetContract.deleteSubcategoryAdvanced,
  deleteSubcategoriesAdvanced: widgetContract.deleteSubcategoriesAdvanced,
  updateSubcategoryOrder: widgetContract.updateSubcategoryOrder,
  updateSubcategoryOrderAdvanced: widgetContract.updateSubcategoryOrderAdvanced,
  createLocationField: widgetContract.createLocationField,
  createLocationFieldsAdvanced: widgetContract.createLocationFieldsAdvanced,
  updateLocationField: widgetContract.updateLocationField,
  updateLocationFieldAdvanced: widgetContract.updateLocationFieldAdvanced,
  updateLocationFieldsAdvanced: widgetContract.updateLocationFieldsAdvanced,
  deleteLocationField: widgetContract.deleteLocationField,
  deleteLocationFieldAdvanced: widgetContract.deleteLocationFieldAdvanced,
  deleteLocationFieldsAdvanced: widgetContract.deleteLocationFieldsAdvanced,
  updateLocationFieldOrder: widgetContract.updateLocationFieldOrder,
  updateLocationFieldOrderAdvanced: widgetContract.updateLocationFieldOrderAdvanced,
  getSettings: widgetContract.getSettings,
  updateSettings: widgetContract.updateSettings,
  listLanguageTexts: widgetContract.listLanguageTexts,
  updateLanguageText: widgetContract.updateLanguageText,
  resetLanguageTexts: widgetContract.resetLanguageTexts
};
