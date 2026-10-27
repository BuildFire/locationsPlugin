/* eslint-disable no-undef */
/* eslint-disable max-len */
/**
 * Locations contract — runtime implementation.
 *
 * This file only implements the operations declared with "type": "function" in plugin.contract.json. Operations typed publicData / datastore / userData / appData / firebase are declarative: their platform call is built on the fly from context.query, so they intentionally have no counterpart here (listCategories is the one declarative operation of this plugin).
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
 * The plugin's own bookkeeping around a write (deep links, analytics event registration, the app-wide search index and the refresh message to the widget) is made the way the plugin makes it, fire-and-forget, and only when the frame provides that service: the contract frames load no `buildfire.services.searchEngine` (the plugin's pages load it from their own script tag) and the server has no messaging, so those steps are skipped there rather than failing the action they follow.
 */

const LOCATIONS_TAG = 'locations'; // must match the collection names in plugin.contract.json
const CATEGORIES_TAG = 'categories';
const SETTINGS_TAG = 'settings';
// Mirrors buildfire.services.Strings#collectionName in src/shared/strings.js for the plugin's one language, en-us.
const STRINGS_TAG = '$bfLanguageSettings_en-us';

// The platform returns at most 50 records a search call; further pages are told by recordCount/totalRecord.
const PAGE_LIMIT = 50;
const BATCH_LIMIT = 50;
// src/control/content/js/locations/index.js offers "Pin to Top" for at most 3 locations ("x of 3 Pinned").
const MAX_PINNED = 3;
// src/control/settings/js/pages/locationFields.js disables both add buttons at 10 fields in total.
const MAX_LOCATION_FIELDS = 10;
// The custom field value input in src/control/content/js/locations/customFields.js has maxlength 150.
const FIELD_VALUE_MAX_LENGTH = 150;
const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
// src/control/content/js/locations/index.js state.defaultCircleMarkerColor: a circle marker without a color gets this one.
const DEFAULT_CIRCLE_MARKER_COLOR = {
  backgroundCSS: 'background: rgba(253,35,5,1)',
  color: 'rgba(253,35,5,1)',
  colorCSS: 'color: rgba(253,35,5,1)',
  colorHex: '#fd2305',
  opacity: '100'
};
// src/widget/js/global/constants/index.js
const QUICK_ACTION_TYPES = ['EMAIL', 'PHONE', 'URL'];
const CONTENT_TYPES = ['EMAIL', 'PHONE', 'URL', 'TEXT', 'RICH_TEXT'];
const FIELD_GROUPS = ['quickActions', 'content'];

/* -------------------------------------------------------------------------- */
/* Generic checks                                                             */
/* -------------------------------------------------------------------------- */

const failWith = (callback, message) => callback(new Error(message), undefined);

/**
 * Assert the callback is callable and options is a plain object.
 * @returns {boolean} true when valid; false when the callback has already fired.
 */
const requireOptions = (options, callback) => {
  if (typeof callback !== 'function') {
    // Nothing to report through; fail loudly only in this one unrecoverable case.
    throw new TypeError('callback must be a function');
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    failWith(callback, 'options must be an object');
    return false;
  }
  return true;
};

/**
 * Assert that every named option is a non-empty string.
 * @returns {boolean} true when valid; false when the callback has already fired.
 */
const requireStringParams = (options, names, callback) => {
  if (!requireOptions(options, callback)) return false;
  const missing = names.find((name) => typeof options[name] !== 'string' || !options[name]);
  if (missing) {
    failWith(callback, `Missing required parameter: ${missing}`);
    return false;
  }
  return true;
};

/**
 * An image param, checked against its declared count. Image params are always arrays, even for a single image, so a bare string is refused rather than wrapped: it means the caller misread the contract.
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

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** A select param: one of the declared values, exactly. */
const checkEnum = (name, value, allowed) => (allowed.includes(value) ? null : `${name} must be one of: ${allowed.join(', ')}`);

/** A number param within its declared inclusive range. */
const checkNumber = (name, value, min, max) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return `${name} must be a number`;
  if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
    return `${name} must be between ${min} and ${max}`;
  }
  return null;
};

const checkBoolean = (name, value) => (typeof value === 'boolean' ? null : `${name} must be true or false`);

/** A required page index (0 or more) and page size (1 to 50), defaulting to the first full page. */
const readPaging = (options) => {
  const page = options.page === undefined ? 0 : options.page;
  const pageSize = options.pageSize === undefined ? PAGE_LIMIT : options.pageSize;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0) return { error: 'page must be a whole number, 0 or more' };
  if (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_LIMIT) {
    return { error: `pageSize must be a whole number between 1 and ${PAGE_LIMIT}` };
  }
  return { page, pageSize };
};

/** Mirrors generateUUID in src/widget/js/global/helpers.js, so ids look like the ones the plugin makes. */
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

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const clone = (value) => JSON.parse(JSON.stringify(value));

/* -------------------------------------------------------------------------- */
/* The plugin's bookkeeping, made only where the frame provides it            */
/* -------------------------------------------------------------------------- */

const ignore = () => {};

/** Mirrors refresh messages sent by the control panel tabs (cmd 'sync' with the tab's scope). */
const syncWidget = (message) => {
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') {
    buildfire.messaging.sendMessageToWidget({ cmd: 'sync', ...message });
  }
};

const sendEvent = (eventName, data) => {
  const { services } = buildfire;
  if (services && services.contract && services.contract.events && typeof services.contract.events.send === 'function') {
    services.contract.events.send(eventName, data);
  }
};

/** Mirrors Analytics.registerEvent in src/utils/analytics.js. */
const registerAnalyticsEvent = (title, key) => {
  if (buildfire.analytics && typeof buildfire.analytics.registerEvent === 'function') {
    buildfire.analytics.registerEvent({ title, key, description: '' }, { silentNotification: true });
  }
};

/** Mirrors DeepLink.registerDeeplink in src/utils/deeplink.js. */
const registerLocationDeeplink = (location) => {
  if (buildfire.deeplink && typeof buildfire.deeplink.registerDeeplink === 'function') {
    buildfire.deeplink.registerDeeplink({
      id: `location-${location.id}`,
      name: location.title,
      deeplinkData: { locationId: location.id },
      imageUrl: location.listImage
    }, ignore);
  }
};

/** Mirrors DeepLink.unregisterDeeplink in src/utils/deeplink.js. */
const unregisterLocationDeeplink = (locationId) => {
  if (buildfire.deeplink && typeof buildfire.deeplink.unregisterDeeplink === 'function') {
    buildfire.deeplink.unregisterDeeplink(`location-${locationId}`, ignore);
  }
};

/** Mirrors SearchEngine.add/update in src/widget/js/global/repository/searchEngine.js. */
const indexLocationForSearch = (location) => {
  const { services } = buildfire;
  if (!services || !services.searchEngine || typeof services.searchEngine.save !== 'function') return;
  services.searchEngine.save({
    tag: LOCATIONS_TAG,
    key: location.id,
    data: { locationId: location.id },
    title: location.title,
    description: location.description ? location.description.replace(/(<([^>]+)>)/gi, '') : '',
    imageUrl: location.listImage,
    keywords: [location.address, location.formattedAddress, location.addressAlias, location.subtitle].join(',')
  }, ignore);
};

/** Mirrors SearchEngine.delete in src/widget/js/global/repository/searchEngine.js. */
const unindexLocationForSearch = (locationId) => {
  const { services } = buildfire;
  if (!services || !services.searchEngine || typeof services.searchEngine.delete !== 'function') return;
  services.searchEngine.delete({ id: locationId, tag: LOCATIONS_TAG }, ignore);
};

/**
 * The signed-in user as the plugin records them in createdBy / lastUpdatedBy: mirrors authManager.sanitizedCurrentUser in src/UserAccessControl/authManager.js (contact details and tokens removed). Nobody signed in, or no answer, records null, as the plugin does.
 */
const getActor = (callback) => {
  if (!buildfire.auth || typeof buildfire.auth.getCurrentUser !== 'function') return callback(null);
  buildfire.auth.getCurrentUser((err, user) => {
    if (err || !user) return callback(null);
    const sanitized = { ...user };
    if (typeof sanitized._cpUser !== 'undefined') sanitized.isCPUser = true;
    ['email', 'username', 'accessToken', 'accessTokenExpiresIn', 'externalApps', 'lastUsedIPAddress', 'userToken',
      'loginProviderType', 'failedAttemptCount', '_cpUser'].forEach((prop) => { delete sanitized[prop]; });
    callback(sanitized);
  });
};

/** Who did it, as an event carries it: id and name only. */
const eventUser = (user) => (user ? { userId: user._id || user.userId || null, displayName: user.displayName || null } : null);

/* -------------------------------------------------------------------------- */
/* Models — mirror the plugin's data classes so records are stored the same   */
/* -------------------------------------------------------------------------- */

/** Mirrors the CustomField class in src/widget/js/global/data/Location.js. */
const toFieldValue = (data = {}) => ({
  id: data.id || null,
  customLabel: data.customLabel || null,
  value: data.value || null
});

/** Mirrors the Location constructor in src/widget/js/global/data/Location.js. */
const toLocation = (data = {}) => ({
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
    showCategory: true,
    showOpeningHours: false,
    showPriceRange: false,
    showStarRating: false,
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
    quickActions: ((data.additionalFields && data.additionalFields.quickActions) || []).map(toFieldValue),
    content: ((data.additionalFields && data.additionalFields.content) || []).map(toFieldValue)
  }
});

/** Mirrors Location#toJSON in src/widget/js/global/data/Location.js: the stored document, with its search index and geo point. */
const toLocationDocument = (location) => {
  const titleKey = location.title.toLowerCase();
  return {
    ...location,
    _buildfire: {
      index: {
        text: `${titleKey} ${location.subtitle ? location.subtitle : ''} ${location.address} ${location.formattedAddress} ${location.addressAlias ? location.addressAlias : ''}`,
        string1: titleKey,
        date1: location.createdOn,
        array1: [
          ...location.categories.main.map((id) => ({ string1: `c_${id}` })),
          ...location.categories.subcategories.map((id) => ({ string1: `s_${id}` })),
          { string1: `v_${location.views}` },
          { string1: `pr_${location.price.range}` },
          { string1: `cid_${location.clientId}` },
          { string1: `title_${titleKey}` }
        ],
        number1: location.pinIndex
      },
      geo: {
        type: 'Point',
        coordinates: [location.coordinates.lng, location.coordinates.lat],
      }
    }
  };
};

/** A location record as the operations return it: its fields, with the record's id, without the search index. */
const locationFromRecord = (record) => toLocation({ ...record.data, id: record.id });

/** Mirrors the Category class in src/widget/js/global/data/Category.js. */
const toCategory = (data = {}) => ({
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
});

const toCategoryDocument = (category) => ({
  ...category,
  _buildfire: {
    index: {
      string1: category.title.toLowerCase(),
      date1: category.deletedOn,
      number1: category.quickAccess
    }
  }
});

const categoryFromRecord = (record) => toCategory({ ...record.data, id: record.id });

/** Mirrors the CustomField class in src/widget/js/global/data/Settings.js. */
const toLocationField = (data = {}) => ({
  id: data.id || null,
  label: data.label || null,
  type: data.type || null,
  required: data.required || false,
  enableCustomLabel: data.enableCustomLabel || false,
  visibility: data.visibility || { value: 'ALL', tags: [] }
});

/** Mirrors the Settings constructor and toJSON in src/widget/js/global/data/Settings.js. */
const toSettings = (data = {}) => {
  const introductoryListView = data.introductoryListView || {
    images: [],
    description: null,
    sorting: 'distance',
    searchOptions: { mode: 'UserPosition', areaRadiusOptions: {} },
  };
  if (!(data.introductoryListView && data.introductoryListView.visibilityOptions)) {
    introductoryListView.visibilityOptions = {
      tags: [],
      value: (data.showIntroductoryListView === true || typeof data.showIntroductoryListView === 'undefined') ? 'ALL' : 'NONE'
    };
  } else {
    introductoryListView.visibilityOptions = {
      tags: data.introductoryListView.visibilityOptions.tags || [],
      value: data.introductoryListView.visibilityOptions.value || 'ALL'
    };
  }
  const globalEntries = data.globalEntries || {
    locations: { allowAdding: 'none', tags: [] },
    photos: { allowAdding: 'none', tags: [] },
    openHours: { enabled: true, inAppEnabled: 'all', tags: [] },
    priceRange: { enabled: true, inAppEnabled: 'all', tags: [] },
    charging: { enabled: 'none', tags: [], description: '', subscriptionOptions: [] },
  };
  if (!globalEntries.charging) {
    globalEntries.charging = { enabled: 'none', tags: [], description: '', subscriptionOptions: [] };
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
  };
};

const toSettingsDocument = (settings) => ({ ...settings, _buildfire: { index: {} } });

/** Mirrors Settings.migrateFieldSettings in src/widget/js/global/repository/Settings.js (applied on read; the control panel's own load saves it). */
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

/**
 * The settings as the plugin loads them: mirrors Settings.get in src/widget/js/global/repository/Settings.js, including its defaults for an instance nothing was saved for yet (subscribing on, unlike instances created before it existed).
 * @param {function(Error=, object=)} callback - (error, settings without the search index)
 */
const loadSettings = (callback) => {
  buildfire.datastore.get(SETTINGS_TAG, (err, record) => {
    if (err) return callback(err, undefined);
    if (!record || !record.data || Object.keys(record.data).length === 0) {
      return callback(null, toSettings({ subscription: { enabled: true, allowCustomNotifications: true } }));
    }
    callback(null, toSettings(migrateFieldSettings(clone(record.data))));
  });
};

/** Saves the whole settings document the way every control panel tab does (SettingsController.saveSettings → datastore.save). */
const saveSettings = (settings, actor, callback) => {
  settings.lastUpdatedOn = new Date();
  settings.lastUpdatedBy = actor;
  buildfire.datastore.save(toSettingsDocument(settings), SETTINGS_TAG, (err, saved) => {
    if (err || !saved) return callback(err || new Error('The settings were not saved'), undefined);
    callback(null, toSettings(saved.data));
  });
};

const settingsResult = (settings) => {
  const { _buildfire, ...rest } = settings;
  return rest;
};

/* -------------------------------------------------------------------------- */
/* Lookups                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The one record a caller named by its exact text. Several matches are refused rather than resolved to one of them: on a write, picking would mean acting on a record the caller did not mean.
 */
const findOne = (records, [noun, plural], text, callback) => {
  if (!records.length) return failWith(callback, `No ${noun} titled "${text}"`);
  if (records.length > 1) return failWith(callback, `${records.length} ${plural} are titled "${text}"`);
  callback(null, records[0]);
};

/** The location record whose title is exactly this text. */
const resolveLocation = (title, callback) => {
  buildfire.publicData.search({ filter: { '$json.title': title }, page: 0, pageSize: PAGE_LIMIT }, LOCATIONS_TAG, (err, records) => {
    if (err) return callback(err, undefined);
    findOne(((records && records.result) || records || []).filter(Boolean), ['location', 'locations'], title, callback);
  });
};

/** The location record with this id; an id that matches nothing is refused (the store answers an empty record, not an error). */
const requireLocationById = (locationId, callback) => {
  buildfire.publicData.getById(locationId, LOCATIONS_TAG, (err, record) => {
    if (err) return callback(err, undefined);
    if (!record || !record.id || !record.data || !Object.keys(record.data).length) {
      return failWith(callback, `No location with id "${locationId}"`);
    }
    callback(null, record);
  });
};

/** The category (not deleted) whose title is exactly this text. */
const resolveCategory = (title, callback) => {
  buildfire.publicData.search({
    filter: { '$json.title': title, '_buildfire.index.date1': { $type: 10 } }, page: 0, pageSize: PAGE_LIMIT
  }, CATEGORIES_TAG, (err, records) => {
    if (err) return callback(err, undefined);
    findOne(((records && records.result) || records || []).filter(Boolean), ['category', 'categories'], title, callback);
  });
};

