/* eslint-disable no-undef, max-len, no-plusplus, no-use-before-define, no-nested-ternary */
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
 * The plugin's own bookkeeping around a write — the search engine index (buildfire.services.searchEngine), deep links, analytics event registration and the refresh message to the widget — is made the way the plugin makes it, but only where that API exists in the host: the contract frames load no service script but the contract one, so the search engine index is updated only where buildfire.services.searchEngine is present, and calls whose answer the plugin never waits for (deep links, analytics, messaging, contract events) are fired without waiting.
 */

// Must match the collection names in plugin.contract.json and the plugin's repositories
// (src/widget/js/global/repository/Locations.js, Categories.js, Settings.js, src/shared/strings.js).
const LOCATIONS_TAG = 'locations';
const CATEGORIES_TAG = 'categories';
const SETTINGS_TAG = 'settings';
const LANGUAGE_TAG = '$bfLanguageSettings_en-us';

// A search returns at most 50 records a call; the rest are told by recordCount / totalRecord.
const PAGE_SIZE = 50;
const BATCH_LIMIT = 50;
// The content tab pins at most three locations ("x of 3 Pinned") and stores the position in pinIndex.
const MAX_PINNED = 3;
// The location fields page disables its add buttons at ten fields.
const MAX_LOCATION_FIELDS = 10;

const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const MARKER_TYPES = ['pin', 'circle', 'image'];
const PRICE_RANGES = [1, 2, 3, 4];
const CURRENCIES = ['€', '$'];
const QUICK_ACTION_TYPES = ['EMAIL', 'PHONE', 'URL'];
const CONTENT_TYPES = ['EMAIL', 'PHONE', 'URL', 'TEXT', 'RICH_TEXT'];
const FIELD_SECTIONS = ['quickActions', 'content'];
// Mirrors state.defaultCircleMarkerColor in src/control/content/js/locations/index.js.
const DEFAULT_CIRCLE_MARKER_COLOR = {
  backgroundCSS: 'background: rgba(253,35,5,1)',
  color: 'rgba(253,35,5,1)',
  colorCSS: 'color: rgba(253,35,5,1)',
  colorHex: '#fd2305',
  opacity: '100'
};

// Mirrors src/shared/stringsConfig.js: every text of the Language tab, keyed "<section>.<label>".
const LANGUAGE_TEXTS = {
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
  "sortingOptions.priceDsc": { title: "$$ - $", defaultValue: "$$ - $", required: true, isPlaceHolder: false, maxLength: 12 },
  "sortingOptions.priceAsc": { title: "$ - $$", defaultValue: "$ - $$", required: true, isPlaceHolder: false, maxLength: 12 },
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
const LANGUAGE_SECTIONS = {
  general: 'General',
  sortingOptions: 'Sorting Options',
  locationEditing: 'Location Creating/Editing',
  toast: 'Toast Messages',
  details: 'Details Page',
  emptyState: 'Empty State'
};

// ---------------------------------------------------------------------------
// Plugin helpers, mirrored so stored values match the plugin's own
// ---------------------------------------------------------------------------

// Mirrors src/widget/js/global/helpers.js generateUUID.
const generateUUID = () => {
  let dt = new Date().getTime();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    // eslint-disable-next-line no-bitwise
    const replace = (dt + Math.random() * 16) % 16 | 0;
    dt = Math.floor(dt / 16);
    // eslint-disable-next-line no-bitwise
    return (c === 'x' ? replace : (replace & 0x3) | 0x8).toString(16);
  });
};

// Mirrors src/utils/datetime.js: times of day are stored as dates on 1970-01-01 UTC.
const convertTimeToDate = (time) => {
  const [hour, min] = time.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, hour, min));
};
const convertDateToTime = (date) => {
  const time = new Date(date);
  const hour = time.getUTCHours();
  const mins = time.getUTCMinutes();
  return `${hour < 10 ? `0${hour}` : hour}:${mins < 10 ? `0${mins}` : mins}`;
};

// Mirrors getDefaultOpeningHours in src/control/content/utils/helpers.js.
const defaultOpeningHours = () => {
  const days = {};
  WEEK_DAYS.forEach((day, index) => {
    days[day] = { index, active: true, intervals: [{ from: convertTimeToDate('08:00'), to: convertTimeToDate('20:00') }] };
  });
  return { timezone: null, days };
};

// Mirrors isValidRGBColor, rgbaToHex and getOpacityFromRGBA in src/control/content/utils/helpers.js.
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
const rgbaToHex = (rgba) => `#${rgba.match(/\d+/g).slice(0, 3).map((x) => Number(x).toString(16).padStart(2, '0')).join('')}`;
const getOpacityFromRGBA = (rgba) => {
  const match = rgba.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(\d?\.?\d+)\s*\)/);
  if (!match) return '100';
  return String(Math.round(parseFloat(match[1]) * 100));
};
// Mirrors applyMarkerColors in src/control/content/js/locations/index.js.
const applyMarkerColors = (color) => ({
  backgroundCSS: `background: ${color}`,
  color,
  colorCSS: `color: ${color}`,
  colorHex: rgbaToHex(color),
  opacity: getOpacityFromRGBA(color),
});

// Mirrors _validateFieldValue in src/control/content/js/locations/customFields.js: checks a location field value by its type and normalizes it (URLs gain https://).
const validateFieldValue = (value, fieldType) => {
  if (!value) return { value };
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

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (callback, message) => callback(new Error(message), undefined);

const requireCallback = (callback) => {
  if (typeof callback !== 'function') {
    // Nothing to report through; fail loudly only in this one unrecoverable case.
    throw new TypeError('callback must be a function');
  }
};

/**
 * Assert that the options are an object and every named option is a non-empty string.
 * @returns {boolean} true when valid; false when the callback has already fired.
 */
const requireStringParams = (options, names, callback) => {
  requireCallback(callback);
  if (!isObject(options)) {
    fail(callback, 'options must be an object');
    return false;
  }
  const missing = names.find((name) => typeof options[name] !== 'string' || !options[name].trim());
  if (missing) {
    fail(callback, `Missing required parameter: ${missing}`);
    return false;
  }
  return true;
};

/** Calls a fire-and-forget platform API without letting a missing or throwing one break the operation. */
const tryCall = (fn) => {
  try {
    fn();
  } catch (err) {
    console.warn('locations contract: side call failed', err);
  }
};

/** Runs fn(item, index, next) on each item in turn; done() once all ran. */
const eachInSeries = (items, fn, done) => {
  const step = (index) => {
    if (index >= items.length) return done();
    fn(items[index], index, () => step(index + 1));
  };
  step(0);
};

/** Reads every record a publicData search matches, page by page (at most 50 a call), using totalRecord to know when to stop. */
const searchAll = (tag, filter, sort, callback) => {
  const records = [];
  const next = (page) => {
    buildfire.publicData.search({
      filter, sort, page, pageSize: PAGE_SIZE, recordCount: true
    }, tag, (err, response) => {
      if (err) return callback(err, undefined);
      const result = (response && response.result) || [];
      records.push(...result);
      const total = (response && response.totalRecord) || 0;
      if (result.length === PAGE_SIZE && records.length < total) return next(page + 1);
      callback(null, records);
    });
  };
  next(0);
};

/** A publicData record by id, refused when the id matches nothing (the store answers an empty record then). */
const getPublicRecord = (id, tag, noun, callback) => {
  buildfire.publicData.getById(id, tag, (err, record) => {
    if (err) return callback(err, undefined);
    if (!record || !record.data || !Object.keys(record.data).length) {
      return fail(callback, `No ${noun} with id "${id}"`);
    }
    callback(null, record);
  });
};

/** Exactly one record out of a lookup's matches: none and several are both refused, naming the text. */
const onlyMatch = (records, noun, field, text, callback, plural = `${noun}s`, total = records.length) => {
  if (!records.length) return fail(callback, `No ${noun} has the ${field} "${text}"`);
  if (records.length > 1) return fail(callback, `${Math.max(total, records.length)} ${plural} have the ${field} "${text}"; it must name exactly one`);
  callback(null, records[0]);
};

/** Fires a contract event where the contract service is loaded; never waits for it. */
const sendEvent = (name, data) => {
  const service = buildfire.services && buildfire.services.contract;
  if (service && service.events && typeof service.events.send === 'function') {
    tryCall(() => service.events.send(name, data));
  }
};

/** The plugin's refresh message to the widget, as the control panel sends it after each save. */
const syncWidget = (scope) => {
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') {
    tryCall(() => buildfire.messaging.sendMessageToWidget({ cmd: 'sync', scope }));
  }
};

const registerAnalyticsEvent = (title, key) => {
  if (buildfire.analytics && typeof buildfire.analytics.registerEvent === 'function') {
    tryCall(() => buildfire.analytics.registerEvent({ title, key, description: '' }, { silentNotification: true }));
  }
};

// ---------------------------------------------------------------------------
// Parameter reading: skip (left out), clear (null, or "" for text) or set
// ---------------------------------------------------------------------------

const TEXT_KINDS = ['string', 'wysiwyg'];

/**
 * An image param, checked against its declared count. Image params are always arrays, even for a single image, so a bare string is refused rather than wrapped: it means the caller misread the contract.
 */
const readImageList = (value, { name, minValue, maxValue }) => {
  const range = maxValue === undefined ? `at least ${minValue}`
    : (minValue === maxValue ? `exactly ${minValue}` : (minValue === 0 ? `up to ${maxValue}` : `${minValue} to ${maxValue}`));
  if (!Array.isArray(value)) return { error: `${name} must be a list of image URLs (${range}), even for one image` };
  if (value.length < minValue || (maxValue !== undefined && value.length > maxValue)) {
    return { error: `${name} must hold ${range} image${maxValue === 1 ? '' : 's'}; got ${value.length}` };
  }
  if (value.some((url) => typeof url !== 'string' || !url.trim())) return { error: `${name} must contain only image URLs` };
  return { value };
};

/** Action items as the plugin's action item dialog saves them: objects naming their action. */
const readActionList = (value, { name, minValue }) => {
  if (!Array.isArray(value)) return { error: `${name} must be a list of action items` };
  if (value.length < minValue) return { error: `${name} must hold at least ${minValue} action item${minValue === 1 ? '' : 's'}` };
  const bad = value.findIndex((item) => !isObject(item) || typeof item.action !== 'string' || !item.action);
  if (bad > -1) return { error: `${name} entry ${bad} must be an action item with its action, such as linkToWeb or callNumber` };
  return { value };
};

/**
 * Opening hours for one day, as text: "closed", or one or more "HH:MM-HH:MM" ranges separated by commas. Checked the way the location form checks them: every end later than its start, and no two ranges of a day starting or ending in the same hour (validateOpeningHoursDuplication).
 */
const readDayHours = (value, name) => {
  if (typeof value !== 'string') return { error: `${name} must be text such as "08:00-20:00" or "closed"` };
  const text = value.trim();
  if (text.toLowerCase() === 'closed') return { value: { active: false } };
  const ranges = text.split(',').map((part) => part.trim());
  const intervals = [];
  for (let i = 0; i < ranges.length; i++) {
    const match = ranges[i].match(/^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/);
    if (!match) return { error: `${name} must be "closed" or times such as "08:00-12:00, 13:00-20:00"` };
    const from = convertTimeToDate(`${match[1]}:${match[2]}`);
    const to = convertTimeToDate(`${match[3]}:${match[4]}`);
    if (from.getTime() > to.getTime()) return { error: `${name}: choose an end time later than the start time` };
    intervals.push({ from, to });
  }
  const fromHours = intervals.map((interval) => interval.from.getUTCHours());
  const toHours = intervals.map((interval) => interval.to.getUTCHours());
  if (new Set(fromHours).size !== fromHours.length || new Set(toHours).size !== toHours.length) {
    return { error: `${name}: opening hours are duplicated for the same day` };
  }
  return { value: { active: true, intervals } };
};

/**
 * One param by its rule. Returns { skip } when left out, { value } when given (null or "" when cleared), or { error }.
 * rule: { kind, required, update, nullable, minValue, maxValue, values, maxLength }
 */
const readParam = (name, value, rule) => {
  if (value === undefined || (value === null && !rule.required && !rule.update)) {
    return rule.required ? { error: `Missing required parameter: ${name}` } : { skip: true };
  }
  const isText = TEXT_KINDS.includes(rule.kind) || rule.kind === 'color';
  if (value === null || (value === '' && isText) || (isText && typeof value === 'string' && !value.trim() && rule.required)) {
    if (rule.required) return { error: `Missing required parameter: ${name}` };
    if (rule.update && !rule.nullable) return { error: `${name} cannot be removed; leave it out to keep the current value` };
    return { value };
  }
  switch (rule.kind) {
    case 'string':
    case 'wysiwyg':
      if (typeof value !== 'string') return { error: `${name} must be text` };
      if (rule.maxLength && value.length > rule.maxLength) return { error: `${name} must be at most ${rule.maxLength} characters` };
      return { value };
    case 'color':
      if (typeof value !== 'string' || !isValidRGBColor(value)) return { error: `${name} must be a color such as rgba(253,35,5,1)` };
      return { value };
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return { error: `${name} must be a number` };
      if (rule.minValue !== undefined && value < rule.minValue) {
        return { error: rule.maxValue === undefined ? `${name} must be at least ${rule.minValue}` : `${name} must be between ${rule.minValue} and ${rule.maxValue}` };
      }
      if (rule.maxValue !== undefined && value > rule.maxValue) return { error: `${name} must be between ${rule.minValue} and ${rule.maxValue}` };
      return { value };
    case 'boolean':
      if (typeof value !== 'boolean') return { error: `${name} must be true or false` };
      return { value };
    case 'select':
      if (!rule.values.includes(value)) return { error: `${name} must be one of: ${rule.values.join(', ')}` };
      return { value };
    case 'image':
      return readImageList(value, { name, minValue: rule.minValue, maxValue: rule.maxValue });
    case 'actions':
      return readActionList(value, { name, minValue: rule.minValue || 0 });
    case 'hours':
      return readDayHours(value, name);
    default:
      return { error: `${name} is not supported` };
  }
};

/**
 * Reads params by their rules. Returns { values } holding only the params given, or { error } for the first bad one.
 * @param {object} options
 * @param {Array<[string, object]>} rules - [paramName, rule] in call order
 */
const readParams = (options, rules) => {
  const values = {};
  for (let i = 0; i < rules.length; i++) {
    const [name, rule] = rules[i];
    const read = readParam(name, options[name], rule);
    if (read.error) return { error: read.error };
    if (!read.skip) values[name] = read.value;
  }
  return { values };
};

/** The update form of a create rule list: every param optional, named new<Name>; clearable only where nullable. */
const updateRules = (rules) => rules.map(([name, rule]) => [
  `new${name.charAt(0).toUpperCase()}${name.slice(1)}`,
  { ...rule, required: false, update: true }
]);
const unprefix = (name) => `${name.charAt(3).toLowerCase()}${name.slice(4)}`;
/** values keyed new<Name> → keyed <name>. */
const plainValues = (values) => {
  const result = {};
  Object.keys(values).forEach((key) => { result[unprefix(key)] = values[key]; });
  return result;
};

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

/**
 * A location record exactly as the plugin stores it. Mirrors the Location model's constructor and toJSON (src/widget/js/global/data/Location.js), including its search index (_buildfire.index) and geo point.
 */
