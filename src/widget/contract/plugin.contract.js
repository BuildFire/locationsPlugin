/* eslint-disable no-undef, max-len, no-use-before-define, no-underscore-dangle */
/**
 * Locations contract — runtime implementation.
 *
 * Storage: locations live in the app-wide buildfire.publicData collection
 * 'locations' (hard-deleted); categories, each holding its subcategories, live
 * in the app-wide buildfire.publicData collection 'categories' (soft-deleted: a
 * removed category is kept with deletedOn set). The instance's settings, design,
 * introduction screen and location fields (custom fields) live in one
 * buildfire.datastore document under the 'settings' tag, scoped to this plugin
 * instance. Basic operations name records by exact title or label; their
 * `…Advanced` alternatives and every batch take record ids.
 *
 * This file only implements the operations declared with "type": "function" in
 * plugin.contract.json. Operations typed publicData / datastore / userData /
 * appData / firebase are declarative: their platform call is built on the fly
 * from context.query, so they intentionally have no counterpart here
 * (searchCategories is the one declarative operation).
 *
 * Each function operation is dispatched by its context.functionName, receives
 * (options, callback), may nest any number of buildfire.* calls, and may run
 * its own logic between them. Each one declares a context.hosts in
 * plugin.contract.json, which is what the `hosts:` tag on the JSDoc below
 * refers to. An operation lists every place it can run: at most one widget
 * host, at most one control host, and headlessSdk when it is server-safe
 * (generic always stands alone):
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
 * headlessSdk is left out when the operation needs frame state (device,
 * localStorage, bookmarks, the actual signed-in session, UI) or handles
 * user-sensitive data / critical behavior that must not be reachable remotely.
 *
 * Only operations whose hosts include generic or headlessSdk are exposed to
 * the MCP.
 *
 * `buildfire` is resolved as a global: in the widget/control hosts it comes from
 * the injected SDK, and on the server the headless SDK provides it.
 * `widgetContract`, `controlContract` and `frameId` are assigned as implicit
 * globals for the same reason — the consumer reaches them without importing
 * this file. The widget frame (widget/contract.html) and the server dispatch
 * to widgetContract; the control panel's frame (control/contract.html) loads
 * this same file and dispatches to controlContract.
 *
 * Every function is Node-style: callback(error, result), invoked exactly once,
 * never with both error and result populated. Invalid input is reported through
 * the callback rather than thrown synchronously.
 *
 * Every option a function reads here must be declared in that operation's
 * `parameters` block, or a caller cannot pass it: the MCP server refuses any
 * param the contract does not declare.
 *
 * How the operations are built: every write is an "action" — validate (no I/O),
 * resolve (find the records it names, refusing no match and ambiguity), and
 * apply (re-read, write, then the plugin's own side effects). runAction runs one
 * action for a single operation; runBatch runs the same action for every entry
 * of a batch, validating every entry and checking every id before the first write, so
 * a single operation and its batch always behave identically per record. Batches are
 * advanced only: each repeats the action's advanced form (record ids, never titles).
 */

// Must match the collection names in plugin.contract.json and the plugin's repositories
// (src/widget/js/global/repository/Locations.js, Categories.js, Settings.js).
const LOCATIONS_TAG = 'locations';
const CATEGORIES_TAG = 'categories';
const SETTINGS_TAG = 'settings';

const MAX_BATCH = 50;
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;
// The control panel's "Pin to Top" allows three pinned locations (content/js/locations/index.js).
const MAX_PINNED = 3;
// The Location Fields page disables both add buttons at ten fields in total (settings/js/pages/locationFields.js).
const MAX_LOCATION_FIELDS = 10;
// Intro screen "Area Radius (miles)" input clamps to 1..200 (content/js/listView/introMap.js).
const MIN_AREA_RADIUS_MILES = 1;
const MAX_AREA_RADIUS_MILES = 200;
const METERS_PER_MILE = 1609.34;
const EARTH_RADIUS_MILES = 3963.2;

// Price radios ($ .. $$$$) and currency dropdown, in both the control panel and the in-app forms.
const PRICE_RANGES = [1, 2, 3, 4];
const CURRENCIES = ['$', '€'];
const MARKER_TYPES = ['pin', 'circle', 'image'];
// Control panel default for a circle marker (content/js/locations/index.js state.defaultCircleMarkerColor).
const DEFAULT_MARKER_COLOR = 'rgba(253,35,5,1)';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DEFAULT_HOURS = { from: '08:00', to: '20:00' };

// Mirrors src/widget/js/global/constants: field types per Location Fields section.
const FIELD_SECTIONS = {
  quickActions: ['EMAIL', 'PHONE', 'URL'],
  content: ['EMAIL', 'PHONE', 'URL', 'TEXT', 'RICH_TEXT']
};

// Only index-backed sorts; locations index string1 = lower-cased title, date1 = createdOn.
const LOCATION_SORTS = {
  alphabetical: { '_buildfire.index.string1': 1 },
  reverseAlphabetical: { '_buildfire.index.string1': -1 },
  newest: { '_buildfire.index.date1': -1 },
  oldest: { '_buildfire.index.date1': 1 }
};

// Settings tab radio groups and the Design tab, by the values their inputs carry.
const DEFAULT_SORTINGS = ['distance', 'alphabetical'];
const MEASUREMENT_UNITS = ['metric', 'imperial'];
const LIST_VIEW_POSITIONS = ['expanded', 'collapsed', 'halfExpanded'];
const LIST_VIEW_STYLES = ['backgroundImage', 'smallImage'];
const MAP_TYPES = ['streets', 'satellite'];
const DETAILS_MAP_POSITIONS = ['top', 'bottom'];
const INTRO_SORTINGS = ['distance', 'alphabetical', 'newest'];
const INTRO_SOURCES = ['All', 'UserPosition', 'AreaRadius', 'MyLocations'];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isGiven = (value) => value !== undefined;
// null always clears; '' clears only string-valued params (rule 25).
const isCleared = (value) => value === null || value === '';
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';
const toError = (err) => (err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err)));

const requireCallback = (callback) => {
  // Nothing to report through; fail loudly only in this one unrecoverable case.
  if (typeof callback !== 'function') throw new TypeError('callback must be a function');
};

/** Mirrors generateUUID in src/widget/js/global/helpers.js, so ids look like the plugin's own. */
const generateUUID = () => {
  let dt = new Date().getTime();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const replace = (dt + Math.random() * 16) % 16 | 0; // eslint-disable-line no-bitwise
    dt = Math.floor(dt / 16);
    return (c === 'x' ? replace : (replace & 0x3) | 0x8).toString(16); // eslint-disable-line no-bitwise
  });
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stripHtml = (html) => (html ? String(html).replace(/(<([^>]+)>)/gi, '') : '');

/** Runs fn(item, index, next) over items one after another, then done(). */
const forEachSeries = (items, fn, done) => {
  const step = (index) => {
    if (index >= items.length) return done();
    fn(items[index], index, () => step(index + 1));
  };
  step(0);
};

/**
 * Fire a plugin contract event (see plugin.contract.json). Mirrors sendContractEvent in
 * src/widget/js/global/helpers.js: the contract service in this workspace's SDK ships no
 * events API, so every send is feature-checked.
 */
const sendContractEvent = (name, data) => {
  try {
    if (buildfire.services && buildfire.services.contract && buildfire.services.contract.events) {
      buildfire.services.contract.events.send(name, data);
    }
  } catch (e) { /* an event that cannot be sent must not fail the action that caused it */ }
};

/** Tell the widget to refresh, as every control-panel save does; only the control frame has a widget to tell. */
const syncWidget = (message) => {
  try {
    if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') {
      buildfire.messaging.sendMessageToWidget(message);
      return true;
    }
  } catch (e) { /* no widget to message on the server or in the widget frame */ }
  return false;
};

/**
 * Ask the person watching the frame to approve a Foreground operation before it changes anything.
 * On the MCP server the headless SDK has no UI (no window, no buildfire.dialog), so this skips the
 * confirmation and proceeds: the MCP server asks the app owner itself, driven by the flags.
 * @param {string} message - one plain sentence naming what is about to happen.
 * @param {function(Error=)} callback - (error); error is set when they cancel or the dialog fails.
 */
const requireUserApproval = (message, callback) => {
  const hasDialog = typeof window !== 'undefined'
    && buildfire.dialog && typeof buildfire.dialog.confirm === 'function';
  if (!hasDialog) return callback(null);

  buildfire.dialog.confirm({ message }, (err, isConfirmed) => {
    if (err) return callback(new Error(`Could not ask for approval: ${err}`));
    if (!isConfirmed) return callback(new Error('Cancelled: the user did not approve this operation'));
    callback(null);
  });
};

/**
 * searchEngine.js and pushNotifications.js are not part of buildfire.min.js, and contract.html may
 * only load three scripts, so in a frame they are loaded on first use from the same scripts/ folder
 * buildfire.min.js came from. On the server the headless SDK provides them, or does not.
 */
const SDK_SERVICES = {
  searchEngine: {
    path: 'buildfire/services/searchEngine/searchEngine.js',
    ready: () => !!(buildfire.services && buildfire.services.searchEngine)
  },
  pushNotifications: {
    path: 'buildfire/services/notifications/pushNotifications.js',
    ready: () => !!(buildfire.notifications && buildfire.notifications.pushNotification
      && typeof buildfire.notifications.pushNotification.schedule === 'function')
  }
};

const ensureSdkService = (name, callback) => {
  const service = SDK_SERVICES[name];
  if (service.ready()) return callback(null);
  if (typeof document === 'undefined') return callback(new Error(`The ${name} service is not available here`));

  const sdkScript = Array.prototype.slice.call(document.getElementsByTagName('script'))
    .find((script) => /buildfire\.min\.js/.test(script.src || ''));
  if (!sdkScript) return callback(new Error(`The ${name} service is not available here`));

  const script = document.createElement('script');
  script.src = sdkScript.src.replace(/buildfire\.min\.js.*$/, service.path);
  script.onload = () => callback(service.ready() ? null : new Error(`The ${name} service did not load`));
  script.onerror = () => callback(new Error(`The ${name} service could not be loaded`));
  document.head.appendChild(script);
};

// ---------------------------------------------------------------------------
// Param checks (validation only, no I/O). Each returns an error message or null.
// ---------------------------------------------------------------------------

const checkString = (entry, name, { required = false } = {}) => {
  const value = entry[name];
  if (!isGiven(value)) return required ? `Missing required parameter: ${name}` : null;
  if (typeof value !== 'string') return `${name} must be text`;
  if (required && !value.trim()) return `Missing required parameter: ${name}`;
  return null;
};

const checkNumber = (entry, name, {
  required = false, min, max, integer = false
} = {}) => {
  const value = entry[name];
  if (!isGiven(value)) return required ? `Missing required parameter: ${name}` : null;
  if (typeof value !== 'number' || Number.isNaN(value)) return `${name} must be a number`;
  if (integer && !Number.isInteger(value)) return `${name} must be a whole number`;
  if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
    return `${name} must be between ${min} and ${max}`;
  }
  return null;
};

const checkBoolean = (entry, name) => {
  const value = entry[name];
  if (!isGiven(value)) return null;
  return typeof value === 'boolean' ? null : `${name} must be true or false`;
};

const checkSelect = (entry, name, values, { required = false } = {}) => {
  const value = entry[name];
  if (!isGiven(value)) return required ? `Missing required parameter: ${name}` : null;
  return values.indexOf(value) === -1 ? `${name} must be one of: ${values.join(', ')}` : null;
};

const checkImage = (entry, name, { required = false } = {}) => {
  const value = entry[name];
  if (!isGiven(value)) return required ? `Missing required parameter: ${name}` : null;
  return isNonEmptyString(value) ? null : `${name} must be an image URL`;
};

const checkImageList = (entry, name) => {
  const value = entry[name];
  if (!isGiven(value)) return null;
  if (!Array.isArray(value)) return `${name} must be a list of image URLs`;
  return value.every(isNonEmptyString) ? null : `${name} must hold only image URLs`;
};

const ACTION_REQUIREMENTS = {
  linkToWeb: 'url', sendEmail: 'email', callNumber: 'phoneNumber', sendSMS: 'phoneNumber', navigateToAddress: 'address'
};
const checkActionItem = (item) => {
  if (!isObject(item) || !isNonEmptyString(item.action)) return 'each action item needs an action';
  const needed = ACTION_REQUIREMENTS[item.action];
  if (needed && !isGiven(item[needed])) return `a ${item.action} action item needs ${needed}`;
  return null;
};
const checkActionList = (entry, name) => {
  const value = entry[name];
  if (!isGiven(value)) return null;
  if (!Array.isArray(value)) return `${name} must be a list of action items`;
  const problem = value.map(checkActionItem).find(Boolean);
  return problem ? `${name}: ${problem}` : null;
};

/** For a nullable update param: null clears it, '' too when string-valued; anything else must pass check. */
const checkNullable = (entry, name, check, { stringValued = true } = {}) => {
  const value = entry[name];
  if (value === null || (stringValued && value === '')) return null;
  if (value === '' && !stringValued) return `${name} can only be cleared with null`;
  return check(entry, name);
};

/** A non-nullable update param passed as null or '' is refused, never ignored (rule 25). */
const findClearedProblem = (entry, names) => {
  const cleared = names.find((name) => isCleared(entry[name]));
  return cleared ? `${cleared} cannot be removed; pass a value or leave it out` : null;
};

const firstProblem = (checks) => checks.find(Boolean) || null;

const requireAnyGiven = (entry, names) => (names.some((name) => isGiven(entry[name]))
  ? null
  : `Pass at least one of: ${names.join(', ')}`);

const RGB_COLOR = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i;

// ---------------------------------------------------------------------------
// Opening hours: "HH:MM-HH:MM, HH:MM-HH:MM" or "closed", stored as times of day on 1970-01-01 UTC
// (mirrors src/utils/datetime.js convertTimeToDate / convertDateToTime).
// ---------------------------------------------------------------------------

const timeToDate = (time) => {
  const [hour, min] = time.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, hour, min));
};