/** The category (not deleted) with this id. */
const requireCategoryById = (categoryId, callback) => {
  buildfire.publicData.getById(categoryId, CATEGORIES_TAG, (err, record) => {
    if (err) return callback(err, undefined);
    if (!record || !record.id || !record.data || !Object.keys(record.data).length || record.data.deletedOn) {
      return failWith(callback, `No category with id "${categoryId}"`);
    }
    callback(null, record);
  });
};

/**
 * Every category that is not deleted, page by page: the platform answers at most 50 a call, and recordCount's totalRecord says whether another page exists. Mirrors CategoriesController.getAllCategories in src/control/content/js/categories/controller.js.
 */
const loadActiveCategories = (callback) => {
  const all = [];
  const next = (page) => {
    buildfire.publicData.search({
      filter: { '_buildfire.index.date1': { $type: 10 } },
      sort: { '_buildfire.index.string1': 1 },
      page,
      pageSize: PAGE_LIMIT,
      recordCount: true
    }, CATEGORIES_TAG, (err, response) => {
      if (err) return callback(err, undefined);
      const result = (response && response.result) || [];
      all.push(...result);
      const total = response && typeof response.totalRecord === 'number' ? response.totalRecord : all.length;
      if (result.length && all.length < total) return next(page + 1);
      callback(null, all.map(categoryFromRecord));
    });
  };
  next(0);
};

/** The pinned locations, in pin order: mirrors LocationsController.getPinnedLocation in src/control/content/js/locations/controller.js. */
const loadPinnedLocations = (callback) => {
  buildfire.publicData.search({
    filter: { '_buildfire.index.number1': { $in: [1, 2, 3] } },
    sort: { '_buildfire.index.number1': 1 },
    page: 0,
    pageSize: PAGE_LIMIT,
    recordCount: true
  }, LOCATIONS_TAG, (err, response) => {
    if (err) return callback(err, undefined);
    callback(null, ((response && response.result) || []).filter(Boolean));
  });
};

/**
 * A location's categories written the way the plugin's location import reads them (src/control/content/js/locations/index.js insertLocations): "Category -> Subcategory, Category", each name exact and the category not deleted. An unknown or shared name is refused rather than skipped.
 * @returns {{ categories?: { main: string[], subcategories: string[] }, error?: string }}
 */
const resolveCategoryText = (text, allCategories) => {
  const main = [];
  const subcategories = [];
  const entries = text.split(',').map((entry) => entry.trim()).filter(Boolean);
  for (let i = 0; i < entries.length; i += 1) {
    const [categoryTitle, subcategoryTitle] = entries[i].split('->').map((part) => part.trim());
    const matches = allCategories.filter((category) => category.title === categoryTitle);
    if (!matches.length) return { error: `No category titled "${categoryTitle}"` };
    if (matches.length > 1) return { error: `${matches.length} categories are titled "${categoryTitle}"` };
    const category = matches[0];
    if (!main.includes(category.id)) main.push(category.id);
    if (subcategoryTitle) {
      const subs = (category.subcategories || []).filter((sub) => sub.title === subcategoryTitle);
      if (!subs.length) return { error: `No subcategory titled "${subcategoryTitle}" in "${categoryTitle}"` };
      if (subs.length > 1) return { error: `${subs.length} subcategories of "${categoryTitle}" are titled "${subcategoryTitle}"` };
      if (!subcategories.includes(subs[0].id)) subcategories.push(subs[0].id);
    }
  }
  return { categories: { main, subcategories } };
};

/* -------------------------------------------------------------------------- */
/* Location input                                                             */
/* -------------------------------------------------------------------------- */

const timeOfDay = (hours, minutes) => new Date(Date.UTC(1970, 0, 1, hours, minutes)).toISOString();

/** Mirrors getDefaultOpeningHours in src/control/content/utils/helpers.js: every day open 08:00 to 20:00. */
const defaultDay = (index) => ({ index, active: true, intervals: [{ from: timeOfDay(8, 0), to: timeOfDay(20, 0) }] });
const defaultOpeningHours = () => ({
  timezone: null,
  days: WEEK_DAYS.reduce((days, day, index) => ({ ...days, [day]: defaultDay(index) }), {})
});

/**
 * A day's hours as the caller writes them: "closed", or one or more "HH:MM-HH:MM" ranges separated by commas. Times of day are stored as dates on 1970-01-01 UTC, as convertTimeToDate in src/utils/datetime.js stores them. Applies the checks of both forms: a range may not end before it starts (validateTimeInterval), two ranges may not share a start or end hour (validateOpeningHoursDuplication) and may not overlap (validateDayOverlap in src/widget/js/util/forms.js).
 * @returns {{ closed?: boolean, intervals?: object[], error?: string }}
 */
const parseDayHours = (name, value) => {
  if (typeof value !== 'string' || !value.trim()) return { error: `${name} must be "closed" or opening hours such as "08:00-20:00"` };
  if (value.trim().toLowerCase() === 'closed') return { closed: true };
  const intervals = [];
  const parts = value.split(',').map((part) => part.trim());
  for (let i = 0; i < parts.length; i += 1) {
    const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(parts[i]);
    if (!match) return { error: `${name} must be "closed" or opening hours such as "08:00-20:00"; got "${parts[i]}"` };
    const [fromH, fromM, toH, toM] = match.slice(1).map(Number);
    if (fromH > 23 || toH > 23 || fromM > 59 || toM > 59) return { error: `${name} has a time that does not exist: "${parts[i]}"` };
    const from = timeOfDay(fromH, fromM);
    const to = timeOfDay(toH, toM);
    if (new Date(from).getTime() > new Date(to).getTime()) return { error: `${name} has a range that ends before it starts: "${parts[i]}"` };
    intervals.push({ from, to });
  }
  const fromHours = intervals.map((interval) => new Date(interval.from).getUTCHours());
  const toHours = intervals.map((interval) => new Date(interval.to).getUTCHours());
  if (new Set(fromHours).size !== fromHours.length || new Set(toHours).size !== toHours.length) {
    return { error: `${name} has two ranges starting or ending in the same hour` };
  }
  for (let i = 0; i < intervals.length; i += 1) {
    for (let j = i + 1; j < intervals.length; j += 1) {
      const aStart = new Date(intervals[i].from).getTime();
      const aEnd = new Date(intervals[i].to).getTime();
      const bStart = new Date(intervals[j].from).getTime();
      const bEnd = new Date(intervals[j].to).getTime();
      if (aStart < bEnd && bStart < aEnd) return { error: `${name} has ranges that overlap` };
    }
  }
  return { intervals };
};

/** Mirrors isValidRGBColor in src/control/content/utils/helpers.js. */
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

/** Mirrors applyMarkerColors (with rgbaToHex and getOpacityFromRGBA) in src/control/content/js/locations/index.js. */
const markerColorOf = (color) => {
  const [r, g, b] = color.match(/\d+/g).map(Number);
  const opacityMatch = color.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(\d?\.?\d+)\s*\)/);
  return {
    backgroundCSS: `background: ${color}`,
    color,
    colorCSS: `color: ${color}`,
    colorHex: `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`,
    opacity: opacityMatch ? String(Math.round(parseFloat(opacityMatch[1]) * 100)) : '100',
  };
};

const MARKER_TYPES = ['pin', 'circle', 'image'];
const PRICE_RANGES = [1, 2, 3, 4];
const PRICE_CURRENCIES = ['$', '€'];
const LOCATION_TOGGLES = ['showCategory', 'showOpeningHours', 'showPriceRange', 'showStarRating'];
const LOCATION_FIELDS = ['subtitle', 'address', 'latitude', 'longitude', 'addressAlias', 'description', 'listImage', 'images',
  'categories', 'markerType', 'markerImage', 'markerColor', ...LOCATION_TOGGLES, 'priceRange', 'priceCurrency', 'actionItems',
  'pinned', ...WEEK_DAYS.map((day) => `${day}Hours`)];

/**
 * Checks the location input that needs no lookup, the way the location forms check it, and says which lookups the write needs. Create and update share it: on create, title, address, latitude, longitude, description and listImage are required; on update every field is optional, left out keeps it, and null (or "" for text) clears the fields a form lets you empty (subtitle, custom name, categories, marker image and color).
 * @returns {{ error?: string, needsCategories?: boolean, needsPins?: boolean }}
 */
const checkLocationInput = (options, isCreate) => {
  const has = (name) => options[name] !== undefined;
  const titleName = isCreate ? 'title' : 'newTitle';
  const required = isCreate ? [titleName, 'address', 'description'] : [];
  const missing = required.find((name) => typeof options[name] !== 'string' || !options[name]);
  if (missing) return { error: `Missing required parameter: ${missing}` };
  if (isCreate && options.latitude === undefined) return { error: 'Missing required parameter: latitude' };
  if (isCreate && options.longitude === undefined) return { error: 'Missing required parameter: longitude' };
  if (isCreate && options.listImage === undefined) return { error: 'Missing required parameter: listImage' };
  if (!isCreate && !has('newTitle') && !LOCATION_FIELDS.some(has)) return { error: `Pass at least one change: newTitle or ${LOCATION_FIELDS.join(', ')}` };

  // Required by the forms, so they can be changed but never removed.
  const notEmpty = [titleName, 'address', 'description'].find((name) => has(name) && (typeof options[name] !== 'string' || !options[name]));
  if (notEmpty) return { error: `${notEmpty} cannot be removed; pass a non-empty value` };
  const optionalText = ['subtitle', 'addressAlias', 'markerColor', 'categories'].find((name) => has(name) && options[name] !== null && typeof options[name] !== 'string');
  if (optionalText) return { error: `${optionalText} must be text, null or an empty string` };
  if (has('latitude')) { const e = checkNumber('latitude', options.latitude, -90, 90); if (e) return { error: e }; }
  if (has('longitude')) { const e = checkNumber('longitude', options.longitude, -180, 180); if (e) return { error: e }; }
  if (has('listImage')) { const { error } = readImageList(options.listImage, { name: 'listImage', minValue: 1, maxValue: 1 }); if (error) return { error }; }
  if (has('images')) { const { error } = readImageList(options.images, { name: 'images', minValue: 0 }); if (error) return { error }; }
  if (has('markerImage') && options.markerImage !== null) {
    const { error } = readImageList(options.markerImage, { name: 'markerImage', minValue: 0, maxValue: 1 });
    if (error) return { error };
  }
  if (has('markerType')) { const e = checkEnum('markerType', options.markerType, MARKER_TYPES); if (e) return { error: e }; }
  if (has('markerColor') && options.markerColor && !isValidRGBColor(options.markerColor)) {
    return { error: 'markerColor must be a color such as "rgba(253,35,5,1)"' };
  }
  const toggle = LOCATION_TOGGLES.find((name) => has(name) && typeof options[name] !== 'boolean');
  if (toggle) return { error: `${toggle} must be true or false` };
  if (has('pinned')) { const e = checkBoolean('pinned', options.pinned); if (e) return { error: e }; }
  if (has('priceRange')) { const e = checkEnum('priceRange', options.priceRange, PRICE_RANGES); if (e) return { error: e }; }
  if (has('priceCurrency')) { const e = checkEnum('priceCurrency', options.priceCurrency, PRICE_CURRENCIES); if (e) return { error: e }; }
  if (has('actionItems')) {
    if (!Array.isArray(options.actionItems)) return { error: 'actionItems must be a list of action items' };
    const bad = options.actionItems.findIndex((item) => !isPlainObject(item) || typeof item.action !== 'string' || !item.action);
    if (bad > -1) return { error: `actionItems entry ${bad} must be an action item with an action` };
  }
  for (let i = 0; i < WEEK_DAYS.length; i += 1) {
    const name = `${WEEK_DAYS[i]}Hours`;
    if (has(name)) { const { error } = parseDayHours(name, options[name]); if (error) return { error }; }
  }
  return { needsCategories: has('categories') && !!options.categories, needsPins: options.pinned === true };
};

/**
 * Applies checked input to a location, the way the location form's save fills the record (saveLocation and its controls in src/control/content/js/locations/index.js). Returns an error for what only the whole record can tell: a marker without its image, a fourth pin.
 * @returns {string|null} error
 */
const applyLocationInput = (location, options, { isCreate, allCategories, pinnedLocations }) => {
  const has = (name) => options[name] !== undefined;
  const titleName = isCreate ? 'title' : 'newTitle';
  if (has(titleName)) location.title = options[titleName];
  if (has('subtitle')) location.subtitle = options.subtitle;
  if (has('addressAlias')) location.addressAlias = options.addressAlias;
  if (has('description')) {
    location.description = options.description.trim();
    location.wysiwygSource = 'control';
  }
  if (has('address')) {
    // The form keeps what was typed in address and the map's answer in formattedAddress; a caller gives one address for both.
    location.address = options.address;
    location.formattedAddress = options.address;
  }
  if (has('latitude') || has('longitude')) {
    location.coordinates = {
      lat: has('latitude') ? options.latitude : location.coordinates.lat,
      lng: has('longitude') ? options.longitude : location.coordinates.lng
    };
  }
  if (has('listImage')) location.listImage = options.listImage[0];
  if (has('images')) {
    // Keeps the id of an image that stays, so the stored list changes only where the caller changed it.
    location.images = options.images.map((imageUrl) => {
      const kept = (location.images || []).find((image) => image.imageUrl === imageUrl);
      return { id: kept ? kept.id : generateUUID(), imageUrl };
    });
  }
  if (has('categories')) {
    if (!options.categories) {
      location.categories = { main: [], subcategories: [] };
    } else {
      const { categories, error } = resolveCategoryText(options.categories, allCategories);
      if (error) return error;
      location.categories = categories;
    }
  }
  if (isCreate || has('markerType') || has('markerImage') || has('markerColor')) {
    location.marker = { ...location.marker };
    if (has('markerType')) location.marker.type = options.markerType;
    if (has('markerImage')) location.marker.image = options.markerImage && options.markerImage.length ? options.markerImage[0] : null;
    if (has('markerColor')) location.marker.color = options.markerColor ? markerColorOf(options.markerColor) : null;
    // Choosing the circle marker gives it the default color when none is set (onMarkerTypeChanged).
    if (location.marker.type === 'circle' && !(location.marker.color && location.marker.color.color)) {
      location.marker.color = { ...DEFAULT_CIRCLE_MARKER_COLOR };
    }
    if (location.marker.type === 'image' && !location.marker.image) return 'markerImage is required for an image marker';
  }

  location.settings = { ...location.settings };
  LOCATION_TOGGLES.forEach((name) => { if (has(name)) location.settings[name] = options[name]; });
  location.price = { ...location.price };
  if (has('priceRange')) location.price.range = options.priceRange;
  if (has('priceCurrency')) location.price.currency = options.priceCurrency;
  if (has('actionItems')) {
    // Each action gets an id, and duplicates of one id are dropped, as the form's action list does.
    const items = options.actionItems.map((item) => ({ ...item, id: item.id || generateUUID() }));
    location.actionItems = items.filter((item, index) => index === items.findIndex((other) => other.id === item.id));
  }

  if (isCreate) {
    location.openingHours = defaultOpeningHours();
  } else if (WEEK_DAYS.some((day) => has(`${day}Hours`))) {
    location.openingHours = clone(location.openingHours || { timezone: null, days: {} });
    location.openingHours.days = location.openingHours.days || {};
  }
  WEEK_DAYS.forEach((day, index) => {
    const name = `${day}Hours`;
    if (!has(name)) return;
    const parsed = parseDayHours(name, options[name]);
    const current = location.openingHours.days[day] || defaultDay(index);
    // Closing a day keeps its hours, as unticking the day in the form does.
    location.openingHours.days[day] = parsed.closed
      ? { ...current, active: false }
      : { ...current, active: true, intervals: parsed.intervals };
  });

  if (has('pinned')) {
    if (!options.pinned) {
      location.pinIndex = null;
    } else if (location.pinIndex === null) {
      // "Pin to Top" takes the next number after the pinned count, and is disabled at 3.
      const others = pinnedLocations.filter((record) => record.id !== location.id);
      if (others.length >= MAX_PINNED) return `Up to ${MAX_PINNED} locations can be pinned; unpin one first`;
      location.pinIndex = others.length + 1;
    }
  }
  return null;
};