const locationRecord = (data = {}) => {
  const location = {
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
    marker: data.marker || {
      type: 'pin', image: null, color: null, base64Image: null
    },
    categories: data.categories || { main: [], subcategories: [] },
    settings: data.settings || {
      showCategory: true, showOpeningHours: false, showPriceRange: false, showStarRating: false
    },
    openingHours: data.openingHours || { timezone: null, days: {} },
    images: data.images || [],
    listImage: data.listImage || null,
    description: data.description || null,
    wysiwygSource: data.wysiwygSource || 'control',
    views: Number.isNaN(parseInt(data.views, 10)) ? 0 : parseInt(data.views, 10),
    price: data.price || { range: 1, currency: '$' },
    rating: data.rating || { total: 0, count: 0, average: 0 },
    bookmarksCount: data.bookmarksCount || 0,
    actionItems: data.actionItems || [],
    editingPermissions: data.editingPermissions || { active: false, editors: [], tags: [] },
    createdOn: data.createdOn || new Date(),
    createdBy: data.createdBy || null,
    lastUpdatedOn: data.lastUpdatedOn || new Date(),
    lastUpdatedBy: data.lastUpdatedBy || null,
    deletedOn: data.deletedOn || null,
    deletedBy: data.deletedBy || null,
    isActive: [0, 1].includes(data.isActive) ? data.isActive : 1,
    additionalFields: {
      quickActions: ((data.additionalFields && data.additionalFields.quickActions) || []).map((field) => ({ id: field.id || null, customLabel: field.customLabel || null, value: field.value || null })),
      content: ((data.additionalFields && data.additionalFields.content) || []).map((field) => ({ id: field.id || null, customLabel: field.customLabel || null, value: field.value || null }))
    }
  };
  location._buildfire = {
    index: {
      text: `${location.title.toLowerCase()} ${location.subtitle ? location.subtitle : ''} ${location.address} ${location.formattedAddress} ${location.addressAlias ? location.addressAlias : ''}`,
      string1: location.title.toLowerCase(),
      date1: location.createdOn,
      array1: [
        ...location.categories.main.map((elemId) => ({ string1: `c_${elemId}` })),
        ...location.categories.subcategories.map((elemId) => ({ string1: `s_${elemId}` })),
        { string1: `v_${location.views}` },
        { string1: `pr_${location.price.range}` },
        { string1: `cid_${location.clientId}` },
        { string1: `title_${location.title.toLowerCase()}` }
      ],
      number1: location.pinIndex
    },
    geo: { type: 'Point', coordinates: [location.coordinates.lng, location.coordinates.lat] }
  };
  return location;
};

// The create params of a location, in call order; the update params are the same, named new<Name> (updateRules).
const LOCATION_RULES = [
  ['title', { kind: 'string', required: true }],
  ['subtitle', { kind: 'string', nullable: true }],
  ['address', { kind: 'string', required: true }],
  ['latitude', {
    kind: 'number', required: true, minValue: -90, maxValue: 90
  }],
  ['longitude', {
    kind: 'number', required: true, minValue: -180, maxValue: 180
  }],
  ['formattedAddress', { kind: 'string', nullable: true }],
  ['addressAlias', { kind: 'string', nullable: true }],
  ['listImage', {
    kind: 'image', required: true, minValue: 1, maxValue: 1
  }],
  ['description', { kind: 'wysiwyg', required: true }],
  ['images', { kind: 'image', nullable: true, minValue: 0 }],
  ['categories', { kind: 'string', nullable: true }],
  ['markerType', { kind: 'select', values: MARKER_TYPES }],
  ['markerImage', {
    kind: 'image', nullable: true, minValue: 0, maxValue: 1
  }],
  ['markerColor', { kind: 'color', nullable: true }],
  ['showCategory', { kind: 'boolean' }],
  ['showOpeningHours', { kind: 'boolean' }],
  ['showPriceRange', { kind: 'boolean' }],
  ['showStarRating', { kind: 'boolean' }],
  ['priceRange', { kind: 'select', values: PRICE_RANGES }],
  ['priceCurrency', { kind: 'select', values: CURRENCIES }],
  ['actionItems', { kind: 'actions', nullable: true, minValue: 0 }],
  ['pinned', { kind: 'boolean' }],
  ...WEEK_DAYS.map((day) => [`${day}Hours`, { kind: 'hours' }])
];
const LOCATION_UPDATE_RULES = updateRules(LOCATION_RULES);

/** Every category that is not deleted, as the content tab loads them (getAllCategories: deletedOn unset, by title). */
const loadActiveCategories = (callback) => {
  searchAll(CATEGORIES_TAG, { '_buildfire.index.date1': { $type: 10 } }, { '_buildfire.index.string1': 1 }, (err, records) => {
    if (err) return callback(err, undefined);
    callback(null, records.map((record) => ({ ...record.data, id: record.id })));
  });
};

/**
 * Parses a location's categories from text in the format the plugin's CSV import and export use: "Category -> Subcategory, Category -> Other subcategory, Another category". Every name must match exactly one category (and subcategory within it) that exists; nothing is created.
 * @returns {{ value?: { main: string[], subcategories: string[] }, error?: string }}
 */
const parseCategoriesText = (text, categories) => {
  const result = { main: [], subcategories: [] };
  if (!text) return { value: result };
  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const [categoryTitle, subcategoryTitle] = parts[i].split('->').map((part) => part.trim());
    const matches = categories.filter((category) => category.title === categoryTitle);
    if (!matches.length) return { error: `No category is titled "${categoryTitle}"` };
    if (matches.length > 1) return { error: `${matches.length} categories are titled "${categoryTitle}"` };
    const category = matches[0];
    if (!result.main.includes(category.id)) result.main.push(category.id);
    if (subcategoryTitle) {
      const subMatches = (category.subcategories || []).filter((sub) => sub.title === subcategoryTitle);
      if (!subMatches.length) return { error: `No subcategory of "${categoryTitle}" is titled "${subcategoryTitle}"` };
      if (subMatches.length > 1) return { error: `${subMatches.length} subcategories of "${categoryTitle}" are titled "${subcategoryTitle}"` };
      if (!result.subcategories.includes(subMatches[0].id)) result.subcategories.push(subMatches[0].id);
    }
  }
  return { value: result };
};

/** The category and subcategory titles of a location, for its reads and its events. */
const categoryTitlesOf = (locationCategories, categories) => {
  const main = (locationCategories && locationCategories.main) || [];
  const subs = (locationCategories && locationCategories.subcategories) || [];
  const titles = [];
  const subcategoryTitles = [];
  main.forEach((id) => {
    const category = categories.find((c) => c.id === id);
    if (!category) return;
    titles.push(category.title);
    (category.subcategories || []).forEach((sub) => {
      if (subs.includes(sub.id)) subcategoryTitles.push(sub.title);
    });
  });
  return { titles, subcategoryTitles };
};

/** The categories of a location as text, in the same format the categories param takes. */
const categoriesTextOf = (locationCategories, categories) => {
  const main = (locationCategories && locationCategories.main) || [];
  const subs = (locationCategories && locationCategories.subcategories) || [];
  const parts = [];
  main.forEach((id) => {
    const category = categories.find((c) => c.id === id);
    if (!category) return;
    const chosen = (category.subcategories || []).filter((sub) => subs.includes(sub.id));
    if (chosen.length) chosen.forEach((sub) => parts.push(`${category.title} -> ${sub.title}`));
    else parts.push(category.title);
  });
  return parts.join(', ');
};

/** A day's stored opening hours as the text the hours params take. */
const dayHoursText = (day) => {
  if (!day) return null;
  if (!day.active) return 'closed';
  return (day.intervals || []).filter(Boolean).map((interval) => `${convertDateToTime(interval.from)}-${convertDateToTime(interval.to)}`).join(', ');
};

/** What the location reads return: the location's details as the app shows them, with its id. */
const locationView = (record, categories) => {
  const data = record.data || {};
  const { titles, subcategoryTitles } = categoryTitlesOf(data.categories, categories);
  const marker = data.marker || {};
  const openingHours = {};
  WEEK_DAYS.forEach((day) => {
    openingHours[day] = dayHoursText(data.openingHours && data.openingHours.days && data.openingHours.days[day]);
  });
  const additional = data.additionalFields || {};
  const fieldValues = [...(additional.quickActions || []), ...(additional.content || [])]
    .map((field) => ({ fieldId: field.id, value: field.value || null, customLabel: field.customLabel || null }));
  return {
    id: record.id,
    title: data.title || null,
    subtitle: data.subtitle || null,
    address: data.address || null,
    formattedAddress: data.formattedAddress || null,
    addressAlias: data.addressAlias || null,
    latitude: data.coordinates ? data.coordinates.lat : null,
    longitude: data.coordinates ? data.coordinates.lng : null,
    listImage: data.listImage || null,
    description: data.description || null,
    images: (data.images || []).map((image) => image.imageUrl),
    categories: categoriesTextOf(data.categories, categories),
    categoryTitles: titles,
    subcategoryTitles,
    categoryIds: (data.categories && data.categories.main) || [],
    subcategoryIds: (data.categories && data.categories.subcategories) || [],
    markerType: marker.type || 'pin',
    markerImage: marker.image || null,
    markerColor: (marker.color && marker.color.color) || null,
    showCategory: !!(data.settings && data.settings.showCategory),
    showOpeningHours: !!(data.settings && data.settings.showOpeningHours),
    showPriceRange: !!(data.settings && data.settings.showPriceRange),
    showStarRating: !!(data.settings && data.settings.showStarRating),
    priceRange: data.price ? data.price.range : null,
    priceCurrency: data.price ? data.price.currency : null,
    pinned: !!data.pinIndex,
    pinPosition: data.pinIndex || null,
    openingHours,
    actionItems: data.actionItems || [],
    fieldValues,
    rating: {
      average: (data.rating && data.rating.average) || 0,
      count: (data.rating && data.rating.count) || 0
    },
    views: data.views || 0,
    createdOn: data.createdOn || null,
    lastUpdatedOn: data.lastUpdatedOn || null
  };
};

/** Every pinned location, in pin order, as the content tab reads them (getPinnedLocation). */
const loadPinnedLocations = (callback) => {
  searchAll(LOCATIONS_TAG, { '_buildfire.index.number1': { $in: [1, 2, 3] } }, { '_buildfire.index.number1': 1 }, callback);
};

/** The location a caller named by its exact title; several with that title are refused. */
const resolveLocationByTitle = (title, callback) => {
  buildfire.publicData.search({ filter: { '$json.title': title }, page: 0, pageSize: PAGE_SIZE, recordCount: true }, LOCATIONS_TAG, (err, response) => {
    if (err) return callback(err, undefined);
    // One page is enough to tell one from several; totalRecord says how many share the title.
    onlyMatch((response && response.result) || [], 'location', 'title', title, callback, 'locations', (response && response.totalRecord) || 0);
  });
};
const requireLocationById = (locationId, callback) => getPublicRecord(locationId, LOCATIONS_TAG, 'location', callback);

/**
 * Applies the values a create or update was given to a location's stored data. Mirrors how the location form fills the Location model (src/control/content/js/locations/index.js saveLocation and its controls).
 * @param {object} data - the location's current data (a copy), changed in place
 * @param {object} values - the params given, keyed by their create names
 * @param {object} parsedCategories - { main, subcategories } when values.categories was given
 */
const applyLocationValues = (data, values, parsedCategories) => {
  ['title', 'subtitle', 'address', 'formattedAddress', 'addressAlias', 'description'].forEach((key) => {
    if (key in values) data[key] = values[key];
  });
  if ('latitude' in values || 'longitude' in values) {
    data.coordinates = { ...(data.coordinates || { lat: null, lng: null }) };
    if ('latitude' in values) data.coordinates.lat = values.latitude;
    if ('longitude' in values) data.coordinates.lng = values.longitude;
  }
  // The plugin keeps one URL for the list image and a list of { id, imageUrl } for the gallery.
  if ('listImage' in values) [data.listImage] = values.listImage;
  if ('images' in values) data.images = (values.images || []).map((imageUrl) => ({ id: generateUUID(), imageUrl }));
  if ('categories' in values) data.categories = parsedCategories;
  data.marker = { ...(data.marker || { type: 'pin', image: null, color: null, base64Image: null }) };
  if ('markerType' in values) data.marker.type = values.markerType;
  if ('markerImage' in values) data.marker.image = (values.markerImage && values.markerImage[0]) || null;
  if ('markerColor' in values) data.marker.color = values.markerColor ? applyMarkerColors(values.markerColor) : null;
  // Switching to a circle marker without a color gives it the form's default color.
  if (data.marker.type === 'circle' && !(data.marker.color && data.marker.color.color)) data.marker.color = DEFAULT_CIRCLE_MARKER_COLOR;
  data.settings = {
    ...(data.settings || {
      showCategory: true, showOpeningHours: false, showPriceRange: false, showStarRating: false
    })
  };
  ['showCategory', 'showOpeningHours', 'showPriceRange', 'showStarRating'].forEach((key) => {
    if (key in values) data.settings[key] = values[key];
  });
  data.price = { ...(data.price || { range: 1, currency: '$' }) };
  if ('priceRange' in values) data.price.range = values.priceRange;
  if ('priceCurrency' in values) data.price.currency = values.priceCurrency;
  if ('actionItems' in values) {
    // The form gives every action item an id and drops duplicates by id.
    const items = (values.actionItems || []).map((item) => ({ ...item, id: item.id || generateUUID() }));
    data.actionItems = items.filter((item, index, self) => index === self.findIndex((other) => other.id === item.id));
  }
  const hoursGiven = WEEK_DAYS.filter((day) => `${day}Hours` in values);
  if (hoursGiven.length || !data.openingHours || !data.openingHours.days || !Object.keys(data.openingHours.days).length) {
    const current = (data.openingHours && data.openingHours.days && Object.keys(data.openingHours.days).length)
      ? data.openingHours : defaultOpeningHours();
    const days = { ...defaultOpeningHours().days, ...current.days };
    hoursGiven.forEach((day) => {
      const given = values[`${day}Hours`];
      const index = WEEK_DAYS.indexOf(day);
      // "closed" unticks the day and keeps its hours, as the form's checkbox does.
      days[day] = given.active ? { index, active: true, intervals: given.intervals } : { ...days[day], index, active: false };
    });
    data.openingHours = { timezone: current.timezone || null, days };
  }
  return data;
};

/** The location form's own checks that span several fields (locationInputValidation). */
const checkLocationData = (data) => {
  if (data.marker.type === 'image' && !data.marker.image) return 'A location with an image marker needs a marker image';
  return null;
};

/** The location's search engine entry, as SearchEngine.add / update build it (src/widget/js/global/repository/searchEngine.js). */
const indexLocation = (id, data, callback) => {
  const engine = buildfire.services && buildfire.services.searchEngine;
  if (!engine || typeof engine.save !== 'function') return callback(null);
  engine.save({
    tag: LOCATIONS_TAG,
    key: id,
    data: { locationId: id },
    title: data.title,
    description: data.description ? data.description.replace(/(<([^>]+)>)/gi, '') : '',
    imageUrl: data.listImage,
    keywords: [data.address, data.formattedAddress, data.addressAlias, data.subtitle].join(',')
  }, (err) => callback(err || null));
};

const registerLocationDeeplink = (id, data) => {
  if (buildfire.deeplink && typeof buildfire.deeplink.registerDeeplink === 'function') {
    tryCall(() => buildfire.deeplink.registerDeeplink({
      id: `location-${id}`, name: data.title, deeplinkData: { locationId: id }, imageUrl: data.listImage
    }, () => {}));
  }
};

/** Contract events carry the location's main details; the app acts here, so there is no person behind them. */
const locationEventDetails = (id, data, categories) => ({
  locationId: id,
  title: data.title || null,
  subtitle: data.subtitle || null,
  address: data.address || null,
  categoryNames: categoryTitlesOf(data.categories, categories).titles,
  listImage: data.listImage || null
});