const dateToTime = (date) => {
  const time = new Date(date);
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(time.getUTCHours())}:${pad(time.getUTCMinutes())}`;
};

/** Mirrors getDefaultOpeningHours (control/content/utils/helpers.js): every day open 08:00-20:00. */
const defaultOpeningHours = () => {
  const days = {};
  DAYS.forEach((day, index) => {
    days[day] = { index, active: true, intervals: [{ from: timeToDate(DEFAULT_HOURS.from), to: timeToDate(DEFAULT_HOURS.to) }] };
  });
  return { timezone: null, days };
};

const hoursView = (openingHours) => {
  const view = {};
  const days = (openingHours && openingHours.days) || {};
  DAYS.forEach((day) => {
    const value = days[day];
    if (!value || !value.active || !value.intervals || !value.intervals.length) {
      view[day] = 'closed';
    } else {
      view[day] = value.intervals.filter(Boolean).map((i) => `${dateToTime(i.from)}-${dateToTime(i.to)}`).join(', ');
    }
  });
  return view;
};

/**
 * Mirrors buildOpenNowCriteria (src/widget/services/search/shared.js): the current time of day,
 * encoded on 1970-01-01 UTC from the local clock of wherever this runs.
 */
const openNowKeys = () => {
  const now = new Date();
  const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
  return { dayName, at: new Date(Date.UTC(1970, 0, 1, now.getHours(), now.getMinutes())) };
};

const isOpenNow = (openingHours) => {
  const { dayName, at } = openNowKeys();
  const day = openingHours && openingHours.days && openingHours.days[dayName];
  if (!day || !day.active || !day.intervals) return false;
  return day.intervals.filter(Boolean).some((i) => new Date(i.from) <= at && new Date(i.to) > at);
};

// ---------------------------------------------------------------------------
// Location model — mirrors src/widget/js/global/data/Location.js, so a document written here is
// indistinguishable from one the control panel writes (same defaults, same _buildfire index).
// ---------------------------------------------------------------------------

const normalizeLocation = (data = {}) => ({
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
  isActive: [0, 1].indexOf(data.isActive) !== -1 ? data.isActive : 1,
  additionalFields: {
    quickActions: ((data.additionalFields && data.additionalFields.quickActions) || []).map(normalizeFieldValue),
    content: ((data.additionalFields && data.additionalFields.content) || []).map(normalizeFieldValue)
  }
});

function normalizeFieldValue(field = {}) {
  return { id: field.id || null, customLabel: field.customLabel || null, value: field.value || null };
}

/** Location.toJSON(): the stored document, including the index the plugin searches by. */
const locationDocument = (loc) => {
  const { id, ...rest } = loc; // eslint-disable-line no-unused-vars
  return {
    ...rest,
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
      geo: { type: 'Point', coordinates: [loc.coordinates.lng, loc.coordinates.lat] }
    }
  };
};

/** Mirrors applyMarkerColors (content/js/locations/index.js), which the CSV import uses for a marker color. */
const markerColor = (color) => {
  const [r, g, b] = (color.match(/\d+/g) || []).map(Number);
  const alpha = color.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(\d?\.?\d+)\s*\)/);
  return {
    backgroundCSS: `background: ${color}`,
    color,
    colorCSS: `color: ${color}`,
    colorHex: `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`,
    opacity: alpha ? String(Math.round(parseFloat(alpha[1]) * 100)) : '100'
  };
};

const toImageItems = (urls) => urls.map((imageUrl) => ({ id: generateUUID(), imageUrl }));
// The control panel gives every action item an id before saving it (addActionItemsBtn).
const toActionItems = (items) => items.map((item) => ({ ...item, id: item.id || generateUUID() }));

/** What a caller sees for one location: plain values, category titles instead of ids. */
const locationView = (id, data, categoriesById, fieldsById) => {
  const loc = normalizeLocation(data);
  const categoryTitles = [];
  const subcategoryTitles = [];
  loc.categories.main.forEach((categoryId) => {
    if (categoriesById[categoryId]) categoryTitles.push(categoriesById[categoryId].title);
  });
  loc.categories.subcategories.forEach((subId) => {
    Object.keys(categoriesById).forEach((categoryId) => {
      const sub = (categoriesById[categoryId].subcategories || []).find((s) => s.id === subId);
      if (sub) subcategoryTitles.push(sub.title);
    });
  });
  const fieldValues = [];
  ['quickActions', 'content'].forEach((section) => {
    loc.additionalFields[section].forEach((value) => {
      const field = fieldsById && fieldsById[value.id];
      if (field && value.value !== null) {
        fieldValues.push({ label: field.label, value: value.value, customLabel: value.customLabel });
      }
    });
  });
  return {
    id,
    title: loc.title,
    subtitle: loc.subtitle,
    address: loc.address,
    addressAlias: loc.addressAlias,
    latitude: loc.coordinates.lat,
    longitude: loc.coordinates.lng,
    description: loc.description,
    listImage: loc.listImage,
    images: loc.images.map((image) => image.imageUrl),
    categoryTitles,
    subcategoryTitles,
    priceRange: loc.price.range,
    priceCurrency: loc.price.currency,
    rating: loc.rating.average,
    ratingCount: loc.rating.count,
    pinned: !!loc.pinIndex,
    pinPosition: loc.pinIndex,
    isOpenNow: isOpenNow(loc.openingHours),
    hours: hoursView(loc.openingHours),
    markerType: loc.marker.type,
    actionItems: loc.actionItems,
    fieldValues,
    subscriberCount: loc.subscribers.length,
    createdOn: loc.createdOn,
    lastUpdatedOn: loc.lastUpdatedOn
  };
};

// ---------------------------------------------------------------------------
// Settings model — mirrors src/widget/js/global/data/Settings.js plus Settings.migrateFieldSettings
// (src/widget/js/global/repository/Settings.js).
// ---------------------------------------------------------------------------

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

const normalizeCustomField = (field = {}) => ({
  id: field.id || null,
  label: field.label || null,
  type: field.type || null,
  required: field.required || false,
  enableCustomLabel: field.enableCustomLabel || false,
  visibility: field.visibility || { value: 'ALL', tags: [] }
});

const normalizeSettings = (data = {}) => {
  const intro = data.introductoryListView || {
    images: [],
    description: null,
    sorting: 'distance',
    searchOptions: { mode: 'UserPosition', areaRadiusOptions: {} }
  };
  if (!(data.introductoryListView && data.introductoryListView.visibilityOptions)) {
    intro.visibilityOptions = {
      tags: [],
      value: (data.showIntroductoryListView === true || typeof data.showIntroductoryListView === 'undefined') ? 'ALL' : 'NONE'
    };
  } else {
    intro.visibilityOptions = {
      tags: intro.visibilityOptions.tags || [],
      value: intro.visibilityOptions.value || 'ALL'
    };
  }
  const globalEntries = data.globalEntries || {
    locations: { allowAdding: 'none', tags: [] },
    photos: { allowAdding: 'none', tags: [] },
    openHours: { enabled: true, inAppEnabled: 'all', tags: [] },
    priceRange: { enabled: true, inAppEnabled: 'all', tags: [] },
    charging: {
      enabled: 'none', tags: [], description: '', subscriptionOptions: []
    }
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
  const customFields = data.customFields || {};
  return {
    subscription: data.subscription || { enabled: false, allowCustomNotifications: false },
    measurementUnit: data.measurementUnit || 'metric',
    introductoryListView: intro,
    sorting: data.sorting || {
      defaultSorting: 'distance',
      hideSorting: false,
      allowSortByReverseAlphabetical: true,
      allowSortByNearest: true,
      allowSortByPriceLowToHigh: true,
      allowSortByPriceHighToLow: true,
      allowSortByDate: true,
      allowSortByRating: true,
      allowSortByViews: true
    },
    filter: data.filter || {
      allowFilterByArea: true, allowFilterByBookmarks: false, hideOpeningHoursFilter: false, hidePriceFilter: false
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
      quickActions: (customFields.quickActions || []).map(normalizeCustomField),
      content: (customFields.content || []).map(normalizeCustomField)
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
      showContributorName: false
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
    isActive: [0, 1].indexOf(data.isActive) !== -1 ? data.isActive : 1,
    _buildfire: { index: {} }
  };
};

/**
 * The settings the plugin runs with. Like Settings.get: an instance that never saved settings gets
 * the new-instance defaults, where subscriptions start enabled.
 * @param {function(Error=, {settings: object, saved: boolean}=)} callback
 */
const readSettings = (callback) => {
  buildfire.datastore.get(SETTINGS_TAG, (err, res) => {
    if (err) return callback(toError(err));
    if (!res || !res.data || !Object.keys(res.data).length) {
      return callback(null, {
        settings: normalizeSettings({ subscription: { enabled: true, allowCustomNotifications: true } }),
        saved: false
      });
    }
    callback(null, { settings: normalizeSettings(migrateFieldSettings(res.data)), saved: true });
  });
};

/** The control panel's saveSettings: whole document, stamped, then the widget is told which scopes changed. */
const saveSettings = (settings, scopes, callback) => {
  const doc = { ...settings, lastUpdatedOn: new Date() };
  buildfire.datastore.save(doc, SETTINGS_TAG, (err, res) => {
    if (err || !res) return callback(toError(err || 'Settings could not be saved'));
    scopes.forEach((scope) => syncWidget({ cmd: 'sync', scope }));
    callback(null, normalizeSettings(res.data || doc));
  });
};

/** What getSettings shows: the stored settings without access, editor and billing settings. */
const settingsView = (settings) => {
  const view = JSON.parse(JSON.stringify(settings));
  delete view.globalEditors;
  delete view.locationEditors;
  delete view._buildfire;
  delete view.createdBy;
  delete view.lastUpdatedBy;
  delete view.deletedOn;
  delete view.deletedBy;
  delete view.isActive;
  view.subscription = { enabled: !!settings.subscription.enabled };
  view.introductoryListView = { ...view.introductoryListView };
  delete view.introductoryListView.visibilityOptions;
  view.locationFields = {
    openHoursEnabled: !!(settings.globalEntries.openHours && settings.globalEntries.openHours.enabled),
    priceRangeEnabled: !!(settings.globalEntries.priceRange && settings.globalEntries.priceRange.enabled)
  };
  delete view.globalEntries;
  ['quickActions', 'content'].forEach((section) => {
    view.customFields[section] = view.customFields[section].map((field) => ({
      id: field.id, label: field.label, type: field.type, required: field.required, allowCustomLabel: field.enableCustomLabel
    }));
  });
  return view;
};

// ---------------------------------------------------------------------------
// Lookups: every handle resolves to exactly one record, or the call is refused.
// ---------------------------------------------------------------------------

const searchAll = (tag, filter, sort, callback) => {
  const rows = [];
  const fetchPage = (page) => {
    buildfire.publicData.search({
      filter, sort, page, pageSize: MAX_PAGE_SIZE
    }, tag, (err, result) => {
      if (err) return callback(toError(err));
      const list = Array.isArray(result) ? result : ((result && result.result) || []);
      rows.push(...list);
      if (list.length < MAX_PAGE_SIZE) return callback(null, rows);
      fetchPage(page + 1);
    });
  };
  fetchPage(0);
};

/** Live categories (soft-deleted ones have date1 set), cached for the length of one call. */
const loadCategories = (ctx, callback) => {
  if (ctx.categories) return callback(null, ctx.categories);
  searchAll(CATEGORIES_TAG, { '_buildfire.index.date1': { $type: 10 } }, { '_buildfire.index.string1': 1 }, (err, rows) => {
    if (err) return callback(err);
    ctx.categories = rows.map((row) => ({ id: row.id, ...row.data }));
    ctx.categoriesById = {};
    ctx.categories.forEach((category) => { ctx.categoriesById[category.id] = category; });
    callback(null, ctx.categories);
  });
};

const pickOne = (matches, noun, handle) => {
  if (!matches.length) return { error: `No ${noun} matches "${handle}"` };
  if (matches.length > 1) return { error: `${matches.length} ${noun}s match "${handle}"; it has to name exactly one` };
  return { found: matches[0] };
};

const findCategoryByTitle = (ctx, title, callback) => {
  loadCategories(ctx, (err, categories) => {
    if (err) return callback(err);
    const picked = pickOne(categories.filter((c) => c.title === title), 'category', title);
    callback(picked.error ? new Error(picked.error) : null, picked.found);
  });
};

const findCategoryById = (ctx, categoryId, callback) => {
  loadCategories(ctx, (err) => {
    if (err) return callback(err);
    // A soft-deleted category counts as missing, as it does everywhere in the plugin.
    const found = ctx.categoriesById[categoryId];
    callback(found ? null : new Error(`No category with id "${categoryId}"`), found);
  });
};

const findSubcategory = (category, { title, id }) => {
  const subs = category.subcategories || [];
  if (isGiven(id)) {
    const found = subs.find((s) => s.id === id);
    return found ? { found } : { error: `Category "${category.title}" has no subcategory with id "${id}"` };
  }
  return pickOne(subs.filter((s) => s.title === title), `subcategory of "${category.title}"`, title);
};

/**
 * Locations a caller names by title. Matched on the plugin's own title index (string1 is the
 * lower-cased title), so the match ignores case; several matches are refused.
 */
const findLocationByTitle = (title, callback) => {
  buildfire.publicData.search({ filter: { '_buildfire.index.string1': title.toLowerCase() }, pageSize: MAX_PAGE_SIZE }, LOCATIONS_TAG, (err, result) => {
    if (err) return callback(toError(err));
    const rows = Array.isArray(result) ? result : ((result && result.result) || []);
    const picked = pickOne(rows, 'location', title);
    callback(picked.error ? new Error(picked.error) : null, picked.found);
  });
};

const findLocationById = (locationId, callback) => {
  buildfire.publicData.getById(locationId, LOCATIONS_TAG, (err, record) => {
    if (err) return callback(toError(err));
    if (!record || !record.data || !Object.keys(record.data).length) {
      return callback(new Error(`No location with id "${locationId}"`));
    }
    callback(null, record);
  });
};

const findLocation = (entry, byId, callback) => (byId
  ? findLocationById(entry.locationId, callback)
  : findLocationByTitle(entry.title, callback));

const splitHandles = (text) => (typeof text === 'string' ? text.split(',').map((part) => part.trim()).filter(Boolean) : []);

/**
 * A location's categories, comma-separated: titles for the basic operations, ids for the advanced
 * ones. Every handle must match a live category; the CSV import skips unknown names, which would
 * leave a caller's location silently uncategorized. Resolves to ids, as categories.main stores them.
 */
const resolveCategoryIds = (ctx, text, byId, callback) => {
  loadCategories(ctx, (err, categories) => {
    if (err) return callback(err);
    const ids = [];
    const handles = splitHandles(text);
    for (let i = 0; i < handles.length; i += 1) {
      const handle = handles[i];
      const picked = byId
        ? { found: ctx.categoriesById[handle], error: ctx.categoriesById[handle] ? null : `No category with id "${handle}"` }
        : pickOne(categories.filter((c) => c.title === handle), 'category', handle);
      if (picked.error) return callback(new Error(picked.error));
      if (ids.indexOf(picked.found.id) === -1) ids.push(picked.found.id);
    }
    callback(null, ids);
  });
};

/**
 * A location's subcategories, comma-separated, matched only under the given categories (the form
 * lists a category's subcategories once it is ticked). A title found under two of them is refused;
 * the advanced operation names it by id. Resolves to ids, as categories.subcategories stores them.
 */
const resolveSubcategoryIds = (ctx, mainIds, text, byId, callback) => {
  loadCategories(ctx, (err) => {
    if (err) return callback(err);
    const parents = mainIds.map((id) => ctx.categoriesById[id]).filter(Boolean);
    const ids = [];
    const handles = splitHandles(text);
    for (let i = 0; i < handles.length; i += 1) {
      const handle = handles[i];
      const matches = [];
      parents.forEach((category) => (category.subcategories || []).forEach((sub) => {
        if ((byId ? sub.id : sub.title) === handle) matches.push(sub);
      }));
      if (!matches.length) {
        return callback(new Error(`No subcategory ${byId ? 'with id' : 'titled'} "${handle}" under the location's categories`));
      }
      if (matches.length > 1) {
        return callback(new Error(`${matches.length} of the location's categories have a subcategory "${handle}"; name it by id with the advanced operation`));
      }
      if (ids.indexOf(matches[0].id) === -1) ids.push(matches[0].id);
    }
    callback(null, ids);
  });
};

/** Subcategory ids that still sit under one of the given categories; unticking a category drops its subcategories. */
const subcategoriesUnder = (ctx, mainIds, subIds) => {
  const kept = {};
  mainIds.forEach((id) => {
    const category = ctx.categoriesById[id];
    ((category && category.subcategories) || []).forEach((sub) => { kept[sub.id] = true; });
  });
  return subIds.filter((id) => kept[id]);
};