/** The configured location fields, as a location record stores their values: one entry per field, in the field's order. */
const fieldValuesFor = (customFields, current) => {
  const pick = (group) => (customFields[group] || []).map((field) => {
    const existing = ((current && current[group]) || []).find((entry) => entry.id === field.id);
    return toFieldValue(existing || { id: field.id });
  });
  return { quickActions: pick('quickActions'), content: pick('content') };
};

/* -------------------------------------------------------------------------- */
/* Location writes, shared by the basic, advanced and batch operations        */
/* -------------------------------------------------------------------------- */

/** Loads what a location write needs beyond its own record: the categories its text names and the pinned locations. */
const loadLocationContext = ({ needsCategories, needsPins }, callback) => {
  const context = { allCategories: [], pinnedLocations: [] };
  const withPins = () => {
    if (!needsPins) return callback(null, context);
    loadPinnedLocations((err, pinned) => {
      if (err) return callback(err, undefined);
      context.pinnedLocations = pinned.map(locationFromRecord);
      callback(null, context);
    });
  };
  if (!needsCategories) return withPins();
  loadActiveCategories((err, categories) => {
    if (err) return callback(err, undefined);
    context.allCategories = categories;
    withPins();
  });
};

/** What the operations return for a location: its fields with its id, without the search index. */
const locationResult = (location) => clone(location);

/** The data of a locationCreated / locationUpdated event: every value comes from the record just written. */
const locationEventData = (location, at, user) => ({
  locationId: location.id,
  title: location.title,
  subtitle: location.subtitle || null,
  address: location.address,
  listImage: location.listImage,
  latitude: location.coordinates.lat,
  longitude: location.coordinates.lng,
  pinned: !!location.pinIndex,
  [at.key]: at.value,
  [user.key]: eventUser(user.value)
});

/**
 * Creates one location the way LocationsController.createLocation does in both frames (src/control/content/js/locations/controller.js, src/widget/widget.controller.js): client id, creator and creation time, the record with its search index, then its viewed-analytics event, deep link and search-index entry, the widget refresh and the locationCreated event. The location fields configured in settings start empty on it.
 */
const createLocationRecord = (options, callback) => {
  const check = checkLocationInput(options, true);
  if (check.error) return failWith(callback, check.error);
  loadLocationContext(check, (err, context) => {
    if (err) return callback(err, undefined);
    loadSettings((settingsErr, settings) => {
      if (settingsErr) return callback(settingsErr, undefined);
      const location = toLocation({});
      const error = applyLocationInput(location, options, { ...context, isCreate: true });
      if (error) return failWith(callback, error);
      location.additionalFields = fieldValuesFor(settings.customFields, null);
      getActor((actor) => {
        location.clientId = generateUUID();
        location.createdOn = new Date();
        location.createdBy = actor;
        const document = toLocationDocument(location);
        delete document.id;
        buildfire.publicData.insert(document, LOCATIONS_TAG, (insertErr, record) => {
          if (insertErr) return callback(insertErr, undefined);
          const created = locationFromRecord(record);
          registerAnalyticsEvent(`${created.title} (Viewed)`, `locations_${created.id}_viewed`);
          registerLocationDeeplink(created);
          indexLocationForSearch(created);
          syncWidget({ scope: 'locations', realtimeUpdate: false, isCancel: false, data: null });
          sendEvent('locationCreated', locationEventData(created, { key: 'createdAt', value: created.createdOn }, { key: 'createdBy', value: actor }));
          callback(null, locationResult(created));
        });
      });
    });
  });
};

/** Writes the whole location back, as the location form's save does (LocationsController.updateLocation), with its bookkeeping. */
const saveLocation = (location, actor, callback) => {
  location.lastUpdatedOn = new Date();
  location.lastUpdatedBy = actor;
  buildfire.publicData.update(location.id, toLocationDocument(location), LOCATIONS_TAG, (err, record) => {
    if (err) return callback(err, undefined);
    const saved = record && record.data ? locationFromRecord({ ...record, id: record.id || location.id }) : location;
    registerLocationDeeplink(saved);
    indexLocationForSearch(saved);
    callback(null, saved);
  });
};

/**
 * Changes the location in this record, only the fields passed, then writes it back whole with its last editor and time, keeps its deep link and search-index entry in step, refreshes the widget and sends locationUpdated.
 */
const applyLocationUpdate = (record, options, callback) => {
  const check = checkLocationInput(options, false);
  if (check.error) return failWith(callback, check.error);
  loadLocationContext(check, (err, context) => {
    if (err) return callback(err, undefined);
    const location = locationFromRecord(record);
    const error = applyLocationInput(location, options, { ...context, isCreate: false });
    if (error) return failWith(callback, error);
    getActor((actor) => {
      saveLocation(location, actor, (saveErr, saved) => {
        if (saveErr) return callback(saveErr, undefined);
        syncWidget({ scope: 'locations', realtimeUpdate: false, isCancel: false, data: null });
        sendEvent('locationUpdated', locationEventData(saved, { key: 'updatedAt', value: saved.lastUpdatedOn }, { key: 'updatedBy', value: actor }));
        callback(null, locationResult(saved));
      });
    });
  });
};

/**
 * Deletes the location in this record for good, as LocationsController.deleteLocation does: the record, its deep link and its search-index entry; then refreshes the widget and sends locationDeleted.
 */
const applyLocationDelete = (record, callback) => {
  const location = locationFromRecord(record);
  buildfire.publicData.delete(location.id, LOCATIONS_TAG, (err) => {
    if (err) return callback(err, undefined);
    unregisterLocationDeeplink(location.id);
    unindexLocationForSearch(location.id);
    syncWidget({ scope: 'locations', realtimeUpdate: false, isCancel: false, data: null });
    getActor((actor) => {
      sendEvent('locationDeleted', {
        locationId: location.id, title: location.title, address: location.address, deletedBy: eventUser(actor)
      });
      callback(null, { id: location.id, title: location.title });
    });
  });
};

/** The location field this text names exactly, in either group. */
const findLocationField = (settings, fieldName) => {
  const matches = FIELD_GROUPS.reduce((found, group) => found.concat(
    settings.customFields[group].filter((field) => field.label === fieldName).map((field) => ({ group, field }))
  ), []);
  if (!matches.length) return { error: `No location field named "${fieldName}"` };
  if (matches.length > 1) return { error: `${matches.length} location fields are named "${fieldName}"` };
  return matches[0];
};

const findLocationFieldById = (settings, fieldId) => {
  const match = FIELD_GROUPS.reduce((found, group) => found || (settings.customFields[group]
    .filter((field) => field.id === fieldId).map((field) => ({ group, field }))[0]), null);
  return match || { error: `No location field with id "${fieldId}"` };
};

/**
 * A location field value, checked as the location form checks it (_validateFieldValue in src/control/content/js/locations/customFields.js): a phone number of digits, spaces and + - ( ); an email with @ and a dot after it; a URL without spaces, given https:// when it has no scheme. Empty clears it, unless the field is required.
 * @returns {{ value?: string|null, error?: string }}
 */
const checkFieldValue = (field, value) => {
  if (value === null || value === '') {
    if (field.required) return { error: `"${field.label}" is required, so its value cannot be removed` };
    return { value: null };
  }
  if (typeof value !== 'string') return { error: 'value must be text, null or an empty string' };
  let parsed = value.trim();
  if (field.type !== 'RICH_TEXT' && parsed.length > FIELD_VALUE_MAX_LENGTH) return { error: `value must be at most ${FIELD_VALUE_MAX_LENGTH} characters` };
  if (field.type === 'PHONE' && !/^[0-9\s+\-()]+$/.test(parsed)) return { error: 'value must be a valid phone number' };
  if (field.type === 'EMAIL') {
    const at = parsed.indexOf('@');
    if (parsed.indexOf(' ') !== -1 || at === -1 || parsed.indexOf('.', at) === -1) return { error: 'value must be a valid email address' };
  }
  if (field.type === 'URL') {
    if (parsed.indexOf(' ') !== -1 || parsed.indexOf('.') === -1) return { error: 'value must be a valid URL' };
    if (!/^https?:\/\//i.test(parsed)) parsed = `https://${parsed}`;
  }
  return { value: parsed };
};

/**
 * Fills one location field's value on a location, the way the location form's save collects the field values (getCustomFieldsValues), then saves the location as its form does.
 * @param {{ group: string, field: object }} target - the field, found in the settings
 */
const applyLocationFieldValue = (record, settings, target, options, callback) => {
  if (options.value === undefined) return failWith(callback, 'Missing required parameter: value');
  const { value, error } = checkFieldValue(target.field, options.value);
  if (error) return failWith(callback, error);
  if (options.customLabel !== undefined) {
    if (!target.field.enableCustomLabel) return failWith(callback, `customLabel is not offered for "${target.field.label}"`);
    if (options.customLabel !== null && typeof options.customLabel !== 'string') return failWith(callback, 'customLabel must be text, null or an empty string');
  }
  const location = locationFromRecord(record);
  const values = fieldValuesFor(settings.customFields, location.additionalFields);
  const entry = values[target.group].find((item) => item.id === target.field.id);
  entry.value = value;
  if (options.customLabel !== undefined) entry.customLabel = options.customLabel || null;
  location.additionalFields = values;
  getActor((actor) => {
    saveLocation(location, actor, (saveErr, saved) => {
      if (saveErr) return callback(saveErr, undefined);
      syncWidget({ scope: 'locations', realtimeUpdate: false, isCancel: false, data: null });
      sendEvent('locationUpdated', locationEventData(saved, { key: 'updatedAt', value: saved.lastUpdatedOn }, { key: 'updatedBy', value: actor }));
      callback(null, locationResult(saved));
    });
  });
};

/**
 * Moves one pinned location to a position in the pinned list and renumbers them all, as dragging in the list view's pinned list does (pinnedLocationsList.onOrderChange in src/control/content/js/listView/index.js): every pinned location is saved with its new number, then the widget's list view refreshes.
 */
const applyPinnedOrder = (record, position, callback) => {
  if (typeof position !== 'number' || !Number.isInteger(position) || position < 1 || position > MAX_PINNED) {
    return failWith(callback, `position must be a whole number between 1 and ${MAX_PINNED}`);
  }
  loadPinnedLocations((err, pinnedRecords) => {
    if (err) return callback(err, undefined);
    const pinned = pinnedRecords.map(locationFromRecord);
    const from = pinned.findIndex((location) => location.id === record.id);
    if (from === -1) return failWith(callback, `"${record.data.title}" is not pinned`);
    if (position > pinned.length) return failWith(callback, `position must be between 1 and ${pinned.length}, the number of pinned locations`);
    const [moved] = pinned.splice(from, 1);
    pinned.splice(position - 1, 0, moved);
    getActor((actor) => {
      const saved = [];
      const next = (index) => {
        if (index === pinned.length) {
          syncWidget({ scope: 'intro' });
          return callback(null, { locations: saved.map((location) => ({ id: location.id, title: location.title, pinIndex: location.pinIndex })) });
        }
        pinned[index].pinIndex = index + 1;
        saveLocation(pinned[index], actor, (saveErr, location) => {
          if (saveErr) return callback(saveErr, undefined);
          saved.push(location);
          next(index + 1);
        });
      };
      next(0);
    });
  });
};

/* -------------------------------------------------------------------------- */
/* Batches                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Runs a batch the way every batch here runs: checks the list's size, validates every entry with the single operation's own checks and resolves every id before anything is written (an invalid entry, an unknown id or the same record twice fails the whole call), then applies each entry in turn through the single operation's implementation, reporting each entry's outcome without stopping at a failed write.
 */
const runBatch = ({ options, listName, maxValue = BATCH_LIMIT, validate, keyOf, resolve, apply }, callback) => {
  if (!requireOptions(options, callback)) return;
  const entries = options[listName];
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > maxValue) {
    return failWith(callback, `${listName} must be a list of 1 to ${maxValue} entries`);
  }
  const invalid = entries.map((entry, index) => {
    if (!isPlainObject(entry)) return `entry ${index}: must be an object`;
    const error = validate(entry);
    return error ? `entry ${index}: ${error}` : null;
  }).filter(Boolean);
  if (invalid.length) return failWith(callback, `Invalid entries in ${listName}: ${invalid.join('; ')}`);
  if (keyOf) {
    const keys = entries.map(keyOf);
    if (new Set(keys).size !== keys.length) return failWith(callback, `The same record is listed more than once in ${listName}`);
  }
  const targets = [];
  const unknown = [];
  const resolveNext = (index) => {
    if (index === entries.length) {
      if (unknown.length) return failWith(callback, `Not found: ${unknown.join('; ')}`);
      const results = [];
      const applyNext = (i) => {
        if (i === entries.length) {
          const failed = results.filter((result) => result.error).length;
          return callback(null, { [listName]: results, succeeded: results.length - failed, failed });
        }
        apply(targets[i], entries[i], (err, result) => {
          results.push({ index: i, id: err ? null : (result && result.id) || null, error: err ? String(err.message || err) : null });
          applyNext(i + 1);
        });
      };
      return applyNext(0);
    }
    if (!resolve) return resolveNext(index + 1);
    resolve(entries[index], (err, target) => {
      if (err) unknown.push(`entry ${index}: ${err.message || err}`);
      else targets[index] = target;
      resolveNext(index + 1);
    });
  };
  resolveNext(0);
};

/** Checks one update entry without writing: the same checks applyLocationUpdate makes before any lookup. */
const locationUpdateError = (entry) => {
  if (typeof entry.locationId !== 'string' || !entry.locationId) return 'Missing required parameter: locationId';
  return checkLocationInput(entry, false).error || null;
};

/* -------------------------------------------------------------------------- */
/* Categories and subcategories                                               */
/* -------------------------------------------------------------------------- */

const syncCategories = () => syncWidget({ scope: 'category' });

/**
 * A category's icon, as its picker sets it: an image (iconUrl) or one of the icon library's icons (iconClassName), never both — choosing one clears the other. Also used for subcategories.
 * @returns {{ changes?: object, error?: string }}
 */
const readIcon = (options, imageName, classNameName) => {
  const hasImage = options[imageName] !== undefined;
  const hasClass = options[classNameName] !== undefined;
  if (hasImage && hasClass) return { error: `Pass ${imageName} or ${classNameName}, not both` };
  if (hasImage) {
    const { images, error } = readImageList(options[imageName], { name: imageName, minValue: 1, maxValue: 1 });
    if (error) return { error };
    return { changes: { iconUrl: images[0], iconClassName: null } };
  }
  if (hasClass) {
    if (typeof options[classNameName] !== 'string' || !options[classNameName]) return { error: `${classNameName} must be an icon's class name` };
    return { changes: { iconUrl: null, iconClassName: options[classNameName] } };
  }
  return { changes: {} };
};

const categoryResult = (category) => clone(category);

/** Writes the whole category back with its last editor and time, as CategoriesController.updateCategory does, then refreshes the widget. */
const saveCategory = (category, actor, callback) => {
  category.lastUpdatedOn = new Date();
  category.lastUpdatedBy = actor;
  buildfire.publicData.update(category.id, toCategoryDocument(category), CATEGORIES_TAG, (err, record) => {
    if (err) return callback(err, undefined);
    syncCategories();
    callback(null, record && record.data ? categoryFromRecord({ ...record, id: record.id || category.id }) : category);
  });
};

const categoryCreateError = (options) => {
  if (typeof options.title !== 'string' || !options.title) return 'Missing required parameter: title';
  return readIcon(options, 'icon', 'iconClassName').error || null;
};

/**
 * Adds one category as the categories tab's save does (CategoriesController.createCategory): creator and time, then the category's selected-analytics event and the widget refresh.
 */