/**
 * Checks what a create or update was given, resolving its categories, and returns the location data it would store. Shared by every location create and update so they check alike before anything is written.
 * @param {object|null} current - the stored data, or null for a new location
 * @param {object} values - the params given, keyed by their create names
 * @param {Array} categories - the active categories
 * @returns {{ data?: object, error?: string }}
 */
const prepareLocation = (current, values, categories) => {
  let parsedCategories;
  if ('categories' in values) {
    const parsed = parseCategoriesText(values.categories, categories);
    if (parsed.error) return { error: parsed.error };
    parsedCategories = parsed.value;
  }
  const data = applyLocationValues(JSON.parse(JSON.stringify(current || {})), values, parsedCategories);
  const problem = checkLocationData(data);
  if (problem) return { error: problem };
  return { data };
};

/**
 * Works out a location's pin position: pinning puts it after the locations already pinned (up to three), unpinning clears it. Mirrors the "Pin to Top" button of the location form.
 * @param {string|null} id - the location's id, or null for a new one
 * @param {number|null} currentPin
 * @param {boolean|undefined} pinned - the value given, if any
 * @param {Array} pinnedRecords - the locations pinned now
 */
const pinIndexFor = (id, currentPin, pinned, pinnedRecords) => {
  if (pinned === undefined) return { value: currentPin || null };
  if (!pinned) return { value: null };
  if (currentPin) return { value: currentPin };
  const others = pinnedRecords.filter((record) => record.id !== id);
  if (others.length >= MAX_PINNED) return { error: `Up to ${MAX_PINNED} locations can be pinned; unpin one first` };
  return { value: others.length + 1 };
};

/** Inserts a prepared new location with every side effect the content tab's save has: analytics event, deep link, search engine entry, widget refresh, and the locationCreated event. */
const insertLocation = (data, categories, callback) => {
  const now = new Date();
  data.clientId = generateUUID();
  data.createdOn = now;
  data.createdBy = null;
  data.lastUpdatedOn = now;
  const record = locationRecord(data);
  delete record.id;
  buildfire.publicData.insert(record, LOCATIONS_TAG, (err, result) => {
    if (err) return callback(err, undefined);
    registerAnalyticsEvent(`${result.data.title} (Viewed)`, `locations_${result.id}_viewed`);
    registerLocationDeeplink(result.id, result.data);
    indexLocation(result.id, result.data, (indexErr) => {
      if (indexErr) return fail(callback, `The location was added, but adding it to the app's search failed: ${indexErr.message || indexErr}`);
      syncWidget('locations');
      sendEvent('locationCreated', {
        ...locationEventDetails(result.id, result.data, categories),
        createdAt: result.data.createdOn || now.toISOString(),
        createdBy: null
      });
      callback(null, locationView(result, categories));
    });
  });
};

/** Saves a prepared location over the stored one with every side effect of the content tab's save (deep link, search engine entry, widget refresh) and the locationUpdated event. */
const saveLocation = (record, data, categories, callback) => {
  data.id = record.id;
  data.lastUpdatedOn = new Date();
  data.lastUpdatedBy = null;
  const stored = locationRecord(data);
  buildfire.publicData.update(record.id, stored, LOCATIONS_TAG, (err, result) => {
    if (err) return callback(err, undefined);
    const saved = (result && result.data) ? result : { id: record.id, data: stored };
    registerLocationDeeplink(record.id, saved.data);
    indexLocation(record.id, saved.data, (indexErr) => {
      if (indexErr) return fail(callback, `The location was saved, but updating it in the app's search failed: ${indexErr.message || indexErr}`);
      syncWidget('locations');
      sendEvent('locationUpdated', {
        ...locationEventDetails(record.id, saved.data, categories),
        previousTitle: (record.data && record.data.title) || null,
        updatedAt: saved.data.lastUpdatedOn || null,
        updatedBy: null
      });
      callback(null, locationView({ id: record.id, data: saved.data }, categories));
    });
  });
};

/** Reads what every location write needs first: the active categories and the pinned locations. */
const loadLocationContext = (callback) => {
  loadActiveCategories((err, categories) => {
    if (err) return callback(err, undefined);
    loadPinnedLocations((pinErr, pinned) => {
      if (pinErr) return callback(pinErr, undefined);
      callback(null, { categories, pinned });
    });
  });
};

/** Creates one location from create params already read. Shared by createLocation and createLocationsAdvanced. */
const createLocationFrom = (params, context, callback) => {
  // Without a map pick there is no geocoded address; like the AI generator, the address stands in for it.
  const values = 'formattedAddress' in params ? params : { ...params, formattedAddress: params.address };
  const { data, error } = prepareLocation(null, values, context.categories);
  if (error) return fail(callback, error);
  const pin = pinIndexFor(null, null, values.pinned, context.pinned);
  if (pin.error) return fail(callback, pin.error);
  data.pinIndex = pin.value;
  insertLocation(data, context.categories, (err, view) => {
    if (err) return callback(err, undefined);
    if (view.pinned) context.pinned.push({ id: view.id, data: { pinIndex: view.pinPosition } });
    callback(null, view);
  });
};

/** Reads the update params of a location; at least one must be given. */
const readLocationChanges = (options) => {
  const { values, error } = readParams(options, LOCATION_UPDATE_RULES);
  if (error) return { error };
  if (!Object.keys(values).length) return { error: 'Pass at least one change, such as newTitle or newDescription' };
  return { changes: plainValues(values) };
};

/** Updates one found location with changes already read. Shared by updateLocation, updateLocationAdvanced and updateLocationsAdvanced. */
const updateLocationWith = (record, changes, context, callback) => {
  const { data, error } = prepareLocation(record.data, changes, context.categories);
  if (error) return fail(callback, error);
  const pin = pinIndexFor(record.id, record.data.pinIndex, changes.pinned, context.pinned);
  if (pin.error) return fail(callback, pin.error);
  data.pinIndex = pin.value;
  saveLocation(record, data, context.categories, (err, view) => {
    if (err) return callback(err, undefined);
    context.pinned = context.pinned.filter((p) => p.id !== view.id);
    if (view.pinned) context.pinned.push({ id: view.id, data: { pinIndex: view.pinPosition } });
    callback(null, view);
  });
};

/** Deletes one found location with every side effect of the content tab's delete: its deep link and search engine entry go too, the widget refreshes, and locationDeleted fires. */
const deleteLocationRecord = (record, callback) => {
  buildfire.publicData.delete(record.id, LOCATIONS_TAG, (err) => {
    if (err) return callback(err, undefined);
    if (buildfire.deeplink && typeof buildfire.deeplink.unregisterDeeplink === 'function') {
      tryCall(() => buildfire.deeplink.unregisterDeeplink(`location-${record.id}`, () => {}));
    }
    const finish = () => {
      syncWidget('locations');
      sendEvent('locationDeleted', { locationId: record.id, title: (record.data && record.data.title) || null, deletedAt: new Date().toISOString() });
      callback(null, { id: record.id, title: (record.data && record.data.title) || null });
    };
    const engine = buildfire.services && buildfire.services.searchEngine;
    // The plugin removes the search entry alongside the record and ignores its outcome (Promise.allSettled).
    if (!engine || typeof engine.delete !== 'function') return finish();
    engine.delete({ id: record.id, tag: LOCATIONS_TAG }, () => finish());
  });
};

/** Moves a pinned location to a new position, renumbering every pinned location as the pinned list's drag-to-reorder does. */
const movePinnedLocation = (record, position, callback) => {
  if (!record.data.pinIndex) return fail(callback, `"${record.data.title}" is not pinned`);
  loadLocationContext((err, context) => {
    if (err) return callback(err, undefined);
    const pinned = context.pinned.slice();
    if (position > pinned.length) return fail(callback, `position must be between 1 and ${pinned.length}, the number of pinned locations`);
    const from = pinned.findIndex((p) => p.id === record.id);
    const [moved] = pinned.splice(from, 1);
    pinned.splice(position - 1, 0, moved);
    const results = [];
    let failure = null;
    eachInSeries(pinned, (item, index, next) => {
      if (failure) return next();
      const data = JSON.parse(JSON.stringify(item.data));
      data.pinIndex = index + 1;
      saveLocation(item, data, context.categories, (saveErr, view) => {
        if (saveErr) failure = saveErr;
        else results.push({ id: view.id, title: view.title, pinPosition: view.pinPosition });
        next();
      });
    }, () => {
      if (failure) return callback(failure, undefined);
      callback(null, { locations: results });
    });
  });
};

// ---------------------------------------------------------------------------
// Categories and subcategories
// ---------------------------------------------------------------------------

/** A category record exactly as the plugin stores it. Mirrors the Category model (src/widget/js/global/data/Category.js). */
const categoryRecord = (data = {}) => {
  const category = {
    id: data.id || undefined,
    title: data.title || '',
    iconUrl: data.iconUrl || null,
    iconClassName: data.iconClassName || null,
    subcategories: data.subcategories || [],
    quickAccess: [0, 1].includes(data.quickAccess) ? data.quickAccess : 0,
    createdOn: data.createdOn || new Date(),
    createdBy: data.createdBy || null,
    lastUpdatedOn: data.lastUpdatedOn || new Date(),
    lastUpdatedBy: data.lastUpdatedBy || null,
    deletedOn: data.deletedOn || null,
    deletedBy: data.deletedBy || null,
    isActive: [0, 1].includes(data.isActive) ? data.isActive : 1
  };
  category._buildfire = { index: { string1: category.title.toLowerCase(), date1: category.deletedOn, number1: category.quickAccess } };
  return category;
};

const subcategoryView = (sub) => ({
  id: sub.id, title: sub.title, iconUrl: sub.iconUrl || null, iconClassName: sub.iconClassName || null
});
const categoryView = (record) => ({
  id: record.id,
  title: record.data.title,
  iconUrl: record.data.iconUrl || null,
  iconClassName: record.data.iconClassName || null,
  subcategories: (record.data.subcategories || []).map(subcategoryView)
});

// icon is the picture picked from the image library; iconName a font icon from its icon tab. The picker sets one and clears the other.
const ICON_RULES = [
  ['icon', {
    kind: 'image', nullable: true, minValue: 0, maxValue: 1
  }],
  ['iconName', { kind: 'string', nullable: true }]
];
const CATEGORY_RULES = [['title', { kind: 'string', required: true }], ...ICON_RULES];
const CATEGORY_UPDATE_RULES = updateRules(CATEGORY_RULES);
const SUBCATEGORY_RULES = CATEGORY_RULES;
const SUBCATEGORY_UPDATE_RULES = CATEGORY_UPDATE_RULES;

/** Applies icon values the way the image library's picker does: a picture clears the font icon and a font icon clears the picture. */
const applyIconValues = (target, values) => {
  const icon = 'icon' in values ? ((values.icon && values.icon[0]) || null) : undefined;
  const iconName = 'iconName' in values ? (values.iconName || null) : undefined;
  if (icon && iconName) return 'Pass either icon or iconName, not both';
  if (icon !== undefined) {
    target.iconUrl = icon;
    if (icon) target.iconClassName = null;
  }
  if (iconName !== undefined) {
    target.iconClassName = iconName;
    if (iconName) target.iconUrl = null;
  }
  return null;
};

/** The active category a caller named by its exact title. */
const resolveCategoryByTitle = (title, callback) => {
  buildfire.publicData.search({
    filter: { '$json.title': title, '_buildfire.index.date1': { $type: 10 } }, page: 0, pageSize: PAGE_SIZE, recordCount: true
  }, CATEGORIES_TAG, (err, response) => {
    if (err) return callback(err, undefined);
    onlyMatch((response && response.result) || [], 'category', 'title', title, callback, 'categories', (response && response.totalRecord) || 0);
  });
};

/** The category with this id, refused when it matches nothing or was deleted. */
const requireCategoryById = (categoryId, callback) => {
  getPublicRecord(categoryId, CATEGORIES_TAG, 'category', (err, record) => {
    if (err) return callback(err, undefined);
    if (record.data.deletedOn) return fail(callback, `No category with id "${categoryId}"`);
    callback(null, record);
  });
};

/** Saves a category over the stored one as the categories tab's Save does (CategoriesController.updateCategory), then refreshes the widget. */
const saveCategory = (record, data, callback) => {
  data.id = record.id;
  data.lastUpdatedOn = new Date();
  data.lastUpdatedBy = null;
  const stored = categoryRecord(data);
  buildfire.publicData.update(record.id, stored, CATEGORIES_TAG, (err, result) => {
    if (err) return callback(err, undefined);
    syncWidget('category');
    callback(null, categoryView((result && result.data) ? result : { id: record.id, data: stored }));
  });
};

/** Reads a category's create params and builds its record. Shared by createCategory and createCategoriesAdvanced. */
const prepareCategory = (options) => {
  const { values, error } = readParams(options, [...CATEGORY_RULES, ['subcategories', { kind: 'string' }]]);
  if (error) return { error };
  const data = { title: values.title };
  const iconProblem = applyIconValues(data, values);
  if (iconProblem) return { error: iconProblem };
  // Subcategory names as the categories CSV import reads them: comma separated.
  data.subcategories = (values.subcategories || '').split(',').map((title) => title.trim()).filter(Boolean)
    .map((title) => ({
      id: generateUUID(), title, iconUrl: null, iconClassName: null
    }));
  return { data };
};

/** Inserts a new category as the categories tab does: registers its analytics events, then refreshes the widget. */
const insertCategory = (data, callback) => {
  const now = new Date();
  const stored = categoryRecord({ ...data, createdOn: now, createdBy: null });
  delete stored.id;
  buildfire.publicData.insert(stored, CATEGORIES_TAG, (err, result) => {
    if (err) return callback(err, undefined);
    registerAnalyticsEvent(`${result.data.title} (Category Selected)`, `categories_${result.id}_selected`);
    (result.data.subcategories || []).forEach((sub) => registerAnalyticsEvent(`${sub.title} (Subcategory Selected)`, `subcategories_${sub.id}_selected`));
    syncWidget('category');
    callback(null, categoryView(result));
  });
};

/** Reads a category's update params; at least one must be given. */
const readCategoryChanges = (options) => {
  const { values, error } = readParams(options, CATEGORY_UPDATE_RULES);
  if (error) return { error };
  if (!Object.keys(values).length) return { error: 'Pass at least one change: newTitle, newIcon or newIconName' };
  const changes = plainValues(values);
  if (changes.icon && changes.icon.length && changes.iconName) return { error: 'Pass either newIcon or newIconName, not both' };
  return { changes };
};

const updateCategoryWith = (record, changes, callback) => {
  const data = JSON.parse(JSON.stringify(record.data));
  if ('title' in changes) data.title = changes.title;
  const iconProblem = applyIconValues(data, changes);
  if (iconProblem) return fail(callback, iconProblem);
  saveCategory(record, data, callback);
};

/** Removes a category from the app the way the categories tab does: it is marked deleted (deletedOn), kept in storage, and no longer listed. */
const softDeleteCategory = (record, callback) => {
  const data = JSON.parse(JSON.stringify(record.data));
  data.id = record.id;
  data.deletedOn = new Date();
  data.deletedBy = null;
  buildfire.publicData.update(record.id, categoryRecord(data), CATEGORIES_TAG, (err) => {
    if (err) return callback(err, undefined);
    syncWidget('category');
    callback(null, { id: record.id, title: record.data.title });
  });
};

const findSubcategory = (record, subcategoryTitle, callback) => {
  const matches = (record.data.subcategories || []).filter((sub) => sub.title === subcategoryTitle);
  onlyMatch(matches, `subcategory of "${record.data.title}"`, 'title', subcategoryTitle, callback, `subcategories of "${record.data.title}"`);
};
const requireSubcategoryById = (record, subcategoryId, callback) => {
  const sub = (record.data.subcategories || []).find((s) => s.id === subcategoryId);
  if (!sub) return fail(callback, `No subcategory of "${record.data.title}" has the id "${subcategoryId}"`);
  callback(null, sub);
};