const checkHandleList = (entry, name) => {
  const value = entry[name];
  if (!isGiven(value) || value === null) return null;
  if (typeof value !== 'string') return `${name} must be text like "First, Second"`;
  return null;
};

/** An app user named by id or email; an email is resolved through the app's auth directory. */
const resolveUserId = (user, callback) => {
  if (user.indexOf('@') === -1) return callback(null, user);
  if (!buildfire.auth || typeof buildfire.auth.getUsersByEmail !== 'function') {
    return callback(new Error('Users can only be named by id here'));
  }
  buildfire.auth.getUsersByEmail({ email: user }, (err, users) => {
    if (err) return callback(toError(err));
    let list = [];
    if (Array.isArray(users)) list = users;
    else if (users) list = [users];
    const picked = pickOne(list, 'user', user);
    if (picked.error) return callback(new Error(picked.error));
    callback(null, picked.found.userId || picked.found._id);
  });
};

// ---------------------------------------------------------------------------
// Location side effects — what LocationsController (control/content/js/locations/controller.js)
// does around every write. Each is best-effort, as in the plugin, and reported in the result.
// ---------------------------------------------------------------------------

const registerViewedEvent = (id, title) => {
  try {
    if (!buildfire.analytics || typeof buildfire.analytics.registerEvent !== 'function') return false;
    buildfire.analytics.registerEvent({ title: `${title} (Viewed)`, key: `locations_${id}_viewed`, description: '' }, { silentNotification: true });
    return true;
  } catch (e) { return false; }
};

const registerDeeplink = (id, loc) => {
  try {
    if (!buildfire.deeplink || typeof buildfire.deeplink.registerDeeplink !== 'function') return false;
    buildfire.deeplink.registerDeeplink({
      id: `location-${id}`, name: loc.title, deeplinkData: { locationId: id }, imageUrl: loc.listImage
    }, () => {});
    return true;
  } catch (e) { return false; }
};

const unregisterDeeplink = (id) => {
  try {
    if (!buildfire.deeplink || typeof buildfire.deeplink.unregisterDeeplink !== 'function') return false;
    buildfire.deeplink.unregisterDeeplink(`location-${id}`, () => {});
    return true;
  } catch (e) { return false; }
};

/** Mirrors SearchEngine.add / update (src/widget/js/global/repository/searchEngine.js). */
const indexLocation = (id, loc, callback) => {
  ensureSdkService('searchEngine', (loadErr) => {
    if (loadErr) return callback(false);
    buildfire.services.searchEngine.save({
      tag: LOCATIONS_TAG,
      key: id,
      data: { locationId: id },
      title: loc.title,
      description: stripHtml(loc.description),
      imageUrl: loc.listImage,
      keywords: [loc.address, loc.formattedAddress, loc.addressAlias, loc.subtitle].join(',')
    }, (err) => callback(!err));
  });
};

const unindexLocation = (id, callback) => {
  ensureSdkService('searchEngine', (loadErr) => {
    if (loadErr) return callback(false);
    buildfire.services.searchEngine.delete({ id, tag: LOCATIONS_TAG }, (err) => callback(!err));
  });
};

// The control panel's triggerWidgetOnLocationsUpdate({}) after a save.
const syncLocations = () => syncWidget({
  cmd: 'sync', scope: 'locations', realtimeUpdate: false, isCancel: false, data: null
});

/** How many locations are pinned now; the pin button numbers a new pin count + 1. */
const countPinned = (callback) => {
  buildfire.publicData.search({ filter: { '_buildfire.index.number1': { $in: [1, 2, 3] } }, pageSize: MAX_PAGE_SIZE }, LOCATIONS_TAG, (err, result) => {
    if (err) return callback(toError(err));
    const rows = Array.isArray(result) ? result : ((result && result.result) || []);
    callback(null, rows);
  });
};

/** Pins or unpins as the location form's "Pin to Top" button does, refusing a fourth pin. */
const applyPinned = (loc, id, pinned, callback) => {
  if (!isGiven(pinned) || pinned === !!loc.pinIndex) return callback(null);
  if (!pinned) {
    loc.pinIndex = null;
    return callback(null);
  }
  countPinned((err, rows) => {
    if (err) return callback(err);
    const others = rows.filter((row) => row.id !== id);
    if (others.length >= MAX_PINNED) return callback(new Error(`${MAX_PINNED} of ${MAX_PINNED} locations are already pinned`));
    loc.pinIndex = others.length + 1;
    callback(null);
  });
};

/** Writes the whole location, as LocationsController.updateLocation does, then its side effects. */
const writeLocation = (id, loc, ctx, callback) => {
  loc.lastUpdatedOn = new Date();
  // Contract writes act as the app, not as a signed-in owner.
  loc.lastUpdatedBy = null;
  buildfire.publicData.update(id, locationDocument(loc), LOCATIONS_TAG, (err) => {
    if (err) return callback(toError(err));
    sendContractEvent('locationUpdated', { locationId: id, title: loc.title });
    const deeplinkRegistered = registerDeeplink(id, loc);
    indexLocation(id, loc, (searchIndexed) => {
      syncLocations();
      callback(null, {
        location: locationView(id, loc, ctx.categoriesById || {}, ctx.fieldsById),
        sideEffects: { deeplinkRegistered, searchIndexed }
      });
    });
  });
};

// ---------------------------------------------------------------------------
// Action runners
// ---------------------------------------------------------------------------

/**
 * Runs one action for a single operation: validate, resolve, ask (Foreground only), apply.
 * @param {{ validate: function, resolve: function, apply: function, approval?: function }} spec
 */
const runAction = (spec, options, callback) => {
  requireCallback(callback);
  if (!isObject(options)) return callback(new Error('options must be an object'), undefined);
  const problem = spec.validate(options);
  if (problem) return callback(new Error(problem), undefined);

  const ctx = {};
  spec.resolve(options, ctx, (err, target) => {
    if (err) return callback(toError(err), undefined);
    const proceed = (approvalErr) => {
      if (approvalErr) return callback(approvalErr, undefined);
      spec.apply(options, target, ctx, (applyErr, result) => {
        if (applyErr) return callback(toError(applyErr), undefined);
        callback(null, result);
      });
    };
    if (spec.approval) return requireUserApproval(spec.approval([options], [target]), proceed);
    proceed(null);
  });
};

/**
 * Runs one action for every entry of a batch. Every entry is validated, then every entry is
 * resolved, before the first write; any invalid, unmatched, ambiguous or repeated entry fails the
 * whole call and nothing is written. Then each entry is applied in turn through the single
 * operation's own apply, and a failed write is reported for that entry without stopping the rest.
 * @param {string} listName - the batch's list param, also the result's list key.
 */
const runBatch = (spec, listName, options, callback) => {
  requireCallback(callback);
  if (!isObject(options)) return callback(new Error('options must be an object'), undefined);
  const entries = options[listName];
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > MAX_BATCH) {
    return callback(new Error(`${listName} must be a list of 1 to ${MAX_BATCH} entries`), undefined);
  }

  const invalid = entries.map((entry, index) => {
    if (!isObject(entry)) return `entry ${index}: must be an object`;
    const problem = spec.validate(entry);
    return problem ? `entry ${index}: ${problem}` : null;
  }).filter(Boolean);
  if (invalid.length) return callback(new Error(`Invalid entries: ${invalid.join('; ')}`), undefined);

  const ctx = {};
  const targets = [];
  const unresolved = [];
  forEachSeries(entries, (entry, index, next) => {
    spec.resolve(entry, ctx, (err, target) => {
      if (err) unresolved.push(`entry ${index}: ${toError(err).message}`);
      targets[index] = target;
      next();
    });
  }, () => {
    if (unresolved.length) return callback(new Error(`Could not resolve: ${unresolved.join('; ')}`), undefined);

    const seen = {};
    const repeated = [];
    targets.forEach((target, index) => {
      const key = spec.keyOf ? spec.keyOf(entries[index], target) : null;
      if (key === null || key === undefined) return;
      if (seen[key] !== undefined) repeated.push(`entries ${seen[key]} and ${index}`);
      else seen[key] = index;
    });
    if (repeated.length) return callback(new Error(`The same record is listed more than once: ${repeated.join('; ')}`), undefined);

    const applyAll = (approvalErr) => {
      if (approvalErr) return callback(approvalErr, undefined);
      const results = [];
      forEachSeries(entries, (entry, index, next) => {
        spec.apply(entry, targets[index], ctx, (err, result) => {
          results.push({
            index,
            id: err ? null : spec.idOf(targets[index], result),
            error: err ? toError(err).message : null
          });
          next();
        });
      }, () => {
        const failed = results.filter((r) => r.error).length;
        callback(null, { [listName]: results, succeeded: results.length - failed, failed });
      });
    };
    if (spec.approval) return requireUserApproval(spec.approval(entries, targets), applyAll);
    applyAll(null);
  });
};

/**
 * Hands an action entries that cannot carry the named params, refusing an entry that tries rather
 * than reading params the operation never declared. Used where a batch entry can't hold list fields
 * (gallery images, action buttons), and to keep a micro basic operation to the params it declares.
 */
const withoutFields = (spec, names, why) => {
  const strip = (entry) => {
    const copy = {};
    Object.keys(entry).forEach((key) => { if (names.indexOf(key) === -1) copy[key] = entry[key]; });
    return copy;
  };
  return {
    ...spec,
    validate: (entry) => {
      const field = names.find((name) => Object.keys(entry).indexOf(name) !== -1);
      if (field) return why(field);
      return spec.validate(strip(entry));
    },
    resolve: (entry, ctx, cb) => spec.resolve(strip(entry), ctx, cb),
    apply: (entry, target, ctx, cb) => spec.apply(strip(entry), target, ctx, cb)
  };
};

const inBatch = (field) => `${field} can't be part of a batch entry`;
const onlyAdvanced = (advanced) => (field) => `${field} is only taken by ${advanced}`;

// What the micro basic operations skip; their advanced alternatives take it (rule: basic is micro).
const LOCATION_CREATE_SECONDARY = [
  'subtitle', 'addressAlias', 'priceRange', 'priceCurrency', 'markerType', 'markerColor', 'markerImage',
  'showCategory', 'showOpeningHours', 'showPriceRange', 'showStarRating', 'pinned', 'images', 'actionItems'
];
const LOCATION_UPDATE_SECONDARY = [
  'newSubtitle', 'newAddressAlias', 'newPriceRange', 'newPriceCurrency', 'newMarkerType', 'newMarkerColor', 'newMarkerImage',
  'newShowCategory', 'newShowOpeningHours', 'newShowPriceRange', 'newShowStarRating', 'pinned', 'newImages', 'newActionItems'
];

// ---------------------------------------------------------------------------
// Location actions
// ---------------------------------------------------------------------------

const checkMarker = (type, color, image, prefix) => {
  if (type === 'circle' && isGiven(color) && !RGB_COLOR.test(color)) return `${prefix}markerColor must be an rgb() or rgba() color`;
  if (type === 'image' && !isNonEmptyString(image)) return `${prefix}markerImage is required when the marker is an image`;
  return null;
};

const validateLocationCreate = (categoriesParam, subcategoriesParam) => (entry) => firstProblem([
  checkString(entry, 'title', { required: true }),
  checkString(entry, 'subtitle'),
  checkString(entry, 'address', { required: true }),
  checkNumber(entry, 'latitude', { required: true, min: -90, max: 90 }),
  checkNumber(entry, 'longitude', { required: true, min: -180, max: 180 }),
  checkString(entry, 'addressAlias'),
  checkString(entry, 'description', { required: true }),
  checkImage(entry, 'listImage', { required: true }),
  checkHandleList(entry, categoriesParam),
  checkHandleList(entry, subcategoriesParam),
  splitHandles(entry[subcategoriesParam]).length && !splitHandles(entry[categoriesParam]).length
    ? `${subcategoriesParam} needs ${categoriesParam}` : null,
  checkSelect(entry, 'priceRange', PRICE_RANGES),
  checkSelect(entry, 'priceCurrency', CURRENCIES),
  checkSelect(entry, 'markerType', MARKER_TYPES),
  checkString(entry, 'markerColor'),
  checkImage(entry, 'markerImage'),
  checkBoolean(entry, 'showCategory'),
  checkBoolean(entry, 'showOpeningHours'),
  checkBoolean(entry, 'showPriceRange'),
  checkBoolean(entry, 'showStarRating'),
  checkBoolean(entry, 'pinned'),
  checkImageList(entry, 'images'),
  checkActionList(entry, 'actionItems'),
  checkMarker(entry.markerType || 'pin', entry.markerColor, entry.markerImage, '')
]);

/** createLocation's action; byId takes category and subcategory ids instead of titles. */
const createLocationAction = (byId) => {
  const categoriesParam = byId ? 'categoryIds' : 'categoryTitles';
  const subcategoriesParam = byId ? 'subcategoryIds' : 'subcategoryTitles';
  return {
    validate: validateLocationCreate(categoriesParam, subcategoriesParam),
    resolve: (entry, ctx, cb) => resolveCategoryIds(ctx, entry[categoriesParam], byId, (err, main) => {
      if (err) return cb(err);
      resolveSubcategoryIds(ctx, main, entry[subcategoriesParam], byId, (subErr, subcategories) => cb(subErr, { main, subcategories }));
    }),
    apply: (entry, categories, ctx, cb) => {
      const type = entry.markerType || 'pin';
      const loc = normalizeLocation({
        title: entry.title,
        subtitle: entry.subtitle,
        address: entry.address,
        // The address autocomplete fills both from the place's formatted address.
        formattedAddress: entry.address,
        addressAlias: entry.addressAlias,
        coordinates: { lat: entry.latitude, lng: entry.longitude },
        description: entry.description,
        listImage: entry.listImage,
        categories,
        price: { range: isGiven(entry.priceRange) ? entry.priceRange : 1, currency: entry.priceCurrency || '$' },
        marker: {
          type,
          image: type === 'image' ? entry.markerImage : null,
          color: type === 'circle' ? markerColor(entry.markerColor || DEFAULT_MARKER_COLOR) : null,
          base64Image: null
        },
        settings: {
          showCategory: isGiven(entry.showCategory) ? entry.showCategory : true,
          showOpeningHours: !!entry.showOpeningHours,
          showPriceRange: !!entry.showPriceRange,
          showStarRating: !!entry.showStarRating
        },
        // Hours aren't a param (too complicated to pass as one); new locations get the form's default week.
        openingHours: defaultOpeningHours(),
        images: toImageItems(entry.images || []),
        actionItems: toActionItems(entry.actionItems || []),
        // Mirrors LocationsController.createLocation; createdBy stays empty because the app, not a person, creates it.
        clientId: generateUUID(),
        createdOn: new Date(),
        wysiwygSource: 'control'
      });
      applyPinned(loc, null, entry.pinned, (pinErr) => {
        if (pinErr) return cb(pinErr);
        buildfire.publicData.insert(locationDocument(loc), LOCATIONS_TAG, (err, record) => {
          if (err) return cb(toError(err));
          const { id } = record;
          sendContractEvent('locationCreated', { locationId: id, title: loc.title });
          const analyticsRegistered = registerViewedEvent(id, loc.title);
          const deeplinkRegistered = registerDeeplink(id, loc);
          indexLocation(id, loc, (searchIndexed) => {
            syncLocations();
            cb(null, {
              location: locationView(id, loc, ctx.categoriesById || {}),
              sideEffects: { analyticsRegistered, deeplinkRegistered, searchIndexed }
            });
          });
        });
      });
    },
    idOf: (target, result) => result.location.id
  };
};