const createCategoryRecord = (options, callback) => {
  const error = categoryCreateError(options);
  if (error) return failWith(callback, error);
  getActor((actor) => {
    const category = toCategory({ title: options.title, ...readIcon(options, 'icon', 'iconClassName').changes });
    category.createdOn = new Date();
    category.createdBy = actor;
    const document = toCategoryDocument(category);
    delete document.id;
    buildfire.publicData.insert(document, CATEGORIES_TAG, (err, record) => {
      if (err) return callback(err, undefined);
      const created = categoryFromRecord(record);
      registerAnalyticsEvent(`${created.title} (Category Selected)`, `categories_${created.id}_selected`);
      syncCategories();
      callback(null, categoryResult(created));
    });
  });
};

const categoryUpdateError = (options) => {
  const has = (name) => options[name] !== undefined;
  if (!has('newTitle') && !has('newIcon') && !has('newIconClassName')) return 'Pass at least one change: newTitle, newIcon or newIconClassName';
  if (has('newTitle') && (typeof options.newTitle !== 'string' || !options.newTitle)) return 'newTitle cannot be removed; pass a non-empty title';
  return readIcon(options, 'newIcon', 'newIconClassName').error || null;
};

/** Changes a category's title or icon, as the category form's save and the icon shortcut in the list do. */
const applyCategoryUpdate = (record, options, callback) => {
  const error = categoryUpdateError(options);
  if (error) return failWith(callback, error);
  const category = { ...categoryFromRecord(record), ...readIcon(options, 'newIcon', 'newIconClassName').changes };
  if (options.newTitle !== undefined) category.title = options.newTitle;
  getActor((actor) => saveCategory(category, actor, (err, saved) => (err ? callback(err, undefined) : callback(null, categoryResult(saved)))));
};

/**
 * Removes a category from the plugin the way the categories tab does (CategoriesController.deleteCategory): it is marked deleted, with who and when, and kept behind the scenes. Locations keep their link to it, as in the plugin.
 */
const applyCategoryDelete = (record, callback) => {
  const category = categoryFromRecord(record);
  getActor((actor) => {
    category.deletedOn = new Date();
    category.deletedBy = actor;
    buildfire.publicData.update(category.id, toCategoryDocument(category), CATEGORIES_TAG, (err) => {
      if (err) return callback(err, undefined);
      syncCategories();
      callback(null, { id: category.id, title: category.title });
    });
  });
};

/** The subcategory of this category whose title is exactly this text. */
const findSubcategory = (category, title) => {
  const matches = (category.subcategories || []).filter((sub) => sub.title === title);
  if (!matches.length) return { error: `No subcategory titled "${title}" in "${category.title}"` };
  if (matches.length > 1) return { error: `${matches.length} subcategories of "${category.title}" are titled "${title}"` };
  return { subcategory: matches[0] };
};

const findSubcategoryById = (category, subcategoryId) => {
  const subcategory = (category.subcategories || []).find((sub) => sub.id === subcategoryId);
  return subcategory ? { subcategory } : { error: `No subcategory with id "${subcategoryId}" in "${category.title}"` };
};

const subcategoryResult = (category, subcategory) => ({ ...clone(subcategory), categoryId: category.id, categoryTitle: category.title });

/** Adds a subcategory at the end of the category's list, as the Add Subcategory dialog does, then saves the category. */
const applySubcategoryCreate = (record, options, callback) => {
  if (typeof options.title !== 'string' || !options.title) return failWith(callback, 'Missing required parameter: title');
  const category = categoryFromRecord(record);
  const subcategory = { id: generateUUID(), title: options.title, iconUrl: null, iconClassName: null };
  category.subcategories = [...category.subcategories, subcategory];
  getActor((actor) => saveCategory(category, actor, (err, saved) => {
    if (err) return callback(err, undefined);
    // Registered as the plugin registers a new category's subcategories (CategoriesController.createCategory).
    registerAnalyticsEvent(`${subcategory.title} (Subcategory Selected)`, `subcategories_${subcategory.id}_selected`);
    callback(null, subcategoryResult(saved, subcategory));
  }));
};

const subcategoryUpdateError = (options) => {
  const has = (name) => options[name] !== undefined;
  if (!has('newTitle') && !has('newIcon') && !has('newIconClassName')) return 'Pass at least one change: newTitle, newIcon or newIconClassName';
  if (has('newTitle') && (typeof options.newTitle !== 'string' || !options.newTitle)) return 'newTitle cannot be removed; pass a non-empty title';
  return readIcon(options, 'newIcon', 'newIconClassName').error || null;
};

/** Renames a subcategory or changes its icon, as the subcategory list's edit and icon shortcut do, then saves the category. */
const applySubcategoryUpdate = (record, subcategoryId, options, callback) => {
  const error = subcategoryUpdateError(options);
  if (error) return failWith(callback, error);
  const category = categoryFromRecord(record);
  let updated;
  category.subcategories = category.subcategories.map((sub) => {
    if (sub.id !== subcategoryId) return sub;
    updated = { ...sub, ...readIcon(options, 'newIcon', 'newIconClassName').changes };
    if (options.newTitle !== undefined) updated.title = options.newTitle;
    return updated;
  });
  getActor((actor) => saveCategory(category, actor, (err, saved) => (err ? callback(err, undefined) : callback(null, subcategoryResult(saved, updated)))));
};

/** Removes a subcategory from its category for good, as the subcategory list's delete does, then saves the category. */
const applySubcategoryDelete = (record, subcategoryId, callback) => {
  const category = categoryFromRecord(record);
  const removed = category.subcategories.find((sub) => sub.id === subcategoryId);
  category.subcategories = category.subcategories.filter((sub) => sub.id !== subcategoryId);
  getActor((actor) => saveCategory(category, actor, (err) => (err ? callback(err, undefined) : callback(null, { id: removed.id, title: removed.title, categoryId: category.id }))));
};

/** Moves a subcategory to a position in its category's list, as dragging it does (subcategoriesListUI.onOrderChange), then saves the category. */
const applySubcategoryOrder = (record, subcategoryId, position, callback) => {
  const category = categoryFromRecord(record);
  if (typeof position !== 'number' || !Number.isInteger(position) || position < 1 || position > category.subcategories.length) {
    return failWith(callback, `position must be a whole number between 1 and ${category.subcategories.length}`);
  }
  const from = category.subcategories.findIndex((sub) => sub.id === subcategoryId);
  const [moved] = category.subcategories.splice(from, 1);
  category.subcategories.splice(position - 1, 0, moved);
  getActor((actor) => saveCategory(category, actor, (err, saved) => (err ? callback(err, undefined) : callback(null, {
    categoryId: saved.id, categoryTitle: saved.title, subcategories: saved.subcategories.map((sub) => ({ id: sub.id, title: sub.title }))
  }))));
};

/** Resolves a category named by title and a subcategory named by title in it. */
const resolveSubcategory = (categoryTitle, subcategoryTitle, callback) => {
  resolveCategory(categoryTitle, (err, record) => {
    if (err) return callback(err, undefined);
    const { subcategory, error } = findSubcategory(categoryFromRecord(record), subcategoryTitle);
    if (error) return failWith(callback, error);
    callback(null, { record, subcategoryId: subcategory.id });
  });
};

const requireSubcategoryById = (categoryId, subcategoryId, callback) => {
  requireCategoryById(categoryId, (err, record) => {
    if (err) return callback(err, undefined);
    const { subcategory, error } = findSubcategoryById(categoryFromRecord(record), subcategoryId);
    if (error) return failWith(callback, error);
    callback(null, { record, subcategoryId: subcategory.id });
  });
};

/* -------------------------------------------------------------------------- */
/* Location fields (settings.customFields)                                    */
/* -------------------------------------------------------------------------- */

/** Saves the settings after a location-field change and refreshes the widget's fields, as updateCustomFieldsWithDeilay does. */
const saveLocationFields = (settings, callback) => {
  // The tab keeps only fields with a label and a type.
  FIELD_GROUPS.forEach((group) => {
    settings.customFields[group] = settings.customFields[group].filter((field) => field.label && field.type);
  });
  getActor((actor) => saveSettings(settings, actor, (err, saved) => {
    if (err) return callback(err, undefined);
    syncWidget({ scope: 'customFields' });
    callback(null, saved);
  }));
};

const fieldResult = (group, field) => ({ ...clone(field), group });

const typesFor = (group) => (group === 'quickActions' ? QUICK_ACTION_TYPES : CONTENT_TYPES);

const locationFieldCreateError = (options) => {
  if (typeof options.group !== 'string' || !options.group) return 'Missing required parameter: group';
  const groupError = checkEnum('group', options.group, FIELD_GROUPS);
  if (groupError) return groupError;
  if (typeof options.label !== 'string' || !options.label) return 'Missing required parameter: label';
  if (typeof options.type !== 'string' || !options.type) return 'Missing required parameter: type';
  const typeError = checkEnum('type', options.type, typesFor(options.group));
  if (typeError) return typeError;
  if (options.required !== undefined && typeof options.required !== 'boolean') return 'required must be true or false';
  if (options.enableCustomLabel !== undefined && typeof options.enableCustomLabel !== 'boolean') return 'enableCustomLabel must be true or false';
  return null;
};

/** Adds a location field at the end of its group, as the Location Fields tab's add buttons do: shown to everyone, at most 10 fields in all. */
const applyLocationFieldCreate = (options, callback) => {
  const error = locationFieldCreateError(options);
  if (error) return failWith(callback, error);
  loadSettings((err, settings) => {
    if (err) return callback(err, undefined);
    const total = settings.customFields.quickActions.length + settings.customFields.content.length;
    if (total >= MAX_LOCATION_FIELDS) return failWith(callback, `Up to ${MAX_LOCATION_FIELDS} location fields can be added`);
    const field = toLocationField({
      id: generateUUID(),
      label: options.label,
      type: options.type,
      required: options.required === true,
      enableCustomLabel: options.enableCustomLabel === true,
      visibility: { value: 'ALL', tags: [] }
    });
    settings.customFields[options.group].push(field);
    saveLocationFields(settings, (saveErr) => (saveErr ? callback(saveErr, undefined) : callback(null, fieldResult(options.group, field))));
  });
};

const locationFieldUpdateError = (options) => {
  const has = (name) => options[name] !== undefined;
  if (!['newLabel', 'newType', 'required', 'enableCustomLabel'].some(has)) return 'Pass at least one change: newLabel, newType, required or enableCustomLabel';
  if (has('newLabel') && (typeof options.newLabel !== 'string' || !options.newLabel)) return 'newLabel cannot be removed; pass a non-empty label';
  if (has('newType')) { const e = checkEnum('newType', options.newType, CONTENT_TYPES); if (e) return e; }
  if (has('required') && typeof options.required !== 'boolean') return 'required must be true or false';
  if (has('enableCustomLabel') && typeof options.enableCustomLabel !== 'boolean') return 'enableCustomLabel must be true or false';
  return null;
};

/** Changes a location field's label, type, whether it is required, or whether it takes a custom label, as its row in the tab does. */
const applyLocationFieldUpdate = (settings, target, options, callback) => {
  const error = locationFieldUpdateError(options);
  if (error) return failWith(callback, error);
  if (options.newType !== undefined) {
    const typeError = checkEnum('newType', options.newType, typesFor(target.group));
    if (typeError) return failWith(callback, `${typeError} for a ${target.group === 'quickActions' ? 'quick action' : 'content'} field`);
  }
  const field = settings.customFields[target.group].find((item) => item.id === target.field.id);
  if (options.newLabel !== undefined) field.label = options.newLabel;
  if (options.newType !== undefined) field.type = options.newType;
  if (options.required !== undefined) field.required = options.required;
  if (options.enableCustomLabel !== undefined) field.enableCustomLabel = options.enableCustomLabel;
  saveLocationFields(settings, (err) => (err ? callback(err, undefined) : callback(null, fieldResult(target.group, field))));
};

/** Removes a location field for good, as its row's delete does. Values locations hold for it stay on them, as in the plugin. */
const applyLocationFieldDelete = (settings, target, callback) => {
  settings.customFields[target.group] = settings.customFields[target.group].filter((item) => item.id !== target.field.id);
  saveLocationFields(settings, (err) => (err ? callback(err, undefined) : callback(null, { id: target.field.id, label: target.field.label, group: target.group })));
};

/** Moves a location field to a position within its group, as dragging its row does. */
const applyLocationFieldOrder = (settings, target, position, callback) => {
  const list = settings.customFields[target.group];
  if (typeof position !== 'number' || !Number.isInteger(position) || position < 1 || position > list.length) {
    return failWith(callback, `position must be a whole number between 1 and ${list.length}`);
  }
  const from = list.findIndex((item) => item.id === target.field.id);
  const [moved] = list.splice(from, 1);
  list.splice(position - 1, 0, moved);
  saveLocationFields(settings, (err) => (err ? callback(err, undefined) : callback(null, {
    group: target.group, fields: list.map((field) => ({ id: field.id, label: field.label }))
  })));
};

/** Loads the settings and finds the location field a caller named, by label or by id. */
const withLocationField = (options, byId, callback) => {
  loadSettings((err, settings) => {
    if (err) return callback(err, undefined);
    const target = byId ? findLocationFieldById(settings, options.fieldId) : findLocationField(settings, options.fieldName);
    if (target.error) return failWith(callback, target.error);
    callback(null, { settings, target });
  });
};