/** Reads a subcategory's create params. */
const prepareSubcategory = (options) => {
  const { values, error } = readParams(options, SUBCATEGORY_RULES);
  if (error) return { error };
  const sub = {
    id: generateUUID(), title: values.title, iconUrl: null, iconClassName: null
  };
  const iconProblem = applyIconValues(sub, values);
  if (iconProblem) return { error: iconProblem };
  return { sub };
};

/** Adds a subcategory to a found category, as the category form's "Add Subcategory" and Save do. */
const addSubcategoryTo = (record, sub, callback) => {
  const data = JSON.parse(JSON.stringify(record.data));
  data.subcategories = [...(data.subcategories || []), sub];
  saveCategory(record, data, (err, category) => {
    if (err) return callback(err, undefined);
    callback(null, { ...subcategoryView(sub), categoryId: category.id, categoryTitle: category.title });
  });
};

const readSubcategoryChanges = (options) => {
  const { values, error } = readParams(options, SUBCATEGORY_UPDATE_RULES);
  if (error) return { error };
  if (!Object.keys(values).length) return { error: 'Pass at least one change: newTitle, newIcon or newIconName' };
  const changes = plainValues(values);
  if (changes.icon && changes.icon.length && changes.iconName) return { error: 'Pass either newIcon or newIconName, not both' };
  return { changes };
};

const updateSubcategoryIn = (record, subcategoryId, changes, callback) => {
  const data = JSON.parse(JSON.stringify(record.data));
  const sub = data.subcategories.find((s) => s.id === subcategoryId);
  if ('title' in changes) sub.title = changes.title;
  const iconProblem = applyIconValues(sub, changes);
  if (iconProblem) return fail(callback, iconProblem);
  saveCategory(record, data, (err, category) => {
    if (err) return callback(err, undefined);
    callback(null, { ...subcategoryView(sub), categoryId: category.id, categoryTitle: category.title });
  });
};

const removeSubcategoryFrom = (record, subcategoryId, callback) => {
  const data = JSON.parse(JSON.stringify(record.data));
  const sub = data.subcategories.find((s) => s.id === subcategoryId);
  data.subcategories = data.subcategories.filter((s) => s.id !== subcategoryId);
  saveCategory(record, data, (err, category) => {
    if (err) return callback(err, undefined);
    callback(null, {
      id: sub.id, title: sub.title, categoryId: category.id, categoryTitle: category.title
    });
  });
};

const moveSubcategoryIn = (record, subcategoryId, position, callback) => {
  const data = JSON.parse(JSON.stringify(record.data));
  if (position > data.subcategories.length) return fail(callback, `position must be between 1 and ${data.subcategories.length}, the number of subcategories`);
  const from = data.subcategories.findIndex((s) => s.id === subcategoryId);
  const [moved] = data.subcategories.splice(from, 1);
  data.subcategories.splice(position - 1, 0, moved);
  saveCategory(record, data, callback);
};

// ---------------------------------------------------------------------------
// Settings and location fields
// ---------------------------------------------------------------------------

/**
 * The settings document exactly as the plugin stores it, with its defaults. Mirrors the Settings model (src/widget/js/global/data/Settings.js).
 */
const settingsRecord = (data = {}) => {
  const s = {};
  s.subscription = data.subscription || { enabled: false, allowCustomNotifications: false };
  s.measurementUnit = data.measurementUnit || 'metric';
  s.introductoryListView = data.introductoryListView || {
    images: [], description: null, sorting: 'distance', searchOptions: { mode: 'UserPosition', areaRadiusOptions: {} }
  };
  if (!(data.introductoryListView && data.introductoryListView.visibilityOptions)) {
    s.introductoryListView.visibilityOptions = {
      tags: [],
      value: (data.showIntroductoryListView === true || typeof data.showIntroductoryListView === 'undefined') ? 'ALL' : 'NONE'
    };
  } else {
    s.introductoryListView.visibilityOptions = {
      tags: data.introductoryListView.visibilityOptions.tags || [],
      value: data.introductoryListView.visibilityOptions.value || 'ALL'
    };
  }
  s.sorting = data.sorting || {
    defaultSorting: 'distance',
    hideSorting: false,
    allowSortByReverseAlphabetical: true,
    allowSortByNearest: true,
    allowSortByPriceLowToHigh: true,
    allowSortByPriceHighToLow: true,
    allowSortByDate: true,
    allowSortByRating: true,
    allowSortByViews: true,
  };
  const fieldOf = (field) => ({
    id: field.id || null,
    label: field.label || null,
    type: field.type || null,
    required: field.required || false,
    enableCustomLabel: field.enableCustomLabel || false,
    visibility: field.visibility || { value: 'ALL', tags: [] }
  });
  s.customFields = {
    quickActions: ((data.customFields && data.customFields.quickActions) || []).map(fieldOf),
    content: ((data.customFields && data.customFields.content) || []).map(fieldOf)
  };
  s.filter = data.filter || {
    allowFilterByArea: true, allowFilterByBookmarks: false, hideOpeningHoursFilter: false, hidePriceFilter: false
  };
  s.map = data.map || {
    distanceUnit: 'metric',
    showPointsOfInterest: false,
    initialArea: true,
    offlineAreaSelection: true,
    initialAreaCoordinates: { lat: null, lng: null },
    initialAreaDisplayAddress: null
  };
  s.bookmarks = data.bookmarks || { enabled: true, allowForLocations: true, allowForFilters: true };
  s.design = data.design || {
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
  };
  s.globalEntries = data.globalEntries || {
    locations: { allowAdding: 'none', tags: [] },
    photos: { allowAdding: 'none', tags: [] },
    openHours: { enabled: true, inAppEnabled: 'all', tags: [] },
    priceRange: { enabled: true, inAppEnabled: 'all', tags: [] },
    charging: {
      enabled: 'none', tags: [], description: '', subscriptionOptions: []
    },
  };
  if (!s.globalEntries.charging) {
    s.globalEntries.charging = {
      enabled: 'none', tags: [], description: '', subscriptionOptions: []
    };
  }
  s.globalEditors = data.globalEditors || {
    enabled: true, allowLocationCreatorsToEdit: true, tags: [], users: []
  };
  s.locationEditors = data.locationEditors || { enabled: true, time: '12H' };
  s.categoriesSortBy = data.categoriesSortBy || 'Asc';
  s.createdOn = data.createdOn || new Date();
  s.createdBy = data.createdBy || null;
  s.lastUpdatedOn = data.lastUpdatedOn || new Date();
  s.lastUpdatedBy = data.lastUpdatedBy || null;
  s.deletedOn = data.deletedOn || null;
  s.deletedBy = data.deletedBy || null;
  s.isActive = [0, 1].includes(data.isActive) ? data.isActive : 1;
  if (typeof s.globalEditors.allowLocationCreatorsToEdit === 'undefined') s.globalEditors.allowLocationCreatorsToEdit = true;
  s._buildfire = { index: {} };
  return s;
};

/** Mirrors Settings.migrateFieldSettings: older instances kept two plain flags where newer ones keep objects. */
const migrateFieldSettings = (data) => {
  const entries = data.globalEntries;
  if (entries) {
    if (entries.allowPriceRange != null) {
      entries.priceRange = { enabled: entries.allowPriceRange, inAppEnabled: entries.allowPriceRange ? 'all' : 'none', tags: [] };
      delete entries.allowPriceRange;
    }
    if (entries.allowOpenHours != null) {
      entries.openHours = { enabled: entries.allowOpenHours, inAppEnabled: entries.allowOpenHours ? 'all' : 'none', tags: [] };
      delete entries.allowOpenHours;
    }
  }
  return data;
};

/** The settings as the control panel loads them (Settings.get): saved ones migrated, or a new instance's defaults, where following locations starts on. */
const loadSettings = (callback) => {
  buildfire.datastore.get(SETTINGS_TAG, (err, res) => {
    if (err) return callback(err, undefined);
    if (!res || !res.data || !Object.keys(res.data).length) {
      return callback(null, settingsRecord({ subscription: { enabled: true, allowCustomNotifications: true } }));
    }
    callback(null, settingsRecord(migrateFieldSettings(JSON.parse(JSON.stringify(res.data)))));
  });
};

/** Saves the whole settings document as every settings, design and content tab does (Settings.save), then sends each refresh message the tabs send. */
const saveSettingsDocument = (settings, scopes, callback) => {
  settings.lastUpdatedOn = new Date();
  settings.lastUpdatedBy = null;
  buildfire.datastore.save(settings, SETTINGS_TAG, (err, res) => {
    if (err || !res) return callback(err || new Error('The settings could not be saved'), undefined);
    scopes.forEach(syncWidget);
    callback(null, settingsRecord(res.data));
  });
};

const getPath = (obj, path) => path.reduce((value, key) => (value == null ? undefined : value[key]), obj);
const setPath = (obj, path, value) => {
  let target = obj;
  path.slice(0, -1).forEach((key) => {
    if (!isObject(target[key])) target[key] = {};
    target = target[key];
  });
  target[path[path.length - 1]] = value;
};

// One param per owner-editable setting: [param, rule, path in the settings document, refresh scope of the tab that edits it].
const SETTINGS_FIELDS = [
  ['followingEnabled', { kind: 'boolean' }, ['subscription', 'enabled'], 'settings'],
  ['allowCustomNotifications', { kind: 'boolean' }, ['subscription', 'allowCustomNotifications'], 'settings'],
  ['defaultSorting', { kind: 'select', values: ['distance', 'alphabetical'] }, ['sorting', 'defaultSorting'], 'settings'],
  ['hideSorting', { kind: 'boolean' }, ['sorting', 'hideSorting'], 'settings'],
  ['allowSortByReverseAlphabetical', { kind: 'boolean' }, ['sorting', 'allowSortByReverseAlphabetical'], 'settings'],
  ['allowSortByNearest', { kind: 'boolean' }, ['sorting', 'allowSortByNearest'], 'settings'],
  ['allowSortByPriceLowToHigh', { kind: 'boolean' }, ['sorting', 'allowSortByPriceLowToHigh'], 'settings'],
  ['allowSortByPriceHighToLow', { kind: 'boolean' }, ['sorting', 'allowSortByPriceHighToLow'], 'settings'],
  ['allowSortByDate', { kind: 'boolean' }, ['sorting', 'allowSortByDate'], 'settings'],
  ['allowSortByRating', { kind: 'boolean' }, ['sorting', 'allowSortByRating'], 'settings'],
  ['allowSortByViews', { kind: 'boolean' }, ['sorting', 'allowSortByViews'], 'settings'],
  ['allowFilterByArea', { kind: 'boolean' }, ['filter', 'allowFilterByArea'], 'settings'],
  ['allowFilterByBookmarks', { kind: 'boolean' }, ['filter', 'allowFilterByBookmarks'], 'settings'],
  ['hideOpeningHoursFilter', { kind: 'boolean' }, ['filter', 'hideOpeningHoursFilter'], 'settings'],
  ['hidePriceFilter', { kind: 'boolean' }, ['filter', 'hidePriceFilter'], 'settings'],
  ['distanceUnit', { kind: 'select', values: ['metric', 'imperial'] }, ['measurementUnit'], 'settings'],
  ['showInitialArea', { kind: 'boolean' }, ['map', 'initialArea'], 'settings'],
  ['initialAreaAddress', { kind: 'string', nullable: true }, ['map', 'initialAreaDisplayAddress'], 'settings'],
  ['initialAreaLatitude', {
    kind: 'number', nullable: true, minValue: -90, maxValue: 90
  }, ['map', 'initialAreaCoordinates', 'lat'], 'settings'],
  ['initialAreaLongitude', {
    kind: 'number', nullable: true, minValue: -180, maxValue: 180
  }, ['map', 'initialAreaCoordinates', 'lng'], 'settings'],
  ['bookmarksEnabled', { kind: 'boolean' }, ['bookmarks', 'enabled'], 'settings'],
  ['allowBookmarkLocations', { kind: 'boolean' }, ['bookmarks', 'allowForLocations'], 'settings'],
  ['allowBookmarkSearches', { kind: 'boolean' }, ['bookmarks', 'allowForFilters'], 'settings'],
  ['allowOpeningHours', { kind: 'boolean' }, ['globalEntries', 'openHours', 'enabled'], 'locationSettings'],
  ['allowPriceRange', { kind: 'boolean' }, ['globalEntries', 'priceRange', 'enabled'], 'locationSettings'],
  ['timeFormat', { kind: 'select', values: ['12H', '24H'] }, ['locationEditors', 'time'], 'settings'],
  ['listViewPosition', { kind: 'select', values: ['expanded', 'collapsed', 'halfExpanded'] }, ['design', 'listViewPosition'], 'design'],
  ['listViewStyle', { kind: 'select', values: ['backgroundImage', 'smallImage'] }, ['design', 'listViewStyle'], 'design'],
  ['defaultMapType', { kind: 'select', values: ['streets', 'satellite'] }, ['design', 'defaultMapType'], 'design'],
  ['enableMapTerrainView', { kind: 'boolean' }, ['design', 'enableMapTerrainView'], 'design'],
  ['hideQuickFilter', { kind: 'boolean' }, ['design', 'hideQuickFilter'], 'design'],
  ['allowMapStyleSelection', { kind: 'boolean' }, ['design', 'allowStyleSelection'], 'design'],
  ['showDetailsCategory', { kind: 'boolean' }, ['design', 'showDetailsCategory'], 'design'],
  ['showContributorName', { kind: 'boolean' }, ['design', 'showContributorName'], 'design'],
  ['detailsMapPosition', { kind: 'select', values: ['top', 'bottom'] }, ['design', 'detailsMapPosition'], 'design'],
  ['introDescription', { kind: 'wysiwyg', nullable: true }, ['introductoryListView', 'description'], 'intro'],
  ['introSorting', { kind: 'select', values: ['distance', 'alphabetical', 'newest'] }, ['introductoryListView', 'sorting'], 'intro'],
  ['introLocationsSource', { kind: 'select', values: ['All', 'UserPosition', 'AreaRadius', 'MyLocations'] }, ['introductoryListView', 'searchOptions', 'mode'], 'intro'],
  ['introAreaAddress', { kind: 'string', nullable: true }, ['introductoryListView', 'searchOptions', 'areaRadiusOptions', 'formattedLocation'], 'intro'],
  ['introAreaLatitude', {
    kind: 'number', nullable: true, minValue: -90, maxValue: 90
  }, ['introductoryListView', 'searchOptions', 'areaRadiusOptions', 'lat'], 'intro'],
  ['introAreaLongitude', {
    kind: 'number', nullable: true, minValue: -180, maxValue: 180
  }, ['introductoryListView', 'searchOptions', 'areaRadiusOptions', 'lng'], 'intro'],
  ['introAreaRadius', {
    kind: 'number', nullable: true, minValue: 1, maxValue: 200
  }, ['introductoryListView', 'searchOptions', 'areaRadiusOptions', 'radius'], 'intro'],
  ['introImages', { kind: 'actions', nullable: true, minValue: 0 }, ['introductoryListView', 'images'], 'intro']
];

const locationFieldView = (field, section) => ({
  id: field.id,
  label: field.label,
  type: field.type,
  section,
  required: !!field.required,
  allowCustomLabel: !!field.enableCustomLabel
});
const allLocationFields = (settings) => [
  ...settings.customFields.quickActions.map((field) => locationFieldView(field, 'quickActions')),
  ...settings.customFields.content.map((field) => locationFieldView(field, 'content'))
];