const LOCATION_UPDATE_FIELDS = [
  'newTitle', 'newSubtitle', 'newAddress', 'newLatitude', 'newLongitude', 'newAddressAlias', 'newDescription',
  'newListImage', 'newPriceRange', 'newPriceCurrency', 'newMarkerType', 'newMarkerColor', 'newMarkerImage',
  'newShowCategory', 'newShowOpeningHours', 'newShowPriceRange', 'newShowStarRating', 'pinned', 'newImages', 'newActionItems'
];

/** updateLocation's action; byId names the location, its categories and subcategories by id. */
const updateLocationAction = (byId) => {
  const categoriesParam = byId ? 'newCategoryIds' : 'newCategoryTitles';
  const subcategoriesParam = byId ? 'newSubcategoryIds' : 'newSubcategoryTitles';
  const fields = LOCATION_UPDATE_FIELDS.concat([categoriesParam, subcategoriesParam]);
  return {
    validate: (entry) => firstProblem([
      byId ? checkString(entry, 'locationId', { required: true }) : checkString(entry, 'title', { required: true }),
      // The basic operation is micro: it names only the fields it declares.
      requireAnyGiven(entry, byId ? fields : fields.filter((f) => LOCATION_UPDATE_SECONDARY.indexOf(f) === -1)),
      // Subtitle, custom name and categories can be emptied in the location form; nothing else can.
      findClearedProblem(entry, fields.filter((f) => ['newSubtitle', 'newAddressAlias', categoriesParam, subcategoriesParam, 'newImages', 'newActionItems'].indexOf(f) === -1)),
      checkString(entry, 'newTitle'),
      checkNullable(entry, 'newSubtitle', checkString),
      checkString(entry, 'newAddress'),
      checkNumber(entry, 'newLatitude', { min: -90, max: 90 }),
      checkNumber(entry, 'newLongitude', { min: -180, max: 180 }),
      isGiven(entry.newLatitude) !== isGiven(entry.newLongitude) || (isGiven(entry.newAddress) && !isGiven(entry.newLatitude))
        ? 'newAddress, newLatitude and newLongitude change together; pass the address with both coordinates'
        : null,
      checkNullable(entry, 'newAddressAlias', checkString),
      checkString(entry, 'newDescription'),
      checkImage(entry, 'newListImage'),
      checkNullable(entry, categoriesParam, checkHandleList),
      checkNullable(entry, subcategoriesParam, checkHandleList),
      checkSelect(entry, 'newPriceRange', PRICE_RANGES),
      checkSelect(entry, 'newPriceCurrency', CURRENCIES),
      checkSelect(entry, 'newMarkerType', MARKER_TYPES),
      checkString(entry, 'newMarkerColor'),
      checkImage(entry, 'newMarkerImage'),
      checkBoolean(entry, 'newShowCategory'),
      checkBoolean(entry, 'newShowOpeningHours'),
      checkBoolean(entry, 'newShowPriceRange'),
      checkBoolean(entry, 'newShowStarRating'),
      checkBoolean(entry, 'pinned'),
      checkNullable(entry, 'newImages', checkImageList, { stringValued: false }),
      checkNullable(entry, 'newActionItems', checkActionList, { stringValued: false }),
      isGiven(entry.newMarkerColor) && !RGB_COLOR.test(entry.newMarkerColor) ? 'newMarkerColor must be an rgb() or rgba() color' : null
    ]),
    resolve: (entry, ctx, cb) => {
      findLocation(entry, byId, (err, record) => {
        if (err) return cb(err);
        const categoriesGiven = isGiven(entry[categoriesParam]);
        const subcategoriesGiven = isGiven(entry[subcategoriesParam]);
        const current = normalizeLocation(record.data).categories;
        resolveCategoryIds(ctx, categoriesGiven ? entry[categoriesParam] : '', byId, (catErr, picked) => {
          if (catErr) return cb(catErr);
          if (!categoriesGiven && !subcategoriesGiven) return cb(null, { id: record.id });
          const main = categoriesGiven ? picked : current.main;
          if (!subcategoriesGiven) {
            return cb(null, { id: record.id, categories: { main, subcategories: subcategoriesUnder(ctx, main, current.subcategories) } });
          }
          resolveSubcategoryIds(ctx, main, entry[subcategoriesParam], byId, (subErr, subcategories) => cb(subErr, { id: record.id, categories: { main, subcategories } }));
        });
      });
    },
    keyOf: (entry, target) => target.id,
    apply: (entry, target, ctx, cb) => {
      // Re-read, so entries of one batch never overwrite each other's changes.
      findLocationById(target.id, (err, record) => {
        if (err) return cb(err);
        const loc = normalizeLocation(record.data);
        if (isGiven(entry.newTitle)) loc.title = entry.newTitle;
        // The form stores an emptied text input as ''.
        if (isGiven(entry.newSubtitle)) loc.subtitle = entry.newSubtitle === null ? '' : entry.newSubtitle;
        if (isGiven(entry.newAddressAlias)) loc.addressAlias = entry.newAddressAlias === null ? '' : entry.newAddressAlias;
        if (isGiven(entry.newLatitude)) {
          loc.coordinates = { lat: entry.newLatitude, lng: entry.newLongitude };
          if (isGiven(entry.newAddress)) {
            loc.address = entry.newAddress;
            loc.formattedAddress = entry.newAddress;
          }
        }
        if (isGiven(entry.newDescription)) {
          loc.description = entry.newDescription;
          loc.wysiwygSource = 'control';
        }
        if (isGiven(entry.newListImage)) loc.listImage = entry.newListImage;
        // A null or '' handle list resolves to no ids, which is how the form stores an emptied choice.
        if (target.categories) loc.categories = target.categories;
        if (isGiven(entry.newPriceRange)) loc.price = { ...loc.price, range: entry.newPriceRange };
        if (isGiven(entry.newPriceCurrency)) loc.price = { ...loc.price, currency: entry.newPriceCurrency };
        if (isGiven(entry.newMarkerType) || isGiven(entry.newMarkerColor) || isGiven(entry.newMarkerImage)) {
          const marker = { ...loc.marker };
          if (isGiven(entry.newMarkerType)) marker.type = entry.newMarkerType;
          if (isGiven(entry.newMarkerColor)) marker.color = markerColor(entry.newMarkerColor);
          if (isGiven(entry.newMarkerImage)) marker.image = entry.newMarkerImage;
          // Switching to a circle with no color picks the default red, as the marker radios do.
          if (marker.type === 'circle' && !(marker.color && marker.color.color)) marker.color = markerColor(DEFAULT_MARKER_COLOR);
          const problem = checkMarker(marker.type, marker.color && marker.color.color, marker.image, 'new');
          if (problem) return cb(new Error(problem));
          loc.marker = marker;
        }
        ['Category', 'OpeningHours', 'PriceRange', 'StarRating'].forEach((key) => {
          const value = entry[`newShow${key}`];
          if (isGiven(value)) loc.settings = { ...loc.settings, [`show${key}`]: value };
        });
        if (isGiven(entry.newImages)) loc.images = entry.newImages === null ? [] : toImageItems(entry.newImages);
        if (isGiven(entry.newActionItems)) loc.actionItems = entry.newActionItems === null ? [] : toActionItems(entry.newActionItems);
        applyPinned(loc, target.id, entry.pinned, (pinErr) => {
          if (pinErr) return cb(pinErr);
          writeLocation(target.id, loc, ctx, cb);
        });
      });
    },
    idOf: (target) => target.id
  };
};

/** deleteLocation's action: the plugin hard-deletes, then drops the deep link and the search entry. */
const deleteLocationAction = (byId) => ({
  validate: (entry) => (byId ? checkString(entry, 'locationId', { required: true }) : checkString(entry, 'title', { required: true })),
  resolve: (entry, ctx, cb) => findLocation(entry, byId, cb),
  keyOf: (entry, target) => target.id,
  apply: (entry, target, ctx, cb) => {
    buildfire.publicData.delete(target.id, LOCATIONS_TAG, (err) => {
      if (err) return cb(toError(err));
      sendContractEvent('locationDeleted', { locationId: target.id });
      const deeplinkRemoved = unregisterDeeplink(target.id);
      unindexLocation(target.id, (searchEntryRemoved) => {
        syncLocations();
        cb(null, {
          deleted: true, locationId: target.id, title: target.data.title, sideEffects: { deeplinkRemoved, searchEntryRemoved }
        });
      });
    });
  },
  idOf: (target) => target.id
});