/* Mirrors src/shared/stringsConfig.js: each label's default text, whether it may be left empty, its length limit. */
const STRINGS_CONFIG = {
  general: {
    title: "General",
    labels: {
      search: {
        title: "Search",
        defaultValue: "Search",
        isPlaceHolder: true,
        maxLength: 25
      },
      price: {
        title: "Price",
        defaultValue: "Price",
        required: true,
        maxLength: 10
      },
      currency: {
        title: "Currency",
        defaultValue: "Currency",
        required: true,
        maxLength: 10
      },
      reset: {
        title: "Reset",
        defaultValue: "Reset",
        required: true,
        maxLength: 10
      },
      notAvailable: {
        title: "N/A",
        defaultValue: "N/A",
        maxLength: 10
      },
      open: {
        title: "Open",
        defaultValue: "Open",
        required: true,
        maxLength: 8
      },
      closed: {
        title: "Closed",
        defaultValue: "Closed",
        required: true,
        maxLength: 8
      },
      bookmark: {
        title: "Bookmark",
        defaultValue: "Bookmark",
        required: true,
        maxLength: 9
      },
      bookmarks: {
        title: "Bookmarks",
        defaultValue: "Bookmarks",
        required: true,
        maxLength: 12
      },
      bookmarkResults: {
        title: "Bookmark Results",
        defaultValue: "Bookmark Results",
        maxLength: 16
      },
      enterBookmarkTitleHere: {
        title: "Enter bookmark title here",
        defaultValue: "Enter bookmark title here",
        maxLength: 50
      },
      rateThisLocation: {
        title: "Rate This Location",
        defaultValue: "Rate This Location",
        required: true,
        maxLength: 40
      },
      findWithinThisArea: {
        title: "Find Within This Area",
        defaultValue: "Find within this area",
        required: true,
        maxLength: 25
      },
      findMore: {
        title: "Find More",
        defaultValue: "Find More",
        required: true,
        maxLength: 20
      },
      nearYou: {
        title: "Near You",
        defaultValue: "Near You",
        required: true,
        maxLength: 40
      },
      otherLocations: {
        title: "Other Locations",
        defaultValue: "Other Locations",
        required: true,
        maxLength: 40
      },
      distanceUnitKm: {
        title: "KM",
        defaultValue: "KM",
        required: true,
        maxLength: 2
      },
      distanceUnitMi: {
        title: "mi",
        defaultValue: "mi",
        required: true,
        maxLength: 2
      },
      distanceUnitFt: {
        title: "ft",
        defaultValue: "ft",
        required: true,
        maxLength: 2
      },
      openHours: {
        title: "Open Hours",
        defaultValue: "Open Hours",
        maxLength: 25
      },
      monday: {
        title: "Monday",
        defaultValue: "Monday",
        required: true,
        maxLength: 25
      },
      sunday: {
        title: "Sunday",
        defaultValue: "Sunday",
        required: true,
        maxLength: 25
      },
      tuesday: {
        title: "Tuesday",
        defaultValue: "Tuesday",
        required: true,
        maxLength: 25
      },
      wednesday: {
        title: "Wednesday",
        defaultValue: "Wednesday",
        required: true,
        maxLength: 25
      },
      thursday: {
        title: "Thursday",
        defaultValue: "Thursday",
        required: true,
        maxLength: 25
      },
      friday: {
        title: "Friday",
        defaultValue: "Friday",
        required: true,
        maxLength: 25
      },
      saturday: {
        title: "Saturday",
        defaultValue: "Saturday",
        required: true,
        maxLength: 25
      },
      follow: {
        title: "Follow",
        defaultValue: "follow",
        required: true,
        maxLength: 25
      },
      following: {
        title: "Following",
        defaultValue: "Following",
        required: true,
        maxLength: 25
      },
      purchaseSuccessful: {
        title: "Purchase Successful",
        defaultValue: "Congratulations! You can add a location now.",
        required: true,
        maxLength: 50
      },
      purchaseCancelled: {
        title: "Purchase Cancelled",
        defaultValue: "Purchase cancelled. No charges were made.",
        required: true,
        maxLength: 50
      },
      genericError: {
        title: "Generic Error",
        defaultValue: "Something went wrong. Please try again.",
        required: true,
        maxLength: 50
      },
      pwaUnsupported: {
        title: "PWA Unsupported",
        defaultValue: "Subscriptions are not supported on PWA. Please use the mobile app to add a new location.",
        required: true,
        maxLength: 100
      },
      appStoreNotAccessible: {
        title: "App Store Not Accessible",
        defaultValue: "App store is not accessible.",
        required: true,
        maxLength: 50
      },
      promotionalOffersNotSupported: {
        title: "Promotional Offers Not Supported",
        defaultValue: "Promotional offers are not supported",
        required: true,
        maxLength: 50
      },
      noSubscriptionsFound: {
        title: "No Subscriptions Found",
        defaultValue: "No subscriptions were found",
        required: true,
        maxLength: 50
      }
    }
  },
  sortingOptions: {
    title: "Sorting Options",
    labels: {
      alphabeticalAsc: {
        title: "Title (A-Z)",
        defaultValue: "Title (A-Z)",
        required: true,
        maxLength: 12
      },
      alphabeticalDsc: {
        title: "Title (Z-A)",
        defaultValue: "Title (Z-A)",
        required: true,
        maxLength: 12
      },
      distance: {
        title: "Distance",
        defaultValue: "Distance",
        required: true,
        maxLength: 12
      },
      recommended: {
        title: "Recommended",
        defaultValue: "Recommended",
        required: true,
        maxLength: 12
      },
      priceDsc: {
        title: "$$$ - $",
        defaultValue: "$$$ - $",
        required: true,
        maxLength: 12
      },
      priceAsc: {
        title: "$ - $$$",
        defaultValue: "$ - $$$",
        required: true,
        maxLength: 12
      },
      recent: {
        title: "Recent",
        defaultValue: "Recent",
        required: true,
        maxLength: 12
      },
      mostViewed: {
        title: "Most Viewed",
        defaultValue: "Most Viewed",
        required: true,
        maxLength: 12
      }
    }
  },
  locationEditing: {
    title: "Location Creating/Editing",
    labels: {
      controlNote: {
        title: "For full customization options go to the admin Control Panel.",
        defaultValue: "For full customization options go to the admin Control Panel.",
        required: true,
        maxLength: 100
      },
      locationDetails: {
        title: "Location Details",
        defaultValue: "Location Details",
        maxLength: 25
      },
      locationName: {
        title: "Location Title",
        defaultValue: "Location Title",
        required: true,
        maxLength: 35
      },
      locationAddress: {
        title: "Location Address",
        defaultValue: "Location Address",
        required: true,
        maxLength: 35
      },
      additionalDetails: {
        title: "Additional Details",
        defaultValue: "Additional Details",
        required: true,
        maxLength: 35
      },
      locationCustomLabel: {
        title: "Location Custom Label",
        defaultValue: "Label (optional)",
        required: true,
        maxLength: 35
      },
      locationStreetNameAndNumber: {
        title: "Street Name and Number",
        defaultValue: "Street Name and Number",
        required: true,
        maxLength: 35
      },
      locationCustomName: {
        title: "Location Custom Name",
        defaultValue: "Location Custom Name",
        required: true,
        maxLength: 35
      },
      locationSubtitle: {
        title: "Location Subtitle",
        defaultValue: "Location Subtitle",
        required: true,
        maxLength: 35
      },
      locationDescription: {
        title: "Location Description",
        defaultValue: "Location Description",
        required: true,
        maxLength: 300
      },
      descriptionDialogPlaceholder: {
        title: "Enter your description here",
        defaultValue: "Enter your description here",
        required: true,
        maxLength: 30
      },
      descriptionDialogSave: {
        title: "Save",
        defaultValue: "Save",
        required: true,
        maxLength: 9
      },
      descriptionDialogCancel: {
        title: "Cancel",
        defaultValue: "Cancel",
        required: true,
        maxLength: 9
      },
      categories: {
        title: "Categories",
        defaultValue: "Categories",
        maxLength: 25
      },
      chooseCategory: {
        title: "Choose Category",
        defaultValue: "Choose Category",
        maxLength: 30
      },
      starRating: {
        title: "Star Rating",
        defaultValue: "Star Rating",
        required: true,
        maxLength: 25
      },
      showCategory: {
        title: "Show Category on Location Screen",
        defaultValue: "Show Category on Location Screen",
        required: true,
        maxLength: 25
      },
      enableEditing: {
        title: "Enable Editing",
        defaultValue: "Enable Editing",
        required: true,
        maxLength: 25
      },
      priceRange: {
        title: "Price Range",
        defaultValue: "Price Range",
        required: true,
        maxLength: 25
      },
      listImage: {
        title: "List Image",
        defaultValue: "List Image",
        required: true,
        maxLength: 25
      },
      listImageNote: {
        title: "This is the main location image displayed next to the location info in a list view.",
        defaultValue: "This is the main location image displayed next to the location info in a list view.",
        required: true,
        maxLength: 110
      },
      mapNote: {
        title: "If you need adjustments, drag the map so the pin matches the exact location of your place.",
        defaultValue: "If you need adjustments, drag the map so the pin matches the exact location of your place.",
        required: true,
        maxLength: 110
      },
      locationImages: {
        title: "Location Images",
        defaultValue: "Location Images",
        required: true,
        maxLength: 25
      },
      locationImagesNote: {
        title: "These are the location details images. First image in the list will be displayed as location’s main image.",
        defaultValue: "These are the location details images. First image in the list will be displayed as location’s main image.",
        required: true,
        maxLength: 110
      },
      monday: {
        title: "Mon",
        defaultValue: "Mon",
        required: true,
        maxLength: 10
      },
      tuesday: {
        title: "Tue",
        defaultValue: "Tue",
        required: true,
        maxLength: 10
      },
      wednesday: {
        title: "Wed",
        defaultValue: "Wed",
        required: true,
        maxLength: 10
      },
      thursday: {
        title: "Thu",
        defaultValue: "Thu",
        required: true,
        maxLength: 10
      },
      friday: {
        title: "Fri",
        defaultValue: "Fri",
        required: true,
        maxLength: 10
      },
      saturday: {
        title: "Sat",
        defaultValue: "Sat",
        required: true,
        maxLength: 10
      },
      sunday: {
        title: "Sun",
        defaultValue: "Sun",
        required: true,
        maxLength: 10
      },
      fieldRequired: {
        title: "This field is required",
        defaultValue: "This field is required",
        required: true,
        maxLength: 25
      },
      required: {
        title: "Required",
        defaultValue: "Required",
        required: true,
        maxLength: 25
      },
      invalidTime: {
        title: "Choose an end time later than the start time.",
        defaultValue: "Choose an end time later than the start time.",
        required: true,
        maxLength: 45
      },
      overlappingHours: {
        title: "Opening hours are overlapping for this day.",
        defaultValue: "Opening hours are overlapping for this day.",
        required: true,
        maxLength: 50
      },
      confirmEditingTitle: {
        title: "Enable Editing",
        defaultValue: "Enable Editing",
        required: true,
        maxLength: 25
      },
      confirmEditingMessage: {
        title: "The location description currently cannot be edited in the app. If you enable editing, the existing description will be deleted and can be replaced with a new description. Are you sure you want to proceed?",
        defaultValue: "The location description currently cannot be edited in the app. If you enable editing, the existing description will be deleted and can be replaced with a new description. Are you sure you want to proceed?",
        required: true,
        maxLength: 210
      },
      confirmEditingConfirm: {
        title: "Confirm",
        defaultValue: "Confirm",
        required: true,
        maxLength: 15
      },
      confirmEditingCancel: {
        title: "Cancel",
        defaultValue: "Cancel",
        required: true,
        maxLength: 15
      },
      enterEmailAddress: {
        title: "Enter email address",
        defaultValue: "Enter email address",
        required: true,
        maxLength: 50
      },
      enterPhoneNumber: {
        title: "Enter phone number",
        defaultValue: "Enter phone number",
        required: true,
        maxLength: 50
      },
      enterURL: {
        title: "Enter URL",
        defaultValue: "Enter URL",
        required: true,
        maxLength: 50
      },
      addDescription: {
        title: "Add description",
        defaultValue: "Add description",
        required: true,
        maxLength: 50
      },
      enterDetails: {
        title: "Enter details",
        defaultValue: "Enter details",
        required: true,
        maxLength: 50
      },
      validEmail: {
        title: "Enter a valid email address",
        defaultValue: "Enter a valid email address",
        required: true,
        maxLength: 50
      },
      validPhone: {
        title: "Enter a valid phone number",
        defaultValue: "Enter a valid phone number",
        required: true,
        maxLength: 50
      },
      validURL: {
        title: "Enter a valid URL",
        defaultValue: "Enter a valid URL",
        required: true,
        maxLength: 50
      }
    }
  },
  toast: {
    title: "Toast Messages",
    labels: {
      bookmarksRemoved: {
        title: "Bookmark Removed",
        defaultValue: "Bookmark removed",
        required: true,
        maxLength: 50
      },
      bookmarksAdded: {
        title: "Bookmark Added",
        defaultValue: "Bookmark added",
        required: true,
        maxLength: 50
      },
      bookmarksError: {
        title: "Couldn't bookmark",
        defaultValue: "Couldn't bookmark",
        required: true,
        maxLength: 50
      },
      uploadingImages: {
        title: "Uploading Images",
        defaultValue: "Uploading images",
        required: true,
        maxLength: 50
      },
      uploadingComplete: {
        title: "Uploading Images is Complete",
        defaultValue: "Uploading Images is Complete",
        required: true,
        maxLength: 50
      },
      uploadingFailed: {
        title: "Uploading Images Failed",
        defaultValue: "Uploading Images Failed",
        required: true,
        maxLength: 50
      },
      locationSaved: {
        title: "Location Saved",
        defaultValue: "Location Saved",
        required: true,
        maxLength: 50
      },
      alreadyReported: {
        title: "This item is already reported",
        defaultValue: "This item is already reported",
        required: true,
        maxLength: 50
      },
      reportedSuccessfully: {
        title: "Reported successfully",
        defaultValue: "Reported successfully",
        required: true,
        maxLength: 50
      },
      uploadedSuccessfully: {
        title: "Thanks for sharing your photos",
        defaultValue: "Thanks for sharing your photos",
        required: true,
        maxLength: 50
      },
      subscribeToLocationUpdates: {
        title: "You'll now get notifications for location updates.",
        defaultValue: "You'll now get notifications for location updates.",
        required: true,
        maxLength: 75
      },
      unSubscribeFromLocationUpdates: {
        title: "You'll no longer get notifications for location updates.",
        defaultValue: "You'll no longer get notifications for location updates.",
        required: true,
        maxLength: 75
      },
      sendNotificationSuccess: {
        title: "Notification sent successfully",
        defaultValue: "Notification sent successfully.",
        required: true,
        maxLength: 75
      },
      sendNotificationFailed: {
        title: "Notification failed",
        defaultValue: "Failed to send notification. Please try again later.",
        required: true,
        maxLength: 75
      },
      locationHasNoSubscribers: {
        title: "Location has no subscribers",
        defaultValue: "This location has no subscribers to notify",
        required: true,
        maxLength: 75
      },
      locationDeleted: {
        title: "Location Deleted",
        defaultValue: "This location has been deleted.",
        required: true,
        maxLength: 75
      },
      somethingWentWrong: {
        title: "Something went wrong",
        defaultValue: "Something went wrong",
        required: true,
        maxLength: 50
      }
    }
  },
  details: {
    title: "Details Page",
    labels: {
      bookmark: {
        title: "Bookmark",
        defaultValue: "Bookmark",
        required: true,
        maxLength: 25
      },
      reportAbuse: {
        title: "Report Abuse",
        defaultValue: "Report Abuse",
        required: true,
        maxLength: 25
      },
      share: {
        title: "Share",
        defaultValue: "Share",
        required: true,
        maxLength: 25
      },
      edit: {
        title: "Edit",
        defaultValue: "Edit",
        required: true,
        maxLength: 25
      },
      notifySubscribers: {
        title: "Notify Subscribers",
        defaultValue: "Notify Subscribers",
        required: true,
        maxLength: 50
      },
      addPhotos: {
        title: "Add Photos",
        defaultValue: "Add Photos",
        required: true,
        maxLength: 25
      },
      contributorPrefix: {
        title: "Contributor Name Prefix",
        defaultValue: "by",
        required: true,
        maxLength: 15
      },
      unknownContributor: {
        title: "Unknown Contributor",
        defaultValue: "Someone",
        required: true,
        maxLength: 25
      },
      newPushNotification: {
        title: "New Push Notification Title",
        defaultValue: "New Push Notification",
        required: true,
        maxLength: 50
      },
      notificationWarningNote: {
        title: "Notification Note",
        defaultValue: "Notify users about changes to this location. Only users who have subscribed to this location will receive this notification.",
        required: true,
        maxLength: 150
      },
      notificationTitlePlaceholder: {
        title: "Notification Title Placeholder",
        defaultValue: "Title",
        required: true,
        maxLength: 50
      },
      notificationMessagePlaceholder: {
        title: "Notification Message Placeholder",
        defaultValue: "Message",
        required: true,
        maxLength: 50
      },
      done: {
        title: "Done",
        defaultValue: "Done",
        required: true,
        maxLength: 9
      },
      cancel: {
        title: "Cancel",
        defaultValue: "Cancel",
        required: true,
        maxLength: 9
      },
      notificationSend: {
        title: "Send",
        defaultValue: "Send",
        required: true,
        maxLength: 15
      }
    }
  },
  emptyState: {
    title: "Empty State",
    labels: {
      emptyCategories: {
        title: "No Categories Added",
        defaultValue: "No Categories Added",
        maxLength: 30
      },
      locationsListBeforeSearch: {
        title: "Start your search",
        defaultValue: "Start your search",
        maxLength: 40
      },
      locationsListAfterSearch: {
        title: "No locations found within this area",
        defaultValue: "No locations found within this area",
        maxLength: 40
      }
    }
  }
};

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

const select = (values) => ({ kind: 'select', values });
const BOOLEAN = { kind: 'boolean' };

/**
 * Every setting updateSettings takes: how its control-panel form control checks the value, where the value is stored, and which widget refresh message its tab sends after saving (src/control/settings/settings.js 'settings', src/control/design/design.js 'design', src/control/content/js/listView/index.js 'intro', src/control/settings/js/pages/locationSettings.js 'locationSettings', 'charging' and 'paymentDetailsUpdated').
 */