/** What getSettings returns: every setting updateSettings takes, under the same names, and the location fields. */
const settingsView = (settings) => {
  const view = {};
  SETTINGS_FIELDS.forEach(([name, , path]) => {
    const value = getPath(settings, path);
    view[name] = value === undefined ? null : value;
  });
  view.introImages = view.introImages || [];
  view.locationFields = allLocationFields(settings);
  return view;
};

const FIELD_TYPES_BY_SECTION = { quickActions: QUICK_ACTION_TYPES, content: CONTENT_TYPES };
const LOCATION_FIELD_RULES = [
  ['label', { kind: 'string', required: true }],
  ['section', { kind: 'select', required: true, values: FIELD_SECTIONS }],
  ['type', { kind: 'select', required: true, values: CONTENT_TYPES }],
  ['required', { kind: 'boolean' }],
  ['allowCustomLabel', { kind: 'boolean' }]
];
const LOCATION_FIELD_UPDATE_RULES = [
  ['newLabel', { kind: 'string', update: true }],
  ['newType', { kind: 'select', update: true, values: CONTENT_TYPES }],
  ['newRequired', { kind: 'boolean', update: true }],
  ['newAllowCustomLabel', { kind: 'boolean', update: true }]
];

/** Reads a location field's create params and builds it as the location fields page adds one: visible to everyone. */
const prepareLocationField = (options) => {
  const { values, error } = readParams(options, LOCATION_FIELD_RULES);
  if (error) return { error };
  if (!FIELD_TYPES_BY_SECTION[values.section].includes(values.type)) {
    return { error: `type must be one of: ${FIELD_TYPES_BY_SECTION[values.section].join(', ')} for ${values.section}` };
  }
  return {
    section: values.section,
    field: {
      id: generateUUID(),
      label: values.label,
      type: values.type,
      required: values.required || false,
      enableCustomLabel: values.allowCustomLabel || false,
      visibility: { value: 'ALL', tags: [] }
    }
  };
};

const readLocationFieldChanges = (options) => {
  const { values, error } = readParams(options, LOCATION_FIELD_UPDATE_RULES);
  if (error) return { error };
  if (!Object.keys(values).length) return { error: 'Pass at least one change: newLabel, newType, newRequired or newAllowCustomLabel' };
  return { changes: plainValues(values) };
};

/** Finds a location field in the settings by its exact label, in either section. */
const findLocationFieldByLabel = (settings, label, callback) => {
  onlyMatch(allLocationFields(settings).filter((field) => field.label === label), 'location field', 'label', label, callback);
};
const findLocationFieldById = (settings, fieldId, callback) => {
  const field = allLocationFields(settings).find((f) => f.id === fieldId);
  if (!field) return fail(callback, `No location field with id "${fieldId}"`);
  callback(null, field);
};

/** Applies changes to a stored field, checking its type against its section. Returns a problem, or null. */
const applyLocationFieldChanges = (settings, fieldView, changes) => {
  const list = settings.customFields[fieldView.section];
  const field = list.find((f) => f.id === fieldView.id);
  if ('type' in changes && !FIELD_TYPES_BY_SECTION[fieldView.section].includes(changes.type)) {
    return `newType must be one of: ${FIELD_TYPES_BY_SECTION[fieldView.section].join(', ')} for ${fieldView.section}`;
  }
  if ('label' in changes) field.label = changes.label;
  if ('type' in changes) field.type = changes.type;
  if ('required' in changes) field.required = changes.required;
  if ('allowCustomLabel' in changes) field.enableCustomLabel = changes.allowCustomLabel;
  return null;
};

const fieldOfSettings = (settings, fieldId) => allLocationFields(settings).find((f) => f.id === fieldId);

// ---------------------------------------------------------------------------
// Language texts
// ---------------------------------------------------------------------------

/** The Language tab's saved texts (buildfire.services.Strings.refresh): the one record under the language's tag, or null. */
const loadLanguageRecord = (callback) => {
  buildfire.datastore.search({ limit: 1 }, LANGUAGE_TAG, (err, records) => {
    if (err) return callback(err, undefined);
    callback(null, (records && records[0]) || null);
  });
};

/** The texts document as the Strings service builds it: every label's default and flags, with the saved values merged in. */
const languageDocument = (record) => {
  const doc = {};
  Object.keys(LANGUAGE_TEXTS).forEach((key) => {
    const [section, label] = key.split('.');
    const text = LANGUAGE_TEXTS[key];
    if (!doc[section]) doc[section] = {};
    doc[section][label] = { defaultValue: text.defaultValue };
    if (text.required) doc[section][label].required = true;
    if (text.isPlaceHolder) doc[section][label].isPlaceHolder = true;
  });
  const saved = (record && record.data) || {};
  Object.keys(saved).forEach((section) => {
    if (!isObject(saved[section])) return;
    if (!doc[section]) doc[section] = {};
    Object.keys(saved[section]).forEach((label) => {
      if (!doc[section][label]) doc[section][label] = {};
      const stored = saved[section][label];
      if (isObject(stored) && stored.value !== undefined) doc[section][label].value = stored.value;
    });
  });
  return doc;
};

/** The text the app shows for a label: its saved value, or its default (Strings.get). */
const shownText = (entry, text) => {
  if (entry && (entry.value || (entry.value === '' && !text.required))) return entry.value;
  return text.defaultValue || '';
};
const languageTextsView = (doc) => ({
  texts: Object.keys(LANGUAGE_TEXTS).map((key) => {
    const [section, label] = key.split('.');
    const text = LANGUAGE_TEXTS[key];
    const entry = doc[section] && doc[section][label];
    return {
      key,
      section: LANGUAGE_SECTIONS[section] || section,
      title: text.title,
      text: shownText(entry, text),
      defaultText: text.defaultValue || '',
      required: !!text.required,
      maxLength: text.maxLength || null
    };
  })
});

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

/** The entries of a batch call, checked for count. */
const readBatchEntries = (options, listName, callback) => {
  requireCallback(callback);
  const entries = isObject(options) ? options[listName] : undefined;
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > BATCH_LIMIT) {
    fail(callback, `${listName} must be a list of 1 to ${BATCH_LIMIT} entries`);
    return null;
  }
  const notObject = entries.findIndex((entry) => !isObject(entry));
  if (notObject > -1) {
    fail(callback, `${listName}: entry ${notObject} must be an object`);
    return null;
  }
  return entries;
};

/** Refuses the same id listed twice in a batch. */
const duplicateEntries = (entries, keyOf) => {
  const seen = {};
  const duplicates = [];
  entries.forEach((entry, index) => {
    const key = keyOf(entry);
    if (seen[key] !== undefined) duplicates.push(`entry ${index} repeats entry ${seen[key]}`);
    else seen[key] = index;
  });
  return duplicates;
};

/** Checks every entry's ids exist before any write: checkOne(entry, index, done(err, found)). */
const checkAllExist = (entries, checkOne, callback) => {
  const found = [];
  const missing = [];
  eachInSeries(entries, (entry, index, next) => {
    checkOne(entry, index, (err, value) => {
      if (err) missing.push(`entry ${index}: ${err.message || err}`);
      else found[index] = value;
      next();
    });
  }, () => {
    if (missing.length) return fail(callback, `Not found: ${missing.join('; ')}`);
    callback(null, found);
  });
};

/** Applies each entry in turn and reports every outcome; a failed write is recorded, not a stop. */
const runBatch = (entries, listName, applyOne, callback) => {
  const results = [];
  eachInSeries(entries, (entry, index, next) => {
    applyOne(entry, index, (err, id) => {
      results.push({ index, id: err ? null : id, error: err ? (err.message || String(err)) : null });
      next();
    });
  }, () => {
    const failed = results.filter((r) => r.error).length;
    callback(null, { [listName]: results, succeeded: results.length - failed, failed });
  });
};

// ---------------------------------------------------------------------------
// Location field values
// ---------------------------------------------------------------------------

const FIELD_VALUE_RULES = [
  ['newValue', { kind: 'string', update: true, nullable: true }],
  ['newCustomLabel', { kind: 'string', update: true, nullable: true }]
];
const readFieldValueChanges = (options) => {
  const { values, error } = readParams(options, FIELD_VALUE_RULES);
  if (error) return { error };
  if (!Object.keys(values).length) return { error: 'Pass at least one change: newValue or newCustomLabel' };
  return { changes: plainValues(values) };
};

/** Checks a field value change against the field, as the location form does (validateCustomFields). Returns { value } normalized, or { error }. */
const checkFieldValue = (field, changes) => {
  const result = {};
  if ('value' in changes) {
    if (!changes.value && field.required) return { error: `"${field.label}" is required, so its value cannot be removed` };
    const checked = validateFieldValue(changes.value, field.type);
    if (checked.error) return { error: `${field.label}: ${checked.error}` };
    result.value = checked.value;
  }
  if ('customLabel' in changes) {
    if (!field.allowCustomLabel) return { error: `"${field.label}" does not take a label of its own` };
    result.customLabel = changes.customLabel;
  }
  return { checked: result };
};

/** Sets one field's value on a found location and saves it through the location's own save path. */
const applyFieldValue = (record, field, checked, categories, callback) => {
  const data = JSON.parse(JSON.stringify(record.data));
  data.additionalFields = data.additionalFields || {};
  const list = data.additionalFields[field.section] || [];
  data.additionalFields[field.section] = list;
  let entry = list.find((item) => item.id === field.id);
  if (!entry) {
    entry = { id: field.id, value: null, customLabel: null };
    list.push(entry);
  }
  if ('value' in checked) entry.value = checked.value;
  if ('customLabel' in checked) entry.customLabel = checked.customLabel;
  saveLocation(record, data, categories, callback);
};

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

const LOCATION_SEARCH_RULES = [
  ['title', { kind: 'string' }],
  ['searchText', { kind: 'string' }],
  ['category', { kind: 'string' }],
  ['subcategory', { kind: 'string' }],
  ['pinnedOnly', { kind: 'boolean' }],
  ['sortBy', { kind: 'select', values: ['alphabetical', 'newest'] }],
  ['page', { kind: 'number', minValue: 0 }],
  ['pageSize', { kind: 'number', minValue: 1, maxValue: PAGE_SIZE }]
];