/** Mirrors the control panel's _validateFieldValue (content/js/locations/customFields.js). */
const validateFieldValue = (value, type) => {
  const parsed = value.trim();
  if (type === 'PHONE' && !/^[0-9\s+\-()]+$/.test(parsed)) return { error: 'Enter a valid phone number' };
  if (type === 'EMAIL') {
    const at = parsed.indexOf('@');
    if (parsed.indexOf(' ') !== -1 || at === -1 || parsed.indexOf('.', at) === -1) return { error: 'Enter a valid email address' };
  }
  if (type === 'URL') {
    if (parsed.indexOf(' ') !== -1 || parsed.indexOf('.') === -1) return { error: 'Enter a valid URL' };
    return { value: /^https?:\/\//i.test(parsed) ? parsed : `https://${parsed}` };
  }
  return { value: parsed };
};

const findField = (settings, { label, id }) => {
  const all = [];
  ['quickActions', 'content'].forEach((section) => {
    settings.customFields[section].forEach((field, index) => all.push({ section, index, field }));
  });
  if (isGiven(id)) {
    const found = all.find((f) => f.field.id === id);
    return found ? { found } : { error: `No location field with id "${id}"` };
  }
  return pickOne(all.filter((f) => f.field.label === label), 'location field', label);
};

const fieldsById = (settings) => {
  const map = {};
  ['quickActions', 'content'].forEach((section) => {
    settings.customFields[section].forEach((field) => { map[field.id] = field; });
  });
  return map;
};

/** updateLocationFieldValue's action: fills in one location field on one location. */
const updateFieldValueAction = (byId) => ({
  validate: (entry) => firstProblem([
    byId ? checkString(entry, 'locationId', { required: true }) : checkString(entry, 'title', { required: true }),
    byId ? checkString(entry, 'fieldId', { required: true }) : checkString(entry, 'fieldLabel', { required: true }),
    requireAnyGiven(entry, ['value', 'customLabel']),
    checkNullable(entry, 'value', checkString),
    checkNullable(entry, 'customLabel', checkString)
  ]),
  resolve: (entry, ctx, cb) => {
    readSettings((err, { settings } = {}) => {
      if (err) return cb(err);
      const field = findField(settings, byId ? { id: entry.fieldId } : { label: entry.fieldLabel });
      if (field.error) return cb(new Error(field.error));
      const {
        type, required, enableCustomLabel, label
      } = field.found.field;
      if (isGiven(entry.value) && isCleared(entry.value) && required) return cb(new Error(`"${label}" is a required field and cannot be emptied`));
      if (isNonEmptyString(entry.value)) {
        const checked = validateFieldValue(entry.value, type);
        if (checked.error) return cb(new Error(`${label}: ${checked.error}`));
      }
      if (isGiven(entry.customLabel) && !enableCustomLabel) return cb(new Error(`"${label}" does not allow a custom label`));
      ctx.fieldsById = fieldsById(settings);
      findLocation(entry, byId, (locErr, record) => (locErr ? cb(locErr) : cb(null, { id: record.id, field: field.found })));
    });
  },
  keyOf: (entry, target) => `${target.id}:${target.field.field.id}`,
  apply: (entry, target, ctx, cb) => {
    findLocationById(target.id, (err, record) => {
      if (err) return cb(err);
      const loc = normalizeLocation(record.data);
      const { section, field } = target.field;
      const values = loc.additionalFields[section];
      let current = values.find((v) => v.id === field.id);
      if (!current) {
        current = { id: field.id, customLabel: null, value: null };
        values.push(current);
      }
      // An emptied field is stored as null, as Location's model stores the form's empty input.
      if (isGiven(entry.value)) current.value = isCleared(entry.value) ? null : validateFieldValue(entry.value, field.type).value;
      if (isGiven(entry.customLabel)) current.customLabel = isCleared(entry.customLabel) ? null : entry.customLabel;
      loadCategories(ctx, (catErr) => (catErr ? cb(catErr) : writeLocation(target.id, loc, ctx, cb)));
    });
  },
  idOf: (target) => target.id
});

/** deleteLocationSubscriber's action: Locations.unsubscribeFromLocationUpdates, as the app. */
const deleteSubscriberAction = (byId) => ({
  validate: (entry) => firstProblem([
    byId ? checkString(entry, 'locationId', { required: true }) : checkString(entry, 'title', { required: true }),
    checkString(entry, 'userId', { required: true })
  ]),
  resolve: (entry, ctx, cb) => {
    resolveUserId(entry.userId, (userErr, userId) => {
      if (userErr) return cb(userErr);
      findLocation(entry, byId, (err, record) => {
        if (err) return cb(err);
        if ((record.data.subscribers || []).indexOf(userId) === -1) {
          return cb(new Error(`That user is not following "${record.data.title}"`));
        }
        cb(null, { id: record.id, title: record.data.title, userId });
      });
    });
  },
  keyOf: (entry, target) => `${target.id}:${target.userId}`,
  apply: (entry, target, ctx, cb) => {
    buildfire.publicData.update(target.id, { $pull: { subscribers: target.userId } }, LOCATIONS_TAG, (err) => {
      if (err) return cb(toError(err));
      sendContractEvent('locationUnsubscribed', { locationId: target.id, userId: target.userId });
      cb(null, { removed: true, locationId: target.id, userId: target.userId });
    });
  },
  idOf: (target) => target.id
});

/** sendLocationNotification's action: the "Notify Users of Location Update" dialog, as the app. */
const sendNotificationAction = (byId) => ({
  validate: (entry) => firstProblem([
    byId ? checkString(entry, 'locationId', { required: true }) : checkString(entry, 'title', { required: true }),
    checkString(entry, 'notificationTitle', { required: true }),
    checkString(entry, 'message', { required: true })
  ]),
  resolve: (entry, ctx, cb) => {
    readSettings((err, { settings } = {}) => {
      if (err) return cb(err);
      // The notify button only exists while location subscribing is on.
      if (!settings.subscription.enabled) return cb(new Error('Location subscribing is turned off for this plugin'));
      findLocation(entry, byId, (locErr, record) => {
        if (locErr) return cb(locErr);
        const subscribers = record.data.subscribers || [];
        if (!subscribers.length) return cb(new Error(`"${record.data.title}" has no subscribers to notify`));
        cb(null, { id: record.id, title: record.data.title, subscribers });
      });
    });
  },
  approval: (entries, targets) => `Send "${entries[0].notificationTitle}" to the ${targets[0].subscribers.length} people following "${targets[0].title}"?`,
  apply: (entry, target, ctx, cb) => {
    ensureSdkService('pushNotifications', (loadErr) => {
      if (loadErr) return cb(loadErr);
      buildfire.notifications.pushNotification.schedule({
        title: entry.notificationTitle,
        text: entry.message,
        users: target.subscribers,
        queryString: `&dld=${encodeURIComponent(JSON.stringify({ locationId: target.id }))}`
      }, (err, result) => {
        if (err) return cb(toError(err));
        cb(null, { sent: true, recipientCount: target.subscribers.length, notificationId: (result && (result.id || result._id)) || null });
      });
    });
  },
  idOf: (target) => target.id
});

/** updatePinnedLocationOrder's action: the intro screen's drag-to-reorder of pinned locations. */
const pinnedOrderAction = (byId) => {
  const names = byId ? ['firstLocationId', 'secondLocationId', 'thirdLocationId'] : ['firstLocationTitle', 'secondLocationTitle', 'thirdLocationTitle'];
  return {
    validate: (entry) => firstProblem([
      checkString(entry, names[0], { required: true }),
      checkString(entry, names[1]),
      checkString(entry, names[2]),
      isGiven(entry[names[2]]) && !isGiven(entry[names[1]]) ? `${names[2]} needs ${names[1]}` : null
    ]),
    resolve: (entry, ctx, cb) => {
      const handles = names.map((n) => entry[n]).filter(isGiven);
      const ids = [];
      forEachSeries(handles, (handle, index, next) => {
        const finder = byId ? findLocationById : findLocationByTitle;
        finder(handle, (err, record) => {
          if (err) return cb(err);
          ids.push(record.id);
          next();
        });
      }, () => {
        if (new Set(ids).size !== ids.length) return cb(new Error('The same location is listed more than once'));
        countPinned((err, rows) => {
          if (err) return cb(err);
          const pinnedIds = rows.map((r) => r.id);
          const same = pinnedIds.length === ids.length && ids.every((id) => pinnedIds.indexOf(id) !== -1);
          if (!same) return cb(new Error(`List exactly the ${pinnedIds.length} pinned locations, in their new order`));
          cb(null, { ids });
        });
      });
    },
    apply: (entry, target, ctx, cb) => {
      const results = [];
      loadCategories(ctx, (catErr) => {
        if (catErr) return cb(catErr);
        forEachSeries(target.ids, (id, index, next) => {
          findLocationById(id, (err, record) => {
            if (err) return cb(err);
            const loc = normalizeLocation(record.data);
            loc.pinIndex = index + 1;
            writeLocation(id, loc, ctx, (writeErr, written) => {
              if (writeErr) return cb(writeErr);
              results.push(written.location);
              next();
            });
          });
        }, () => {
          syncWidget({ cmd: 'sync', scope: 'intro' });
          cb(null, { locations: results });
        });
      });
    }
  };
};

// ---------------------------------------------------------------------------
// Searches
// ---------------------------------------------------------------------------

const SEARCH_CHECKS = (entry, byId) => firstProblem([
  checkString(entry, 'searchText'),
  checkString(entry, 'title'),
  byId ? checkString(entry, 'categoryId') : checkString(entry, 'categoryTitle'),
  byId ? checkString(entry, 'subcategoryId') : checkString(entry, 'subcategoryTitle'),
  checkSelect(entry, 'priceRange', PRICE_RANGES),
  checkBoolean(entry, 'openNow'),
  checkNumber(entry, 'page', { min: 0, integer: true }),
  checkNumber(entry, 'pageSize', { min: 1, max: MAX_PAGE_SIZE, integer: true })
]);

/** The array1 index values a category/subcategory/price filter narrows by (shared.js buildSearchCriteria). */
const resolveIndexFilters = (entry, byId, ctx, callback) => {
  const values = [];
  if (isGiven(entry.priceRange)) values.push(`pr_${entry.priceRange}`);
  const categoryHandle = byId ? entry.categoryId : entry.categoryTitle;
  const subHandle = byId ? entry.subcategoryId : entry.subcategoryTitle;
  if (!isGiven(categoryHandle) && !isGiven(subHandle)) return callback(null, values);
  if (!isGiven(categoryHandle)) return callback(new Error(`${byId ? 'subcategoryId' : 'subcategoryTitle'} needs ${byId ? 'categoryId' : 'categoryTitle'}`));
  const finder = byId ? findCategoryById : findCategoryByTitle;
  finder(ctx, categoryHandle, (err, category) => {
    if (err) return callback(err);
    if (!isGiven(subHandle)) {
      values.push(`c_${category.id}`);
      return callback(null, values);
    }
    const sub = findSubcategory(category, byId ? { id: subHandle } : { title: subHandle });
    if (sub.error) return callback(new Error(sub.error));
    values.push(`s_${sub.found.id}`);
    callback(null, values);
  });
};

const searchLocationsImpl = (byId) => (options, callback) => {
  requireCallback(callback);
  if (!isObject(options)) return callback(new Error('options must be an object'), undefined);
  const problem = firstProblem([
    SEARCH_CHECKS(options, byId),
    checkBoolean(options, 'pinned'),
    checkString(options, 'createdBy'),
    checkSelect(options, 'sortBy', Object.keys(LOCATION_SORTS))
  ]);
  if (problem) return callback(new Error(problem), undefined);

  const ctx = {};
  const page = options.page || 0;
  const pageSize = options.pageSize || DEFAULT_PAGE_SIZE;
  resolveIndexFilters(options, byId, ctx, (err, indexValues) => {
    if (err) return callback(err, undefined);
    const resolveCreator = (cb) => (isGiven(options.createdBy) ? resolveUserId(options.createdBy, cb) : cb(null, null));
    resolveCreator((userErr, creatorId) => {
      if (userErr) return callback(userErr, undefined);
      // Every filter given narrows the results further (AND); each one left out is dropped.
      const and = indexValues.map((value) => ({ '_buildfire.index.array1.string1': value }));
      if (isGiven(options.title)) and.push({ '_buildfire.index.string1': options.title.toLowerCase() });
      if (isNonEmptyString(options.searchText)) {
        and.push({ '_buildfire.index.text': { $regex: escapeRegex(options.searchText.toLowerCase()), $options: 'i' } });
      }
      if (isGiven(options.pinned)) {
        and.push({ '_buildfire.index.number1': options.pinned ? { $in: [1, 2, 3] } : { $nin: [1, 2, 3] } });
      }
      // "My Locations" on the intro screen matches createdBy.userId.
      if (creatorId) and.push({ '$json.createdBy.userId': creatorId });
      if (options.openNow) {
        const { dayName, at } = openNowKeys();
        and.push({ [`$json.openingHours.days.${dayName}.active`]: true });
        and.push({ [`$json.openingHours.days.${dayName}.intervals`]: { $elemMatch: { from: { $lte: at }, to: { $gt: at } } } });
      }
      const filter = and.length ? { $and: and } : {};
      const sort = LOCATION_SORTS[options.sortBy || 'alphabetical'];
      buildfire.publicData.search({
        filter, sort, page, pageSize, recordCount: true
      }, LOCATIONS_TAG, (searchErr, response) => {
        if (searchErr) return callback(toError(searchErr), undefined);
        const rows = (response && response.result) || [];
        const total = (response && response.totalRecord) || 0;
        loadCategories(ctx, (catErr) => {
          if (catErr) return callback(catErr, undefined);
          callback(null, {
            locations: rows.map((row) => locationView(row.id, row.data, ctx.categoriesById)),
            total,
            page,
            hasMore: (page + 1) * pageSize < total
          });
        });
      });
    });
  });
};

const searchNearPointImpl = (byId) => (options, callback) => {
  requireCallback(callback);
  if (!isObject(options)) return callback(new Error('options must be an object'), undefined);
  const problem = firstProblem([
    checkNumber(options, 'latitude', { required: true, min: -90, max: 90 }),
    checkNumber(options, 'longitude', { required: true, min: -180, max: 180 }),
    checkNumber(options, 'radiusMiles', { min: MIN_AREA_RADIUS_MILES, max: MAX_AREA_RADIUS_MILES }),
    SEARCH_CHECKS(options, byId)
  ]);
  if (problem) return callback(new Error(problem), undefined);

  const ctx = {};
  const page = options.page || 0;
  const pageSize = options.pageSize || DEFAULT_PAGE_SIZE;
  resolveIndexFilters(options, byId, ctx, (err, indexValues) => {
    if (err) return callback(err, undefined);
    const query = {};
    if (indexValues.length) query['_buildfire.index.array1.string1'] = { $all: indexValues };
    if (isGiven(options.title)) query['_buildfire.index.string1'] = options.title.toLowerCase();
    if (isNonEmptyString(options.searchText)) {
      query['_buildfire.index.text'] = { $regex: escapeRegex(options.searchText.toLowerCase()), $options: 'i' };
    }
    // Same pipeline shape as the intro screen's IntroSearchService: $geoNear for the distance, then the area.
    const pipelineStages = [{
      $geoNear: {
        near: { type: 'Point', coordinates: [options.longitude, options.latitude] },
        key: '_buildfire.geo',
        distanceField: 'distance',
        query
      }
    }];
    if (isGiven(options.radiusMiles)) {
      pipelineStages.push({
        $match: { '_buildfire.geo': { $geoWithin: { $centerSphere: [[options.longitude, options.latitude], options.radiusMiles / EARTH_RADIUS_MILES] } } }
      });
    }
    if (options.openNow) {
      const { dayName, at } = openNowKeys();
      pipelineStages.push({
        $match: {
          [`openingHours.days.${dayName}.active`]: true,
          [`openingHours.days.${dayName}.intervals`]: { $elemMatch: { from: { $lte: at }, to: { $gt: at } } }
        }
      });
    }
    pipelineStages.push({ $sort: { distance: 1 } });
    buildfire.publicData.aggregate({ pipelineStages, page, pageSize }, LOCATIONS_TAG, (aggErr, rows) => {
      if (aggErr) return callback(toError(aggErr), undefined);
      loadCategories(ctx, (catErr) => {
        if (catErr) return callback(catErr, undefined);
        const list = rows || [];
        callback(null, {
          locations: list.map((row) => ({
            ...locationView(row._id || row.id, row.data || row, ctx.categoriesById),
            distanceKm: Math.round((row.distance / 1000) * 100) / 100,
            distanceMiles: Math.round((row.distance / METERS_PER_MILE) * 100) / 100
          })),
          page,
          hasMore: list.length === pageSize
        });
      });
    });
  });
};

const getLocationImpl = (byId) => (options, callback) => {
  requireCallback(callback);
  if (!isObject(options)) return callback(new Error('options must be an object'), undefined);
  const problem = byId ? checkString(options, 'locationId', { required: true }) : checkString(options, 'title', { required: true });
  if (problem) return callback(new Error(problem), undefined);
  const ctx = {};
  findLocation(options, byId, (err, record) => {
    if (err) return callback(err, undefined);
    readSettings((settingsErr, { settings } = {}) => {
      if (settingsErr) return callback(settingsErr, undefined);
      loadCategories(ctx, (catErr) => {
        if (catErr) return callback(catErr, undefined);
        callback(null, locationView(record.id, record.data, ctx.categoriesById, fieldsById(settings)));
      });
    });
  });
};

// ---------------------------------------------------------------------------
// Category and subcategory actions — mirrors CategoriesController and the Category model
// (src/widget/js/global/data/Category.js); categories are soft-deleted.
// ---------------------------------------------------------------------------

const categoryDocument = (category) => {
  const { id, ...rest } = category; // eslint-disable-line no-unused-vars
  return {
    title: rest.title || '',
    iconUrl: rest.iconUrl || null,
    iconClassName: rest.iconClassName || null,
    subcategories: rest.subcategories || [],
    quickAccess: [0, 1].indexOf(rest.quickAccess) !== -1 ? rest.quickAccess : 0,
    createdOn: rest.createdOn || new Date(),
    createdBy: rest.createdBy || null,
    lastUpdatedOn: rest.lastUpdatedOn || new Date(),
    lastUpdatedBy: rest.lastUpdatedBy || null,
    deletedOn: rest.deletedOn || null,
    deletedBy: rest.deletedBy || null,
    isActive: [0, 1].indexOf(rest.isActive) !== -1 ? rest.isActive : 1,
    _buildfire: {
      index: {
        string1: (rest.title || '').toLowerCase(),
        date1: rest.deletedOn || null,
        number1: [0, 1].indexOf(rest.quickAccess) !== -1 ? rest.quickAccess : 0
      }
    }
  };
};

const categoryView = (id, data) => ({
  id,
  title: data.title,
  iconUrl: data.iconUrl || null,
  subcategories: (data.subcategories || []).map((s) => ({ id: s.id, title: s.title, iconUrl: s.iconUrl || null }))
});

const syncCategories = () => syncWidget({ cmd: 'sync', scope: 'category' });

/** Re-reads a category, applies mutate(category) (which may return an error message), and saves the whole document. */
const rewriteCategory = (categoryId, mutate, callback) => {
  buildfire.publicData.getById(categoryId, CATEGORIES_TAG, (err, record) => {
    if (err) return callback(toError(err));
    if (!record || !record.data || !Object.keys(record.data).length || record.data.deletedOn) {
      return callback(new Error(`No category with id "${categoryId}"`));
    }
    const category = { ...record.data };
    const problem = mutate(category);
    if (problem) return callback(new Error(problem));
    category.lastUpdatedOn = new Date();
    category.lastUpdatedBy = null;
    buildfire.publicData.update(categoryId, categoryDocument(category), CATEGORIES_TAG, (updateErr) => {
      if (updateErr) return callback(toError(updateErr));
      syncCategories();
      callback(null, categoryView(categoryId, category));
    });
  });
};

const findCategory = (ctx, entry, byId, callback) => (byId
  ? findCategoryById(ctx, entry.categoryId, callback)
  : findCategoryByTitle(ctx, entry.categoryTitle, callback));

const createCategoryAction = () => ({
  validate: (entry) => firstProblem([checkString(entry, 'title', { required: true }), checkImage(entry, 'iconImage')]),
  resolve: (entry, ctx, cb) => {
    loadCategories(ctx, (err, categories) => {
      if (err) return cb(err);
      // Titles are how basic operations find a category, so a second one with the same title is refused.
      if (categories.some((c) => c.title === entry.title)) return cb(new Error(`A category titled "${entry.title}" already exists`));
      cb(null, {});
    });
  },
  keyOf: (entry) => entry.title,
  apply: (entry, target, ctx, cb) => {
    const doc = categoryDocument({ title: entry.title, iconUrl: entry.iconImage || null, createdOn: new Date() });
    buildfire.publicData.insert(doc, CATEGORIES_TAG, (err, record) => {
      if (err) return cb(toError(err));
      // CategoriesController.createCategory registers a "(Category Selected)" analytics event.
      let analyticsRegistered = false;
      try {
        if (buildfire.analytics && typeof buildfire.analytics.registerEvent === 'function') {
          buildfire.analytics.registerEvent({ title: `${entry.title} (Category Selected)`, key: `categories_${record.id}_selected`, description: '' }, { silentNotification: true });
          analyticsRegistered = true;
        }
      } catch (e) { analyticsRegistered = false; }
      syncCategories();
      cb(null, { category: categoryView(record.id, doc), sideEffects: { analyticsRegistered } });
    });
  },
  idOf: (target, result) => result.category.id
});

const updateCategoryAction = (byId) => ({
  validate: (entry) => firstProblem([
    byId ? checkString(entry, 'categoryId', { required: true }) : checkString(entry, 'categoryTitle', { required: true }),
    requireAnyGiven(entry, ['newTitle', 'newIconImage']),
    findClearedProblem(entry, ['newTitle', 'newIconImage']),
    checkString(entry, 'newTitle'),
    checkImage(entry, 'newIconImage')
  ]),
  resolve: (entry, ctx, cb) => findCategory(ctx, entry, byId, (err, category) => {
    if (err) return cb(err);
    if (isGiven(entry.newTitle) && entry.newTitle !== category.title && ctx.categories.some((c) => c.title === entry.newTitle)) {
      return cb(new Error(`A category titled "${entry.newTitle}" already exists`));
    }
    cb(null, category);
  }),
  keyOf: (entry, target) => target.id,
  apply: (entry, target, ctx, cb) => rewriteCategory(target.id, (category) => {
    if (isGiven(entry.newTitle)) category.title = entry.newTitle;
    if (isGiven(entry.newIconImage)) {
      category.iconUrl = entry.newIconImage;
      category.iconClassName = null;
    }
    return null;
  }, (err, view) => (err ? cb(err) : cb(null, { category: view }))),
  idOf: (target) => target.id
});

const deleteCategoryAction = (byId) => ({
  validate: (entry) => (byId ? checkString(entry, 'categoryId', { required: true }) : checkString(entry, 'categoryTitle', { required: true })),
  resolve: (entry, ctx, cb) => findCategory(ctx, entry, byId, cb),
  keyOf: (entry, target) => target.id,
  apply: (entry, target, ctx, cb) => rewriteCategory(target.id, (category) => {
    category.deletedOn = new Date();
    category.deletedBy = null;
    return null;
  }, (err) => (err ? cb(err) : cb(null, { deleted: true, categoryId: target.id, title: target.title }))),
  idOf: (target) => target.id
});

const createSubcategoryAction = (byId) => ({
  validate: (entry) => firstProblem([
    byId ? checkString(entry, 'categoryId', { required: true }) : checkString(entry, 'categoryTitle', { required: true }),
    checkString(entry, 'title', { required: true }),
    checkImage(entry, 'iconImage')
  ]),
  resolve: (entry, ctx, cb) => findCategory(ctx, entry, byId, (err, category) => {
    if (err) return cb(err);
    if ((category.subcategories || []).some((s) => s.title === entry.title)) {
      return cb(new Error(`"${category.title}" already has a subcategory titled "${entry.title}"`));
    }
    cb(null, category);
  }),
  keyOf: (entry, target) => `${target.id}:${entry.title}`,
  apply: (entry, target, ctx, cb) => {
    // Shape of a subcategory the "Add Subcategory" dialog creates.
    const subcategory = {
      id: generateUUID(), title: entry.title, iconUrl: entry.iconImage || null, iconClassName: null
    };
    rewriteCategory(target.id, (category) => {
      category.subcategories = (category.subcategories || []).concat([subcategory]);
      return null;
    }, (err, view) => (err ? cb(err) : cb(null, { subcategory: { id: subcategory.id, title: subcategory.title, iconUrl: subcategory.iconUrl }, category: view })));
  },
  idOf: (target, result) => result.subcategory.id
});

const subcategoryHandle = (entry, byId) => (byId ? { id: entry.subcategoryId } : { title: entry.subcategoryTitle });

const resolveSubcategory = (byId) => (entry, ctx, cb) => findCategory(ctx, entry, byId, (err, category) => {
  if (err) return cb(err);
  const sub = findSubcategory(category, subcategoryHandle(entry, byId));
  if (sub.error) return cb(new Error(sub.error));
  cb(null, { category, subcategory: sub.found });
});

const subcategoryTargetChecks = (entry, byId) => firstProblem([
  byId ? checkString(entry, 'categoryId', { required: true }) : checkString(entry, 'categoryTitle', { required: true }),
  byId ? checkString(entry, 'subcategoryId', { required: true }) : checkString(entry, 'subcategoryTitle', { required: true })
]);

const updateSubcategoryAction = (byId) => ({
  validate: (entry) => firstProblem([
    subcategoryTargetChecks(entry, byId),
    requireAnyGiven(entry, ['newTitle', 'newIconImage']),
    findClearedProblem(entry, ['newTitle', 'newIconImage']),
    checkString(entry, 'newTitle'),
    checkImage(entry, 'newIconImage')
  ]),
  resolve: (entry, ctx, cb) => resolveSubcategory(byId)(entry, ctx, (err, target) => {
    if (err) return cb(err);
    const { category, subcategory } = target;
    if (isGiven(entry.newTitle) && entry.newTitle !== subcategory.title && category.subcategories.some((s) => s.title === entry.newTitle)) {
      return cb(new Error(`"${category.title}" already has a subcategory titled "${entry.newTitle}"`));
    }
    cb(null, target);
  }),
  keyOf: (entry, target) => `${target.category.id}:${target.subcategory.id}`,
  apply: (entry, target, ctx, cb) => rewriteCategory(target.category.id, (category) => {
    const sub = (category.subcategories || []).find((s) => s.id === target.subcategory.id);
    if (!sub) return `The subcategory "${target.subcategory.title}" no longer exists`;
    if (isGiven(entry.newTitle)) sub.title = entry.newTitle;
    if (isGiven(entry.newIconImage)) {
      sub.iconUrl = entry.newIconImage;
      sub.iconClassName = null;
    }
    return null;
  }, (err, view) => (err ? cb(err) : cb(null, { category: view }))),
  idOf: (target) => target.subcategory.id
});

const deleteSubcategoryAction = (byId) => ({
  validate: (entry) => subcategoryTargetChecks(entry, byId),
  resolve: resolveSubcategory(byId),
  keyOf: (entry, target) => `${target.category.id}:${target.subcategory.id}`,
  apply: (entry, target, ctx, cb) => rewriteCategory(target.category.id, (category) => {
    // The control panel only removes it from the category; locations keep the stale id, as there.
    category.subcategories = (category.subcategories || []).filter((s) => s.id !== target.subcategory.id);
    return null;
  }, (err, view) => (err ? cb(err) : cb(null, { deleted: true, subcategoryId: target.subcategory.id, category: view }))),
  idOf: (target) => target.subcategory.id
});

// ---------------------------------------------------------------------------
// Location field (custom field) actions — the Settings tab's Location Fields page. It saves only
// customFields, with $set, and then tells the widget (locationFields.js updateCustomFieldsWithDeilay).
// ---------------------------------------------------------------------------

const fieldView = (section, field) => ({
  id: field.id, section, label: field.label, type: field.type, required: field.required, allowCustomLabel: field.enableCustomLabel
});

const saveCustomFields = (customFields, callback) => {
  readSettings((err, { settings, saved } = {}) => {
    if (err) return callback(err);
    const done = (saveErr) => {
      if (saveErr) return callback(toError(saveErr));
      syncWidget({ cmd: 'sync', scope: 'customFields' });
      callback(null);
    };
    // An instance that never saved settings gets its defaults saved first, as the Settings tab's load does.
    if (!saved) return buildfire.datastore.save({ ...settings, customFields }, SETTINGS_TAG, done);
    buildfire.datastore.save({ $set: { customFields } }, SETTINGS_TAG, done);
  });
};

/** Re-reads settings, applies mutate(customFields), and saves. mutate returns an error message or a result. */
const rewriteCustomFields = (mutate, callback) => {
  readSettings((err, { settings } = {}) => {
    if (err) return callback(err);
    const { customFields } = settings;
    const outcome = mutate(customFields);
    if (outcome.error) return callback(new Error(outcome.error));
    saveCustomFields(customFields, (saveErr) => (saveErr ? callback(saveErr) : callback(null, outcome.result)));
  });
};

const checkFieldType = (entry, name, section) => {
  if (!isGiven(entry[name])) return null;
  const allowed = FIELD_SECTIONS[section];
  return allowed.indexOf(entry[name]) === -1 ? `${name} must be one of: ${allowed.join(', ')} for ${section}` : null;
};

const createFieldAction = () => ({
  validate: (entry) => firstProblem([
    checkSelect(entry, 'section', Object.keys(FIELD_SECTIONS), { required: true }),
    checkString(entry, 'label', { required: true }),
    checkSelect(entry, 'type', FIELD_SECTIONS.content),
    entry.section ? checkFieldType(entry, 'type', entry.section) : null,
    checkBoolean(entry, 'required'),
    checkBoolean(entry, 'allowCustomLabel')
  ]),
  resolve: (entry, ctx, cb) => readSettings((err, { settings } = {}) => {
    if (err) return cb(err);
    // Labels are how basic operations find a field, so a second one with the same label is refused.
    if (!findField(settings, { label: entry.label }).error) return cb(new Error(`A location field labeled "${entry.label}" already exists`));
    cb(null, {});
  }),
  keyOf: (entry) => entry.label,
  apply: (entry, target, ctx, cb) => {
    const field = normalizeCustomField({
      id: generateUUID(),
      label: entry.label,
      // The add buttons start a new field as Email.
      type: entry.type || 'EMAIL',
      required: !!entry.required,
      enableCustomLabel: !!entry.allowCustomLabel,
      visibility: { value: 'ALL', tags: [] }
    });
    rewriteCustomFields((customFields) => {
      if (customFields.quickActions.length + customFields.content.length >= MAX_LOCATION_FIELDS) {
        return { error: `There are already ${MAX_LOCATION_FIELDS} location fields, the most the plugin allows` };
      }
      customFields[entry.section].push(field);
      return { result: { field: fieldView(entry.section, field) } };
    }, cb);
  },
  idOf: (target, result) => result.field.id
});

const fieldTargetChecks = (entry, byId) => (byId ? checkString(entry, 'fieldId', { required: true }) : checkString(entry, 'label', { required: true }));

const resolveField = (byId) => (entry, ctx, cb) => readSettings((err, { settings } = {}) => {
  if (err) return cb(err);
  const found = findField(settings, byId ? { id: entry.fieldId } : { label: entry.label });
  if (found.error) return cb(new Error(found.error));
  cb(null, { ...found.found, settings });
});

const updateFieldAction = (byId) => ({
  validate: (entry) => firstProblem([
    fieldTargetChecks(entry, byId),
    requireAnyGiven(entry, ['newLabel', 'newType', 'newRequired', 'newAllowCustomLabel', 'newPosition']),
    findClearedProblem(entry, ['newLabel', 'newType', 'newRequired', 'newAllowCustomLabel', 'newPosition']),
    checkString(entry, 'newLabel'),
    checkSelect(entry, 'newType', FIELD_SECTIONS.content),
    checkBoolean(entry, 'newRequired'),
    checkBoolean(entry, 'newAllowCustomLabel'),
    checkNumber(entry, 'newPosition', { min: 1, max: MAX_LOCATION_FIELDS, integer: true })
  ]),
  resolve: (entry, ctx, cb) => resolveField(byId)(entry, ctx, (err, target) => {
    if (err) return cb(err);
    const problem = firstProblem([
      checkFieldType(entry, 'newType', target.section),
      isGiven(entry.newPosition) && entry.newPosition > target.settings.customFields[target.section].length
        ? `newPosition must be between 1 and ${target.settings.customFields[target.section].length}`
        : null,
      isGiven(entry.newLabel) && entry.newLabel !== target.field.label && !findField(target.settings, { label: entry.newLabel }).error
        ? `A location field labeled "${entry.newLabel}" already exists`
        : null
    ]);
    cb(problem ? new Error(problem) : null, target);
  }),
  keyOf: (entry, target) => target.field.id,
  apply: (entry, target, ctx, cb) => rewriteCustomFields((customFields) => {
    const list = customFields[target.section];
    const index = list.findIndex((f) => f.id === target.field.id);
    if (index === -1) return { error: `The location field "${target.field.label}" no longer exists` };
    const field = list[index];
    if (isGiven(entry.newLabel)) field.label = entry.newLabel;
    if (isGiven(entry.newType)) field.type = entry.newType;
    if (isGiven(entry.newRequired)) field.required = entry.newRequired;
    if (isGiven(entry.newAllowCustomLabel)) field.enableCustomLabel = entry.newAllowCustomLabel;
    // Drag-to-reorder within its section.
    if (isGiven(entry.newPosition)) {
      list.splice(index, 1);
      list.splice(Math.min(entry.newPosition - 1, list.length), 0, field);
    }
    return { result: { field: fieldView(target.section, field) } };
  }, cb),
  idOf: (target) => target.field.id
});

const deleteFieldAction = (byId) => ({
  validate: (entry) => fieldTargetChecks(entry, byId),
  resolve: resolveField(byId),
  keyOf: (entry, target) => target.field.id,
  apply: (entry, target, ctx, cb) => rewriteCustomFields((customFields) => {
    const list = customFields[target.section];
    const index = list.findIndex((f) => f.id === target.field.id);
    if (index === -1) return { error: `The location field "${target.field.label}" no longer exists` };
    // As on the Location Fields page, values already filled in on locations are left in place.
    list.splice(index, 1);
    return { result: { deleted: true, fieldId: target.field.id, label: target.field.label } };
  }, cb),
  idOf: (target) => target.field.id
});

// ---------------------------------------------------------------------------
// Settings, design and intro screen
// ---------------------------------------------------------------------------

const SETTINGS_BOOLEANS = {
  subscriptionEnabled: ['subscription', 'enabled'],
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
  mapInitialAreaEnabled: ['map', 'initialArea'],
  bookmarksEnabled: ['bookmarks', 'enabled'],
  allowBookmarkLocations: ['bookmarks', 'allowForLocations'],
  allowBookmarkSearches: ['bookmarks', 'allowForFilters']
};
const SETTINGS_PARAMS = Object.keys(SETTINGS_BOOLEANS).concat([
  'openHoursEnabled', 'priceRangeEnabled', 'defaultSorting', 'measurementUnit',
  'initialAreaLatitude', 'initialAreaLongitude', 'initialAreaAddress'
]);

const DESIGN_SELECTS = {
  listViewPosition: LIST_VIEW_POSITIONS,
  listViewStyle: LIST_VIEW_STYLES,
  defaultMapType: MAP_TYPES,
  detailsMapPosition: DETAILS_MAP_POSITIONS
};
const DESIGN_BOOLEANS = ['enableMapTerrainView', 'hideQuickFilter', 'allowStyleSelection', 'showDetailsCategory', 'showContributorName'];
const DESIGN_PARAMS = Object.keys(DESIGN_SELECTS).concat(DESIGN_BOOLEANS);

const INTRO_PARAMS = ['description', 'sorting', 'locationSource', 'areaLatitude', 'areaLongitude', 'areaAddress', 'areaRadiusMiles'];

const checkOptions = (options, callback) => {
  requireCallback(callback);
  if (!isObject(options)) {
    callback(new Error('options must be an object'), undefined);
    return false;
  }
  return true;
};

/** Turns a field-access toggle off the way the Location Settings page does: access drops to nobody. */
const setFieldEnabled = (entry, enabled) => {
  entry.enabled = enabled;
  if (!enabled) {
    entry.inAppEnabled = 'none';
    entry.tags = [];
  }
};

// ---------------------------------------------------------------------------
// widgetContract
// ---------------------------------------------------------------------------

widgetContract = {
  /**
   * Bind this contract to a plugin instance. Called by the consumer; resolves
   * the iframe window that widget/control-hosted operations are proxied into.
   * @param {string} instanceId - the plugin instance to contract with.
   */
  init(instanceId) {
    buildfire.services.contract.use({ instanceId }, (err, data) => {
      if (err) return console.error('Failed to initialize Locations contract', err);
      frameId = data.fid;
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic; its advanced alternative
   * is searchLocationsAdvanced. Uses only buildfire.publicData, which behaves the same in both
   * frames and on the server; nothing about it needs to be watched, so Background. A function rather
   * than a declarative search because category and subcategory titles must be resolved to the ids the
   * index holds, the open-now filter is keyed by today's day name, and the result carries category
   * titles and an open-now answer. Filters combine with AND, unlike the widget's own OR across
   * selected categories, because a caller narrowing by several filters expects all of them to apply.
   * Sorts are the index-backed ones only (title, creation date).
   * @param {{ searchText?: string, title?: string, categoryTitle?: string, subcategoryTitle?: string, priceRange?: number, openNow?: boolean, pinned?: boolean, createdBy?: string, sortBy?: string, page?: number, pageSize?: number }} options
   * @param {function(Error=, object=)} callback - (error, { locations, total, page, hasMore })
   */
  searchLocations: searchLocationsImpl(false),

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of
   * searchLocations, taking a category id and subcategory id instead of titles. Same implementation,
   * hosts and result; an id that matches no live category is refused.
   * @param {{ categoryId?: string, subcategoryId?: string }} options - plus searchLocations' other filters.
   * @param {function(Error=, object=)} callback - (error, { locations, total, page, hasMore })
   */
  searchLocationsAdvanced: searchLocationsImpl(true),

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic; its advanced alternative
   * is searchLocationsNearPointAdvanced. Mirrors the intro screen's IntroSearchService: a
   * publicData.aggregate with $geoNear for the distance and $geoWithin for the optional radius (miles,
   * 1 to 200 as on the intro screen's radius input). Kept apart from searchLocations because each
   * result carries a distance. Uses only buildfire.publicData, so it runs in both frames and on the
   * server; Background because nothing needs watching. The aggregate gives no total, so hasMore is
   * true whenever a full page came back.
   * @param {{ latitude: number, longitude: number, radiusMiles?: number, searchText?: string, title?: string, categoryTitle?: string, subcategoryTitle?: string, priceRange?: number, openNow?: boolean, page?: number, pageSize?: number }} options
   * @param {function(Error=, object=)} callback - (error, { locations, page, hasMore })
   */
  searchLocationsNearPoint: searchNearPointImpl(false),

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of
   * searchLocationsNearPoint, taking a category id and subcategory id instead of titles.
   * @param {{ latitude: number, longitude: number, categoryId?: string, subcategoryId?: string }} options
   * @param {function(Error=, object=)} callback - (error, { locations, page, hasMore })
   */
  searchLocationsNearPointAdvanced: searchNearPointImpl(true),

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic; its advanced alternative
   * is getLocationAdvanced. Resolves the title (ignoring case, refusing several matches), then
   * reads categories and settings to show category titles and location field labels. Uses only
   * buildfire.publicData and buildfire.datastore; Background.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, location)
   */
  getLocation: getLocationImpl(false),

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of
   * getLocation, taking the location's record id and checking it exists.
   * @param {{ locationId: string }} options
   * @param {function(Error=, object=)} callback - (error, location)
   */
  getLocationAdvanced: getLocationImpl(true),

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic; its advanced alternative
   * is createLocationAdvanced. The control panel's Add Location save (LocationsController.
   * createLocation): validates as the form does, inserts the location with the plugin's own index,
   * then fires locationCreated, registers the "(Viewed)" analytics event and the deep link, adds the
   * search-engine entry and refreshes the widget. Multi-step over the SDK, which is why it is a
   * function. Background in both frames: the user chose to keep location writes unattended.
   * Deep links and analytics do not exist on the server, so there they are skipped and reported as
   * false in sideEffects; the searchEngine service is loaded on first use in a frame. New locations
   * get the plugin's default hours (every day 08:00-20:00) and no location field values (the CSV
   * import creates locations the same way; fill them in with updateLocationFieldValue). Micro: it
   * takes the form's required fields plus categories and subcategories; everything else gets the
   * form's empty-field default, and createLocationAdvanced takes it. Passing a skipped field is refused.
   * @param {object} options - title, address, latitude, longitude, description, listImage, categoryTitles, subcategoryTitles.
   * @param {function(Error=, object=)} callback - (error, { location, sideEffects })
   */
  createLocation(options, callback) { runAction(withoutFields(createLocationAction(false), LOCATION_CREATE_SECONDARY, onlyAdvanced('createLocationAdvanced')), options, callback); },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of
   * createLocation, taking categoryIds and subcategoryIds instead of titles, and every field the
   * basic one skips (subtitle, custom name, price, marker, display toggles, pin, gallery, buttons).
   * @param {object} options
   * @param {function(Error=, object=)} callback - (error, { location, sideEffects })
   */
  createLocationAdvanced(options, callback) { runAction(createLocationAction(true), options, callback); },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced (batches are never basic); the batch form
   * of createLocationAdvanced, and what the control panel's CSV import does. Validates every entry and
   * checks every category id first, then creates each through createLocationAdvanced's own action.
   * Entries carry no gallery images or action buttons, since an entry's fields can't be lists.
   * @param {{ locations: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  createLocationsAdvanced(options, callback) { runBatch(withoutFields(createLocationAction(true), ['images', 'actionItems'], inBatch), 'locations', options, callback); },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic; its advanced alternative
   * is updateLocationAdvanced. The location form's Save in edit mode (LocationsController.
   * updateLocation): changes only the fields passed, re-reads and rewrites the whole document with a
   * fresh index, then fires locationUpdated, re-registers the deep link, updates the search entry and
   * refreshes the widget. Categories and subcategories can be cleared with null or ""; clearing
   * anything else is refused. Micro: it changes title, address and position, description, list
   * image and categories; updateLocationAdvanced changes the rest, and a skipped field is refused.
   * Background, by the user's choice for location writes.
   * @param {object} options - title plus the new* fields declared in plugin.contract.json.
   * @param {function(Error=, object=)} callback - (error, { location, sideEffects })
   */
  updateLocation(options, callback) { runAction(withoutFields(updateLocationAction(false), LOCATION_UPDATE_SECONDARY, onlyAdvanced('updateLocationAdvanced')), options, callback); },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of
   * updateLocation, taking locationId, newCategoryIds and newSubcategoryIds, and every field the
   * basic one skips. Subtitle, custom name, gallery images and action buttons can also be cleared.
   * @param {object} options
   * @param {function(Error=, object=)} callback - (error, { location, sideEffects })
   */
  updateLocationAdvanced(options, callback) { runAction(updateLocationAction(true), options, callback); },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced (batches are never basic); the batch form of
   * updateLocationAdvanced: each entry names its record by id.
   * @param {{ locations: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  updateLocationsAdvanced(options, callback) { runBatch(withoutFields(updateLocationAction(true), ['newImages', 'newActionItems'], inBatch), 'locations', options, callback); },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic; its advanced alternative
   * is deleteLocationAdvanced. LocationsController.deleteLocation: a hard delete, then
   * locationDeleted, the deep link and the search entry are removed and the widget refreshed.
   * Background, by the user's choice; flagged dangerous because it cannot be undone.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, { deleted, locationId, title, sideEffects })
   */
  deleteLocation(options, callback) { runAction(deleteLocationAction(false), options, callback); },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of
   * deleteLocation, taking the location's record id.
   * @param {{ locationId: string }} options
   * @param {function(Error=, object=)} callback - (error, { deleted, locationId, title, sideEffects })
   */
  deleteLocationAdvanced(options, callback) { runAction(deleteLocationAction(true), options, callback); },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced (batches are never basic); the batch form of
   * deleteLocationAdvanced: each entry names its record by id.
   * @param {{ locations: Array<{ locationId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  deleteLocationsAdvanced(options, callback) { runBatch(deleteLocationAction(true), 'locations', options, callback); },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic; its advanced alternative
   * is updateLocationFieldValueAdvanced. Fills in one location field (a custom field from the
   * Settings tab) on one location, validated by the field's type exactly as the location form's
   * customFields.js does (URLs get https:// added). A separate operation from updateLocation because
   * the fields are defined per app, so they cannot be fixed parameters. Saved through the same full
   * update as updateLocation, with its side effects. Background.
   * @param {{ title: string, fieldLabel: string, value?: string|null, customLabel?: string|null }} options
   * @param {function(Error=, object=)} callback - (error, { location, sideEffects })
   */
  updateLocationFieldValue(options, callback) { runAction(updateFieldValueAction(false), options, callback); },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of
   * updateLocationFieldValue, taking locationId and fieldId.
   * @param {{ locationId: string, fieldId: string, value?: string|null, customLabel?: string|null }} options
   * @param {function(Error=, object=)} callback - (error, { location, sideEffects })
   */
  updateLocationFieldValueAdvanced(options, callback) { runAction(updateFieldValueAction(true), options, callback); },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced (batches are never basic); the batch form of
   * updateLocationFieldValueAdvanced: each entry names its record by id.
   * @param {{ locations: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  updateLocationsFieldValueAdvanced(options, callback) { runBatch(updateFieldValueAction(true), 'locations', options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; its advanced alternative is
   * updatePinnedLocationOrderAdvanced. The intro screen's drag-to-reorder of "Pinned to top
   * locations": every pinned location is listed in its new order and renumbered 1..3 through the
   * same full update as updateLocation, then the intro screen is refreshed. Acts on several
   * locations at once, so it has no batch form. No widget host: only the control panel reorders
   * pins. Background: it rearranges content, it does not publish or contact anyone.
   * @param {{ firstLocationTitle: string, secondLocationTitle?: string, thirdLocationTitle?: string }} options
   * @param {function(Error=, object=)} callback - (error, { locations })
   */
  updatePinnedLocationOrder(options, callback) { runAction(pinnedOrderAction(false), options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of
   * updatePinnedLocationOrder, taking location ids.
   * @param {{ firstLocationId: string, secondLocationId?: string, thirdLocationId?: string }} options
   * @param {function(Error=, object=)} callback - (error, { locations })
   */
  updatePinnedLocationOrderAdvanced(options, callback) { runAction(pinnedOrderAction(true), options, callback); },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic; its advanced alternative
   * is deleteLocationSubscriberAdvanced. Stops one app user's updates about a location, as the
   * app (Locations.unsubscribeFromLocationUpdates: $pull from subscribers), and fires
   * locationUnsubscribed. The user is the target, never the actor. The reverse, subscribing someone,
   * is not offered: opting a person in to notifications is their consent to give. Uses only
   * buildfire.publicData (and buildfire.auth to resolve an email), so it runs everywhere; Background.
   * @param {{ title: string, userId: string }} options
   * @param {function(Error=, object=)} callback - (error, { removed, locationId, userId })
   */
  deleteLocationSubscriber(options, callback) { runAction(deleteSubscriberAction(false), options, callback); },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of
   * deleteLocationSubscriber, taking the location's record id.
   * @param {{ locationId: string, userId: string }} options
   * @param {function(Error=, object=)} callback - (error, { removed, locationId, userId })
   */
  deleteLocationSubscriberAdvanced(options, callback) { runAction(deleteSubscriberAction(true), options, callback); },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced (batches are never basic); the batch form of
   * deleteLocationSubscriberAdvanced: each entry names its record by id.
   * @param {{ subscribers: Array<{ locationId: string, userId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { subscribers, succeeded, failed })
   */
  deleteLocationSubscribersAdvanced(options, callback) { runBatch(deleteSubscriberAction(true), 'subscribers', options, callback); },

  /**
   * hosts: widgetForeground, controlForeground, headlessSdk. usage: basic; its advanced alternative
   * is sendLocationNotificationAdvanced. The "Notify Users of Location Update" dialog (control
   * panel) and notification form (widget): a push to everyone following the location, sent as the
   * app, refused while location subscribing is off or when nobody follows it. Foreground in both
   * frames because it reaches real people, so the person watching approves it first
   * (requireUserApproval). buildfire.notifications.pushNotification.schedule is server-safe, so it
   * keeps headlessSdk, where the MCP server confirms instead; in a frame pushNotifications.js is
   * loaded on first use. A send to several people is this operation's audience, so it has no batch.
   * @param {{ title: string, notificationTitle: string, message: string }} options
   * @param {function(Error=, object=)} callback - (error, { sent, recipientCount, notificationId })
   */
  sendLocationNotification(options, callback) { runAction(sendNotificationAction(false), options, callback); },

  /**
   * hosts: widgetForeground, controlForeground, headlessSdk. usage: advanced; the alternative of
   * sendLocationNotification, taking the location's record id. Same approval step.
   * @param {{ locationId: string, notificationTitle: string, message: string }} options
   * @param {function(Error=, object=)} callback - (error, { sent, recipientCount, notificationId })
   */
  sendLocationNotificationAdvanced(options, callback) { runAction(sendNotificationAction(true), options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic. The Categories tab's Add Category save
   * (CategoriesController.createCategory): inserts the category, registers its analytics event and
   * refreshes the widget. A function because it refuses a title that already exists, since basic
   * operations find categories by title. No widget host: only the control panel manages categories.
   * Background. Subcategories are added with createSubcategory. The icon picker's font icons are not
   * offered; only an image icon.
   * @param {{ title: string, iconImage?: string }} options
   * @param {function(Error=, object=)} callback - (error, { category, sideEffects })
   */
  createCategory(options, callback) { runAction(createCategoryAction(), options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced (batches are never basic); the batch form of
   * createCategory (the Categories tab's CSV import).
   * @param {{ categories: Array<{ title: string, iconImage?: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  createCategoriesAdvanced(options, callback) { runBatch(createCategoryAction(), 'categories', options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; its advanced alternative is
   * updateCategoryAdvanced. The Edit Category save and the list's icon click: re-reads the
   * category, changes the title and/or icon, and rewrites the whole document as
   * CategoriesController.updateCategory does, then refreshes the widget. Background.
   * @param {{ categoryTitle: string, newTitle?: string, newIconImage?: string }} options
   * @param {function(Error=, object=)} callback - (error, { category })
   */
  updateCategory(options, callback) { runAction(updateCategoryAction(false), options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateCategory,
   * taking the category's record id.
   * @param {{ categoryId: string, newTitle?: string, newIconImage?: string }} options
   * @param {function(Error=, object=)} callback - (error, { category })
   */
  updateCategoryAdvanced(options, callback) { runAction(updateCategoryAction(true), options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced (batches are never basic); the batch form of
   * updateCategoryAdvanced: each entry names its record by id.
   * @param {{ categories: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  updateCategoriesAdvanced(options, callback) { runBatch(updateCategoryAction(true), 'categories', options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; its advanced alternative is
   * deleteCategoryAdvanced. A soft delete, as CategoriesController.deleteCategory does: the
   * document is kept with deletedOn set (and its index date1), which hides it everywhere in the
   * plugin. Locations keep the category id, as in the control panel. Background; safe because the
   * record is kept.
   * @param {{ categoryTitle: string }} options
   * @param {function(Error=, object=)} callback - (error, { deleted, categoryId, title })
   */
  deleteCategory(options, callback) { runAction(deleteCategoryAction(false), options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of deleteCategory,
   * taking the category's record id.
   * @param {{ categoryId: string }} options
   * @param {function(Error=, object=)} callback - (error, { deleted, categoryId, title })
   */
  deleteCategoryAdvanced(options, callback) { runAction(deleteCategoryAction(true), options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced (batches are never basic); the batch form of
   * deleteCategoryAdvanced: each entry names its record by id.
   * @param {{ categories: Array<{ categoryId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  deleteCategoriesAdvanced(options, callback) { runBatch(deleteCategoryAction(true), 'categories', options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; its advanced alternative is
   * createSubcategoryAdvanced. The Add Subcategory dialog followed by the category's Save: a new
   * subcategory (generated id, the dialog's shape) is appended and the whole category rewritten. A
   * title already used in that category is refused. Background.
   * @param {{ categoryTitle: string, title: string, iconImage?: string }} options
   * @param {function(Error=, object=)} callback - (error, { subcategory, category })
   */
  createSubcategory(options, callback) { runAction(createSubcategoryAction(false), options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of createSubcategory,
   * taking the category's record id.
   * @param {{ categoryId: string, title: string, iconImage?: string }} options
   * @param {function(Error=, object=)} callback - (error, { subcategory, category })
   */
  createSubcategoryAdvanced(options, callback) { runAction(createSubcategoryAction(true), options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced (batches are never basic); the batch form of
   * createSubcategoryAdvanced: each entry names its record by id.
   * @param {{ subcategories: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { subcategories, succeeded, failed })
   */
  createSubcategoriesAdvanced(options, callback) { runBatch(createSubcategoryAction(true), 'subcategories', options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; its advanced alternative is
   * updateSubcategoryAdvanced. The Edit Subcategory dialog and the subcategory icon click,
   * saved with the category. Background.
   * @param {{ categoryTitle: string, subcategoryTitle: string, newTitle?: string, newIconImage?: string }} options
   * @param {function(Error=, object=)} callback - (error, { category })
   */
  updateSubcategory(options, callback) { runAction(updateSubcategoryAction(false), options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateSubcategory,
   * taking category and subcategory ids.
   * @param {{ categoryId: string, subcategoryId: string, newTitle?: string, newIconImage?: string }} options
   * @param {function(Error=, object=)} callback - (error, { category })
   */
  updateSubcategoryAdvanced(options, callback) { runAction(updateSubcategoryAction(true), options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced (batches are never basic); the batch form of
   * updateSubcategoryAdvanced: each entry names its record by id.
   * @param {{ subcategories: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { subcategories, succeeded, failed })
   */
  updateSubcategoriesAdvanced(options, callback) { runBatch(updateSubcategoryAction(true), 'subcategories', options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; its advanced alternative is
   * deleteSubcategoryAdvanced. The subcategory delete in the category form, saved with the
   * category: the subcategory is removed outright (dangerous; there is nothing to restore), and
   * locations keep its id, as in the control panel. Background.
   * @param {{ categoryTitle: string, subcategoryTitle: string }} options
   * @param {function(Error=, object=)} callback - (error, { deleted, subcategoryId, category })
   */
  deleteSubcategory(options, callback) { runAction(deleteSubcategoryAction(false), options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of deleteSubcategory,
   * taking category and subcategory ids.
   * @param {{ categoryId: string, subcategoryId: string }} options
   * @param {function(Error=, object=)} callback - (error, { deleted, subcategoryId, category })
   */
  deleteSubcategoryAdvanced(options, callback) { runAction(deleteSubcategoryAction(true), options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced (batches are never basic); the batch form of
   * deleteSubcategoryAdvanced: each entry names its record by id.
   * @param {{ subcategories: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { subcategories, succeeded, failed })
   */
  deleteSubcategoriesAdvanced(options, callback) { runBatch(deleteSubcategoryAction(true), 'subcategories', options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic. What the control panel's tabs load
   * (Settings.get): the stored settings with the plugin's defaults filled in and old field settings
   * migrated, without the access, editor and billing settings, which the contract does not expose.
   * Uses only buildfire.datastore. No widget host: it is the owner's configuration. Background.
   * @param {object} options - takes no parameters.
   * @param {function(Error=, object=)} callback - (error, { settings })
   */
  getSettings(options, callback) {
    if (!checkOptions(options, callback)) return;
    readSettings((err, { settings } = {}) => {
      if (err) return callback(err, undefined);
      callback(null, { settings: settingsView(settings) });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic. The Settings tab's toggles and radios
   * (Global Settings, Location Settings field toggles, Sorting, Filtering, Map, Bookmarks): changes
   * only the settings passed, with the same rules the pages apply (turning off nearest sorting moves
   * the default to alphabetical and distance can't be the default without it; turning a field off
   * drops its in-app access to nobody), then saves the whole document as SettingsController.
   * saveSettings does and tells the widget. Who-can-add, editors and charging are access and billing
   * settings and are left out. No widget host. Background.
   * @param {object} options - one optional param per setting, see plugin.contract.json.
   * @param {function(Error=, object=)} callback - (error, { settings })
   */
  updateSettings(options, callback) {
    if (!checkOptions(options, callback)) return;
    const problem = firstProblem([
      requireAnyGiven(options, SETTINGS_PARAMS),
      findClearedProblem(options, SETTINGS_PARAMS),
      ...Object.keys(SETTINGS_BOOLEANS).map((name) => checkBoolean(options, name)),
      checkBoolean(options, 'openHoursEnabled'),
      checkBoolean(options, 'priceRangeEnabled'),
      checkSelect(options, 'defaultSorting', DEFAULT_SORTINGS),
      checkSelect(options, 'measurementUnit', MEASUREMENT_UNITS),
      checkNumber(options, 'initialAreaLatitude', { min: -90, max: 90 }),
      checkNumber(options, 'initialAreaLongitude', { min: -180, max: 180 }),
      checkString(options, 'initialAreaAddress'),
      isGiven(options.initialAreaLatitude) !== isGiven(options.initialAreaLongitude)
        || (isGiven(options.initialAreaAddress) && !isGiven(options.initialAreaLatitude))
        ? 'initialAreaLatitude, initialAreaLongitude and initialAreaAddress change together; pass both coordinates'
        : null
    ]);
    if (problem) return callback(new Error(problem), undefined);

    readSettings((err, { settings } = {}) => {
      if (err) return callback(err, undefined);
      const scopes = ['settings'];
      Object.keys(SETTINGS_BOOLEANS).forEach((name) => {
        if (!isGiven(options[name])) return;
        const [group, key] = SETTINGS_BOOLEANS[name];
        settings[group][key] = options[name];
      });
      if (options.allowSortByNearest === false) settings.sorting.defaultSorting = 'alphabetical';
      if (isGiven(options.defaultSorting)) {
        if (options.defaultSorting === 'distance' && !settings.sorting.allowSortByNearest) {
          return callback(new Error('Distance can only be the default sorting while nearest sorting is allowed'), undefined);
        }
        settings.sorting.defaultSorting = options.defaultSorting;
      }
      if (isGiven(options.openHoursEnabled)) setFieldEnabled(settings.globalEntries.openHours, options.openHoursEnabled);
      if (isGiven(options.priceRangeEnabled)) setFieldEnabled(settings.globalEntries.priceRange, options.priceRangeEnabled);
      if (isGiven(options.openHoursEnabled) || isGiven(options.priceRangeEnabled)) scopes.push('locationSettings');
      if (isGiven(options.measurementUnit)) settings.measurementUnit = options.measurementUnit;
      if (isGiven(options.initialAreaLatitude)) {
        settings.map.initialAreaCoordinates = { lat: options.initialAreaLatitude, lng: options.initialAreaLongitude };
        if (isGiven(options.initialAreaAddress)) settings.map.initialAreaDisplayAddress = options.initialAreaAddress;
      }
      saveSettings(settings, scopes, (saveErr, saved) => (saveErr ? callback(saveErr, undefined) : callback(null, { settings: settingsView(saved) })));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic. The Design tab: list view position and
   * style, map type, details map position and its toggles; changes only what is passed, saves the
   * whole settings document as DesignController.saveSettings does and tells the widget (scope
   * design). The map style radios are disabled in the tab, so they are not offered. No widget host.
   * Background.
   * @param {object} options - one optional param per design setting.
   * @param {function(Error=, object=)} callback - (error, { design })
   */
  updateDesign(options, callback) {
    if (!checkOptions(options, callback)) return;
    const problem = firstProblem([
      requireAnyGiven(options, DESIGN_PARAMS),
      findClearedProblem(options, DESIGN_PARAMS),
      ...Object.keys(DESIGN_SELECTS).map((name) => checkSelect(options, name, DESIGN_SELECTS[name])),
      ...DESIGN_BOOLEANS.map((name) => checkBoolean(options, name))
    ]);
    if (problem) return callback(new Error(problem), undefined);
    readSettings((err, { settings } = {}) => {
      if (err) return callback(err, undefined);
      DESIGN_PARAMS.forEach((name) => {
        if (isGiven(options[name])) settings.design[name] = options[name];
      });
      saveSettings(settings, ['design'], (saveErr, saved) => (saveErr ? callback(saveErr, undefined) : callback(null, { design: saved.design })));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic. The Content tab's Introduction screen: its
   * description, location source, local area and sort order; changes only what is passed, saves the
   * whole settings document as the intro page does and tells the widget (scope intro). The
   * description can be cleared (stored as "", as the editor leaves it). Who sees the intro screen is
   * an access setting and is left out. No widget host. Background.
   * @param {{ description?: string|null, sorting?: string, locationSource?: string, areaLatitude?: number, areaLongitude?: number, areaAddress?: string, areaRadiusMiles?: number }} options
   * @param {function(Error=, object=)} callback - (error, { introScreen })
   */
  updateIntroScreen(options, callback) {
    if (!checkOptions(options, callback)) return;
    const problem = firstProblem([
      requireAnyGiven(options, INTRO_PARAMS),
      findClearedProblem(options, INTRO_PARAMS.filter((name) => name !== 'description')),
      checkNullable(options, 'description', checkString),
      checkSelect(options, 'sorting', INTRO_SORTINGS),
      checkSelect(options, 'locationSource', INTRO_SOURCES),
      checkNumber(options, 'areaLatitude', { min: -90, max: 90 }),
      checkNumber(options, 'areaLongitude', { min: -180, max: 180 }),
      checkString(options, 'areaAddress'),
      checkNumber(options, 'areaRadiusMiles', { min: MIN_AREA_RADIUS_MILES, max: MAX_AREA_RADIUS_MILES }),
      isGiven(options.areaLatitude) !== isGiven(options.areaLongitude)
        || (isGiven(options.areaAddress) && !isGiven(options.areaLatitude))
        ? 'areaLatitude, areaLongitude and areaAddress change together; pass both coordinates'
        : null
    ]);
    if (problem) return callback(new Error(problem), undefined);
    readSettings((err, { settings } = {}) => {
      if (err) return callback(err, undefined);
      const intro = settings.introductoryListView;
      intro.searchOptions = intro.searchOptions || { mode: 'UserPosition', areaRadiusOptions: {} };
      const area = { ...(intro.searchOptions.areaRadiusOptions || {}) };
      if (isGiven(options.description)) intro.description = options.description === null ? '' : options.description;
      if (isGiven(options.sorting)) intro.sorting = options.sorting;
      if (isGiven(options.locationSource)) intro.searchOptions.mode = options.locationSource;
      if (isGiven(options.areaLatitude)) {
        area.lat = options.areaLatitude;
        area.lng = options.areaLongitude;
        if (isGiven(options.areaAddress)) area.formattedLocation = options.areaAddress;
      }
      if (isGiven(options.areaRadiusMiles)) area.radius = options.areaRadiusMiles;
      intro.searchOptions.areaRadiusOptions = area;
      saveSettings(settings, ['intro'], (saveErr, saved) => {
        if (saveErr) return callback(saveErr, undefined);
        const view = { ...saved.introductoryListView };
        delete view.visibilityOptions;
        callback(null, { introScreen: view });
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic. The Introduction screen's image carousel
   * (buildfire.components.carousel.editor): replaces every carousel item with the list given, in
   * order, each an action item whose iconUrl is the picture, given an id as the page does. Flagged
   * dangerous because the previous carousel is not kept anywhere. An empty list removes every image.
   * No widget host. Background.
   * @param {{ images: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { images })
   */
  updateIntroScreenImages(options, callback) {
    if (!checkOptions(options, callback)) return;
    const { images } = options;
    if (!Array.isArray(images)) return callback(new Error('Missing required parameter: images (a list of action items)'), undefined);
    const bad = images.findIndex((item) => !isObject(item) || !isNonEmptyString(item.iconUrl) || (isGiven(item.action) && typeof item.action !== 'string'));
    if (bad !== -1) return callback(new Error(`images[${bad}] must be an action item with an iconUrl`), undefined);
    readSettings((err, { settings } = {}) => {
      if (err) return callback(err, undefined);
      settings.introductoryListView.images = images.map((item) => ({ ...item, id: item.id || generateUUID() }));
      saveSettings(settings, ['intro'], (saveErr, saved) => (saveErr ? callback(saveErr, undefined) : callback(null, { images: saved.introductoryListView.images })));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic. The Location Fields page's add buttons:
   * a new field in Quick Actions or Text Content with the page's defaults, refused at ten fields in
   * total and when the label is already used (basic operations find fields by label). Saved with
   * $set on customFields, as the page does, and the widget is told. Field visibility by user tag is
   * an access setting and is left out (new fields are visible to everyone, the page's default).
   * Background.
   * @param {{ section: string, label: string, type?: string, required?: boolean, allowCustomLabel?: boolean }} options
   * @param {function(Error=, object=)} callback - (error, { field })
   */
  createLocationField(options, callback) { runAction(createFieldAction(), options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced (batches are never basic); the batch form of
   * createLocationField.
   * @param {{ fields: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { fields, succeeded, failed })
   */
  createLocationFieldsAdvanced(options, callback) { runBatch(createFieldAction(), 'fields', options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; its advanced alternative is
   * updateLocationFieldAdvanced. Edits a field's label, type, required and custom-label switches, or
   * moves it within its section (drag-to-reorder), as the page does; the type must fit the section.
   * Background.
   * @param {{ label: string, newLabel?: string, newType?: string, newRequired?: boolean, newAllowCustomLabel?: boolean, newPosition?: number }} options
   * @param {function(Error=, object=)} callback - (error, { field })
   */
  updateLocationField(options, callback) { runAction(updateFieldAction(false), options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateLocationField,
   * taking the field's id.
   * @param {{ fieldId: string }} options - plus updateLocationField's new* params.
   * @param {function(Error=, object=)} callback - (error, { field })
   */
  updateLocationFieldAdvanced(options, callback) { runAction(updateFieldAction(true), options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced (batches are never basic); the batch form of
   * updateLocationFieldAdvanced: each entry names its record by id.
   * @param {{ fields: object[] }} options
   * @param {function(Error=, object=)} callback - (error, { fields, succeeded, failed })
   */
  updateLocationFieldsAdvanced(options, callback) { runBatch(updateFieldAction(true), 'fields', options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; its advanced alternative is
   * deleteLocationFieldAdvanced. The page's delete: the field is removed outright (dangerous), and
   * values already filled in on locations are left in place, as on the page. Background.
   * @param {{ label: string }} options
   * @param {function(Error=, object=)} callback - (error, { deleted, fieldId, label })
   */
  deleteLocationField(options, callback) { runAction(deleteFieldAction(false), options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of deleteLocationField,
   * taking the field's id.
   * @param {{ fieldId: string }} options
   * @param {function(Error=, object=)} callback - (error, { deleted, fieldId, label })
   */
  deleteLocationFieldAdvanced(options, callback) { runAction(deleteFieldAction(true), options, callback); },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced (batches are never basic); the batch form of
   * deleteLocationFieldAdvanced: each entry names its record by id.
   * @param {{ fields: Array<{ fieldId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { fields, succeeded, failed })
   */
  deleteLocationFieldsAdvanced(options, callback) { runBatch(deleteFieldAction(true), 'fields', options, callback); }
};

/**
 * What the control panel's frame (control/contract.html) dispatches to: init plus every function
 * whose hosts include controlForeground or controlBackground, in plugin.contract.json order. Every
 * function here has a control host. The implementations are widgetContract's own.
 */
controlContract = {
  init: widgetContract.init
};
Object.keys(widgetContract).forEach((name) => {
  controlContract[name] = widgetContract[name];
});