const SETTINGS_PARAMS = {
  subscriptionEnabled: { ...BOOLEAN, scope: 'settings', apply: (s, v) => { s.subscription.enabled = v; } },
  distanceUnit: { ...select(['metric', 'imperial']), scope: 'settings', apply: (s, v) => { s.measurementUnit = v; } },
  timeFormat: { ...select(['12H', '24H']), scope: 'settings', apply: (s, v) => { s.locationEditors.time = v; } },
  defaultSorting: { ...select(['distance', 'alphabetical']), scope: 'settings', apply: (s, v) => { s.sorting.defaultSorting = v; } },
  hideSorting: { ...BOOLEAN, scope: 'settings', apply: (s, v) => { s.sorting.hideSorting = v; } },
  allowSortByReverseAlphabetical: { ...BOOLEAN, scope: 'settings', apply: (s, v) => { s.sorting.allowSortByReverseAlphabetical = v; } },
  allowSortByNearest: { ...BOOLEAN, scope: 'settings', apply: (s, v) => { s.sorting.allowSortByNearest = v; } },
  allowSortByPriceLowToHigh: { ...BOOLEAN, scope: 'settings', apply: (s, v) => { s.sorting.allowSortByPriceLowToHigh = v; } },
  allowSortByPriceHighToLow: { ...BOOLEAN, scope: 'settings', apply: (s, v) => { s.sorting.allowSortByPriceHighToLow = v; } },
  allowSortByDate: { ...BOOLEAN, scope: 'settings', apply: (s, v) => { s.sorting.allowSortByDate = v; } },
  allowSortByRating: { ...BOOLEAN, scope: 'settings', apply: (s, v) => { s.sorting.allowSortByRating = v; } },
  allowSortByViews: { ...BOOLEAN, scope: 'settings', apply: (s, v) => { s.sorting.allowSortByViews = v; } },
  allowFilterByArea: { ...BOOLEAN, scope: 'settings', apply: (s, v) => { s.filter.allowFilterByArea = v; } },
  allowFilterByBookmarks: { ...BOOLEAN, scope: 'settings', apply: (s, v) => { s.filter.allowFilterByBookmarks = v; } },
  hideOpeningHoursFilter: { ...BOOLEAN, scope: 'settings', apply: (s, v) => { s.filter.hideOpeningHoursFilter = v; } },
  hidePriceFilter: { ...BOOLEAN, scope: 'settings', apply: (s, v) => { s.filter.hidePriceFilter = v; } },
  mapInitialArea: { ...BOOLEAN, scope: 'settings', apply: (s, v) => { s.map.initialArea = v; } },
  mapInitialAreaAddress: { kind: 'text', scope: 'settings', apply: (s, v) => { s.map.initialAreaDisplayAddress = v; } },
  mapInitialAreaLatitude: { kind: 'number', min: -90, max: 90, scope: 'settings', apply: (s, v) => { s.map.initialAreaCoordinates = { ...s.map.initialAreaCoordinates, lat: v }; } },
  mapInitialAreaLongitude: { kind: 'number', min: -180, max: 180, scope: 'settings', apply: (s, v) => { s.map.initialAreaCoordinates = { ...s.map.initialAreaCoordinates, lng: v }; } },
  bookmarksEnabled: { ...BOOLEAN, scope: 'settings', apply: (s, v) => { s.bookmarks.enabled = v; } },
  allowBookmarkLocations: { ...BOOLEAN, scope: 'settings', apply: (s, v) => { s.bookmarks.allowForLocations = v; } },
  allowBookmarkSearches: { ...BOOLEAN, scope: 'settings', apply: (s, v) => { s.bookmarks.allowForFilters = v; } },
  listViewPosition: { ...select(['expanded', 'collapsed', 'halfExpanded']), scope: 'design', apply: (s, v) => { s.design.listViewPosition = v; } },
  listViewStyle: { ...select(['backgroundImage', 'smallImage']), scope: 'design', apply: (s, v) => { s.design.listViewStyle = v; } },
  defaultMapType: { ...select(['streets', 'satellite']), scope: 'design', apply: (s, v) => { s.design.defaultMapType = v; } },
  detailsMapPosition: { ...select(['top', 'bottom']), scope: 'design', apply: (s, v) => { s.design.detailsMapPosition = v; } },
  enableMapTerrainView: { ...BOOLEAN, scope: 'design', apply: (s, v) => { s.design.enableMapTerrainView = v; } },
  hideQuickFilter: { ...BOOLEAN, scope: 'design', apply: (s, v) => { s.design.hideQuickFilter = v; } },
  allowMapStyleSelection: { ...BOOLEAN, scope: 'design', apply: (s, v) => { s.design.allowStyleSelection = v; } },
  showDetailsCategory: { ...BOOLEAN, scope: 'design', apply: (s, v) => { s.design.showDetailsCategory = v; } },
  showContributorName: { ...BOOLEAN, scope: 'design', apply: (s, v) => { s.design.showContributorName = v; } },
  introImages: {
    kind: 'image', scope: 'intro',
    apply: (s, v) => {
      // Carousel items as the list view tab's carousel editor stores them; an image kept keeps its item.
      s.introductoryListView.images = v.map((iconUrl) => {
        const kept = (s.introductoryListView.images || []).find((item) => item && item.iconUrl === iconUrl);
        return kept || { title: 'image', iconUrl, action: 'noAction', id: generateUUID() };
      });
    }
  },
  introDescription: { kind: 'wysiwyg', nullable: true, scope: 'intro', apply: (s, v) => { s.introductoryListView.description = v; } },
  introVisibility: { ...select(['ALL', 'TAGS', 'NONE']), scope: 'intro', apply: (s, v) => { s.introductoryListView.visibilityOptions.value = v; } },
  introSorting: { ...select(['distance', 'alphabetical', 'newest']), scope: 'intro', apply: (s, v) => { s.introductoryListView.sorting = v; } },
  introLocationsSource: {
    ...select(['All', 'UserPosition', 'AreaRadius', 'MyLocations']), scope: 'intro',
    apply: (s, v) => { s.introductoryListView.searchOptions = { ...(s.introductoryListView.searchOptions || {}), mode: v }; }
  },
  introAreaAddress: { kind: 'text', scope: 'intro', apply: (s, v) => { areaOf(s).formattedLocation = v; } },
  introAreaLatitude: { kind: 'number', min: -90, max: 90, scope: 'intro', apply: (s, v) => { areaOf(s).lat = v; } },
  introAreaLongitude: { kind: 'number', min: -180, max: 180, scope: 'intro', apply: (s, v) => { areaOf(s).lng = v; } },
  introAreaRadius: { kind: 'number', min: 1, max: 200, scope: 'intro', apply: (s, v) => { areaOf(s).radius = v; } },
  openingHoursEnabled: {
    ...BOOLEAN, scope: 'locationSettings',
    apply: (s, v) => {
      s.globalEntries.openHours.enabled = v;
      // Turning the field off also turns it off for app users, as the tab does.
      if (!v) { s.globalEntries.openHours.inAppEnabled = 'none'; s.globalEntries.openHours.tags = []; }
    }
  },
  priceRangeEnabled: {
    ...BOOLEAN, scope: 'locationSettings',
    apply: (s, v) => {
      s.globalEntries.priceRange.enabled = v;
      if (!v) { s.globalEntries.priceRange.inAppEnabled = 'none'; s.globalEntries.priceRange.tags = []; }
    }
  },
  chargeForNewLocations: { ...select(['none', 'limited', 'all']), scope: 'charging', apply: (s, v) => { s.globalEntries.charging.enabled = v; } },
  paymentDetails: { kind: 'wysiwyg', nullable: true, scope: 'paymentDetailsUpdated', apply: (s, v) => { s.globalEntries.charging.description = v; } },
};

function areaOf(settings) {
  const searchOptions = settings.introductoryListView.searchOptions || (settings.introductoryListView.searchOptions = { mode: 'UserPosition' });
  searchOptions.areaRadiusOptions = searchOptions.areaRadiusOptions || {};
  return searchOptions.areaRadiusOptions;
}

/** Checks one setting's value the way its form control limits it. */
const checkSetting = (name, rule, value) => {
  if (value === null || value === '') {
    if (rule.nullable) return null;
    return `${name} cannot be removed`;
  }
  switch (rule.kind) {
    case 'boolean': return checkBoolean(name, value);
    case 'select': return checkEnum(name, value, rule.values);
    case 'number': return checkNumber(name, value, rule.min, rule.max);
    case 'image': return readImageList(value, { name, minValue: 0 }).error || null;
    default: return typeof value === 'string' ? null : `${name} must be text`;
  }
};

/* -------------------------------------------------------------------------- */
/* Language strings                                                           */
/* -------------------------------------------------------------------------- */

const STRING_KEYS = Object.keys(STRINGS_CONFIG).reduce((keys, section) => keys.concat(
  Object.keys(STRINGS_CONFIG[section].labels).map((label) => `${section}.${label}`)
), []);

/**
 * The strings as the plugin's Strings service holds them after refresh (src/shared/strings.js): every label's default, required and placeholder flags, with the values saved so far.
 */
const loadStrings = (callback) => {
  // Mirrors Strings#refresh, which reads the first record because get has an edge case.
  buildfire.datastore.search({ limit: 1 }, STRINGS_TAG, (err, records) => {
    if (err) return callback(err, undefined);
    const record = (records || [])[0] || null;
    const data = {};
    Object.keys(STRINGS_CONFIG).forEach((section) => {
      data[section] = {};
      Object.keys(STRINGS_CONFIG[section].labels).forEach((label) => {
        const config = STRINGS_CONFIG[section].labels[label];
        data[section][label] = { defaultValue: config.defaultValue, required: config.required, isPlaceHolder: config.isPlaceHolder };
      });
    });
    const stored = (record && record.data) || {};
    Object.keys(stored).forEach((section) => {
      if (!data[section]) data[section] = {};
      Object.keys(stored[section] || {}).forEach((label) => {
        if (!data[section][label]) data[section][label] = {};
        data[section][label].value = stored[section][label] && stored[section][label].value;
      });
    });
    callback(null, { data });
  });
};

/** The text the app shows for a label: mirrors Strings#get (a saved value, an emptied optional one, else the default). */
const shownText = (entry) => {
  if (entry.value || (entry.value === '' && !entry.required)) return entry.value;
  return entry.defaultValue || '';
};