/** Moves a location field to a new place within its section, as dragging it on the Location Fields page does. Shared by updateLocationFieldOrder and its advanced form. */
const moveLocationField = (options, findField, callback) => {
  const { values, error } = readParams(options, [['position', { kind: 'number', required: true, minValue: 1 }]]);
  if (error) return fail(callback, error);
  if (!Number.isInteger(values.position)) return fail(callback, 'position must be a whole number');
  loadSettings((err, settings) => {
    if (err) return callback(err, undefined);
    findField(settings, (fieldErr, field) => {
      if (fieldErr) return callback(fieldErr, undefined);
      const list = settings.customFields[field.section];
      if (values.position > list.length) return fail(callback, `position must be between 1 and ${list.length}, the number of fields in its section`);
      const from = list.findIndex((f) => f.id === field.id);
      const [moved] = list.splice(from, 1);
      list.splice(values.position - 1, 0, moved);
      saveSettingsDocument(settings, ['customFields'], (saveErr, saved) => {
        if (saveErr) return callback(saveErr, undefined);
        callback(null, { fields: saved.customFields[field.section].map((f) => locationFieldView(f, field.section)) });
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
      if (err) return console.error('Failed to initialize locations contract', err);
      frameId = data.fid;
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Searches the locations the way the content tab's list and the app's lists do: an exact title, the content tab's text search over the location's search text (_buildfire.index.text), a category (and subcategory) by name through the array1 index the widget filters on (c_<id>, s_<id>), the pinned locations (number1 1–3, in pin order, as getPinnedLocation reads them), sorted alphabetically (_buildfire.index.text) or newest first (_buildfire.index.date1) as the widget sorts. One page of at most 50 a call; recordCount gives the total. A function rather than a declarative search because the category name is resolved to its id first, and every location's category names are filled in from the categories. Uses only buildfire.publicData, the same in both frames and on the server; nothing to watch, so Background.
   * @param {{ title?: string, searchText?: string, category?: string, subcategory?: string, pinnedOnly?: boolean, sortBy?: string, page?: number, pageSize?: number }} options
   * @param {function(Error=, object=)} callback - (error, { locations, total, page, hasMore })
   */
  searchLocations(options, callback) {
    requireCallback(callback);
    const params = options === undefined ? {} : options;
    if (!isObject(params)) return fail(callback, 'options must be an object');
    const { values, error } = readParams(params, LOCATION_SEARCH_RULES);
    if (error) return fail(callback, error);
    if (values.subcategory && !values.category) return fail(callback, 'subcategory needs the category it belongs to');
    if (values.page !== undefined && !Number.isInteger(values.page)) return fail(callback, 'page must be a whole number');
    if (values.pageSize !== undefined && !Number.isInteger(values.pageSize)) return fail(callback, 'pageSize must be a whole number');
    loadActiveCategories((err, categories) => {
      if (err) return callback(err, undefined);
      const filter = {};
      if (values.title) filter['$json.title'] = values.title;
      if (values.searchText) filter['_buildfire.index.text'] = { $regex: values.searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      if (values.category) {
        const parsed = parseCategoriesText(values.subcategory ? `${values.category} -> ${values.subcategory}` : values.category, categories);
        if (parsed.error) return fail(callback, parsed.error);
        const tokens = values.subcategory ? [`s_${parsed.value.subcategories[0]}`] : [`c_${parsed.value.main[0]}`];
        filter['_buildfire.index.array1.string1'] = { $in: tokens };
      }
      let sort = values.sortBy === 'newest' ? { '_buildfire.index.date1': -1 } : { '_buildfire.index.text': 1 };
      if (values.pinnedOnly) {
        filter['_buildfire.index.number1'] = { $in: [1, 2, 3] };
        sort = { '_buildfire.index.number1': 1 };
      }
      const page = values.page || 0;
      const pageSize = values.pageSize || PAGE_SIZE;
      buildfire.publicData.search({
        filter, sort, page, pageSize, recordCount: true
      }, LOCATIONS_TAG, (searchErr, response) => {
        if (searchErr) return callback(searchErr, undefined);
        const result = (response && response.result) || [];
        const total = (response && response.totalRecord) || 0;
        callback(null, {
          locations: result.map((record) => locationView(record, categories)),
          total,
          page,
          hasMore: (page + 1) * pageSize < total
        });
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. One location, named by its exact title, with its category names filled in. Resolving the title is a search, which is why it is a function. Uses only buildfire.publicData, the same in both frames and on the server; nothing to watch, so Background. usage: basic; its advanced alternative is getLocationAdvanced.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, location)
   */
  getLocation(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    resolveLocationByTitle(options.title, (err, record) => {
      if (err) return callback(err, undefined);
      loadActiveCategories((catErr, categories) => {
        if (catErr) return callback(catErr, undefined);
        callback(null, locationView(record, categories));
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of getLocation, taking the location's id. An id that matches nothing is refused (the store answers an empty record for it). Same hosts and reasons as getLocation.
   * @param {{ locationId: string }} options
   * @param {function(Error=, object=)} callback - (error, location)
   */
  getLocationAdvanced(options, callback) {
    if (!requireStringParams(options, ['locationId'], callback)) return;
    requireLocationById(options.locationId, (err, record) => {
      if (err) return callback(err, undefined);
      loadActiveCategories((catErr, categories) => {
        if (catErr) return callback(catErr, undefined);
        callback(null, locationView(record, categories));
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Adds a location the way the content tab's location form does (LocationsController.createLocation): the Location model's record with a new clientId, its analytics event, deep link and search engine entry, then the widget refresh and locationCreated. Categories are named in the CSV import's text format and must exist. The form's required location fields are not asked for, as the CSV import does not ask for them; their values are set with updateLocationFieldValue. Created on behalf of the app, so createdBy is empty. Multi-step over the SDK (categories and pinned locations are read first), which is why it is a function. Uses buildfire.publicData (plus deep links, analytics and the search engine where present), the same in both frames and on the server; content edits need no watching, so Background. The widget offers the same form to permitted app users.
   * @param {object} options - the location's details, as declared
   * @param {function(Error=, object=)} callback - (error, location)
   */
  createLocation(options, callback) {
    requireCallback(callback);
    if (!isObject(options)) return fail(callback, 'options must be an object');
    const { values, error } = readParams(options, LOCATION_RULES);
    if (error) return fail(callback, error);
    loadLocationContext((err, context) => {
      if (err) return callback(err, undefined);
      createLocationFrom(values, context, callback);
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced (batches are never basic). The batch form of createLocation, as the content tab's CSV import and AI generator add many: every entry is checked with createLocation's own checks (its categories resolved, its marker, and no more than three pinned in all) before anything is written, then each is added through createLocation's implementation, so each gets every side effect and its locationCreated. A failed write is reported per entry and does not stop the rest. Same hosts and reasons as createLocation.
   * @param {{ locations: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  createLocationsAdvanced(options, callback) {
    const entries = readBatchEntries(options, 'locations', callback);
    if (!entries) return;
    const read = entries.map((entry) => readParams(entry, LOCATION_RULES));
    const invalid = read.map((r, index) => (r.error ? `entry ${index}: ${r.error}` : null)).filter(Boolean);
    if (invalid.length) return fail(callback, `Invalid entries: ${invalid.join('; ')}`);
    loadLocationContext((err, context) => {
      if (err) return callback(err, undefined);
      const problems = read.map((r, index) => {
        const { error } = prepareLocation(null, r.values, context.categories);
        return error ? `entry ${index}: ${error}` : null;
      }).filter(Boolean);
      if (problems.length) return fail(callback, `Invalid entries: ${problems.join('; ')}`);
      const pinning = read.filter((r) => r.values.pinned).length;
      if (context.pinned.length + pinning > MAX_PINNED) return fail(callback, `Up to ${MAX_PINNED} locations can be pinned; ${context.pinned.length} already are`);
      runBatch(read, 'locations', (r, index, done) => createLocationFrom(r.values, context, (createErr, view) => done(createErr, view && view.id)), callback);
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Edits one location, named by its exact current title, changing only what is passed, the way the location form's Save does (LocationsController.updateLocation): the whole record is rebuilt through the Location model and saved, its deep link and search engine entry updated, then the widget refreshes and locationUpdated fires. Pinning follows the form's "Pin to Top" (at most three). Resolving the title is a search, which is why it is a function. Same hosts and reasons as createLocation; the widget offers the same edit to permitted app users. usage: basic; its advanced alternative is updateLocationAdvanced.
   * @param {object} options - title plus the new<Name> changes, as declared
   * @param {function(Error=, object=)} callback - (error, location)
   */
  updateLocation(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    const { changes, error } = readLocationChanges(options);
    if (error) return fail(callback, error);
    resolveLocationByTitle(options.title, (err, record) => {
      if (err) return callback(err, undefined);
      loadLocationContext((ctxErr, context) => {
        if (ctxErr) return callback(ctxErr, undefined);
        updateLocationWith(record, changes, context, callback);
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of updateLocation, taking the location's id. Checks the id exists first, then applies the same changes through updateLocationWith. Same hosts and reasons as updateLocation.
   * @param {object} options - locationId plus the new<Name> changes, as declared
   * @param {function(Error=, object=)} callback - (error, location)
   */
  updateLocationAdvanced(options, callback) {
    if (!requireStringParams(options, ['locationId'], callback)) return;
    const { changes, error } = readLocationChanges(options);
    if (error) return fail(callback, error);
    requireLocationById(options.locationId, (err, record) => {
      if (err) return callback(err, undefined);
      loadLocationContext((ctxErr, context) => {
        if (ctxErr) return callback(ctxErr, undefined);
        updateLocationWith(record, changes, context, callback);
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced. The batch form of updateLocationAdvanced: every entry's changes are checked and every id is checked to exist before anything is written (the same location twice is refused, and pinning may not go past three in all), then each goes through updateLocationWith. A failed write is reported per entry. Same hosts and reasons as updateLocation.
   * @param {{ locations: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  updateLocationsAdvanced(options, callback) {
    const entries = readBatchEntries(options, 'locations', callback);
    if (!entries) return;
    const read = entries.map((entry) => {
      if (typeof entry.locationId !== 'string' || !entry.locationId) return { error: 'Missing required parameter: locationId' };
      return readLocationChanges(entry);
    });
    const invalid = read.map((r, index) => (r.error ? `entry ${index}: ${r.error}` : null)).filter(Boolean);
    if (invalid.length) return fail(callback, `Invalid entries: ${invalid.join('; ')}`);
    const duplicates = duplicateEntries(entries, (entry) => entry.locationId);
    if (duplicates.length) return fail(callback, `The same location is listed more than once: ${duplicates.join('; ')}`);
    checkAllExist(entries, (entry, index, done) => requireLocationById(entry.locationId, done), (err, records) => {
      if (err) return callback(err, undefined);
      loadLocationContext((ctxErr, context) => {
        if (ctxErr) return callback(ctxErr, undefined);
        const problems = read.map((r, index) => {
          const { error } = prepareLocation(records[index].data, r.changes, context.categories);
          return error ? `entry ${index}: ${error}` : null;
        }).filter(Boolean);
        if (problems.length) return fail(callback, `Invalid entries: ${problems.join('; ')}`);
        const pinnedIds = new Set(context.pinned.map((p) => p.id));
        read.forEach((r, index) => {
          if (r.changes.pinned === true) pinnedIds.add(records[index].id);
          if (r.changes.pinned === false) pinnedIds.delete(records[index].id);
        });
        if (pinnedIds.size > MAX_PINNED) return fail(callback, `Up to ${MAX_PINNED} locations can be pinned`);
        runBatch(read, 'locations', (r, index, done) => {
          // Read again right before writing, so an earlier entry's pin renumbering is not overwritten.
          requireLocationById(records[index].id, (getErr, fresh) => {
            if (getErr) return done(getErr);
            updateLocationWith(fresh, r.changes, context, (updateErr, view) => done(updateErr, view && view.id));
          });
        }, callback);
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Permanently removes one location, named by its exact title, as the content tab's delete does (LocationsController.deleteLocation): the record, its deep link and its search engine entry, then the widget refreshes and locationDeleted fires. Resolving the title is a search, which is why it is a function. Same hosts and reasons as createLocation; the widget removes locations through abuse reports. usage: basic; its advanced alternative is deleteLocationAdvanced.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, title })
   */
  deleteLocation(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    resolveLocationByTitle(options.title, (err, record) => {
      if (err) return callback(err, undefined);
      deleteLocationRecord(record, callback);
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of deleteLocation, taking the location's id, checked to exist first. Same hosts and reasons as deleteLocation.
   * @param {{ locationId: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, title })
   */
  deleteLocationAdvanced(options, callback) {
    if (!requireStringParams(options, ['locationId'], callback)) return;
    requireLocationById(options.locationId, (err, record) => {
      if (err) return callback(err, undefined);
      deleteLocationRecord(record, callback);
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced. The batch form of deleteLocationAdvanced: every id is checked to exist (and none twice) before anything is removed, then each goes through deleteLocationRecord. A failed delete is reported per entry. Same hosts and reasons as deleteLocation.
   * @param {{ locations: Array<{ locationId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  deleteLocationsAdvanced(options, callback) {
    const entries = readBatchEntries(options, 'locations', callback);
    if (!entries) return;
    const invalid = entries.map((entry, index) => ((typeof entry.locationId !== 'string' || !entry.locationId) ? `entry ${index}: Missing required parameter: locationId` : null)).filter(Boolean);
    if (invalid.length) return fail(callback, `Invalid entries: ${invalid.join('; ')}`);
    const duplicates = duplicateEntries(entries, (entry) => entry.locationId);
    if (duplicates.length) return fail(callback, `The same location is listed more than once: ${duplicates.join('; ')}`);
    checkAllExist(entries, (entry, index, done) => requireLocationById(entry.locationId, done), (err, records) => {
      if (err) return callback(err, undefined);
      runBatch(records, 'locations', (record, index, done) => deleteLocationRecord(record, (deleteErr) => done(deleteErr, record.id)), callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Moves a pinned location, named by its exact title, to a new place among the pinned locations, renumbering all of them as the introduction screen's pinned list does when dragged (each saved through the location's own save path). No widget host: only the control panel reorders pins. Uses only buildfire.publicData, so it also runs on the server; nothing to watch, so Background. usage: basic; its advanced alternative is updatePinnedLocationOrderAdvanced.
   * @param {{ title: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, { locations })
   */
  updatePinnedLocationOrder(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    const { values, error } = readParams(options, [['position', {
      kind: 'number', required: true, minValue: 1, maxValue: MAX_PINNED
    }]]);
    if (error) return fail(callback, error);
    if (!Number.isInteger(values.position)) return fail(callback, 'position must be a whole number');
    resolveLocationByTitle(options.title, (err, record) => {
      if (err) return callback(err, undefined);
      movePinnedLocation(record, values.position, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updatePinnedLocationOrder, taking the location's id, checked to exist first. Same hosts and reasons.
   * @param {{ locationId: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, { locations })
   */
  updatePinnedLocationOrderAdvanced(options, callback) {
    if (!requireStringParams(options, ['locationId'], callback)) return;
    const { values, error } = readParams(options, [['position', {
      kind: 'number', required: true, minValue: 1, maxValue: MAX_PINNED
    }]]);
    if (error) return fail(callback, error);
    if (!Number.isInteger(values.position)) return fail(callback, 'position must be a whole number');
    requireLocationById(options.locationId, (err, record) => {
      if (err) return callback(err, undefined);
      movePinnedLocation(record, values.position, callback);
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Sets the value (and, where the field allows it, the label) of one location field on one location, both named by their exact text, checked as the location form checks it (required fields, phone, email and URL formats; URLs gain https://), then saved through the location's own save path. Multi-step (location, settings, categories), which is why it is a function. Uses buildfire.publicData and buildfire.datastore reads, the same in both frames and on the server; the widget's location forms fill the same fields. Background: a content edit. usage: basic; its advanced alternative is updateLocationFieldValueAdvanced.
   * @param {{ title: string, fieldLabel: string, newValue?: string|null, newCustomLabel?: string|null }} options
   * @param {function(Error=, object=)} callback - (error, location)
   */
  updateLocationFieldValue(options, callback) {
    if (!requireStringParams(options, ['title', 'fieldLabel'], callback)) return;
    const { changes, error } = readFieldValueChanges(options);
    if (error) return fail(callback, error);
    resolveLocationByTitle(options.title, (err, record) => {
      if (err) return callback(err, undefined);
      loadSettings((setErr, settings) => {
        if (setErr) return callback(setErr, undefined);
        findLocationFieldByLabel(settings, options.fieldLabel, (fieldErr, field) => {
          if (fieldErr) return callback(fieldErr, undefined);
          const { checked, error: checkError } = checkFieldValue(field, changes);
          if (checkError) return fail(callback, checkError);
          loadActiveCategories((catErr, categories) => {
            if (catErr) return callback(catErr, undefined);
            applyFieldValue(record, field, checked, categories, callback);
          });
        });
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of updateLocationFieldValue, taking the location's id and the field's id, both checked to exist first. Same hosts and reasons.
   * @param {{ locationId: string, fieldId: string, newValue?: string|null, newCustomLabel?: string|null }} options
   * @param {function(Error=, object=)} callback - (error, location)
   */
  updateLocationFieldValueAdvanced(options, callback) {
    if (!requireStringParams(options, ['locationId', 'fieldId'], callback)) return;
    const { changes, error } = readFieldValueChanges(options);
    if (error) return fail(callback, error);
    requireLocationById(options.locationId, (err, record) => {
      if (err) return callback(err, undefined);
      loadSettings((setErr, settings) => {
        if (setErr) return callback(setErr, undefined);
        findLocationFieldById(settings, options.fieldId, (fieldErr, field) => {
          if (fieldErr) return callback(fieldErr, undefined);
          const { checked, error: checkError } = checkFieldValue(field, changes);
          if (checkError) return fail(callback, checkError);
          loadActiveCategories((catErr, categories) => {
            if (catErr) return callback(catErr, undefined);
            applyFieldValue(record, field, checked, categories, callback);
          });
        });
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced. The batch form of updateLocationFieldValueAdvanced: every entry is checked (its location and field exist, its value fits the field, the same field of the same location not twice) before anything is written, then each is applied in turn, reading its location again so entries on the same location build on each other. Same hosts and reasons.
   * @param {{ values: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { values, succeeded, failed })
   */
  updateLocationsFieldValueAdvanced(options, callback) {
    const entries = readBatchEntries(options, 'values', callback);
    if (!entries) return;
    const read = entries.map((entry) => {
      const missing = ['locationId', 'fieldId'].find((name) => typeof entry[name] !== 'string' || !entry[name]);
      if (missing) return { error: `Missing required parameter: ${missing}` };
      return readFieldValueChanges(entry);
    });
    const invalid = read.map((r, index) => (r.error ? `entry ${index}: ${r.error}` : null)).filter(Boolean);
    if (invalid.length) return fail(callback, `Invalid entries: ${invalid.join('; ')}`);
    const duplicates = duplicateEntries(entries, (entry) => `${entry.locationId}/${entry.fieldId}`);
    if (duplicates.length) return fail(callback, `The same field of the same location is listed more than once: ${duplicates.join('; ')}`);
    loadSettings((setErr, settings) => {
      if (setErr) return callback(setErr, undefined);
      checkAllExist(entries, (entry, index, done) => requireLocationById(entry.locationId, (err) => {
        if (err) return done(err);
        findLocationFieldById(settings, entry.fieldId, done);
      }), (err, fields) => {
        if (err) return callback(err, undefined);
        const checks = read.map((r, index) => checkFieldValue(fields[index], r.changes));
        const problems = checks.map((c, index) => (c.error ? `entry ${index}: ${c.error}` : null)).filter(Boolean);
        if (problems.length) return fail(callback, `Invalid entries: ${problems.join('; ')}`);
        loadActiveCategories((catErr, categories) => {
          if (catErr) return callback(catErr, undefined);
          runBatch(entries, 'values', (entry, index, done) => requireLocationById(entry.locationId, (getErr, record) => {
            if (getErr) return done(getErr);
            applyFieldValue(record, fields[index], checks[index].checked, categories, (applyErr) => done(applyErr, record.id));
          }), callback);
        });
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Adds a category as the categories tab's form does (CategoriesController.createCategory): the Category model's record, its subcategories (named as the categories CSV import reads them), its analytics events, then the widget refresh. No widget host: only the control panel manages categories. Uses only buildfire.publicData (plus analytics where present), so it also runs on the server; nothing to watch, so Background.
   * @param {{ title: string, icon?: string[], iconName?: string, subcategories?: string }} options
   * @param {function(Error=, object=)} callback - (error, category)
   */
  createCategory(options, callback) {
    requireCallback(callback);
    if (!isObject(options)) return fail(callback, 'options must be an object');
    const { data, error } = prepareCategory(options);
    if (error) return fail(callback, error);
    insertCategory(data, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of createCategory, as the categories CSV import adds many: every entry is checked first, then each is added through insertCategory, so each gets its analytics events. Same hosts and reasons as createCategory.
   * @param {{ categories: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  createCategoriesAdvanced(options, callback) {
    const entries = readBatchEntries(options, 'categories', callback);
    if (!entries) return;
    const prepared = entries.map(prepareCategory);
    const invalid = prepared.map((p, index) => (p.error ? `entry ${index}: ${p.error}` : null)).filter(Boolean);
    if (invalid.length) return fail(callback, `Invalid entries: ${invalid.join('; ')}`);
    runBatch(prepared, 'categories', (p, index, done) => insertCategory(p.data, (err, category) => done(err, category && category.id)), callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. Edits one category, named by its exact title, changing only what is passed (title, picture or font icon), as the category form's Save does. Resolving the title is a search, which is why it is a function. Same hosts and reasons as createCategory. usage: basic; its advanced alternative is updateCategoryAdvanced.
   * @param {{ title: string, newTitle?: string, newIcon?: string[]|null, newIconName?: string|null }} options
   * @param {function(Error=, object=)} callback - (error, category)
   */
  updateCategory(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    const { changes, error } = readCategoryChanges(options);
    if (error) return fail(callback, error);
    resolveCategoryByTitle(options.title, (err, record) => {
      if (err) return callback(err, undefined);
      updateCategoryWith(record, changes, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateCategory, taking the category's id, checked to exist (and not deleted) first. Same hosts and reasons.
   * @param {{ categoryId: string, newTitle?: string, newIcon?: string[]|null, newIconName?: string|null }} options
   * @param {function(Error=, object=)} callback - (error, category)
   */
  updateCategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId'], callback)) return;
    const { changes, error } = readCategoryChanges(options);
    if (error) return fail(callback, error);
    requireCategoryById(options.categoryId, (err, record) => {
      if (err) return callback(err, undefined);
      updateCategoryWith(record, changes, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of updateCategoryAdvanced: every entry's changes and id are checked (none twice) before anything is written, then each goes through updateCategoryWith. Same hosts and reasons.
   * @param {{ categories: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  updateCategoriesAdvanced(options, callback) {
    const entries = readBatchEntries(options, 'categories', callback);
    if (!entries) return;
    const read = entries.map((entry) => ((typeof entry.categoryId !== 'string' || !entry.categoryId) ? { error: 'Missing required parameter: categoryId' } : readCategoryChanges(entry)));
    const invalid = read.map((r, index) => (r.error ? `entry ${index}: ${r.error}` : null)).filter(Boolean);
    if (invalid.length) return fail(callback, `Invalid entries: ${invalid.join('; ')}`);
    const duplicates = duplicateEntries(entries, (entry) => entry.categoryId);
    if (duplicates.length) return fail(callback, `The same category is listed more than once: ${duplicates.join('; ')}`);
    checkAllExist(entries, (entry, index, done) => requireCategoryById(entry.categoryId, done), (err, records) => {
      if (err) return callback(err, undefined);
      runBatch(read, 'categories', (r, index, done) => updateCategoryWith(records[index], r.changes, (updateErr, category) => done(updateErr, category && category.id)), callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Removes one category, named by its exact title, as the categories tab's delete does (CategoriesController.deleteCategory): it is marked deleted and kept in storage, so it no longer shows; locations keep their link to it, as in the plugin. Same hosts and reasons as createCategory. usage: basic; its advanced alternative is deleteCategoryAdvanced.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, title })
   */
  deleteCategory(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    resolveCategoryByTitle(options.title, (err, record) => {
      if (err) return callback(err, undefined);
      softDeleteCategory(record, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of deleteCategory, taking the category's id, checked to exist (and not already deleted) first. Same hosts and reasons.
   * @param {{ categoryId: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, title })
   */
  deleteCategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId'], callback)) return;
    requireCategoryById(options.categoryId, (err, record) => {
      if (err) return callback(err, undefined);
      softDeleteCategory(record, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of deleteCategoryAdvanced: every id is checked (none twice) before anything is removed, then each goes through softDeleteCategory. Same hosts and reasons.
   * @param {{ categories: Array<{ categoryId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  deleteCategoriesAdvanced(options, callback) {
    const entries = readBatchEntries(options, 'categories', callback);
    if (!entries) return;
    const invalid = entries.map((entry, index) => ((typeof entry.categoryId !== 'string' || !entry.categoryId) ? `entry ${index}: Missing required parameter: categoryId` : null)).filter(Boolean);
    if (invalid.length) return fail(callback, `Invalid entries: ${invalid.join('; ')}`);
    const duplicates = duplicateEntries(entries, (entry) => entry.categoryId);
    if (duplicates.length) return fail(callback, `The same category is listed more than once: ${duplicates.join('; ')}`);
    checkAllExist(entries, (entry, index, done) => requireCategoryById(entry.categoryId, done), (err, records) => {
      if (err) return callback(err, undefined);
      runBatch(records, 'categories', (record, index, done) => softDeleteCategory(record, (deleteErr) => done(deleteErr, record.id)), callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Adds a subcategory to a category named by its exact title, as the category form's "Add Subcategory" and Save do: a read-modify-write of the category record. Same hosts and reasons as createCategory. usage: basic; its advanced alternative is createSubcategoryAdvanced.
   * @param {{ category: string, title: string, icon?: string[], iconName?: string }} options
   * @param {function(Error=, object=)} callback - (error, subcategory)
   */
  createSubcategory(options, callback) {
    if (!requireStringParams(options, ['category'], callback)) return;
    const { sub, error } = prepareSubcategory(options);
    if (error) return fail(callback, error);
    resolveCategoryByTitle(options.category, (err, record) => {
      if (err) return callback(err, undefined);
      addSubcategoryTo(record, sub, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of createSubcategory, taking the category's id, checked to exist first. Same hosts and reasons.
   * @param {{ categoryId: string, title: string, icon?: string[], iconName?: string }} options
   * @param {function(Error=, object=)} callback - (error, subcategory)
   */
  createSubcategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId'], callback)) return;
    const { sub, error } = prepareSubcategory(options);
    if (error) return fail(callback, error);
    requireCategoryById(options.categoryId, (err, record) => {
      if (err) return callback(err, undefined);
      addSubcategoryTo(record, sub, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of createSubcategoryAdvanced, as the category form's subcategory CSV import adds many: every entry and category id is checked first, then each is added in turn, reading its category again so entries for the same category build on each other. Same hosts and reasons.
   * @param {{ subcategories: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { subcategories, succeeded, failed })
   */
  createSubcategoriesAdvanced(options, callback) {
    const entries = readBatchEntries(options, 'subcategories', callback);
    if (!entries) return;
    const prepared = entries.map((entry) => ((typeof entry.categoryId !== 'string' || !entry.categoryId) ? { error: 'Missing required parameter: categoryId' } : prepareSubcategory(entry)));
    const invalid = prepared.map((p, index) => (p.error ? `entry ${index}: ${p.error}` : null)).filter(Boolean);
    if (invalid.length) return fail(callback, `Invalid entries: ${invalid.join('; ')}`);
    checkAllExist(entries, (entry, index, done) => requireCategoryById(entry.categoryId, done), (err) => {
      if (err) return callback(err, undefined);
      runBatch(entries, 'subcategories', (entry, index, done) => requireCategoryById(entry.categoryId, (getErr, record) => {
        if (getErr) return done(getErr);
        addSubcategoryTo(record, prepared[index].sub, (addErr, sub) => done(addErr, sub && sub.id));
      }), callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Edits one subcategory, named by its category's exact title and its own, changing only what is passed, as the category form's subcategory edit and Save do. Same hosts and reasons as createCategory. usage: basic; its advanced alternative is updateSubcategoryAdvanced.
   * @param {{ category: string, title: string, newTitle?: string, newIcon?: string[]|null, newIconName?: string|null }} options
   * @param {function(Error=, object=)} callback - (error, subcategory)
   */
  updateSubcategory(options, callback) {
    if (!requireStringParams(options, ['category', 'title'], callback)) return;
    const { changes, error } = readSubcategoryChanges(options);
    if (error) return fail(callback, error);
    resolveCategoryByTitle(options.category, (err, record) => {
      if (err) return callback(err, undefined);
      findSubcategory(record, options.title, (subErr, sub) => {
        if (subErr) return callback(subErr, undefined);
        updateSubcategoryIn(record, sub.id, changes, callback);
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateSubcategory, taking the category's and the subcategory's ids, both checked to exist first. Same hosts and reasons.
   * @param {{ categoryId: string, subcategoryId: string, newTitle?: string, newIcon?: string[]|null, newIconName?: string|null }} options
   * @param {function(Error=, object=)} callback - (error, subcategory)
   */
  updateSubcategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId', 'subcategoryId'], callback)) return;
    const { changes, error } = readSubcategoryChanges(options);
    if (error) return fail(callback, error);
    requireCategoryById(options.categoryId, (err, record) => {
      if (err) return callback(err, undefined);
      requireSubcategoryById(record, options.subcategoryId, (subErr, sub) => {
        if (subErr) return callback(subErr, undefined);
        updateSubcategoryIn(record, sub.id, changes, callback);
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of updateSubcategoryAdvanced: every entry, category id and subcategory id is checked (none twice) before anything is written, then each is applied in turn, reading its category again. Same hosts and reasons.
   * @param {{ subcategories: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { subcategories, succeeded, failed })
   */
  updateSubcategoriesAdvanced(options, callback) {
    const entries = readBatchEntries(options, 'subcategories', callback);
    if (!entries) return;
    const read = entries.map((entry) => {
      const missing = ['categoryId', 'subcategoryId'].find((name) => typeof entry[name] !== 'string' || !entry[name]);
      return missing ? { error: `Missing required parameter: ${missing}` } : readSubcategoryChanges(entry);
    });
    const invalid = read.map((r, index) => (r.error ? `entry ${index}: ${r.error}` : null)).filter(Boolean);
    if (invalid.length) return fail(callback, `Invalid entries: ${invalid.join('; ')}`);
    const duplicates = duplicateEntries(entries, (entry) => entry.subcategoryId);
    if (duplicates.length) return fail(callback, `The same subcategory is listed more than once: ${duplicates.join('; ')}`);
    checkAllExist(entries, (entry, index, done) => requireCategoryById(entry.categoryId, (err, record) => {
      if (err) return done(err);
      requireSubcategoryById(record, entry.subcategoryId, done);
    }), (err) => {
      if (err) return callback(err, undefined);
      runBatch(entries, 'subcategories', (entry, index, done) => requireCategoryById(entry.categoryId, (getErr, record) => {
        if (getErr) return done(getErr);
        updateSubcategoryIn(record, entry.subcategoryId, read[index].changes, (updateErr) => done(updateErr, entry.subcategoryId));
      }), callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Permanently removes one subcategory, named by its category's exact title and its own, as the category form's subcategory delete and Save do. Locations keep their link to it, as in the plugin. Same hosts and reasons as createCategory. usage: basic; its advanced alternative is deleteSubcategoryAdvanced.
   * @param {{ category: string, title: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, title, categoryId, categoryTitle })
   */
  deleteSubcategory(options, callback) {
    if (!requireStringParams(options, ['category', 'title'], callback)) return;
    resolveCategoryByTitle(options.category, (err, record) => {
      if (err) return callback(err, undefined);
      findSubcategory(record, options.title, (subErr, sub) => {
        if (subErr) return callback(subErr, undefined);
        removeSubcategoryFrom(record, sub.id, callback);
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of deleteSubcategory, taking the category's and the subcategory's ids, both checked to exist first. Same hosts and reasons.
   * @param {{ categoryId: string, subcategoryId: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, title, categoryId, categoryTitle })
   */
  deleteSubcategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId', 'subcategoryId'], callback)) return;
    requireCategoryById(options.categoryId, (err, record) => {
      if (err) return callback(err, undefined);
      requireSubcategoryById(record, options.subcategoryId, (subErr, sub) => {
        if (subErr) return callback(subErr, undefined);
        removeSubcategoryFrom(record, sub.id, callback);
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of deleteSubcategoryAdvanced: every id pair is checked (none twice) before anything is removed, then each is removed in turn, reading its category again. Same hosts and reasons.
   * @param {{ subcategories: Array<{ categoryId: string, subcategoryId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { subcategories, succeeded, failed })
   */
  deleteSubcategoriesAdvanced(options, callback) {
    const entries = readBatchEntries(options, 'subcategories', callback);
    if (!entries) return;
    const invalid = entries.map((entry, index) => {
      const missing = ['categoryId', 'subcategoryId'].find((name) => typeof entry[name] !== 'string' || !entry[name]);
      return missing ? `entry ${index}: Missing required parameter: ${missing}` : null;
    }).filter(Boolean);
    if (invalid.length) return fail(callback, `Invalid entries: ${invalid.join('; ')}`);
    const duplicates = duplicateEntries(entries, (entry) => entry.subcategoryId);
    if (duplicates.length) return fail(callback, `The same subcategory is listed more than once: ${duplicates.join('; ')}`);
    checkAllExist(entries, (entry, index, done) => requireCategoryById(entry.categoryId, (err, record) => {
      if (err) return done(err);
      requireSubcategoryById(record, entry.subcategoryId, done);
    }), (err) => {
      if (err) return callback(err, undefined);
      runBatch(entries, 'subcategories', (entry, index, done) => requireCategoryById(entry.categoryId, (getErr, record) => {
        if (getErr) return done(getErr);
        removeSubcategoryFrom(record, entry.subcategoryId, (removeErr) => done(removeErr, entry.subcategoryId));
      }), callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Moves a subcategory, named by its category's exact title and its own, to a new place in its category's list, as dragging it in the category form and saving does. Same hosts and reasons as createCategory. usage: basic; its advanced alternative is updateSubcategoryOrderAdvanced.
   * @param {{ category: string, title: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, category)
   */
  updateSubcategoryOrder(options, callback) {
    if (!requireStringParams(options, ['category', 'title'], callback)) return;
    const { values, error } = readParams(options, [['position', { kind: 'number', required: true, minValue: 1 }]]);
    if (error) return fail(callback, error);
    if (!Number.isInteger(values.position)) return fail(callback, 'position must be a whole number');
    resolveCategoryByTitle(options.category, (err, record) => {
      if (err) return callback(err, undefined);
      findSubcategory(record, options.title, (subErr, sub) => {
        if (subErr) return callback(subErr, undefined);
        moveSubcategoryIn(record, sub.id, values.position, callback);
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateSubcategoryOrder, taking the category's and the subcategory's ids, both checked to exist first. Same hosts and reasons.
   * @param {{ categoryId: string, subcategoryId: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, category)
   */
  updateSubcategoryOrderAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId', 'subcategoryId'], callback)) return;
    const { values, error } = readParams(options, [['position', { kind: 'number', required: true, minValue: 1 }]]);
    if (error) return fail(callback, error);
    if (!Number.isInteger(values.position)) return fail(callback, 'position must be a whole number');
    requireCategoryById(options.categoryId, (err, record) => {
      if (err) return callback(err, undefined);
      requireSubcategoryById(record, options.subcategoryId, (subErr, sub) => {
        if (subErr) return callback(subErr, undefined);
        moveSubcategoryIn(record, sub.id, values.position, callback);
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. The plugin's settings as the control panel loads them (Settings.get): saved values migrated as the plugin migrates them, or a new instance's defaults when nothing is saved yet (nothing is saved by this read). Returned under the names updateSettings takes, with the location fields. Who may add, edit or pay for locations (access and payment settings) is left out. A function because defaults and migration are applied in code. Uses only a buildfire.datastore read, which both frames and the server allow; nothing to watch, so Background.
   * @param {object} [options] - none
   * @param {function(Error=, object=)} callback - (error, settings)
   */
  getSettings(options, callback) {
    requireCallback(callback);
    loadSettings((err, settings) => {
      if (err) return callback(err, undefined);
      callback(null, settingsView(settings));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Changes the settings the content, settings and design tabs edit, only those passed, then saves the whole document as each tab does (Settings.save) and sends each tab's refresh message (settings, design, intro, locationSettings). Mirrors the tabs' rules: turning off "Nearest to User Location" makes the default sorting alphabetical (and distance cannot then be the default); turning off open hours or price range turns them off for everyone adding locations; introduction screen pictures get ids. No widget host: app users must not change the owner's configuration, and the app may not write the datastore. Background: it changes configuration and contacts no one. Access settings (who may add, edit or pay for locations, introduction screen visibility, editors) are deliberately not exposed.
   * @param {object} options - one optional param per setting, as declared
   * @param {function(Error=, object=)} callback - (error, settings)
   */
  updateSettings(options, callback) {
    requireCallback(callback);
    if (!isObject(options)) return fail(callback, 'options must be an object');
    const { values, error } = readParams(options, SETTINGS_FIELDS.map(([name, rule]) => [name, { ...rule, update: true }]));
    if (error) return fail(callback, error);
    if (!Object.keys(values).length) return fail(callback, 'Pass at least one setting to change');
    loadSettings((err, settings) => {
      if (err) return callback(err, undefined);
      const scopes = [];
      SETTINGS_FIELDS.forEach(([name, , path, scope]) => {
        if (!(name in values)) return;
        let value = values[name];
        if (name === 'introImages') value = (value || []).map((item) => ({ ...item, id: item.id || generateUUID() }));
        setPath(settings, path, value);
        if (!scopes.includes(scope)) scopes.push(scope);
      });
      if (values.allowSortByNearest === false && values.defaultSorting === undefined) settings.sorting.defaultSorting = 'alphabetical';
      if (settings.sorting.allowSortByNearest === false && settings.sorting.defaultSorting === 'distance') {
        return fail(callback, 'defaultSorting cannot be distance while allowSortByNearest is off');
      }
      ['openHours', 'priceRange'].forEach((key) => {
        const entry = settings.globalEntries[key];
        if (entry && entry.enabled === false && values[key === 'openHours' ? 'allowOpeningHours' : 'allowPriceRange'] === false) {
          entry.inAppEnabled = 'none';
          entry.tags = [];
        }
      });
      saveSettingsDocument(settings, scopes, (saveErr, saved) => {
        if (saveErr) return callback(saveErr, undefined);
        callback(null, settingsView(saved));
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Adds a location field as the settings tab's Location Fields page does: in its section (quick actions take email, phone or URL; text content also text and rich text), visible to everyone, up to ten fields in all; the settings document is saved whole and the widget told to refresh its fields. No widget host: the app may not write the datastore and app users must not change the owner's configuration. Background. Uses only buildfire.datastore, so it also runs on the server.
   * @param {{ label: string, section: string, type: string, required?: boolean, allowCustomLabel?: boolean }} options
   * @param {function(Error=, object=)} callback - (error, field)
   */
  createLocationField(options, callback) {
    requireCallback(callback);
    if (!isObject(options)) return fail(callback, 'options must be an object');
    const { field, section, error } = prepareLocationField(options);
    if (error) return fail(callback, error);
    loadSettings((err, settings) => {
      if (err) return callback(err, undefined);
      if (allLocationFields(settings).length >= MAX_LOCATION_FIELDS) return fail(callback, `Up to ${MAX_LOCATION_FIELDS} location fields can be added`);
      settings.customFields[section].push(field);
      saveSettingsDocument(settings, ['customFields'], (saveErr, saved) => {
        if (saveErr) return callback(saveErr, undefined);
        callback(null, fieldOfSettings(saved, field.id));
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of createLocationField: every entry is checked first (and the ten-field limit for them all), then each is added in turn through the same save. Same hosts and reasons.
   * @param {{ fields: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { fields, succeeded, failed })
   */
  createLocationFieldsAdvanced(options, callback) {
    const entries = readBatchEntries(options, 'fields', callback);
    if (!entries) return;
    const prepared = entries.map(prepareLocationField);
    const invalid = prepared.map((p, index) => (p.error ? `entry ${index}: ${p.error}` : null)).filter(Boolean);
    if (invalid.length) return fail(callback, `Invalid entries: ${invalid.join('; ')}`);
    loadSettings((err, settings) => {
      if (err) return callback(err, undefined);
      const count = allLocationFields(settings).length;
      if (count + prepared.length > MAX_LOCATION_FIELDS) return fail(callback, `Up to ${MAX_LOCATION_FIELDS} location fields can be added; ${count} already exist`);
      runBatch(prepared, 'fields', (p, index, done) => loadSettings((loadErr, current) => {
        if (loadErr) return done(loadErr);
        current.customFields[p.section].push(p.field);
        saveSettingsDocument(current, ['customFields'], (saveErr) => done(saveErr, p.field.id));
      }), callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Edits one location field, named by its exact label, changing only what is passed, as the Location Fields page does; the settings document is saved whole and the widget refreshed. Same hosts and reasons as createLocationField. usage: basic; its advanced alternative is updateLocationFieldAdvanced.
   * @param {{ label: string, newLabel?: string, newType?: string, newRequired?: boolean, newAllowCustomLabel?: boolean }} options
   * @param {function(Error=, object=)} callback - (error, field)
   */
  updateLocationField(options, callback) {
    if (!requireStringParams(options, ['label'], callback)) return;
    const { changes, error } = readLocationFieldChanges(options);
    if (error) return fail(callback, error);
    loadSettings((err, settings) => {
      if (err) return callback(err, undefined);
      findLocationFieldByLabel(settings, options.label, (fieldErr, field) => {
        if (fieldErr) return callback(fieldErr, undefined);
        const problem = applyLocationFieldChanges(settings, field, changes);
        if (problem) return fail(callback, problem);
        saveSettingsDocument(settings, ['customFields'], (saveErr, saved) => {
          if (saveErr) return callback(saveErr, undefined);
          callback(null, fieldOfSettings(saved, field.id));
        });
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateLocationField, taking the field's id, checked to exist first. Same hosts and reasons.
   * @param {{ fieldId: string, newLabel?: string, newType?: string, newRequired?: boolean, newAllowCustomLabel?: boolean }} options
   * @param {function(Error=, object=)} callback - (error, field)
   */
  updateLocationFieldAdvanced(options, callback) {
    if (!requireStringParams(options, ['fieldId'], callback)) return;
    const { changes, error } = readLocationFieldChanges(options);
    if (error) return fail(callback, error);
    loadSettings((err, settings) => {
      if (err) return callback(err, undefined);
      findLocationFieldById(settings, options.fieldId, (fieldErr, field) => {
        if (fieldErr) return callback(fieldErr, undefined);
        const problem = applyLocationFieldChanges(settings, field, changes);
        if (problem) return fail(callback, problem);
        saveSettingsDocument(settings, ['customFields'], (saveErr, saved) => {
          if (saveErr) return callback(saveErr, undefined);
          callback(null, fieldOfSettings(saved, field.id));
        });
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of updateLocationFieldAdvanced: every entry's changes and field id are checked (none twice, each type fitting its section) before anything is written, then all are applied and the settings saved once per entry, in turn. Same hosts and reasons.
   * @param {{ fields: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { fields, succeeded, failed })
   */
  updateLocationFieldsAdvanced(options, callback) {
    const entries = readBatchEntries(options, 'fields', callback);
    if (!entries) return;
    const read = entries.map((entry) => ((typeof entry.fieldId !== 'string' || !entry.fieldId) ? { error: 'Missing required parameter: fieldId' } : readLocationFieldChanges(entry)));
    const invalid = read.map((r, index) => (r.error ? `entry ${index}: ${r.error}` : null)).filter(Boolean);
    if (invalid.length) return fail(callback, `Invalid entries: ${invalid.join('; ')}`);
    const duplicates = duplicateEntries(entries, (entry) => entry.fieldId);
    if (duplicates.length) return fail(callback, `The same field is listed more than once: ${duplicates.join('; ')}`);
    loadSettings((err, settings) => {
      if (err) return callback(err, undefined);
      checkAllExist(entries, (entry, index, done) => findLocationFieldById(settings, entry.fieldId, done), (existErr, fields) => {
        if (existErr) return callback(existErr, undefined);
        const trial = JSON.parse(JSON.stringify(settings));
        const problems = read.map((r, index) => {
          const problem = applyLocationFieldChanges(trial, fields[index], r.changes);
          return problem ? `entry ${index}: ${problem}` : null;
        }).filter(Boolean);
        if (problems.length) return fail(callback, `Invalid entries: ${problems.join('; ')}`);
        runBatch(entries, 'fields', (entry, index, done) => loadSettings((loadErr, current) => {
          if (loadErr) return done(loadErr);
          const field = allLocationFields(current).find((f) => f.id === entry.fieldId);
          if (!field) return done(new Error(`No location field with id "${entry.fieldId}"`));
          applyLocationFieldChanges(current, field, read[index].changes);
          saveSettingsDocument(current, ['customFields'], (saveErr) => done(saveErr, entry.fieldId));
        }), callback);
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Permanently removes one location field, named by its exact label, as the Location Fields page's delete does; values locations hold for it stay in their records, as in the plugin, but no longer show. Same hosts and reasons as createLocationField. usage: basic; its advanced alternative is deleteLocationFieldAdvanced.
   * @param {{ label: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, label })
   */
  deleteLocationField(options, callback) {
    if (!requireStringParams(options, ['label'], callback)) return;
    loadSettings((err, settings) => {
      if (err) return callback(err, undefined);
      findLocationFieldByLabel(settings, options.label, (fieldErr, field) => {
        if (fieldErr) return callback(fieldErr, undefined);
        settings.customFields[field.section] = settings.customFields[field.section].filter((f) => f.id !== field.id);
        saveSettingsDocument(settings, ['customFields'], (saveErr) => {
          if (saveErr) return callback(saveErr, undefined);
          callback(null, { id: field.id, label: field.label });
        });
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of deleteLocationField, taking the field's id, checked to exist first. Same hosts and reasons.
   * @param {{ fieldId: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, label })
   */
  deleteLocationFieldAdvanced(options, callback) {
    if (!requireStringParams(options, ['fieldId'], callback)) return;
    loadSettings((err, settings) => {
      if (err) return callback(err, undefined);
      findLocationFieldById(settings, options.fieldId, (fieldErr, field) => {
        if (fieldErr) return callback(fieldErr, undefined);
        settings.customFields[field.section] = settings.customFields[field.section].filter((f) => f.id !== field.id);
        saveSettingsDocument(settings, ['customFields'], (saveErr) => {
          if (saveErr) return callback(saveErr, undefined);
          callback(null, { id: field.id, label: field.label });
        });
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of deleteLocationFieldAdvanced: every field id is checked (none twice) before anything is removed, then each is removed in turn. Same hosts and reasons.
   * @param {{ fields: Array<{ fieldId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { fields, succeeded, failed })
   */
  deleteLocationFieldsAdvanced(options, callback) {
    const entries = readBatchEntries(options, 'fields', callback);
    if (!entries) return;
    const invalid = entries.map((entry, index) => ((typeof entry.fieldId !== 'string' || !entry.fieldId) ? `entry ${index}: Missing required parameter: fieldId` : null)).filter(Boolean);
    if (invalid.length) return fail(callback, `Invalid entries: ${invalid.join('; ')}`);
    const duplicates = duplicateEntries(entries, (entry) => entry.fieldId);
    if (duplicates.length) return fail(callback, `The same field is listed more than once: ${duplicates.join('; ')}`);
    loadSettings((err, settings) => {
      if (err) return callback(err, undefined);
      checkAllExist(entries, (entry, index, done) => findLocationFieldById(settings, entry.fieldId, done), (existErr) => {
        if (existErr) return callback(existErr, undefined);
        runBatch(entries, 'fields', (entry, index, done) => loadSettings((loadErr, current) => {
          if (loadErr) return done(loadErr);
          const field = allLocationFields(current).find((f) => f.id === entry.fieldId);
          if (!field) return done(new Error(`No location field with id "${entry.fieldId}"`));
          current.customFields[field.section] = current.customFields[field.section].filter((f) => f.id !== field.id);
          saveSettingsDocument(current, ['customFields'], (saveErr) => done(saveErr, entry.fieldId));
        }), callback);
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Moves a location field, named by its exact label, to a new place within its section, as dragging it on the Location Fields page does. Same hosts and reasons as createLocationField. usage: basic; its advanced alternative is updateLocationFieldOrderAdvanced.
   * @param {{ label: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, { fields })
   */
  updateLocationFieldOrder(options, callback) {
    if (!requireStringParams(options, ['label'], callback)) return;
    moveLocationField(options, (settings, done) => findLocationFieldByLabel(settings, options.label, done), callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateLocationFieldOrder, taking the field's id, checked to exist first. Same hosts and reasons.
   * @param {{ fieldId: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, { fields })
   */
  updateLocationFieldOrderAdvanced(options, callback) {
    if (!requireStringParams(options, ['fieldId'], callback)) return;
    moveLocationField(options, (settings, done) => findLocationFieldById(settings, options.fieldId, done), callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Every text of the Language tab, with what the app shows for it now: the saved text, or its default. Uses only a buildfire.datastore read, which both frames and the server allow; nothing to watch, so Background. A function because the defaults live in the plugin's code (src/shared/stringsConfig.js).
   * @param {object} [options] - none
   * @param {function(Error=, object=)} callback - (error, { texts })
   */
  getLanguageTexts(options, callback) {
    requireCallback(callback);
    loadLanguageRecord((err, record) => {
      if (err) return callback(err, undefined);
      callback(null, languageTextsView(languageDocument(record)));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Changes one text of the Language tab, checked as its form checks it (required texts cannot be empty; each has a length limit), then saved the way the tab saves (the Strings service's insert on first save, then save), and the widget told to refresh its texts. No widget host: the app may not write the datastore and app users must not change the owner's texts. Background.
   * @param {{ key: string, text: string }} options
   * @param {function(Error=, object=)} callback - (error, text)
   */
  updateLanguageText(options, callback) {
    if (!requireStringParams(options, ['key'], callback)) return;
    const definition = LANGUAGE_TEXTS[options.key];
    if (!definition) return fail(callback, `key must be one of the Language tab's texts, such as general.search; got "${options.key}"`);
    const { text } = options;
    if (text === undefined || text === null) return fail(callback, 'Missing required parameter: text');
    if (typeof text !== 'string') return fail(callback, 'text must be text');
    if (definition.required && !text.trim()) return fail(callback, `Missing required parameter: text ("${definition.title}" cannot be empty)`);
    if (definition.maxLength && text.length > definition.maxLength) return fail(callback, `text must be at most ${definition.maxLength} characters for "${definition.title}"`);
    loadLanguageRecord((err, record) => {
      if (err) return callback(err, undefined);
      const doc = languageDocument(record);
      const [section, label] = options.key.split('.');
      doc[section][label].value = text;
      const done = (saveErr) => {
        if (saveErr) return callback(saveErr, undefined);
        syncWidget('strings');
        const view = languageTextsView(doc).texts.find((t) => t.key === options.key);
        callback(null, view);
      };
      if (record) buildfire.datastore.save(doc, LANGUAGE_TAG, done);
      else buildfire.datastore.insert(doc, LANGUAGE_TAG, done);
    });
  }
};

/**
 * What the control panel's frame (control/contract.html) dispatches to: init plus every function whose hosts include controlBackground, in plugin.contract.json order. Every function operation of this plugin runs in the control panel, so all are listed; the implementations are widgetContract's own.
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
  updatePinnedLocationOrder: widgetContract.updatePinnedLocationOrder,
  updatePinnedLocationOrderAdvanced: widgetContract.updatePinnedLocationOrderAdvanced,
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
  getSettings: widgetContract.getSettings,
  updateSettings: widgetContract.updateSettings,
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
  getLanguageTexts: widgetContract.getLanguageTexts,
  updateLanguageText: widgetContract.updateLanguageText
};