/* -------------------------------------------------------------------------- */
/* Operations                                                                 */
/* -------------------------------------------------------------------------- */

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

  /* ----------------------------- Locations ------------------------------ */

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Lists locations a page at a time, filtered the ways the plugin filters them: words in the title, subtitle or address (the content tab's search on the text index), an exact title, a category or subcategory and a price range (the app's filter, on the index's c_/s_/pr_ entries, here each one narrowing the list), and the pinned locations (number1 1–3, in pin order). Category names are resolved to ids first, which is why this is a function. Uses only buildfire.publicData, the same in both frames and on the server; nothing about it needs watching, so Background.
   * @param {{ search?: string, title?: string, categoryName?: string, subcategoryName?: string, priceRange?: number, pinnedOnly?: boolean, sort?: string, page?: number, pageSize?: number }} options
   * @param {function(Error=, object=)} callback - (error, { locations, total, page, hasMore })
   */
  searchLocations(options, callback) {
    if (!requireOptions(options, callback)) return;
    const { page, pageSize, error } = readPaging(options);
    if (error) return failWith(callback, error);
    const textParam = ['search', 'title', 'categoryName', 'subcategoryName'].find((name) => options[name] !== undefined && typeof options[name] !== 'string');
    if (textParam) return failWith(callback, `${textParam} must be text`);
    if (options.subcategoryName && !options.categoryName) return failWith(callback, 'subcategoryName needs categoryName, the category it belongs to');
    if (options.priceRange !== undefined) { const e = checkEnum('priceRange', options.priceRange, PRICE_RANGES); if (e) return failWith(callback, e); }
    if (options.pinnedOnly !== undefined) { const e = checkBoolean('pinnedOnly', options.pinnedOnly); if (e) return failWith(callback, e); }
    const sort = options.sort === undefined ? 'alphabetical' : options.sort;
    const sortError = checkEnum('sort', sort, ['alphabetical', 'reverseAlphabetical', 'newest']);
    if (sortError) return failWith(callback, sortError);

    const run = (categoryRecord) => {
      const and = [];
      // The text is matched as typed, not as a pattern.
      if (options.search) and.push({ '_buildfire.index.text': { $regex: escapeRegex(options.search.toLowerCase()), $options: 'i' } });
      if (options.title) and.push({ '$json.title': options.title });
      if (categoryRecord) {
        const category = categoryFromRecord(categoryRecord);
        and.push({ '_buildfire.index.array1.string1': `c_${category.id}` });
        if (options.subcategoryName) {
          const { subcategory, error: subError } = findSubcategory(category, options.subcategoryName);
          if (subError) return failWith(callback, subError);
          and.push({ '_buildfire.index.array1.string1': `s_${subcategory.id}` });
        }
      }
      if (options.priceRange !== undefined) and.push({ '_buildfire.index.array1.string1': `pr_${options.priceRange}` });
      if (options.pinnedOnly) and.push({ '_buildfire.index.number1': { $in: [1, 2, 3] } });
      let sortBy = { '_buildfire.index.text': 1 };
      if (sort === 'reverseAlphabetical') sortBy = { '_buildfire.index.text': -1 };
      if (sort === 'newest') sortBy = { '_buildfire.index.date1': -1 };
      if (options.pinnedOnly) sortBy = { '_buildfire.index.number1': 1 };
      buildfire.publicData.search({
        filter: and.length ? { $and: and } : {}, sort: sortBy, page, pageSize, recordCount: true
      }, LOCATIONS_TAG, (err, response) => {
        if (err) return callback(err, undefined);
        const result = ((response && response.result) || []).filter(Boolean);
        const total = response && typeof response.totalRecord === 'number' ? response.totalRecord : result.length;
        callback(null, {
          locations: result.map((record) => locationResult(locationFromRecord(record))),
          total,
          page,
          hasMore: page * pageSize + result.length < total
        });
      });
    };
    if (!options.categoryName) return run(null);
    resolveCategory(options.categoryName, (err, record) => (err ? callback(err, undefined) : run(record)));
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. One location, named by its exact title; several with that title are refused, saying how many. Resolving the title is a search, which is why this is a function. Uses only buildfire.publicData, the same in both frames and on the server; Background. usage: basic; its advanced alternative is getLocationAdvanced.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, location)
   */
  getLocation(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    resolveLocation(options.title, (err, record) => (err ? callback(err, undefined) : callback(null, locationResult(locationFromRecord(record)))));
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of getLocation, taking the location's id. An id that matches nothing is refused (the store answers an empty record for it). Same hosts and result as getLocation.
   * @param {{ locationId: string }} options
   * @param {function(Error=, object=)} callback - (error, location)
   */
  getLocationAdvanced(options, callback) {
    if (!requireStringParams(options, ['locationId'], callback)) return;
    requireLocationById(options.locationId, (err, record) => (err ? callback(err, undefined) : callback(null, locationResult(locationFromRecord(record)))));
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Adds a location the way both frames' location forms do (createLocationRecord): the form's checks, the record with its search index, then its analytics event, deep link, search-index entry (where the frame loads that service), widget refresh and the locationCreated event. Several platform calls depend on each other (category names, pinned count, configured location fields), which is why it is a function. Uses buildfire.publicData and buildfire.datastore reads, the same in both frames and on the server; the widget offers the same action to its location creators. Adding a location is ordinary content management, nothing anyone must watch, so Background.
   * @param {object} options - title, address, latitude, longitude, description, listImage, and the optional location fields
   * @param {function(Error=, object=)} callback - (error, location)
   */
  createLocation(options, callback) {
    if (!requireOptions(options, callback)) return;
    createLocationRecord(options, callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced (batches are never basic). The batch form of createLocation, as the content tab's import does it: every entry checked first, then each created through createLocationRecord, so each gets every side effect and its own event; a failed write is reported for its entry and does not stop the rest.
   * @param {{ locations: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  createLocationsAdvanced(options, callback) {
    runBatch({
      options,
      listName: 'locations',
      validate: (entry) => checkLocationInput(entry, true).error || null,
      apply: (target, entry, done) => createLocationRecord(entry, done)
    }, callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Edits one location, named by its exact current title, changing only the fields passed, as the location forms' save does (applyLocationUpdate): the whole record written back with its editor and time, its deep link and search-index entry kept in step, the widget refreshed and locationUpdated sent. Resolving the title is a search, which is why this is a function. Same hosts as createLocation, for the same reasons. usage: basic; its advanced alternative is updateLocationAdvanced.
   * @param {object} options - title, and at least one change
   * @param {function(Error=, object=)} callback - (error, location)
   */
  updateLocation(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    const { error } = checkLocationInput(options, false);
    if (error) return failWith(callback, error);
    resolveLocation(options.title, (err, record) => (err ? callback(err, undefined) : applyLocationUpdate(record, options, callback)));
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of updateLocation, taking the location's id; the id is checked to exist first. Same checks and effects through applyLocationUpdate.
   * @param {object} options - locationId, and at least one change
   * @param {function(Error=, object=)} callback - (error, location)
   */
  updateLocationAdvanced(options, callback) {
    if (!requireStringParams(options, ['locationId'], callback)) return;
    const { error } = checkLocationInput(options, false);
    if (error) return failWith(callback, error);
    requireLocationById(options.locationId, (err, record) => (err ? callback(err, undefined) : applyLocationUpdate(record, options, callback)));
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced. The batch form of updateLocationAdvanced: every entry checked and every id found before anything is written, the same location twice refused, then each applied through applyLocationUpdate.
   * @param {{ locations: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  updateLocationsAdvanced(options, callback) {
    runBatch({
      options,
      listName: 'locations',
      validate: locationUpdateError,
      keyOf: (entry) => entry.locationId,
      resolve: (entry, done) => requireLocationById(entry.locationId, done),
      apply: (record, entry, done) => applyLocationUpdate(record, entry, done)
    }, callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Deletes one location for good, named by its exact title, as the content tab's delete and the app's abuse-report removal do (applyLocationDelete): the record, its deep link and search-index entry, then the widget refresh and locationDeleted. It cannot be undone, which its flags say; nothing about it needs a screen, so Background, and it stays on the server like any content edit. usage: basic; its advanced alternative is deleteLocationAdvanced.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, title })
   */
  deleteLocation(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    resolveLocation(options.title, (err, record) => (err ? callback(err, undefined) : applyLocationDelete(record, callback)));
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of deleteLocation, taking the location's id; the id is checked to exist first.
   * @param {{ locationId: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, title })
   */
  deleteLocationAdvanced(options, callback) {
    if (!requireStringParams(options, ['locationId'], callback)) return;
    requireLocationById(options.locationId, (err, record) => (err ? callback(err, undefined) : applyLocationDelete(record, callback)));
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced. The batch form of deleteLocationAdvanced, as the content tab's AI generator clears the list: every id found first, the same location twice refused, then each deleted through applyLocationDelete.
   * @param {{ locations: Array<{ locationId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  deleteLocationsAdvanced(options, callback) {
    runBatch({
      options,
      listName: 'locations',
      validate: (entry) => (typeof entry.locationId !== 'string' || !entry.locationId ? 'Missing required parameter: locationId' : null),
      keyOf: (entry) => entry.locationId,
      resolve: (entry, done) => requireLocationById(entry.locationId, done),
      apply: (record, entry, done) => applyLocationDelete(record, done)
    }, callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Fills one of the location fields set up in settings on one location, named by the location's exact title and the field's exact name, with the location form's checks for that field's type (applyLocationFieldValue), then saves the location as its form does and sends locationUpdated. Reads the settings and the location first, which is why it is a function; same hosts as updateLocation. usage: basic; its advanced alternative is updateLocationFieldValueAdvanced.
   * @param {{ locationTitle: string, fieldName: string, value: string|null, customLabel?: string|null }} options
   * @param {function(Error=, object=)} callback - (error, location)
   */
  updateLocationFieldValue(options, callback) {
    if (!requireStringParams(options, ['locationTitle', 'fieldName'], callback)) return;
    if (options.value === undefined) return failWith(callback, 'Missing required parameter: value');
    withLocationField(options, false, (err, found) => {
      if (err) return callback(err, undefined);
      resolveLocation(options.locationTitle, (findErr, record) => (findErr ? callback(findErr, undefined)
        : applyLocationFieldValue(record, found.settings, found.target, options, callback)));
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of updateLocationFieldValue, taking the location's id and the field's id, both checked to exist first.
   * @param {{ locationId: string, fieldId: string, value: string|null, customLabel?: string|null }} options
   * @param {function(Error=, object=)} callback - (error, location)
   */
  updateLocationFieldValueAdvanced(options, callback) {
    if (!requireStringParams(options, ['locationId', 'fieldId'], callback)) return;
    if (options.value === undefined) return failWith(callback, 'Missing required parameter: value');
    withLocationField(options, true, (err, found) => {
      if (err) return callback(err, undefined);
      requireLocationById(options.locationId, (findErr, record) => (findErr ? callback(findErr, undefined)
        : applyLocationFieldValue(record, found.settings, found.target, options, callback)));
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced. The batch form of updateLocationFieldValueAdvanced: every entry's value checked against its field and every location and field found before anything is written, the same location and field twice refused, then each applied in turn (reading the location afresh, so several fields of one location all stick).
   * @param {{ values: Array<{ locationId: string, fieldId: string, value: string|null, customLabel?: string|null }> }} options
   * @param {function(Error=, object=)} callback - (error, { values, succeeded, failed })
   */
  updateLocationFieldValuesAdvanced(options, callback) {
    if (!requireOptions(options, callback)) return;
    loadSettings((err, settings) => {
      if (err) return callback(err, undefined);
      runBatch({
        options,
        listName: 'values',
        validate: (entry) => {
          if (typeof entry.locationId !== 'string' || !entry.locationId) return 'Missing required parameter: locationId';
          if (typeof entry.fieldId !== 'string' || !entry.fieldId) return 'Missing required parameter: fieldId';
          if (entry.value === undefined) return 'Missing required parameter: value';
          const target = findLocationFieldById(settings, entry.fieldId);
          if (target.error) return target.error;
          if (entry.customLabel !== undefined && !target.field.enableCustomLabel) return `customLabel is not offered for "${target.field.label}"`;
          return checkFieldValue(target.field, entry.value).error || null;
        },
        keyOf: (entry) => `${entry.locationId}/${entry.fieldId}`,
        resolve: (entry, done) => requireLocationById(entry.locationId, done),
        apply: (record, entry, done) => requireLocationById(record.id, (readErr, fresh) => (readErr ? done(readErr)
          : applyLocationFieldValue(fresh, settings, findLocationFieldById(settings, entry.fieldId), entry, done)))
      }, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Moves a pinned location, named by its exact title, to a position in the pinned list and renumbers them all, as the list view tab's drag does (applyPinnedOrder). Only the control panel offers it, so no widget host: app users must not reorder the owner's pins. Background: it rearranges content, it reaches no one. usage: basic; its advanced alternative is updatePinnedLocationOrderAdvanced.
   * @param {{ title: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, { locations })
   */
  updatePinnedLocationOrder(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    if (options.position === undefined) return failWith(callback, 'Missing required parameter: position');
    resolveLocation(options.title, (err, record) => (err ? callback(err, undefined) : applyPinnedOrder(record, options.position, callback)));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updatePinnedLocationOrder, taking the location's id, checked to exist first.
   * @param {{ locationId: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, { locations })
   */
  updatePinnedLocationOrderAdvanced(options, callback) {
    if (!requireStringParams(options, ['locationId'], callback)) return;
    if (options.position === undefined) return failWith(callback, 'Missing required parameter: position');
    requireLocationById(options.locationId, (err, record) => (err ? callback(err, undefined) : applyPinnedOrder(record, options.position, callback)));
  },

  /* ----------------------------- Categories ----------------------------- */

  /**
   * hosts: controlBackground, headlessSdk. Adds a category as the categories tab does (createCategoryRecord). Only the control panel manages categories, so no widget host; Background, since it reaches no one. Uses only buildfire.publicData, which the server provides.
   * @param {{ title: string, icon?: string[], iconClassName?: string }} options
   * @param {function(Error=, object=)} callback - (error, category)
   */
  createCategory(options, callback) {
    if (!requireOptions(options, callback)) return;
    createCategoryRecord(options, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of createCategory, as the categories tab's import does it: every entry checked first, then each created through createCategoryRecord.
   * @param {{ categories: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  createCategoriesAdvanced(options, callback) {
    runBatch({
      options, listName: 'categories', validate: categoryCreateError, apply: (target, entry, done) => createCategoryRecord(entry, done)
    }, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. Renames a category or changes its icon, the category named by its exact title (applyCategoryUpdate). Same hosts as createCategory. usage: basic; its advanced alternative is updateCategoryAdvanced.
   * @param {{ title: string, newTitle?: string, newIcon?: string[], newIconClassName?: string }} options
   * @param {function(Error=, object=)} callback - (error, category)
   */
  updateCategory(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    const error = categoryUpdateError(options);
    if (error) return failWith(callback, error);
    resolveCategory(options.title, (err, record) => (err ? callback(err, undefined) : applyCategoryUpdate(record, options, callback)));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateCategory, taking the category's id, checked to exist first.
   * @param {{ categoryId: string, newTitle?: string, newIcon?: string[], newIconClassName?: string }} options
   * @param {function(Error=, object=)} callback - (error, category)
   */
  updateCategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId'], callback)) return;
    const error = categoryUpdateError(options);
    if (error) return failWith(callback, error);
    requireCategoryById(options.categoryId, (err, record) => (err ? callback(err, undefined) : applyCategoryUpdate(record, options, callback)));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of updateCategoryAdvanced.
   * @param {{ categories: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  updateCategoriesAdvanced(options, callback) {
    runBatch({
      options,
      listName: 'categories',
      validate: (entry) => (typeof entry.categoryId !== 'string' || !entry.categoryId ? 'Missing required parameter: categoryId' : categoryUpdateError(entry)),
      keyOf: (entry) => entry.categoryId,
      resolve: (entry, done) => requireCategoryById(entry.categoryId, done),
      apply: (record, entry, done) => applyCategoryUpdate(record, entry, done)
    }, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. Removes a category, named by its exact title, the way the categories tab does: marked deleted and kept behind the scenes (applyCategoryDelete). Same hosts as createCategory. usage: basic; its advanced alternative is deleteCategoryAdvanced.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, title })
   */
  deleteCategory(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    resolveCategory(options.title, (err, record) => (err ? callback(err, undefined) : applyCategoryDelete(record, callback)));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of deleteCategory, taking the category's id, checked to exist (and not already deleted) first.
   * @param {{ categoryId: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, title })
   */
  deleteCategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId'], callback)) return;
    requireCategoryById(options.categoryId, (err, record) => (err ? callback(err, undefined) : applyCategoryDelete(record, callback)));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of deleteCategoryAdvanced.
   * @param {{ categories: Array<{ categoryId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  deleteCategoriesAdvanced(options, callback) {
    runBatch({
      options,
      listName: 'categories',
      validate: (entry) => (typeof entry.categoryId !== 'string' || !entry.categoryId ? 'Missing required parameter: categoryId' : null),
      keyOf: (entry) => entry.categoryId,
      resolve: (entry, done) => requireCategoryById(entry.categoryId, done),
      apply: (record, entry, done) => applyCategoryDelete(record, done)
    }, callback);
  },

  /* ---------------------------- Subcategories --------------------------- */

  /**
   * hosts: controlBackground, headlessSdk. Adds a subcategory to a category named by its exact title: a read-modify-write of the category record, as the category form does (applySubcategoryCreate). Same hosts as createCategory. usage: basic; its advanced alternative is createSubcategoryAdvanced.
   * @param {{ categoryTitle: string, title: string }} options
   * @param {function(Error=, object=)} callback - (error, subcategory)
   */
  createSubcategory(options, callback) {
    if (!requireStringParams(options, ['categoryTitle', 'title'], callback)) return;
    resolveCategory(options.categoryTitle, (err, record) => (err ? callback(err, undefined) : applySubcategoryCreate(record, options, callback)));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of createSubcategory, taking the category's id, checked to exist first.
   * @param {{ categoryId: string, title: string }} options
   * @param {function(Error=, object=)} callback - (error, subcategory)
   */
  createSubcategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId', 'title'], callback)) return;
    requireCategoryById(options.categoryId, (err, record) => (err ? callback(err, undefined) : applySubcategoryCreate(record, options, callback)));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of createSubcategoryAdvanced, as the subcategory import does it; each entry reads its category afresh, so several entries for one category all stick.
   * @param {{ subcategories: Array<{ categoryId: string, title: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { subcategories, succeeded, failed })
   */
  createSubcategoriesAdvanced(options, callback) {
    runBatch({
      options,
      listName: 'subcategories',
      validate: (entry) => {
        if (typeof entry.categoryId !== 'string' || !entry.categoryId) return 'Missing required parameter: categoryId';
        return typeof entry.title !== 'string' || !entry.title ? 'Missing required parameter: title' : null;
      },
      resolve: (entry, done) => requireCategoryById(entry.categoryId, done),
      apply: (record, entry, done) => requireCategoryById(record.id, (err, fresh) => (err ? done(err) : applySubcategoryCreate(fresh, entry, done)))
    }, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. Renames a subcategory or changes its icon, named by its category's exact title and its own (applySubcategoryUpdate). usage: basic; its advanced alternative is updateSubcategoryAdvanced.
   * @param {{ categoryTitle: string, title: string, newTitle?: string, newIcon?: string[], newIconClassName?: string }} options
   * @param {function(Error=, object=)} callback - (error, subcategory)
   */
  updateSubcategory(options, callback) {
    if (!requireStringParams(options, ['categoryTitle', 'title'], callback)) return;
    const error = subcategoryUpdateError(options);
    if (error) return failWith(callback, error);
    resolveSubcategory(options.categoryTitle, options.title, (err, found) => (err ? callback(err, undefined)
      : applySubcategoryUpdate(found.record, found.subcategoryId, options, callback)));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateSubcategory, taking the category's and the subcategory's ids, checked to exist first.
   * @param {{ categoryId: string, subcategoryId: string, newTitle?: string, newIcon?: string[], newIconClassName?: string }} options
   * @param {function(Error=, object=)} callback - (error, subcategory)
   */
  updateSubcategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId', 'subcategoryId'], callback)) return;
    const error = subcategoryUpdateError(options);
    if (error) return failWith(callback, error);
    requireSubcategoryById(options.categoryId, options.subcategoryId, (err, found) => (err ? callback(err, undefined)
      : applySubcategoryUpdate(found.record, found.subcategoryId, options, callback)));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of updateSubcategoryAdvanced; each entry reads its category afresh.
   * @param {{ subcategories: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { subcategories, succeeded, failed })
   */
  updateSubcategoriesAdvanced(options, callback) {
    runBatch({
      options,
      listName: 'subcategories',
      validate: (entry) => {
        if (typeof entry.categoryId !== 'string' || !entry.categoryId) return 'Missing required parameter: categoryId';
        if (typeof entry.subcategoryId !== 'string' || !entry.subcategoryId) return 'Missing required parameter: subcategoryId';
        return subcategoryUpdateError(entry);
      },
      keyOf: (entry) => entry.subcategoryId,
      resolve: (entry, done) => requireSubcategoryById(entry.categoryId, entry.subcategoryId, done),
      apply: (found, entry, done) => requireCategoryById(found.record.id, (err, fresh) => (err ? done(err)
        : applySubcategoryUpdate(fresh, found.subcategoryId, entry, done)))
    }, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. Removes a subcategory from its category for good, named by both exact titles (applySubcategoryDelete). Locations keep their link to it, as in the plugin. usage: basic; its advanced alternative is deleteSubcategoryAdvanced.
   * @param {{ categoryTitle: string, title: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, title, categoryId })
   */
  deleteSubcategory(options, callback) {
    if (!requireStringParams(options, ['categoryTitle', 'title'], callback)) return;
    resolveSubcategory(options.categoryTitle, options.title, (err, found) => (err ? callback(err, undefined)
      : applySubcategoryDelete(found.record, found.subcategoryId, callback)));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of deleteSubcategory, taking both ids, checked to exist first.
   * @param {{ categoryId: string, subcategoryId: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, title, categoryId })
   */
  deleteSubcategoryAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId', 'subcategoryId'], callback)) return;
    requireSubcategoryById(options.categoryId, options.subcategoryId, (err, found) => (err ? callback(err, undefined)
      : applySubcategoryDelete(found.record, found.subcategoryId, callback)));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of deleteSubcategoryAdvanced; each entry reads its category afresh.
   * @param {{ subcategories: Array<{ categoryId: string, subcategoryId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { subcategories, succeeded, failed })
   */
  deleteSubcategoriesAdvanced(options, callback) {
    runBatch({
      options,
      listName: 'subcategories',
      validate: (entry) => {
        if (typeof entry.categoryId !== 'string' || !entry.categoryId) return 'Missing required parameter: categoryId';
        return typeof entry.subcategoryId !== 'string' || !entry.subcategoryId ? 'Missing required parameter: subcategoryId' : null;
      },
      keyOf: (entry) => entry.subcategoryId,
      resolve: (entry, done) => requireSubcategoryById(entry.categoryId, entry.subcategoryId, done),
      apply: (found, entry, done) => requireCategoryById(found.record.id, (err, fresh) => (err ? done(err)
        : applySubcategoryDelete(fresh, found.subcategoryId, done)))
    }, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. Moves a subcategory, named by both exact titles, to a position in its category's list (applySubcategoryOrder). It rewrites the order of the whole list, so it has no batch form. usage: basic; its advanced alternative is updateSubcategoryOrderAdvanced.
   * @param {{ categoryTitle: string, title: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, { categoryId, categoryTitle, subcategories })
   */
  updateSubcategoryOrder(options, callback) {
    if (!requireStringParams(options, ['categoryTitle', 'title'], callback)) return;
    if (options.position === undefined) return failWith(callback, 'Missing required parameter: position');
    resolveSubcategory(options.categoryTitle, options.title, (err, found) => (err ? callback(err, undefined)
      : applySubcategoryOrder(found.record, found.subcategoryId, options.position, callback)));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateSubcategoryOrder, taking both ids, checked to exist first.
   * @param {{ categoryId: string, subcategoryId: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, { categoryId, categoryTitle, subcategories })
   */
  updateSubcategoryOrderAdvanced(options, callback) {
    if (!requireStringParams(options, ['categoryId', 'subcategoryId'], callback)) return;
    if (options.position === undefined) return failWith(callback, 'Missing required parameter: position');
    requireSubcategoryById(options.categoryId, options.subcategoryId, (err, found) => (err ? callback(err, undefined)
      : applySubcategoryOrder(found.record, found.subcategoryId, options.position, callback)));
  },

  /* --------------------------- Location fields -------------------------- */

  /**
   * hosts: controlBackground, headlessSdk. Adds a location field to the settings, as the Location Fields tab does (applyLocationFieldCreate): a read-modify-write of the settings record. The datastore is read-only from the app and only the control panel offers it, so no widget host; Background.
   * @param {{ group: string, label: string, type: string, required?: boolean, enableCustomLabel?: boolean }} options
   * @param {function(Error=, object=)} callback - (error, location field)
   */
  createLocationField(options, callback) {
    if (!requireOptions(options, callback)) return;
    applyLocationFieldCreate(options, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of createLocationField: every entry checked first (with room for all of them under the limit of 10), then each added in turn.
   * @param {{ fields: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { fields, succeeded, failed })
   */
  createLocationFieldsAdvanced(options, callback) {
    if (!requireOptions(options, callback)) return;
    loadSettings((err, settings) => {
      if (err) return callback(err, undefined);
      const room = MAX_LOCATION_FIELDS - settings.customFields.quickActions.length - settings.customFields.content.length;
      const { fields } = options;
      if (Array.isArray(fields) && fields.length >= 1 && fields.length <= MAX_LOCATION_FIELDS && fields.length > room) {
        return failWith(callback, `Up to ${MAX_LOCATION_FIELDS} location fields can be added; there is room for ${Math.max(room, 0)} more`);
      }
      runBatch({
        options,
        listName: 'fields',
        maxValue: MAX_LOCATION_FIELDS,
        validate: locationFieldCreateError,
        apply: (target, entry, done) => applyLocationFieldCreate(entry, done)
      }, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Changes a location field, named by its exact label (applyLocationFieldUpdate). Same hosts as createLocationField. usage: basic; its advanced alternative is updateLocationFieldAdvanced.
   * @param {{ fieldName: string, newLabel?: string, newType?: string, required?: boolean, enableCustomLabel?: boolean }} options
   * @param {function(Error=, object=)} callback - (error, location field)
   */
  updateLocationField(options, callback) {
    if (!requireStringParams(options, ['fieldName'], callback)) return;
    const error = locationFieldUpdateError(options);
    if (error) return failWith(callback, error);
    withLocationField(options, false, (err, found) => (err ? callback(err, undefined) : applyLocationFieldUpdate(found.settings, found.target, options, callback)));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateLocationField, taking the field's id, checked to exist first.
   * @param {{ fieldId: string, newLabel?: string, newType?: string, required?: boolean, enableCustomLabel?: boolean }} options
   * @param {function(Error=, object=)} callback - (error, location field)
   */
  updateLocationFieldAdvanced(options, callback) {
    if (!requireStringParams(options, ['fieldId'], callback)) return;
    const error = locationFieldUpdateError(options);
    if (error) return failWith(callback, error);
    withLocationField(options, true, (err, found) => (err ? callback(err, undefined) : applyLocationFieldUpdate(found.settings, found.target, options, callback)));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of updateLocationFieldAdvanced; each entry reads the settings afresh.
   * @param {{ fields: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { fields, succeeded, failed })
   */
  updateLocationFieldsAdvanced(options, callback) {
    runBatch({
      options,
      listName: 'fields',
      maxValue: MAX_LOCATION_FIELDS,
      validate: (entry) => (typeof entry.fieldId !== 'string' || !entry.fieldId ? 'Missing required parameter: fieldId' : locationFieldUpdateError(entry)),
      keyOf: (entry) => entry.fieldId,
      resolve: (entry, done) => withLocationField(entry, true, done),
      apply: (found, entry, done) => withLocationField(entry, true, (err, fresh) => (err ? done(err) : applyLocationFieldUpdate(fresh.settings, fresh.target, entry, done)))
    }, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. Removes a location field for good, named by its exact label (applyLocationFieldDelete). usage: basic; its advanced alternative is deleteLocationFieldAdvanced.
   * @param {{ fieldName: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, label, group })
   */
  deleteLocationField(options, callback) {
    if (!requireStringParams(options, ['fieldName'], callback)) return;
    withLocationField(options, false, (err, found) => (err ? callback(err, undefined) : applyLocationFieldDelete(found.settings, found.target, callback)));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of deleteLocationField, taking the field's id, checked to exist first.
   * @param {{ fieldId: string }} options
   * @param {function(Error=, object=)} callback - (error, { id, label, group })
   */
  deleteLocationFieldAdvanced(options, callback) {
    if (!requireStringParams(options, ['fieldId'], callback)) return;
    withLocationField(options, true, (err, found) => (err ? callback(err, undefined) : applyLocationFieldDelete(found.settings, found.target, callback)));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced. The batch form of deleteLocationFieldAdvanced; each entry reads the settings afresh.
   * @param {{ fields: Array<{ fieldId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { fields, succeeded, failed })
   */
  deleteLocationFieldsAdvanced(options, callback) {
    runBatch({
      options,
      listName: 'fields',
      maxValue: MAX_LOCATION_FIELDS,
      validate: (entry) => (typeof entry.fieldId !== 'string' || !entry.fieldId ? 'Missing required parameter: fieldId' : null),
      keyOf: (entry) => entry.fieldId,
      resolve: (entry, done) => withLocationField(entry, true, done),
      apply: (found, entry, done) => withLocationField(entry, true, (err, fresh) => (err ? done(err) : applyLocationFieldDelete(fresh.settings, fresh.target, done)))
    }, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. Moves a location field, named by its exact label, to a position within its group (applyLocationFieldOrder). It rewrites the group's order, so it has no batch form. usage: basic; its advanced alternative is updateLocationFieldOrderAdvanced.
   * @param {{ fieldName: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, { group, fields })
   */
  updateLocationFieldOrder(options, callback) {
    if (!requireStringParams(options, ['fieldName'], callback)) return;
    if (options.position === undefined) return failWith(callback, 'Missing required parameter: position');
    withLocationField(options, false, (err, found) => (err ? callback(err, undefined) : applyLocationFieldOrder(found.settings, found.target, options.position, callback)));
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateLocationFieldOrder, taking the field's id, checked to exist first.
   * @param {{ fieldId: string, position: number }} options
   * @param {function(Error=, object=)} callback - (error, { group, fields })
   */
  updateLocationFieldOrderAdvanced(options, callback) {
    if (!requireStringParams(options, ['fieldId'], callback)) return;
    if (options.position === undefined) return failWith(callback, 'Missing required parameter: position');
    withLocationField(options, true, (err, found) => (err ? callback(err, undefined) : applyLocationFieldOrder(found.settings, found.target, options.position, callback)));
  },

  /* ------------------------------ Settings ------------------------------ */

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. The plugin's settings as both frames load them (loadSettings): the stored record with the plugin's defaults and its field-settings migration applied, without saving anything. Applying the defaults needs code, which is why it is a function. A datastore read works in both frames and on the server; Background.
   * @param {object} options - none
   * @param {function(Error=, object=)} callback - (error, settings)
   */
  getSettings(options, callback) {
    if (!requireOptions(options || {}, callback)) return;
    loadSettings((err, settings) => (err ? callback(err, undefined) : callback(null, settingsResult(settings))));
  },

  /**
   * hosts: controlBackground, headlessSdk. Changes the settings the control panel's settings, design and list view tabs edit, only those passed: reads the settings (with defaults), applies each with its form's checks and knock-on effects (no nearest sorting makes alphabetical the default; turning a location field off turns it off for app users; charging needs location adding switched on), saves the whole record as every tab does, then sends each touched tab's refresh message. Access settings (who may add, edit or see) and the purchase options are not taken. The datastore is read-only from the app, so no widget host; Background: it changes configuration and reaches no one.
   * @param {object} options - one optional param per setting, at least one
   * @param {function(Error=, object=)} callback - (error, settings)
   */
  updateSettings(options, callback) {
    if (!requireOptions(options, callback)) return;
    const names = Object.keys(SETTINGS_PARAMS).filter((name) => options[name] !== undefined);
    if (!names.length) return failWith(callback, `Pass at least one setting to change: ${Object.keys(SETTINGS_PARAMS).join(', ')}`);
    const invalid = names.map((name) => checkSetting(name, SETTINGS_PARAMS[name], options[name])).find(Boolean);
    if (invalid) return failWith(callback, invalid);
    loadSettings((err, settings) => {
      if (err) return callback(err, undefined);
      names.forEach((name) => SETTINGS_PARAMS[name].apply(settings, options[name]));
      // The sorting tab turns the distance option off with "Nearest to User Location", and switches the default to alphabetical.
      if (!settings.sorting.allowSortByNearest) {
        if (options.defaultSorting === 'distance') return failWith(callback, 'defaultSorting cannot be distance while allowSortByNearest is off');
        settings.sorting.defaultSorting = 'alphabetical';
      }
      // The location settings tab offers charging only while app users may add locations.
      if (options.chargeForNewLocations !== undefined && options.chargeForNewLocations !== 'none' && settings.globalEntries.locations.allowAdding === 'none') {
        return failWith(callback, 'chargeForNewLocations can only be none while app users cannot add locations');
      }
      getActor((actor) => saveSettings(settings, actor, (saveErr, saved) => {
        if (saveErr) return callback(saveErr, undefined);
        const scopes = names.map((name) => SETTINGS_PARAMS[name].scope).filter((scope, index, all) => all.indexOf(scope) === index);
        scopes.forEach((scope) => syncWidget({ scope }));
        callback(null, settingsResult(saved));
      }));
    });
  },

  /* ------------------------------ Language ------------------------------ */

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Every text label the app shows, with the text it shows now and its default, as the Language tab lists them (loadStrings, shownText). A datastore read works in both frames and on the server; Background.
   * @param {object} options - none
   * @param {function(Error=, object=)} callback - (error, { strings })
   */
  getLanguageStrings(options, callback) {
    if (!requireOptions(options || {}, callback)) return;
    loadStrings((err, loaded) => {
      if (err) return callback(err, undefined);
      callback(null, {
        strings: STRING_KEYS.map((key) => {
          const [section, label] = key.split('.');
          const entry = loaded.data[section][label];
          const config = STRINGS_CONFIG[section].labels[label];
          return {
            key, section: STRINGS_CONFIG[section].title, label: config.title, value: shownText(entry), defaultValue: config.defaultValue, required: !!config.required
          };
        })
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Changes the text of one label the app shows, as the Language tab's field does: within the label's length limit; a label the tab requires cannot be emptied, an optional one empties to show nothing. Saves the whole language record as the tab's Save does (Strings#save, datastore.save, which also makes the record the first time; the tab's createLanguage inserts an identical first record, which save makes unnecessary), then refreshes the widget's strings. The datastore is read-only from the app, so no widget host; Background.
   * @param {{ key: string, value: string|null }} options
   * @param {function(Error=, object=)} callback - (error, { key, value })
   */
  updateLanguageString(options, callback) {
    if (!requireStringParams(options, ['key'], callback)) return;
    const keyError = checkEnum('key', options.key, STRING_KEYS);
    if (keyError) return failWith(callback, `key must be one of the app's text labels, such as general.search; got "${options.key}"`);
    if (options.value === undefined) return failWith(callback, 'Missing required parameter: value');
    const [section, label] = options.key.split('.');
    const config = STRINGS_CONFIG[section].labels[label];
    const value = options.value === null ? '' : options.value;
    if (typeof value !== 'string') return failWith(callback, 'value must be text, null or an empty string');
    if (!value && config.required) return failWith(callback, `value cannot be empty for "${config.title}", which the app needs`);
    if (config.maxLength && value.length > config.maxLength) return failWith(callback, `value must be at most ${config.maxLength} characters for "${config.title}"`);
    loadStrings((err, loaded) => {
      if (err) return callback(err, undefined);
      loaded.data[section][label].value = value;
      const done = (saveErr) => {
        if (saveErr) return callback(saveErr, undefined);
        syncWidget({ scope: 'strings' });
        callback(null, { key: options.key, value: shownText(loaded.data[section][label]) });
      };
      buildfire.datastore.save(loaded.data, STRINGS_TAG, done);
    });
  }
};

/**
 * What the control panel's frame (control/contract.html) dispatches to: init plus every function whose hosts include controlForeground or controlBackground, in plugin.contract.json order. The implementations are widgetContract's own. Every function here has a control host.
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
  updateLocationFieldValue: widgetContract.updateLocationFieldValue,
  updateLocationFieldValueAdvanced: widgetContract.updateLocationFieldValueAdvanced,
  updateLocationFieldValuesAdvanced: widgetContract.updateLocationFieldValuesAdvanced,
  updatePinnedLocationOrder: widgetContract.updatePinnedLocationOrder,
  updatePinnedLocationOrderAdvanced: widgetContract.updatePinnedLocationOrderAdvanced,
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
  getLanguageStrings: widgetContract.getLanguageStrings,
  updateLanguageString: widgetContract.updateLanguageString
};
