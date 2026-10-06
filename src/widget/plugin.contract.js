/* eslint-disable no-undef, max-len */
/**
 * Locations contract — runtime implementation.
 *
 * This file only implements the operations declared with "type": "function" in
 * plugin.contract.json. Operations typed publicData / datastore / userData /
 * appData / firebase are declarative: their platform call is built on the fly
 * from context.query, so they intentionally have no counterpart here.
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
 * The plugin's own create/update/delete flows also register a deeplink, index the
 * location in buildfire.services.searchEngine and register analytics events. Those
 * services are frame APIs that the headless SDK (and contract.html, which loads only
 * the SDK and the contract service) may not provide, so each one is called only when
 * it exists, and — exactly as the plugin does — its failure never fails the action.
 */

const LOCATIONS_TAG = 'locations'; // must match the collection names in plugin.contract.json
const CATEGORIES_TAG = 'categories';
const SETTINGS_TAG = 'settings';

const MAX_PINNED_LOCATIONS = 3; // Mirrors the "N of 3 Pinned" limit in src/control/content/js/locations/index.js
const MAX_PAGE_SIZE = 50;
const MAX_BATCH_SIZE = 50; // No platform limit applies to these one-by-one writes; the skill's default.
const DEFAULT_NEAR_RADIUS_KM = 100; // Mirrors introSearchService's user-position radius.
const EARTH_RADIUS_KM = 6378.1;

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** What requireStringParams checks, as a message (null when valid), for checks that collect problems. */
const findMissingStringParam = (options, names) => {
  if (options === null || typeof options !== 'object') return 'options must be an object';
  const missing = names.find((name) => typeof options[name] !== 'string' || !options[name].trim());
  return missing ? `Missing required parameter: ${missing}` : null;
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
  const problem = findMissingStringParam(options, names);
  if (problem) {
    callback(new Error(problem), undefined);
    return false;
  }
  return true;
};

const isGiven = (value) => value !== undefined && value !== null && value !== '';

/**
 * Update params have three states: left out (undefined) keeps the stored value, null or '' clears
 * it, and anything else sets it. Only the fields the plugin's own forms let people empty are
 * nullable; clearing any other field is refused, never ignored.
 */
const isCleared = (value) => value === null || value === '';

/** The first of these non-nullable update params passed as null or '', as a problem message, or null. */
const findClearedProblem = (options, names) => {
  const name = names.find((n) => isCleared(options[n]));
  return name ? `${name} cannot be removed; leave it out to keep the current value` : null;
};

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

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

/** Mirrors sendContractEvent in src/widget/js/global/helpers.js: the events API may be absent. */
const sendContractEvent = (name, data) => {
  if (buildfire.services && buildfire.services.contract && buildfire.services.contract.events) {
    buildfire.services.contract.events.send(name, data);
  }
};

/** Runs an optional side effect the plugin itself treats as best effort; reports whether it ran. */
const bestEffort = (available, run) => {
  if (!available) return false;
  try {
    run();
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};

/** Mirrors Analytics.registerEvent in src/utils/analytics.js. */
const registerAnalyticsEvent = (title, key) => bestEffort(
  buildfire.analytics && typeof buildfire.analytics.registerEvent === 'function',
  () => buildfire.analytics.registerEvent({ title, key, description: '' }, { silentNotification: true })
);

/** Mirrors DeepLink.registerDeeplink in src/utils/deeplink.js. */
const registerDeeplink = (id, data) => bestEffort(
  buildfire.deeplink && typeof buildfire.deeplink.registerDeeplink === 'function',
  () => buildfire.deeplink.registerDeeplink({
    id: `location-${id}`,
    name: data.title,
    deeplinkData: { locationId: id },
    imageUrl: data.listImage
  }, (err) => { if (err) console.error(err); })
);

/** Mirrors DeepLink.unregisterDeeplink in src/utils/deeplink.js. */
const unregisterDeeplink = (id) => bestEffort(
  buildfire.deeplink && typeof buildfire.deeplink.unregisterDeeplink === 'function',
  () => buildfire.deeplink.unregisterDeeplink(`location-${id}`, (err) => { if (err) console.error(err); })
);

/** Mirrors SearchEngine.add/update in src/widget/js/global/repository/searchEngine.js. */
const saveSearchIndex = (id, data) => bestEffort(
  buildfire.services && buildfire.services.searchEngine,
  () => buildfire.services.searchEngine.save({
    tag: LOCATIONS_TAG,
    key: id,
    data: { locationId: id },
    title: data.title,
    description: data.description ? data.description.replace(/(<([^>]+)>)/gi, '') : '',
    imageUrl: data.listImage,
    keywords: [data.address, data.formattedAddress, data.addressAlias, data.subtitle].join(',')
  }, (err) => { if (err) console.error(err); })
);

/** Mirrors SearchEngine.delete in src/widget/js/global/repository/searchEngine.js. */
const deleteSearchIndex = (id) => bestEffort(
  buildfire.services && buildfire.services.searchEngine,
  () => buildfire.services.searchEngine.delete({ id, tag: LOCATIONS_TAG }, (err) => { if (err) console.error(err); })
);

/**
 * The `_buildfire` block Location.toJSON() writes (src/widget/js/global/data/Location.js),
 * reproduced exactly — including the literal "null" it puts in the text index for an empty
 * address — so a record written here indexes and sorts the same as one written in the app.
 */
const buildLocationIndex = (doc) => ({
  index: {
    text: `${doc.title.toLowerCase()} ${doc.subtitle ? doc.subtitle : ''} ${doc.address} ${doc.formattedAddress} ${doc.addressAlias ? doc.addressAlias : ''}`,
    string1: doc.title.toLowerCase(),
    date1: doc.createdOn,
    array1: [
      ...doc.categories.main.map((id) => ({ string1: `c_${id}` })),
      ...doc.categories.subcategories.map((id) => ({ string1: `s_${id}` })),
      { string1: `v_${doc.views}` },
      { string1: `pr_${doc.price.range}` },
      { string1: `cid_${doc.clientId}` },
      { string1: `title_${doc.title.toLowerCase()}` }
    ],
    number1: doc.pinIndex
  },
  geo: {
    type: 'Point',
    coordinates: [doc.coordinates.lng, doc.coordinates.lat]
  }
});

/** The `_buildfire` block Category.toJSON() writes (src/widget/js/global/data/Category.js). */
const buildCategoryIndex = (doc) => ({
  index: {
    string1: doc.title.toLowerCase(),
    date1: doc.deletedOn,
    number1: doc.quickAccess
  }
});

/** Mirrors getDefaultOpeningHours: 08:00–20:00 every day, as times of day on 1970-01-01 UTC. */
const defaultOpeningHours = () => {
  const intervals = [{ from: new Date(Date.UTC(1970, 0, 1, 8, 0)), to: new Date(Date.UTC(1970, 0, 1, 20, 0)) }];
  const days = {};
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].forEach((day, index) => {
    days[day] = { index, active: true, intervals: [...intervals] };
  });
  return { days, timezone: null };
};

/**
 * The day name and time of day at which "open now" is judged. The plugin judges it in the
 * viewer's local clock (openingNowDate / getCurrentDayName in src/utils/datetime.js); a caller
 * outside the app passes utcOffsetMinutes to say whose clock that is, and without it the host's
 * own clock is used, which on the server is the server's.
 * @returns {{ dayName: string, time: Date } | null} null when `at` is not a valid timestamp.
 */
const resolveOpeningMoment = (at, utcOffsetMinutes) => {
  const instant = isGiven(at) ? new Date(at) : new Date();
  if (Number.isNaN(instant.getTime())) return null;

  let day;
  let hours;
  let minutes;
  if (isFiniteNumber(utcOffsetMinutes)) {
    const shifted = new Date(instant.getTime() + utcOffsetMinutes * 60000);
    day = shifted.getUTCDay();
    hours = shifted.getUTCHours();
    minutes = shifted.getUTCMinutes();
  } else {
    day = instant.getDay();
    hours = instant.getHours();
    minutes = instant.getMinutes();
  }
  // Interval bounds are stored as times of day on 1970-01-01 UTC, so compare against a date normalized the same way.
  return { dayName: DAY_NAMES[day], time: new Date(Date.UTC(1970, 0, 1, hours, minutes)) };
};

/** Mirrors isLocationOpen in src/widget/js/util/helpers.js, tolerating a day with no entry. */
const isOpenAt = (data, moment) => {
  const today = data.openingHours && data.openingHours.days && data.openingHours.days[moment.dayName];
  if (!today || !today.active || !Array.isArray(today.intervals)) return false;
  return today.intervals.some((i) => i && new Date(i.from) <= moment.time && new Date(i.to) > moment.time);
};

/** The public shape of one location, read off a stored record. */
const toLocationSummary = (id, data, moment) => ({
  id,
  title: data.title,
  subtitle: data.subtitle || null,
  address: data.address || null,
  formattedAddress: data.formattedAddress || null,
  addressAlias: data.addressAlias || null,
  lat: data.coordinates ? data.coordinates.lat : null,
  lng: data.coordinates ? data.coordinates.lng : null,
  description: data.description || null,
  listImage: data.listImage || null,
  priceRange: data.price ? data.price.range : null,
  currency: data.price ? data.price.currency : null,
  ratingAverage: data.rating ? data.rating.average : 0,
  ratingCount: data.rating ? data.rating.count : 0,
  isPinned: [1, 2, 3].includes(data.pinIndex),
  subscriberCount: Array.isArray(data.subscribers) ? data.subscribers.length : 0,
  isOpenNow: isOpenAt(data, moment),
  createdOn: data.createdOn || null
});

/** publicData.search answers an array, or { result, totalRecord } when recordCount is set. */
const readSearchResponse = (response) => {
  if (Array.isArray(response)) return { records: response.filter(Boolean), total: undefined };
  return {
    records: ((response && response.result) || []).filter(Boolean),
    total: response ? response.totalRecord : undefined
  };
};

/**
 * The location a caller named by its exact title. Matching is on the plugin's own lowercased
 * title index, so it is case-insensitive like the widget's title lookup. A title matching
 * several locations is refused rather than resolved to one of them: on a write, picking would
 * mean acting on a location the caller did not mean.
 * @param {string} title
 * @param {function(Error=, object=)} callback - (error, { id, data })
 */
const resolveLocation = (title, callback) => {
  const filter = { '_buildfire.index.string1': title.trim().toLowerCase() };
  buildfire.publicData.search({ filter, pageSize: 2 }, LOCATIONS_TAG, (err, response) => {
    if (err) return callback(err, undefined);
    const { records } = readSearchResponse(response);
    if (!records.length) return callback(new Error(`No location titled "${title}"`), undefined);
    if (records.length > 1) return callback(new Error(`${records.length} or more locations are titled "${title}"`), undefined);
    callback(null, { id: records[0].id, data: records[0].data });
  });
};

/**
 * The live (not deleted) category a caller named by its exact title, case-insensitively.
 * Deleted categories keep a deletedOn date in date1, so live ones are those where it is null.
 * @param {string} title
 * @param {function(Error=, object=)} callback - (error, { id, data })
 */
const resolveCategory = (title, callback) => {
  const filter = {
    '_buildfire.index.string1': title.trim().toLowerCase(),
    '_buildfire.index.date1': { $type: 10 }
  };
  buildfire.publicData.search({ filter, pageSize: 2 }, CATEGORIES_TAG, (err, response) => {
    if (err) return callback(err, undefined);
    const { records } = readSearchResponse(response);
    if (!records.length) return callback(new Error(`No category titled "${title}"`), undefined);
    if (records.length > 1) return callback(new Error(`${records.length} or more categories are titled "${title}"`), undefined);
    callback(null, { id: records[0].id, data: records[0].data });
  });
};

/**
 * The location an advanced operation names by its record id, checked to exist: the advanced
 * counterpart of resolveLocation, with no search, but an id that matches nothing is still refused.
 * @param {string} locationId
 * @param {function(Error=, object=)} callback - (error, { id, data })
 */
const requireLocationById = (locationId, callback) => {
  buildfire.publicData.getById(locationId, LOCATIONS_TAG, (err, record) => {
    if (err) return callback(err, undefined);
    if (!record || !record.data || !Object.keys(record.data).length) {
      return callback(new Error(`No location with id "${locationId}"`), undefined);
    }
    callback(null, { id: record.id || locationId, data: record.data });
  });
};

/**
 * A live category by its record id; a soft-deleted one counts as missing, as it does in the app.
 * The advanced counterpart of resolveCategory.
 * @param {function(Error=, object=)} callback - (error, { id, data })
 */
const resolveCategoryById = (categoryId, callback) => {
  buildfire.publicData.getById(categoryId, CATEGORIES_TAG, (err, record) => {
    if (err) return callback(err, undefined);
    if (!record || !record.data || !Object.keys(record.data).length || record.data.deletedOn) {
      return callback(new Error(`No category with id "${categoryId}"`), undefined);
    }
    callback(null, { id: record.id || categoryId, data: record.data });
  });
};

/**
 * How a basic read or send finds the location it names (its title, by search) and how its advanced
 * alternative does (its record id, checked to exist). readLocation and notifyLocationSubscribers
 * take one of these, so a basic operation and its alternative behave identically once the location
 * is found. Writes name their record through LOCATION_BY_TITLE / LOCATION_BY_ID instead.
 */
const findLocationByTitle = (options) => (callback) => resolveLocation(options.title, callback);
const findLocationById = (options) => (callback) => requireLocationById(options.locationId, callback);

/**
 * Resolves an optional category (and optional subcategory inside it) to the `categories` block a
 * location stores. Basic operations give them by title; their advanced alternatives by id, as
 * searchCategories gives them. Neither given → null, meaning "leave unchanged".
 * @param {boolean} byId - true for an advanced operation's ids, false for a basic one's titles.
 * @param {{ category?: string, subcategory?: string, categoryName: string, subcategoryName: string }} handles
 *   the values and the parameter names they came from, for error messages.
 * @param {function(Error=, object=)} callback - (error, { main, subcategories } | null)
 */
const resolveLocationCategories = (byId, handles, callback) => {
  const {
    category, subcategory, categoryName, subcategoryName
  } = handles;
  const notText = [[categoryName, category], [subcategoryName, subcategory]].find(([, v]) => isGiven(v) && typeof v !== 'string');
  if (notText) return callback(new Error(`${notText[0]} must be text`), undefined);

  if (!isGiven(category)) {
    if (isGiven(subcategory)) return callback(new Error(`${subcategoryName} needs ${categoryName}`), undefined);
    return callback(null, null);
  }
  const lookup = byId ? resolveCategoryById : resolveCategory;
  lookup(category, (err, found) => {
    if (err) return callback(err, undefined);
    if (!isGiven(subcategory)) return callback(null, { main: [found.id], subcategories: [] });

    const subcategories = (found.data.subcategories || []).filter(Boolean);
    if (byId) {
      const match = subcategories.find((s) => s.id === subcategory);
      if (!match) return callback(new Error(`Category "${found.data.title}" has no subcategory with id "${subcategory}"`), undefined);
      return callback(null, { main: [found.id], subcategories: [match.id] });
    }
    const wanted = subcategory.trim().toLowerCase();
    const matches = subcategories.filter((s) => s.title && s.title.toLowerCase() === wanted);
    if (!matches.length) return callback(new Error(`Category "${category}" has no subcategory titled "${subcategory}"`), undefined);
    if (matches.length > 1) return callback(new Error(`${matches.length} subcategories of "${category}" are titled "${subcategory}"`), undefined);
    callback(null, { main: [found.id], subcategories: [matches[0].id] });
  });
};

/** The category filter or value a search or create was given, by title (basic) or by id (advanced). */
const locationCategoryHandles = (options, byId) => (byId
  ? {
    category: options.categoryId, subcategory: options.subcategoryId, categoryName: 'categoryId', subcategoryName: 'subcategoryId'
  }
  : {
    category: options.categoryTitle, subcategory: options.subcategoryTitle, categoryName: 'categoryTitle', subcategoryName: 'subcategoryTitle'
  });

/**
 * An app user named by id or email, as the id the plugin stores in `subscribers` and
 * `createdBy.userId`. An email is recognised by its "@" and looked up in the app's users.
 * @param {function(Error=, string=)} callback - (error, userId)
 */
const resolveUserId = (user, callback) => {
  if (user.indexOf('@') === -1) return callback(null, user);
  buildfire.auth.getUsersByEmail({ emails: [user] }, (err, users) => {
    if (err) return callback(err, undefined);
    const found = (Array.isArray(users) ? users : []).filter(Boolean);
    if (!found.length) return callback(new Error(`No app user with email "${user}"`), undefined);
    if (found.length > 1) return callback(new Error(`${found.length} app users have email "${user}"`), undefined);
    callback(null, found[0].userId || found[0]._id);
  });
};

/** Reads and validates the optional page / pageSize pair; null when invalid (callback fired). */
const readPaging = (options, callback) => {
  const page = isGiven(options.page) ? options.page : 0;
  const pageSize = isGiven(options.pageSize) ? options.pageSize : 20;
  if (!Number.isInteger(page) || page < 0) {
    callback(new Error('page must be a whole number, 0 or more'), undefined);
    return null;
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    callback(new Error(`pageSize must be a whole number from 1 to ${MAX_PAGE_SIZE}`), undefined);
    return null;
  }
  return { page, pageSize };
};

/** Validates an optional price range: the plugin's selector offers 1 to 4. */
const isValidPriceRange = (value) => Number.isInteger(value) && value >= 1 && value <= 4;

// The currencies the create/edit forms offer: widget templates/create.html and edit.html
// (#locationCurrencySelect) and the control panel's #location-select-price-currency in
// control/content/templates/locations.html. Neither form takes a custom value.
const CURRENCIES = ['$', '€'];

const SORTS = {
  // Mirrors the widget's sort options (src/widget/widget.js): alphabetical sorts on the text index.
  alphabetical: { '_buildfire.index.text': 1 },
  reverseAlphabetical: { '_buildfire.index.text': -1 },
  newest: { '_buildfire.index.date1': -1 },
  oldest: { '_buildfire.index.date1': 1 }
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

/** Reads the optional at / utcOffsetMinutes pair; null when invalid (callback fired). */
const readOpeningMoment = (options, callback) => {
  if (isGiven(options.utcOffsetMinutes) && !isFiniteNumber(options.utcOffsetMinutes)) {
    callback(new Error('utcOffsetMinutes must be a number'), undefined);
    return null;
  }
  const moment = resolveOpeningMoment(options.at, options.utcOffsetMinutes);
  if (!moment) callback(new Error(`Invalid timestamp: ${options.at}`), undefined);
  return moment;
};

/**
 * Shared by searchLocations and searchLocationsByCategoryId; they differ only in whether the
 * category and subcategory filter is given by title or by id.
 * Assumption: when several filters are given they all apply (category, subcategory and price are
 * required together through `$all`); the widget's own quick filter unions its category and price
 * chips into one `$in`, which reads as "any of these".
 */
const searchLocationRecords = (options, byId, callback) => {
  if (!requireStringParams(options, [], callback)) return;
  const paging = readPaging(options, callback);
  if (!paging) return;

  if (isGiven(options.sortBy) && !SORTS[options.sortBy]) {
    return callback(new Error(`sortBy must be one of: ${Object.keys(SORTS).join(', ')}`), undefined);
  }
  if (isGiven(options.priceRange) && !isValidPriceRange(options.priceRange)) {
    return callback(new Error('priceRange must be a whole number from 1 to 4'), undefined);
  }
  const moment = readOpeningMoment(options, callback);
  if (!moment) return;

  resolveLocationCategories(byId, locationCategoryHandles(options, byId), (catErr, categories) => {
    if (catErr) return callback(catErr, undefined);

    const withCreator = (next) => (isGiven(options.createdByUserId)
      ? resolveUserId(options.createdByUserId, next)
      : next(null, null));

    withCreator((userErr, creatorId) => {
      if (userErr) return callback(userErr, undefined);

      const filter = {};
      const requiredTags = [];
      if (isGiven(options.title)) filter['_buildfire.index.string1'] = options.title.trim().toLowerCase();
      if (isGiven(options.text)) {
        filter['_buildfire.index.text'] = { $regex: escapeRegex(options.text.trim().toLowerCase()), $options: 'i' };
      }
      if (categories) {
        requiredTags.push(...categories.main.map((id) => `c_${id}`));
        requiredTags.push(...categories.subcategories.map((id) => `s_${id}`));
      }
      if (isGiven(options.priceRange)) requiredTags.push(`pr_${options.priceRange}`);
      if (requiredTags.length) filter['_buildfire.index.array1.string1'] = { $all: requiredTags };
      // introSearchService's "My Locations" matches createdBy.userId, not createdBy._id.
      if (creatorId) filter['$json.createdBy.userId'] = creatorId;
      if (options.pinnedOnly === true) filter['_buildfire.index.number1'] = { $in: [1, 2, 3] };
      if (options.openNow === true) {
        // Mirrors buildOpenNowCriteria in src/widget/services/search/shared.js, with the $json. prefix a publicData filter needs.
        filter[`$json.openingHours.days.${moment.dayName}.intervals`] = {
          $elemMatch: { from: { $lte: moment.time }, to: { $gt: moment.time } }
        };
        filter[`$json.openingHours.days.${moment.dayName}.active`] = true;
      }

      let sort = SORTS[options.sortBy || 'alphabetical'];
      // Pinned locations are shown in pin order unless the caller picked a sort.
      if (options.pinnedOnly === true && !isGiven(options.sortBy)) sort = { '_buildfire.index.number1': 1 };

      const searchOptions = {
        filter, sort, page: paging.page, pageSize: paging.pageSize, recordCount: true
      };
      buildfire.publicData.search(searchOptions, LOCATIONS_TAG, (err, response) => {
        if (err) return callback(err, undefined);
        const { records, total } = readSearchResponse(response);
        const locations = records.map((r) => toLocationSummary(r.id, r.data, moment));
        const result = { locations, page: paging.page };
        if (typeof total === 'number') {
          result.total = total;
          result.hasMore = (paging.page + 1) * paging.pageSize < total;
        }
        callback(null, result);
      });
    });
  });
};

/**
 * Shared by getLocation and getLocationByLocationId: one location with its category and
 * subcategory titles resolved and whether it is open at the given moment.
 * @param {object} options
 * @param {function(function)} findLocation - findLocationByTitle(options) or findLocationById(options).
 * @param {function(Error=, object=)} callback - (error, location)
 */
const readLocation = (options, findLocation, callback) => {
  const moment = readOpeningMoment(options, callback);
  if (!moment) return;

  findLocation((err, location) => {
    if (err) return callback(err, undefined);

    const categoryIds = (location.data.categories && location.data.categories.main) || [];
    const subcategoryIds = (location.data.categories && location.data.categories.subcategories) || [];
    const result = { ...toLocationSummary(location.id, location.data, moment), categories: [], subcategories: [] };
    if (!categoryIds.length) return callback(null, result);

    // Walks the live categories page by page, as CategoriesController.getAllCategories does;
    // ids of deleted categories stay on locations and are simply not reported.
    const collect = (page) => buildfire.publicData.search({
      filter: { '_buildfire.index.date1': { $type: 10 } },
      sort: { '_buildfire.index.string1': 1 },
      pageSize: MAX_PAGE_SIZE,
      page
    }, CATEGORIES_TAG, (catErr, response) => {
      if (catErr) return callback(catErr, undefined);
      const { records } = readSearchResponse(response);
      records.forEach((r) => {
        if (categoryIds.includes(r.id)) result.categories.push(r.data.title);
        (r.data.subcategories || []).forEach((s) => {
          if (s && subcategoryIds.includes(s.id)) result.subcategories.push(s.title);
        });
      });
      if (records.length < MAX_PAGE_SIZE) return callback(null, result);
      collect(page + 1);
    });
    collect(0);
  });
};

/**
 * How a write operation names the record it acts on. A basic operation names a location or
 * category by its exact title (resolved by search, see resolveLocation / resolveCategory); its
 * advanced alternative by its record id (checked to exist). `param` is the option that carries it.
 */
const LOCATION_BY_TITLE = { param: 'title', find: (o, cb) => resolveLocation(o.title, cb) };
const LOCATION_BY_ID = { param: 'locationId', find: (o, cb) => requireLocationById(o.locationId, cb) };
const CATEGORY_BY_TITLE = { param: 'title', find: (o, cb) => resolveCategory(o.title, cb) };
const CATEGORY_BY_ID = { param: 'categoryId', find: (o, cb) => resolveCategoryById(o.categoryId, cb) };

/**
 * Every write a single operation and its batch share is one "action":
 *   check(options)             → a problem message, or null. No I/O.
 *   resolve(options, cb)       → cb(error, found): every lookup the write needs (handles, categories, users).
 *   keys(options, found)       → strings naming what the entry acts on, so a batch can refuse repeats.
 *   apply(options, found, cb)  → cb(error, result): the write and every side effect it has.
 *   idOf(result, found)        → the id of the record written, for a batch's per-entry outcome.
 * The single operation runs check → resolve → apply. Its batch runs every check, then every resolve,
 * then each apply in turn (runBatch), so each entry gets exactly what the single operation does.
 */
const runAction = (action, options, callback) => {
  if (typeof callback !== 'function') throw new TypeError('callback must be a function');
  const problem = action.check(options);
  if (problem) return callback(new Error(problem), undefined);
  action.resolve(options, (err, found) => {
    if (err) return callback(err, undefined);
    action.apply(options, found, callback);
  });
};

/**
 * The batch form of an action: up to MAX_BATCH_SIZE entries, each shaped like the single
 * operation's params, under options[listName].
 *   1. Every entry passes the single operation's checks, or the call fails naming each bad entry
 *      and nothing is written.
 *   2. Every entry's lookups succeed (no missing or ambiguous title, no unknown id), and no record
 *      is named twice, or the call fails naming the entries and nothing is written.
 *   3. Each entry is applied in turn through the single operation's own apply. A failed write is
 *      recorded in that entry's outcome and the rest still run.
 * @param {function(Error=, object=)} callback - (error, { [listName]: [{ index, id, error }], succeeded, failed })
 */
const runBatch = (action, options, listName, callback) => {
  if (typeof callback !== 'function') throw new TypeError('callback must be a function');
  const entries = options && options[listName];
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > MAX_BATCH_SIZE) {
    return callback(new Error(`${listName} must be a list of 1 to ${MAX_BATCH_SIZE} entries`), undefined);
  }

  const invalid = entries
    .map((entry, index) => {
      const problem = action.check(entry);
      return problem ? `entry ${index}: ${problem}` : null;
    })
    .filter(Boolean);
  if (invalid.length) return callback(new Error(`Invalid entries: ${invalid.join('; ')}`), undefined);

  const found = [];
  const unresolved = [];

  const applyAll = () => {
    const problems = unresolved.filter(Boolean);
    if (problems.length) return callback(new Error(`Could not resolve: ${problems.join('; ')}`), undefined);

    const seen = {};
    const repeated = [];
    entries.forEach((entry, index) => {
      action.keys(entry, found[index]).forEach((key) => {
        if (key in seen) repeated.push(`entries ${seen[key]} and ${index}`);
        else seen[key] = index;
      });
    });
    if (repeated.length) {
      return callback(new Error(`The same record is listed more than once: ${repeated.join('; ')}`), undefined);
    }

    const outcomes = [];
    const record = (index, err, result) => {
      outcomes.push({
        index,
        id: err ? null : action.idOf(result, found[index]),
        error: err ? (err.message || String(err)) : null
      });
    };
    const applyNext = (index) => {
      if (index === entries.length) {
        const failed = outcomes.filter((o) => o.error).length;
        return callback(null, { [listName]: outcomes, succeeded: outcomes.length - failed, failed });
      }
      let settled = false;
      const next = (err, result) => {
        if (settled) return;
        settled = true;
        record(index, err, result);
        applyNext(index + 1);
      };
      try {
        action.apply(entries[index], found[index], next);
      } catch (e) {
        next(e);
      }
    };
    applyNext(0);
  };

  let pending = entries.length;
  entries.forEach((entry, index) => {
    action.resolve(entry, (err, result) => {
      if (err) unresolved[index] = `entry ${index}: ${err.message || err}`;
      else found[index] = result;
      pending -= 1;
      if (pending === 0) applyAll();
    });
  });
};

/** The problem with a category / subcategory pair given by title or id, or null. */
const categoryHandlesProblem = (handles) => {
  const {
    category, subcategory, categoryName, subcategoryName
  } = handles;
  const notText = [[categoryName, category], [subcategoryName, subcategory]].find(([, v]) => isGiven(v) && typeof v !== 'string');
  if (notText) return `${notText[0]} must be text`;
  if (!isGiven(category) && isGiven(subcategory)) return `${subcategoryName} needs ${categoryName}`;
  return null;
};

/**
 * Shared by createLocation, createLocationByCategoryId and their batches; they differ only in
 * whether the category and subcategory are given by title or by id.
 * The creator is left unset: createdBy grants edit rights in accessManager.canEditLocations,
 * and a caller outside the app is not an app user, so the location is created as the app.
 * In a batch, two entries with the same title are refused, since the title is the handle every
 * basic operation names a location by.
 */
const locationCreation = (byId) => ({
  check: (options) => {
    const missing = findMissingStringParam(options, ['title', 'description', 'address', 'listImage']);
    if (missing) return missing;
    if (!isFiniteNumber(options.lat) || options.lat < -90 || options.lat > 90) return 'lat must be a number from -90 to 90';
    if (!isFiniteNumber(options.lng) || options.lng < -180 || options.lng > 180) return 'lng must be a number from -180 to 180';
    if (isGiven(options.priceRange) && !isValidPriceRange(options.priceRange)) return 'priceRange must be a whole number from 1 to 4';
    if (isGiven(options.currency) && !CURRENCIES.includes(options.currency)) return `currency must be one of: ${CURRENCIES.join(', ')}`;
    return categoryHandlesProblem(locationCategoryHandles(options, byId));
  },
  resolve: (options, cb) => resolveLocationCategories(byId, locationCategoryHandles(options, byId), (err, categories) => {
    if (err) return cb(err, undefined);
    cb(null, { categories });
  }),
  keys: (options) => [`title:${options.title.trim().toLowerCase()}`],
  apply: (options, found, callback) => {
    const now = new Date();
    // Same fields and defaults as new Location(...).toJSON() in src/widget/js/global/data/Location.js.
    const doc = {
      clientId: generateUUID(),
      title: options.title.trim(),
      subtitle: isGiven(options.subtitle) ? options.subtitle : null,
      pinIndex: null,
      address: options.address,
      formattedAddress: options.address,
      addressAlias: isGiven(options.addressAlias) ? options.addressAlias : null,
      subscribers: [],
      coordinates: { lat: options.lat, lng: options.lng },
      marker: {
        type: 'pin', image: null, color: null, base64Image: null
      },
      categories: found.categories || { main: [], subcategories: [] },
      settings: {
        showCategory: true, showOpeningHours: false, showPriceRange: false, showStarRating: false
      },
      openingHours: defaultOpeningHours(),
      images: [],
      listImage: options.listImage,
      description: options.description,
      wysiwygSource: 'control',
      views: 0,
      price: { range: isGiven(options.priceRange) ? options.priceRange : 1, currency: isGiven(options.currency) ? options.currency : '$' },
      rating: { total: 0, count: 0, average: 0 },
      bookmarksCount: 0,
      actionItems: [],
      editingPermissions: { active: false, editors: [], tags: [] },
      createdOn: now,
      createdBy: null,
      lastUpdatedOn: now,
      lastUpdatedBy: null,
      deletedOn: null,
      deletedBy: null,
      isActive: 1,
      additionalFields: { quickActions: [], content: [] }
    };
    doc._buildfire = buildLocationIndex(doc);

    buildfire.publicData.insert(doc, LOCATIONS_TAG, (err, record) => {
      if (err) return callback(err, undefined);
      const data = record.data || doc;
      sendContractEvent('locationCreated', { locationId: record.id, title: data.title });
      registerAnalyticsEvent(`${data.title} (Viewed)`, `locations_${record.id}_viewed`);
      const deeplinkRegistered = registerDeeplink(record.id, data);
      const searchIndexed = saveSearchIndex(record.id, data);
      callback(null, {
        ...toLocationSummary(record.id, data, resolveOpeningMoment(undefined, undefined)),
        deeplinkRegistered,
        searchIndexed
      });
    });
  },
  idOf: (result) => result.id
});

/**
 * The changes an update asked for, validated: { problem } when invalid, otherwise
 * { problem: null, changes, categoryHandles, categoryGiven, categoryClear }. Pure, so a batch can
 * check every entry before any lookup.
 * Subtitle, address alias and categories are the fields the edit form lets people empty (its
 * locationInputValidation requires the rest), so only they can be cleared. The form stores an
 * emptied subtitle or alias as '' (the input's value), and a location with no category as
 * { main: [], subcategories: [] }, so a cleared one is stored the same way.
 * @param {boolean} byId - whether the new category is given by newCategoryId / newSubcategoryId
 *   (advanced) rather than by newCategoryTitle / newSubcategoryTitle (basic).
 */
const readLocationChanges = (options, byId) => {
  const fail = (problem) => ({ problem });
  const cleared = findClearedProblem(options, [
    'newTitle', 'newDescription', 'newAddress', 'newLat', 'newLng', 'newListImage', 'newPriceRange', 'newCurrency'
  ]);
  if (cleared) return fail(cleared);
  const textParams = ['newTitle', 'newSubtitle', 'newDescription', 'newAddressAlias', 'newListImage', 'newCurrency'];
  const notText = textParams.find((name) => isGiven(options[name]) && typeof options[name] !== 'string');
  if (notText) return fail(`${notText} must be text`);

  const changes = {};
  if (isGiven(options.newTitle)) {
    if (!options.newTitle.trim()) return fail('newTitle cannot be blank');
    changes.title = options.newTitle.trim();
  }
  if (options.newSubtitle !== undefined) changes.subtitle = isCleared(options.newSubtitle) ? '' : options.newSubtitle;
  if (isGiven(options.newDescription)) changes.description = options.newDescription;
  if (options.newAddressAlias !== undefined) changes.addressAlias = isCleared(options.newAddressAlias) ? '' : options.newAddressAlias;
  if (isGiven(options.newListImage)) changes.listImage = options.newListImage;
  if (isGiven(options.newCurrency)) {
    if (!CURRENCIES.includes(options.newCurrency)) return fail(`newCurrency must be one of: ${CURRENCIES.join(', ')}`);
    changes.currency = options.newCurrency;
  }
  if (isGiven(options.newPriceRange)) {
    if (!isValidPriceRange(options.newPriceRange)) return fail('newPriceRange must be a whole number from 1 to 4');
    changes.priceRange = options.newPriceRange;
  }

  // The address and its coordinates change together, as they do when a new address is picked on the map.
  const addressParts = [options.newAddress, options.newLat, options.newLng].filter(isGiven).length;
  if (addressParts && addressParts !== 3) return fail('newAddress, newLat and newLng must be given together');
  if (addressParts) {
    if (typeof options.newAddress !== 'string') return fail('newAddress must be text');
    if (!isFiniteNumber(options.newLat) || options.newLat < -90 || options.newLat > 90) return fail('newLat must be a number from -90 to 90');
    if (!isFiniteNumber(options.newLng) || options.newLng < -180 || options.newLng > 180) return fail('newLng must be a number from -180 to 180');
    changes.address = options.newAddress;
  }
  const [categoryName, subcategoryName] = byId ? ['newCategoryId', 'newSubcategoryId'] : ['newCategoryTitle', 'newSubcategoryTitle'];
  const category = options[categoryName];
  const subcategory = options[subcategoryName];
  if (isCleared(category) && isGiven(subcategory)) return fail(`${subcategoryName} needs ${categoryName}`);
  // Clearing the category clears its subcategory with it; clearing only the subcategory keeps the
  // category. A cleared handle is never looked up.
  let categoryClear = null;
  if (isCleared(category)) categoryClear = 'all';
  else if (isCleared(subcategory) && category === undefined) categoryClear = 'subcategories';
  const categoryHandles = {
    category: isCleared(category) ? undefined : category,
    subcategory: isCleared(subcategory) ? undefined : subcategory,
    categoryName,
    subcategoryName
  };
  const categoryGiven = categoryClear !== null || isGiven(categoryHandles.category) || isGiven(categoryHandles.subcategory);
  if (!Object.keys(changes).length && !categoryGiven) return fail('Pass at least one field to change');
  const categoryProblem = categoryHandlesProblem(categoryHandles);
  if (categoryProblem) return fail(categoryProblem);

  return {
    problem: null, changes, categoryHandles, categoryGiven, categoryClear
  };
};

/**
 * Shared by updateLocation, updateLocationByLocationId and their batches. The edit forms save the
 * whole document, so this reads the record, applies only the changes the caller passed, rebuilds
 * the index the same way Location.toJSON() does and writes it back, then refreshes the deeplink
 * and search index (best effort) and fires locationUpdated — the same steps as updateLocation in
 * editView.js and the control panel's controller.
 * @param {{ param: string, find: function }} handle - LOCATION_BY_TITLE or LOCATION_BY_ID.
 * @param {boolean} byId - see readLocationChanges.
 */
const locationUpdate = (handle, byId) => ({
  check: (options) => findMissingStringParam(options, [handle.param]) || readLocationChanges(options, byId).problem,
  resolve: (options, cb) => handle.find(options, (err, location) => {
    if (err) return cb(err, undefined);
    resolveLocationCategories(byId, readLocationChanges(options, byId).categoryHandles, (catErr, categories) => {
      if (catErr) return cb(catErr, undefined);
      cb(null, { location, categories });
    });
  }),
  keys: (options, found) => [`location:${found.location.id}`],
  apply: (options, found, callback) => {
    const { changes, categoryClear } = readLocationChanges(options, byId);
    const { location, categories } = found;
    const doc = { ...location.data };
    delete doc._buildfire;
    if (changes.title) doc.title = changes.title;
    if ('subtitle' in changes) doc.subtitle = changes.subtitle;
    if ('description' in changes) doc.description = changes.description;
    if ('addressAlias' in changes) doc.addressAlias = changes.addressAlias;
    if ('listImage' in changes) doc.listImage = changes.listImage;
    if ('address' in changes) {
      doc.address = changes.address;
      doc.formattedAddress = changes.address;
      doc.coordinates = { lat: options.newLat, lng: options.newLng };
    }
    doc.price = { range: 1, currency: '$', ...(doc.price || {}) };
    if ('priceRange' in changes) doc.price.range = changes.priceRange;
    if ('currency' in changes) doc.price.currency = changes.currency;
    if (categoryClear === 'all') doc.categories = { main: [], subcategories: [] };
    else if (categoryClear === 'subcategories') doc.categories = { main: [], ...(doc.categories || {}), subcategories: [] };
    else if (categories) doc.categories = categories;
    doc.categories = doc.categories || { main: [], subcategories: [] };
    doc.coordinates = doc.coordinates || { lat: null, lng: null };
    doc.views = Number.isNaN(parseInt(doc.views, 10)) ? 0 : parseInt(doc.views, 10);
    doc.pinIndex = doc.pinIndex || null;
    doc.lastUpdatedOn = new Date();
    doc.lastUpdatedBy = null;
    doc._buildfire = buildLocationIndex(doc);

    buildfire.publicData.update(location.id, doc, LOCATIONS_TAG, (updateErr) => {
      if (updateErr) return callback(updateErr, undefined);
      sendContractEvent('locationUpdated', { locationId: location.id, title: doc.title });
      const deeplinkRegistered = registerDeeplink(location.id, doc);
      const searchIndexed = saveSearchIndex(location.id, doc);
      callback(null, {
        ...toLocationSummary(location.id, doc, resolveOpeningMoment(undefined, undefined)),
        deeplinkRegistered,
        searchIndexed
      });
    });
  },
  idOf: (result, found) => found.location.id
});

/**
 * Writes a location back with a new pin position, the way the control panel's pin button and the
 * Introduction screen's pinned list do (a full-record update), and fires locationUpdated.
 * @param {function(Error=)} callback
 */
const writeLocationPin = (location, pinIndex, callback) => {
  const doc = { ...location.data };
  delete doc._buildfire;
  doc.pinIndex = pinIndex;
  doc.categories = doc.categories || { main: [], subcategories: [] };
  doc.coordinates = doc.coordinates || { lat: null, lng: null };
  doc.price = { range: 1, currency: '$', ...(doc.price || {}) };
  doc.views = Number.isNaN(parseInt(doc.views, 10)) ? 0 : parseInt(doc.views, 10);
  doc.lastUpdatedOn = new Date();
  doc.lastUpdatedBy = null;
  doc._buildfire = buildLocationIndex(doc);
  buildfire.publicData.update(location.id, doc, LOCATIONS_TAG, (updateErr) => {
    if (updateErr) return callback(updateErr);
    sendContractEvent('locationUpdated', { locationId: location.id, title: doc.title });
    callback(null, doc);
  });
};

/**
 * Shared by updateLocationPin, updateLocationPinByLocationId and their batches: at most three
 * locations are pinned, a newly pinned one takes the next position (pinned count + 1, as the
 * control panel assigns it), and unpinning clears the position without renumbering the others.
 * In a batch the pinned count is read again for each entry, so the three-pin limit holds across it.
 */
const locationPin = (handle) => ({
  check: (options) => findMissingStringParam(options, [handle.param])
    || (typeof options.isPinned !== 'boolean' ? 'isPinned must be true or false' : null),
  resolve: (options, cb) => handle.find(options, (err, location) => {
    if (err) return cb(err, undefined);
    cb(null, { location });
  }),
  keys: (options, found) => [`location:${found.location.id}`],
  apply: (options, found, callback) => {
    const { location } = found;
    const current = location.data.pinIndex || null;
    const writePin = (pinIndex) => writeLocationPin(location, pinIndex, (err, doc) => {
      if (err) return callback(err, undefined);
      callback(null, { title: doc.title, isPinned: pinIndex !== null, pinPosition: pinIndex });
    });

    if (!options.isPinned) {
      if (current === null) return callback(null, { title: location.data.title, isPinned: false, pinPosition: null });
      return writePin(null);
    }
    if (current !== null) return callback(null, { title: location.data.title, isPinned: true, pinPosition: current });

    buildfire.publicData.search({
      filter: { '_buildfire.index.number1': { $in: [1, 2, 3] } }, pageSize: MAX_PAGE_SIZE, recordCount: true
    }, LOCATIONS_TAG, (searchErr, response) => {
      if (searchErr) return callback(searchErr, undefined);
      const { records, total } = readSearchResponse(response);
      const pinnedCount = typeof total === 'number' ? total : records.length;
      if (pinnedCount >= MAX_PINNED_LOCATIONS) {
        return callback(new Error(`${MAX_PINNED_LOCATIONS} locations are already pinned; unpin one first`), undefined);
      }
      writePin(pinnedCount + 1);
    });
  },
  idOf: (result, found) => found.location.id
});

/**
 * Shared by deleteLocation, deleteLocationByLocationId and their batches: the record is
 * hard-deleted (publicData.delete, as both the control panel and the widget's report-abuse flow
 * do), its deeplink is unregistered and its search-index entry removed (best effort, as the
 * plugin's Promise.allSettled chain treats them), and locationDeleted fires.
 */
const locationRemoval = (handle) => ({
  check: (options) => findMissingStringParam(options, [handle.param]),
  resolve: (options, cb) => handle.find(options, (err, location) => {
    if (err) return cb(err, undefined);
    cb(null, { location });
  }),
  keys: (options, found) => [`location:${found.location.id}`],
  apply: (options, found, callback) => {
    const { location } = found;
    buildfire.publicData.delete(location.id, LOCATIONS_TAG, (deleteErr) => {
      if (deleteErr) return callback(deleteErr, undefined);
      sendContractEvent('locationDeleted', { locationId: location.id });
      const deeplinkRemoved = unregisterDeeplink(location.id);
      const searchIndexRemoved = deleteSearchIndex(location.id);
      callback(null, {
        deleted: true, title: location.data.title, deeplinkRemoved, searchIndexRemoved
      });
    });
  },
  idOf: (result, found) => found.location.id
});

/**
 * Shared by deleteLocationSubscriber, deleteLocationSubscriberByLocationId and their batches: the
 * same `$pull` from `subscribers` as the widget's unfollow button, then locationUnsubscribed.
 * In a batch the same user on the same location twice is refused.
 */
const locationSubscriberRemoval = (handle) => ({
  check: (options) => findMissingStringParam(options, [handle.param, 'userId']),
  resolve: (options, cb) => resolveUserId(options.userId, (userErr, userId) => {
    if (userErr) return cb(userErr, undefined);
    handle.find(options, (err, location) => {
      if (err) return cb(err, undefined);
      cb(null, { location, userId });
    });
  }),
  keys: (options, found) => [`subscriber:${found.location.id}:${found.userId}`],
  apply: (options, found, callback) => {
    const { location, userId } = found;
    const wasSubscribed = (location.data.subscribers || []).includes(userId);
    if (!wasSubscribed) return callback(null, { title: location.data.title, userId, wasSubscribed: false });

    buildfire.publicData.update(location.id, { $pull: { subscribers: userId } }, LOCATIONS_TAG, (updateErr) => {
      if (updateErr) return callback(updateErr, undefined);
      sendContractEvent('locationUnsubscribed', { locationId: location.id, userId });
      callback(null, { title: location.data.title, userId, wasSubscribed: true });
    });
  },
  idOf: (result, found) => found.location.id
});

/** Refuses a title a live category already has: categories are named by title in every basic operation. */
const requireFreeCategoryTitle = (title, callback) => resolveCategory(title, (lookupErr) => {
  if (!lookupErr) return callback(new Error(`A category titled "${title}" already exists`));
  if (!/^No category titled/.test(lookupErr.message)) return callback(lookupErr);
  callback(null);
});

/** The comma-separated subcategory titles a create or update was given, as new subcategory records. */
const newSubcategories = (titles) => (isGiven(titles) ? String(titles).split(',') : [])
  .map((t) => t.trim())
  .filter(Boolean)
  .map((t) => ({
    id: generateUUID(), title: t, iconUrl: null, iconClassName: null
  }));

/**
 * Shared by createCategory and createCategories: the control panel's "Add Category" form — a
 * title, an optional icon and optional subcategories given as one comma-separated list (the same
 * split the category CSV import does), each subcategory with a fresh id, then the category's
 * analytics events (best effort), as CategoriesController.createCategory registers them.
 * Assumption: a title already used by a live category is refused (and, in a batch, a title given
 * twice). The control panel does not check, but categories are named by title in every basic
 * operation, so a duplicate would make both unaddressable there.
 */
const categoryCreation = () => ({
  check: (options) => findMissingStringParam(options, ['title']),
  resolve: (options, cb) => requireFreeCategoryTitle(options.title.trim(), (err) => cb(err, err ? undefined : {})),
  keys: (options) => [`title:${options.title.trim().toLowerCase()}`],
  apply: (options, found, callback) => {
    const title = options.title.trim();
    const subcategories = newSubcategories(options.subcategoryTitles);
    const now = new Date();
    const doc = {
      title,
      iconUrl: isGiven(options.iconUrl) ? options.iconUrl : null,
      iconClassName: null,
      subcategories,
      quickAccess: 0,
      createdOn: now,
      createdBy: null,
      lastUpdatedOn: now,
      lastUpdatedBy: null,
      deletedOn: null,
      deletedBy: null,
      isActive: 1
    };
    doc._buildfire = buildCategoryIndex(doc);

    buildfire.publicData.insert(doc, CATEGORIES_TAG, (err, record) => {
      if (err) return callback(err, undefined);
      registerAnalyticsEvent(`${title} (Category Selected)`, `categories_${record.id}_selected`);
      subcategories.forEach((s) => registerAnalyticsEvent(`${s.title} (Subcategory Selected)`, `subcategories_${s.id}_selected`));
      callback(null, {
        id: record.id, title, iconUrl: doc.iconUrl, subcategories: subcategories.map((s) => s.title)
      });
    });
  },
  idOf: (result) => result.id
});

/** The trimmed new title an update asked for, or '' when none. */
const readNewCategoryTitle = (options) => (isGiven(options.newTitle) ? String(options.newTitle).trim() : '');

/**
 * Shared by updateCategory, updateCategoryByCategoryId and their batches: renames the category,
 * changes its icon and/or appends subcategories (comma-separated), leaving everything else as
 * stored; the control panel saves the whole document, so this reads it, applies the changes and
 * writes it back with a new lastUpdatedOn. A new title another live category already has is
 * refused; in a batch, two entries renaming to the same title are refused too.
 */
const categoryUpdate = (handle) => ({
  check: (options) => {
    const missing = findMissingStringParam(options, [handle.param]);
    if (missing) return missing;
    // A category always has a title and an icon (the icon picker only swaps one for another), and
    // addSubcategoryTitles adds rather than sets, so none of them can be cleared.
    const cleared = findClearedProblem(options, ['newTitle', 'newIconUrl', 'addSubcategoryTitles']);
    if (cleared) return cleared;
    if (!readNewCategoryTitle(options) && !isGiven(options.newIconUrl) && !newSubcategories(options.addSubcategoryTitles).length) {
      return 'Pass at least one of newTitle, newIconUrl or addSubcategoryTitles';
    }
    return null;
  },
  resolve: (options, cb) => handle.find(options, (err, category) => {
    if (err) return cb(err, undefined);
    const newTitle = readNewCategoryTitle(options);
    if (!newTitle || newTitle.toLowerCase() === category.data.title.toLowerCase()) return cb(null, { category });
    requireFreeCategoryTitle(newTitle, (clashErr) => cb(clashErr, clashErr ? undefined : { category }));
  }),
  keys: (options, found) => {
    const newTitle = readNewCategoryTitle(options);
    const keys = [`category:${found.category.id}`];
    if (newTitle && newTitle.toLowerCase() !== found.category.data.title.toLowerCase()) keys.push(`title:${newTitle.toLowerCase()}`);
    return keys;
  },
  apply: (options, found, callback) => {
    const { category } = found;
    const newTitle = readNewCategoryTitle(options);
    const added = newSubcategories(options.addSubcategoryTitles);
    const doc = { ...category.data };
    delete doc._buildfire;
    if (newTitle) doc.title = newTitle;
    if (isGiven(options.newIconUrl)) {
      doc.iconUrl = options.newIconUrl;
      doc.iconClassName = null;
    }
    doc.subcategories = [...(doc.subcategories || []), ...added];
    doc.quickAccess = [0, 1].includes(doc.quickAccess) ? doc.quickAccess : 0;
    doc.deletedOn = doc.deletedOn || null;
    doc.lastUpdatedOn = new Date();
    doc.lastUpdatedBy = null;
    doc._buildfire = buildCategoryIndex(doc);

    buildfire.publicData.update(category.id, doc, CATEGORIES_TAG, (updateErr) => {
      if (updateErr) return callback(updateErr, undefined);
      added.forEach((s) => registerAnalyticsEvent(`${s.title} (Subcategory Selected)`, `subcategories_${s.id}_selected`));
      callback(null, {
        id: category.id,
        title: doc.title,
        iconUrl: doc.iconUrl || null,
        subcategories: doc.subcategories.map((s) => s.title)
      });
    });
  },
  idOf: (result, found) => found.category.id
});

/**
 * Shared by deleteCategory, deleteCategoryByCategoryId and their batches: a soft delete that
 * writes deletedOn (mirrored into the date1 index the app filters on) and keeps the record, so it
 * disappears from the app but can be restored. Locations keep the category id, exactly as after an
 * in-app delete.
 */
const categoryRemoval = (handle) => ({
  check: (options) => findMissingStringParam(options, [handle.param]),
  resolve: (options, cb) => handle.find(options, (err, category) => {
    if (err) return cb(err, undefined);
    cb(null, { category });
  }),
  keys: (options, found) => [`category:${found.category.id}`],
  apply: (options, found, callback) => {
    const { category } = found;
    const doc = { ...category.data };
    delete doc._buildfire;
    doc.quickAccess = [0, 1].includes(doc.quickAccess) ? doc.quickAccess : 0;
    doc.deletedOn = new Date();
    doc.deletedBy = null;
    doc.lastUpdatedOn = new Date();
    doc._buildfire = buildCategoryIndex(doc);

    buildfire.publicData.update(category.id, doc, CATEGORIES_TAG, (updateErr) => {
      if (updateErr) return callback(updateErr, undefined);
      callback(null, { deleted: true, title: doc.title });
    });
  },
  idOf: (result, found) => found.category.id
});

/**
 * Shared by sendLocationNotification and sendLocationNotificationByLocationId — the widget's
 * "Notify Subscribers" form: the same settings gate (subscriptions enabled and custom
 * notifications allowed), the same refusal when the location has no subscribers, the same deep
 * link back to the location, and the watching person's approval once the location and its
 * subscribers are known.
 */
const notifyLocationSubscribers = (options, findLocation, callback) => {
  if (!requireStringParams(options, ['notificationTitle', 'notificationText'], callback)) return;
  // The widget's message dialog caps the text at 300 characters.
  if (options.notificationText.length > 300) {
    return callback(new Error('notificationText must be 300 characters or fewer'), undefined);
  }

  buildfire.datastore.get(SETTINGS_TAG, (settingsErr, settingsRecord) => {
    if (settingsErr) return callback(settingsErr, undefined);
    const stored = settingsRecord && settingsRecord.data;
    // New instances default subscriptions on (Settings.get); only a saved settings doc can turn them off.
    const subscription = stored && Object.keys(stored).length
      ? (stored.subscription || { enabled: false, allowCustomNotifications: false })
      : { enabled: true, allowCustomNotifications: true };
    if (!subscription.enabled || !subscription.allowCustomNotifications) {
      return callback(new Error('Location notifications are turned off for this plugin instance'), undefined);
    }

    findLocation((err, location) => {
      if (err) return callback(err, undefined);
      const subscribers = (location.data.subscribers || []).filter(Boolean);
      if (!subscribers.length) return callback(new Error(`Location "${location.data.title}" has no subscribers`), undefined);

      const people = subscribers.length === 1 ? '1 person' : `${subscribers.length} people`;
      requireUserApproval(`Send "${options.notificationTitle}" to the ${people} following "${location.data.title}"?`, (approvalErr) => {
        if (approvalErr) return callback(approvalErr, undefined);

        buildfire.notifications.pushNotification.schedule({
          title: options.notificationTitle,
          text: options.notificationText,
          users: subscribers,
          queryString: `&dld=${encodeURIComponent(JSON.stringify({ locationId: location.id }))}`
        }, (sendErr) => {
          if (sendErr) return callback(sendErr, undefined);
          callback(null, { title: location.data.title, recipientCount: subscribers.length });
        });
      });
    });
  });
};

/**
 * Mirrors Settings.migrateFieldSettings in src/widget/js/global/repository/Settings.js: older
 * instances stored allowPriceRange / allowOpenHours flags, which the control panel rewrites into
 * the priceRange / openHours blocks the first time it loads them.
 */
const migrateSettings = (data) => {
  const migrated = JSON.parse(JSON.stringify(data));
  const entries = migrated.globalEntries;
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
  return migrated;
};

/**
 * The settings document exactly as new Settings(data).toJSON() writes it
 * (src/widget/js/global/data/Settings.js): every block the plugin keeps, with its defaults where
 * nothing is stored. A never-saved instance gets the defaults Settings.get gives a new one
 * (subscriptions on), which the control panel saves the first time it opens.
 * @param {object|null} stored - the datastore record's data.
 */
const normalizeSettings = (stored) => {
  const data = stored && Object.keys(stored).length
    ? migrateSettings(stored)
    : { subscription: { enabled: true, allowCustomNotifications: true } };

  const intro = data.introductoryListView || {
    images: [],
    description: null,
    sorting: 'distance',
    searchOptions: { mode: 'UserPosition', areaRadiusOptions: {} }
  };
  intro.visibilityOptions = data.introductoryListView && data.introductoryListView.visibilityOptions
    ? {
      tags: data.introductoryListView.visibilityOptions.tags || [],
      value: data.introductoryListView.visibilityOptions.value || 'ALL'
    }
    : {
      tags: [],
      value: (data.showIntroductoryListView === true || typeof data.showIntroductoryListView === 'undefined') ? 'ALL' : 'NONE'
    };

  const toCustomField = (field = {}) => ({
    id: field.id || null,
    label: field.label || null,
    type: field.type || null,
    required: field.required || false,
    enableCustomLabel: field.enableCustomLabel || false,
    visibility: field.visibility || { value: 'ALL', tags: [] }
  });
  const customFields = data.customFields || {};

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
      allowFilterByArea: true,
      allowFilterByBookmarks: false,
      hideOpeningHoursFilter: false,
      hidePriceFilter: false
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
      quickActions: (customFields.quickActions || []).map(toCustomField),
      content: (customFields.content || []).map(toCustomField)
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
    isActive: [0, 1].includes(data.isActive) ? data.isActive : 1,
    _buildfire: { index: {} }
  };
};

/**
 * Reads the settings document, normalized (see normalizeSettings).
 * @param {function(Error=, object=, boolean=)} callback - (error, settings, wasSaved)
 */
const readSettings = (callback) => {
  buildfire.datastore.get(SETTINGS_TAG, (err, record) => {
    if (err) return callback(err, undefined);
    const stored = record && record.data;
    callback(null, normalizeSettings(stored), !!(stored && Object.keys(stored).length));
  });
};

/** Mirrors the control panel's widget refresh after a save: sendMessageToWidget({ cmd: 'sync', scope }). */
const syncWidget = (scope) => bestEffort(
  buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function',
  () => buildfire.messaging.sendMessageToWidget({ cmd: 'sync', scope })
);

/** The public shape of one location field; its tag-based visibility (an access setting) is left out. */
const toPublicField = (field, section, index) => ({
  id: field.id,
  section,
  label: field.label,
  type: field.type,
  required: !!field.required,
  enableCustomLabel: !!field.enableCustomLabel,
  position: index + 1
});

/**
 * The settings a caller may see: everything the owner edits through the operations here, in the
 * shape the plugin stores it. Left out are the permission and access blocks (global and
 * per-location editors, who may add locations, photos, hours and prices, who sees the
 * Introduction screen and each custom field) and the charging block (billing), which this
 * contract neither reads nor writes, plus the stamps naming control-panel users.
 */
const toPublicSettings = (settings) => ({
  subscription: { enabled: settings.subscription.enabled },
  measurementUnit: settings.measurementUnit,
  introductoryListView: {
    images: settings.introductoryListView.images || [],
    description: settings.introductoryListView.description || null,
    sorting: settings.introductoryListView.sorting,
    searchOptions: settings.introductoryListView.searchOptions || { mode: 'UserPosition', areaRadiusOptions: {} }
  },
  sorting: settings.sorting,
  filter: settings.filter,
  map: settings.map,
  bookmarks: settings.bookmarks,
  customFields: {
    quickActions: settings.customFields.quickActions.map((f, i) => toPublicField(f, 'quickActions', i)),
    content: settings.customFields.content.map((f, i) => toPublicField(f, 'content', i))
  },
  design: settings.design,
  globalEntries: {
    openHours: { enabled: !!(settings.globalEntries.openHours && settings.globalEntries.openHours.enabled) },
    priceRange: { enabled: !!(settings.globalEntries.priceRange && settings.globalEntries.priceRange.enabled) }
  },
  lastUpdatedOn: settings.lastUpdatedOn
});

/**
 * Saves the whole settings document the way every control-panel tab does (SettingsController /
 * DesignController / ListViewController.saveSettings: stamp lastUpdatedOn and lastUpdatedBy, then
 * datastore.save of the full document), then tells the widget to refresh with the tab's scope.
 * lastUpdatedBy is null: the caller is not a signed-in control-panel user.
 * @param {function(Error=, object=)} callback - (error, saved settings)
 */
const saveSettings = (settings, scope, callback) => {
  const doc = { ...settings, lastUpdatedOn: new Date(), lastUpdatedBy: null };
  buildfire.datastore.save(doc, SETTINGS_TAG, (err) => {
    if (err) return callback(err, undefined);
    const widgetRefreshed = syncWidget(scope);
    callback(null, { settings: toPublicSettings(doc), widgetRefreshed });
  });
};

/** Validates the optional boolean params named, collecting them into `into`; returns a problem or null. */
const readBooleans = (options, names, into) => {
  const bad = names.find((name) => isGiven(options[name]) && typeof options[name] !== 'boolean');
  if (bad) return `${bad} must be true or false`;
  names.forEach((name) => { if (isGiven(options[name])) into[name] = options[name]; });
  return null;
};

/** Validates the optional select params given as { param: allowedValues }, collecting them into `into`. */
const readSelects = (options, allowed, into) => {
  const bad = Object.keys(allowed).find((name) => isGiven(options[name]) && !allowed[name].includes(options[name]));
  if (bad) return `${bad} must be one of: ${allowed[bad].join(', ')}`;
  Object.keys(allowed).forEach((name) => { if (isGiven(options[name])) into[name] = options[name]; });
  return null;
};

/**
 * An address picked on a map, given as three params that must come together, as the control
 * panel's address pickers always set them together. Returns { problem } or { address } (null when none given).
 */
const readPickedAddress = (options, [addressName, latName, lngName]) => {
  const parts = [options[addressName], options[latName], options[lngName]].filter(isGiven).length;
  if (!parts) return { address: null };
  if (parts !== 3) return { problem: `${addressName}, ${latName} and ${lngName} must be given together` };
  if (typeof options[addressName] !== 'string' || !options[addressName].trim()) return { problem: `${addressName} must be text` };
  if (!isFiniteNumber(options[latName]) || options[latName] < -90 || options[latName] > 90) return { problem: `${latName} must be a number from -90 to 90` };
  if (!isFiniteNumber(options[lngName]) || options[lngName] < -180 || options[lngName] > 180) return { problem: `${lngName} must be a number from -180 to 180` };
  return { address: { text: options[addressName].trim(), lat: options[latName], lng: options[lngName] } };
};

// The Settings tab's toggles (src/control/settings/settings.js: initSorting, initFiltering,
// iniBookmarks) and the radio groups in templates/sorting.html and templates/map.html.
const SORTING_TOGGLES = [
  'hideSorting', 'allowSortByReverseAlphabetical', 'allowSortByNearest', 'allowSortByPriceLowToHigh',
  'allowSortByPriceHighToLow', 'allowSortByDate', 'allowSortByRating', 'allowSortByViews'
];
const FILTER_TOGGLES = ['allowFilterByArea', 'allowFilterByBookmarks', 'hideOpeningHoursFilter', 'hidePriceFilter'];
const SETTINGS_TOGGLES = [
  'subscriptionEnabled', 'openHoursEnabled', 'priceRangeEnabled', 'mapInitialAreaEnabled',
  'bookmarksEnabled', 'allowBookmarkLocations', 'allowBookmarkSearch', ...SORTING_TOGGLES, ...FILTER_TOGGLES
];
const SETTINGS_SELECTS = {
  defaultSorting: ['distance', 'alphabetical'], // templates/sorting.html, name="defaultLocationSort"
  measurementUnit: ['metric', 'imperial'] // templates/map.html, name="distanceUnits"
};

// The Design tab's controls (src/control/design/index.html, design.js). Map Style
// (design.defaultMapStyle) is left out: its radios are disabled and never written.
const DESIGN_TOGGLES = ['enableMapTerrainView', 'hideQuickFilter', 'allowStyleSelection', 'showDetailsCategory', 'showContributorName'];
const DESIGN_SELECTS = {
  listViewPosition: ['expanded', 'collapsed', 'halfExpanded'],
  listViewStyle: ['backgroundImage', 'smallImage'],
  defaultMapType: ['streets', 'satellite'],
  detailsMapPosition: ['top', 'bottom']
};

// The Introduction screen's dropdowns (src/control/content/js/listView/index.js, from
// SearchLocationsModes / SortingOptions in src/widget/js/global/constants/index.js).
const INTRO_SELECTS = {
  locationSource: ['All', 'UserPosition', 'AreaRadius', 'MyLocations'],
  sorting: ['distance', 'alphabetical', 'newest']
};
const MIN_AREA_RADIUS_MILES = 1; // introMap.js clamps the radius input to 1–200 miles.
const MAX_AREA_RADIUS_MILES = 200;

/**
 * The location fields the Settings tab's "Location Fields" page defines
 * (src/control/settings/js/pages/locationFields.js): two sections, each with its own field types
 * (QuickActionsOptions / ContentOptions in src/widget/js/global/constants/index.js), at most ten
 * fields across both.
 */
const FIELD_SECTIONS = {
  quickActions: ['EMAIL', 'PHONE', 'URL'],
  content: ['EMAIL', 'PHONE', 'URL', 'TEXT', 'RICH_TEXT']
};
const FIELD_TYPES = ['EMAIL', 'PHONE', 'URL', 'TEXT', 'RICH_TEXT'];
const MAX_LOCATION_FIELDS = 10;

/** Every field across both sections, with where it sits. */
const listFields = (settings) => ['quickActions', 'content'].reduce((all, section) => all.concat(
  settings.customFields[section].map((field, index) => ({ field, section, index }))
), []);

/**
 * How location-field operations name a field: by its exact label (basic, case-insensitive, an
 * ambiguous label refused) or by its id (advanced).
 */
const FIELD_BY_LABEL = {
  param: 'label',
  find: (options, cb) => readSettings((err, settings) => {
    if (err) return cb(err, undefined);
    const wanted = options.label.trim().toLowerCase();
    const matches = listFields(settings).filter((f) => f.field.label && f.field.label.toLowerCase() === wanted);
    if (!matches.length) return cb(new Error(`No location field labelled "${options.label}"`), undefined);
    if (matches.length > 1) return cb(new Error(`${matches.length} location fields are labelled "${options.label}"`), undefined);
    cb(null, matches[0]);
  })
};
const FIELD_BY_ID = {
  param: 'fieldId',
  find: (options, cb) => readSettings((err, settings) => {
    if (err) return cb(err, undefined);
    const match = listFields(settings).find((f) => f.field.id === options.fieldId);
    if (!match) return cb(new Error(`No location field with id "${options.fieldId}"`), undefined);
    cb(null, match);
  })
};

/**
 * Saves the custom fields the way the Location Fields page does: SettingsController.updateSettings,
 * a `$set` of customFields only (dropping fields with no label or type, as it does), then
 * sync 'customFields'. On a never-saved instance there is nothing to `$set` into, so the whole
 * normalized document is saved instead, as the control panel's Settings.get(true) would have.
 * @param {function(Error=, boolean=)} callback - (error, widgetRefreshed)
 */
const saveCustomFields = (settings, wasSaved, callback) => {
  const customFields = {
    quickActions: settings.customFields.quickActions.filter((f) => f.label && f.type),
    content: settings.customFields.content.filter((f) => f.label && f.type)
  };
  const payload = wasSaved
    ? { $set: { customFields } }
    : { ...settings, customFields, lastUpdatedOn: new Date() };
  buildfire.datastore.save(payload, SETTINGS_TAG, (err) => {
    if (err) return callback(err, undefined);
    callback(null, syncWidget('customFields'));
  });
};

/** Re-reads the settings and finds a field by id: each write in a batch starts from the latest save. */
const withFreshField = (fieldId, callback) => readSettings((err, settings, wasSaved) => {
  if (err) return callback(err);
  const match = listFields(settings).find((f) => f.field.id === fieldId);
  if (!match) return callback(new Error(`No location field with id "${fieldId}"`));
  callback(null, settings, wasSaved, match);
});

/**
 * Shared by createLocationField and createLocationFields: the "Add Field" button of either
 * section, then the field's label, type and checkboxes. New fields are visible to every user, as
 * the page adds them. A label another field already has is refused (and, in a batch, a label
 * given twice), because basic operations name a field by its label; the page itself does not check.
 */
const fieldCreation = () => ({
  check: (options) => {
    const missing = findMissingStringParam(options, ['section', 'label', 'type']);
    if (missing) return missing;
    if (!FIELD_SECTIONS[options.section]) return `section must be one of: ${Object.keys(FIELD_SECTIONS).join(', ')}`;
    if (!FIELD_SECTIONS[options.section].includes(options.type)) {
      return `type must be one of: ${FIELD_SECTIONS[options.section].join(', ')} in the ${options.section} section`;
    }
    return readBooleans(options, ['required', 'enableCustomLabel'], {});
  },
  resolve: (options, cb) => FIELD_BY_LABEL.find(options, (err) => {
    if (!err) return cb(new Error(`A location field labelled "${options.label.trim()}" already exists`), undefined);
    if (!/^No location field labelled/.test(err.message)) return cb(err, undefined);
    cb(null, {});
  }),
  keys: (options) => [`label:${options.label.trim().toLowerCase()}`],
  apply: (options, found, callback) => readSettings((err, settings, wasSaved) => {
    if (err) return callback(err, undefined);
    if (listFields(settings).length >= MAX_LOCATION_FIELDS) {
      return callback(new Error(`There are already ${MAX_LOCATION_FIELDS} location fields, the most the plugin allows`), undefined);
    }
    const field = {
      id: generateUUID(),
      label: options.label.trim(),
      type: options.type,
      required: options.required === true,
      enableCustomLabel: options.enableCustomLabel === true,
      visibility: { value: 'ALL', tags: [] }
    };
    const list = settings.customFields[options.section];
    list.push(field);
    saveCustomFields(settings, wasSaved, (saveErr, widgetRefreshed) => {
      if (saveErr) return callback(saveErr, undefined);
      callback(null, { ...toPublicField(field, options.section, list.length - 1), widgetRefreshed });
    });
  }),
  idOf: (result) => result.id
});

/**
 * Shared by updateLocationField, updateLocationFieldByFieldId and their batches: renames a field,
 * changes its type or checkboxes, or moves it within its section (the page's drag to reorder),
 * leaving the rest as it was. Values already filled in on locations are kept, as they are when
 * the page edits a field.
 */
const fieldUpdate = (handle) => ({
  check: (options) => {
    const missing = findMissingStringParam(options, [handle.param]);
    if (missing) return missing;
    const cleared = findClearedProblem(options, ['newLabel', 'newType', 'newRequired', 'newEnableCustomLabel', 'newPosition']);
    if (cleared) return cleared;
    if (isGiven(options.newLabel) && (typeof options.newLabel !== 'string' || !options.newLabel.trim())) return 'newLabel cannot be blank';
    if (isGiven(options.newType) && !FIELD_TYPES.includes(options.newType)) return `newType must be one of: ${FIELD_TYPES.join(', ')}`;
    if (isGiven(options.newPosition) && (!Number.isInteger(options.newPosition) || options.newPosition < 1 || options.newPosition > MAX_LOCATION_FIELDS)) {
      return `newPosition must be a whole number from 1 to ${MAX_LOCATION_FIELDS}`;
    }
    const booleanProblem = readBooleans(options, ['newRequired', 'newEnableCustomLabel'], {});
    if (booleanProblem) return booleanProblem;
    const given = ['newLabel', 'newType', 'newRequired', 'newEnableCustomLabel', 'newPosition'].some((n) => isGiven(options[n]));
    return given ? null : 'Pass at least one of newLabel, newType, newRequired, newEnableCustomLabel or newPosition';
  },
  resolve: (options, cb) => handle.find(options, (err, match) => {
    if (err) return cb(err, undefined);
    if (isGiven(options.newType) && !FIELD_SECTIONS[match.section].includes(options.newType)) {
      return cb(new Error(`newType must be one of: ${FIELD_SECTIONS[match.section].join(', ')} in the ${match.section} section`), undefined);
    }
    const newLabel = isGiven(options.newLabel) ? options.newLabel.trim() : '';
    if (!newLabel || newLabel.toLowerCase() === (match.field.label || '').toLowerCase()) return cb(null, match);
    FIELD_BY_LABEL.find({ label: newLabel }, (clashErr) => {
      if (!clashErr) return cb(new Error(`A location field labelled "${newLabel}" already exists`), undefined);
      if (!/^No location field labelled/.test(clashErr.message)) return cb(clashErr, undefined);
      cb(null, match);
    });
  }),
  keys: (options, found) => {
    const keys = [`field:${found.field.id}`];
    if (isGiven(options.newLabel)) keys.push(`label:${options.newLabel.trim().toLowerCase()}`);
    return keys;
  },
  apply: (options, found, callback) => withFreshField(found.field.id, (err, settings, wasSaved, match) => {
    if (err) return callback(err, undefined);
    const list = settings.customFields[match.section];
    const field = list[match.index];
    if (isGiven(options.newLabel)) field.label = options.newLabel.trim();
    if (isGiven(options.newType)) field.type = options.newType;
    if (isGiven(options.newRequired)) field.required = options.newRequired;
    if (isGiven(options.newEnableCustomLabel)) field.enableCustomLabel = options.newEnableCustomLabel;
    let position = match.index;
    if (isGiven(options.newPosition)) {
      if (options.newPosition > list.length) {
        return callback(new Error(`newPosition must be from 1 to ${list.length} in the ${match.section} section`), undefined);
      }
      list.splice(match.index, 1);
      position = options.newPosition - 1;
      list.splice(position, 0, field);
    }
    saveCustomFields(settings, wasSaved, (saveErr, widgetRefreshed) => {
      if (saveErr) return callback(saveErr, undefined);
      callback(null, { ...toPublicField(field, match.section, position), widgetRefreshed });
    });
  }),
  idOf: (result, found) => found.field.id
});

/**
 * Shared by deleteLocationField, deleteLocationFieldByFieldId and their batches: the page's delete
 * button. The field stops showing on every location; values already filled in stay on the
 * location records, as they do after the page deletes one, but nothing shows them again.
 */
const fieldRemoval = (handle) => ({
  check: (options) => findMissingStringParam(options, [handle.param]),
  resolve: (options, cb) => handle.find(options, cb),
  keys: (options, found) => [`field:${found.field.id}`],
  apply: (options, found, callback) => withFreshField(found.field.id, (err, settings, wasSaved, match) => {
    if (err) return callback(err, undefined);
    settings.customFields[match.section].splice(match.index, 1);
    saveCustomFields(settings, wasSaved, (saveErr, widgetRefreshed) => {
      if (saveErr) return callback(saveErr, undefined);
      callback(null, { deleted: true, label: match.field.label, widgetRefreshed });
    });
  }),
  idOf: (result, found) => found.field.id
});

/**
 * Shared by updatePinnedLocationOrder and updatePinnedLocationOrderByLocationId: the
 * Introduction screen's drag-to-reorder of the pinned list (src/control/content/js/listView/index.js).
 * The locations given must be exactly the ones pinned now, in their new order; each gets
 * pinIndex = its position, written through the full update the control panel uses (deeplink and
 * search index refreshed, locationUpdated fired), then the widget's Introduction screen is refreshed.
 * @param {string[]} handleNames - the three positional params, first to third.
 * @param {function(string, function)} findOne - (handle value, cb(err, location)).
 */
const reorderPinnedLocations = (options, handleNames, findOne, callback) => {
  if (!requireStringParams(options, [handleNames[0]], callback)) return;
  const given = handleNames.filter((name) => isGiven(options[name]));
  const notText = given.find((name) => typeof options[name] !== 'string');
  if (notText) return callback(new Error(`${notText} must be text`), undefined);
  const gap = handleNames.findIndex((name, i) => i > 0 && isGiven(options[name]) && !isGiven(options[handleNames[i - 1]]));
  if (gap > 0) return callback(new Error(`${handleNames[gap]} needs ${handleNames[gap - 1]}`), undefined);

  const located = [];
  let pending = given.length;
  const failures = [];
  given.forEach((name, i) => findOne(options[name], (err, location) => {
    if (err) failures[i] = err.message;
    else located[i] = location;
    pending -= 1;
    if (pending) return;
    if (failures.some(Boolean)) return callback(new Error(failures.filter(Boolean).join('; ')), undefined);
    if (new Set(located.map((l) => l.id)).size !== located.length) return callback(new Error('The same location is listed more than once'), undefined);

    buildfire.publicData.search({
      filter: { '_buildfire.index.number1': { $in: [1, 2, 3] } }, pageSize: MAX_PAGE_SIZE
    }, LOCATIONS_TAG, (searchErr, response) => {
      if (searchErr) return callback(searchErr, undefined);
      const pinnedIds = readSearchResponse(response).records.map((r) => r.id);
      const sameSet = pinnedIds.length === located.length && located.every((l) => pinnedIds.includes(l.id));
      if (!sameSet) {
        return callback(new Error(`List exactly the ${pinnedIds.length} pinned location(s), in their new order; pin or unpin with updateLocationPin`), undefined);
      }

      const writeNext = (index) => {
        if (index === located.length) {
          const widgetRefreshed = syncWidget('intro');
          return callback(null, { pinned: located.map((l) => l.data.title), widgetRefreshed });
        }
        writeLocationPin(located[index], index + 1, (writeErr, doc) => {
          if (writeErr) return callback(writeErr, undefined);
          registerDeeplink(located[index].id, doc);
          saveSearchIndex(located[index].id, doc);
          writeNext(index + 1);
        });
      };
      writeNext(0);
    });
  }));
};

/** Mirrors the carousel editor's items: an action item with an image, stored with an id. */
const isCarouselItem = (item) => item && typeof item === 'object' && !Array.isArray(item)
  && typeof item.action === 'string' && item.action
  && typeof item.iconUrl === 'string' && item.iconUrl.trim();

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
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic; its advanced
   * alternative is searchLocationsByCategoryId. The one paged search over locations, every
   * filter optional (title, text, category, subcategory, price range, creator, pinned, open now).
   * Uses only buildfire.publicData and buildfire.auth, which behave the same in both frames and
   * on the server; it only reads, so nothing about it needs to be watched — Background in both
   * frames. It is a function, not a declarative search, because a category is named by title and
   * has to be resolved to its id first, and the open-now filter keys on the day name
   * (`openingHours.days.<day>.intervals`), which a static query cannot express.
   * @param {{ title?: string, text?: string, categoryTitle?: string, subcategoryTitle?: string,
   *   priceRange?: number, createdByUserId?: string, pinnedOnly?: boolean, openNow?: boolean,
   *   at?: string, utcOffsetMinutes?: number, sortBy?: string, page?: number, pageSize?: number }} options
   * @param {function(Error=, object=)} callback - (error, { locations, total, page, hasMore })
   */
  searchLocations(options, callback) {
    searchLocationRecords(options, false, callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of
   * searchLocations, taking the category and subcategory by id (as searchCategories gives them)
   * instead of by title. Same hosts, filters and result, via the same searchLocationRecords; an id
   * that matches no live category or subcategory is refused.
   * @param {{ title?: string, text?: string, categoryId?: string, subcategoryId?: string,
   *   priceRange?: number, createdByUserId?: string, pinnedOnly?: boolean, openNow?: boolean,
   *   at?: string, utcOffsetMinutes?: number, sortBy?: string, page?: number, pageSize?: number }} options
   * @param {function(Error=, object=)} callback - (error, { locations, total, page, hasMore })
   */
  searchLocationsByCategoryId(options, callback) {
    searchLocationRecords(options, true, callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic, with no advanced
   * alternative: it names nothing by a handle. Locations within a radius of a point, nearest
   * first, each with its distance. Kept apart from searchLocations because it answers a different
   * shape (every location carries a distance). Uses only buildfire.publicData.aggregate, which
   * behaves the same in both frames and on the server; it only reads, so Background in both
   * frames. It is a function because the radius is taken in kilometres and converted to the
   * radians $centerSphere expects, the same conversion introSearchService does.
   * @param {{ lat: number, lng: number, radiusKm?: number, page?: number, pageSize?: number }} options
   * @param {function(Error=, object=)} callback - (error, { locations, page, hasMore })
   */
  searchLocationsNearPoint(options, callback) {
    if (!requireStringParams(options, [], callback)) return;
    if (!isFiniteNumber(options.lat) || options.lat < -90 || options.lat > 90) {
      return callback(new Error('lat must be a number from -90 to 90'), undefined);
    }
    if (!isFiniteNumber(options.lng) || options.lng < -180 || options.lng > 180) {
      return callback(new Error('lng must be a number from -180 to 180'), undefined);
    }
    const radiusKm = isGiven(options.radiusKm) ? options.radiusKm : DEFAULT_NEAR_RADIUS_KM;
    if (!isFiniteNumber(radiusKm) || radiusKm <= 0) {
      return callback(new Error('radiusKm must be a number above 0'), undefined);
    }
    const paging = readPaging(options, callback);
    if (!paging) return;

    const point = [options.lng, options.lat];
    const moment = resolveOpeningMoment(undefined, undefined);
    const pipelineStages = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: point }, key: '_buildfire.geo', distanceField: 'distance', query: {}
        }
      },
      { $match: { '_buildfire.geo': { $geoWithin: { $centerSphere: [point, radiusKm / EARTH_RADIUS_KM] } } } }
    ];
    buildfire.publicData.aggregate(
      { pipelineStages, page: paging.page, pageSize: paging.pageSize },
      LOCATIONS_TAG,
      (err, response) => {
        if (err) return callback(err, undefined);
        const records = (Array.isArray(response) ? response : []).filter(Boolean);
        // A GeoJSON $geoNear reports distance in metres.
        const locations = records.map((r) => ({
          ...toLocationSummary(r._id || r.id, r.data || {}, moment),
          distanceKm: typeof r.distance === 'number' ? Math.round(r.distance) / 1000 : null
        }));
        callback(null, { locations, page: paging.page, hasMore: records.length === paging.pageSize });
      }
    );
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic; its advanced
   * alternative is getLocationByLocationId. One location, named by its exact title, with its
   * category and subcategory titles resolved and whether it is open at the given moment. Uses
   * only buildfire.publicData, which behaves the same in both frames and on the server; it only
   * reads, so Background in both frames. Multi-step: the title is resolved by a search, then the
   * category ids on the record are resolved to titles by a second search, which is why it is not
   * a declarative operation.
   * @param {{ title: string, at?: string, utcOffsetMinutes?: number }} options
   * @param {function(Error=, object=)} callback - (error, location)
   */
  getLocation(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    readLocation(options, findLocationByTitle(options), callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of
   * getLocation, taking the location's record id instead of its title. Same hosts and result, via
   * the same readLocation; it checks the id exists instead of searching.
   * @param {{ locationId: string, at?: string, utcOffsetMinutes?: number }} options
   * @param {function(Error=, object=)} callback - (error, location)
   */
  getLocationByLocationId(options, callback) {
    if (!requireStringParams(options, ['locationId'], callback)) return;
    readLocation(options, findLocationById(options), callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic; its advanced
   * alternative is createLocationByCategoryId. Adds a location the way the widget's and control
   * panel's create forms do: the same required fields, a fresh clientId, the default 08:00–20:00
   * opening hours, then the deeplink, search-index and analytics registrations (best effort, as
   * in the plugin) and the locationCreated event. Uses only buildfire.publicData plus optional
   * services, so it runs in both frames and on the server. Background in both frames: adding a
   * location is the same routine content edit the control panel makes, and it can be undone by
   * deleteLocation.
   * @param {{ title: string, description: string, address: string, lat: number, lng: number,
   *   listImage: string, subtitle?: string, addressAlias?: string, categoryTitle?: string,
   *   subcategoryTitle?: string, priceRange?: number, currency?: string }} options
   * @param {function(Error=, object=)} callback - (error, created location)
   */
  createLocation(options, callback) {
    runAction(locationCreation(false), options, callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of
   * createLocation, taking the category and subcategory by id (as searchCategories gives them)
   * instead of by title. Same hosts, record, events and result, via the same locationCreation.
   * @param {{ title: string, description: string, address: string, lat: number, lng: number,
   *   listImage: string, subtitle?: string, addressAlias?: string, categoryId?: string,
   *   subcategoryId?: string, priceRange?: number, currency?: string }} options
   * @param {function(Error=, object=)} callback - (error, created location)
   */
  createLocationByCategoryId(options, callback) {
    runAction(locationCreation(true), options, callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic; its advanced
   * alternative is updateLocationByLocationId. Edits one location, named by its exact current
   * title, changing only the fields the caller passes (see locationUpdate). Uses only
   * buildfire.publicData plus optional services, so it runs in both frames and on the server.
   * Background in both frames: a routine content edit, undone by another update. Resolving the
   * title is a search, which is why this is a function rather than a declarative update.
   * @param {{ title: string, newTitle?: string, newSubtitle?: string, newDescription?: string,
   *   newAddress?: string, newLat?: number, newLng?: number, newAddressAlias?: string,
   *   newListImage?: string, newPriceRange?: number, newCurrency?: string,
   *   newCategoryTitle?: string, newSubcategoryTitle?: string }} options
   * @param {function(Error=, object=)} callback - (error, updated location)
   */
  updateLocation(options, callback) {
    runAction(locationUpdate(LOCATION_BY_TITLE, false), options, callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of
   * updateLocation, taking the location's record id instead of its title, and the new category
   * and subcategory by newCategoryId / newSubcategoryId instead of by title. Same hosts, effect,
   * events and result, via the same locationUpdate; it checks the id exists instead of
   * searching.
   * @param {{ locationId: string, newTitle?: string, newSubtitle?: string, newDescription?: string,
   *   newAddress?: string, newLat?: number, newLng?: number, newAddressAlias?: string,
   *   newListImage?: string, newPriceRange?: number, newCurrency?: string,
   *   newCategoryId?: string, newSubcategoryId?: string }} options
   * @param {function(Error=, object=)} callback - (error, updated location)
   */
  updateLocationByLocationId(options, callback) {
    runAction(locationUpdate(LOCATION_BY_ID, true), options, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; its advanced alternative is
   * updateLocationPinByLocationId. Pins a location to the top of the list or unpins it, the
   * control panel's "Pin to Top" / "Unpin" action (see locationPin). Kept separate from
   * updateLocation because it has its own check (the three-pin limit). Uses only
   * buildfire.publicData, so it runs in the control panel and on the server; no widget host,
   * because pinning is an owner's curation of the list and the app offers no way to do it.
   * Nothing about it needs to be watched and it is undone by the opposite call, so Background.
   * @param {{ title: string, isPinned: boolean }} options
   * @param {function(Error=, object=)} callback - (error, { title, isPinned, pinPosition })
   */
  updateLocationPin(options, callback) {
    runAction(locationPin(LOCATION_BY_TITLE), options, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateLocationPin,
   * taking the location's record id instead of its title, via the same locationPin.
   * @param {{ locationId: string, isPinned: boolean }} options
   * @param {function(Error=, object=)} callback - (error, { title, isPinned, pinPosition })
   */
  updateLocationPinByLocationId(options, callback) {
    runAction(locationPin(LOCATION_BY_ID), options, callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic; its advanced
   * alternative is deleteLocationByLocationId. Permanently deletes one location, named by its
   * exact title (see locationRemoval). Uses only buildfire.publicData plus optional services, so it
   * runs in both frames and on the server, where the `dangerous` flag makes the app owner confirm
   * it. Background in both frames, as the control panel's own delete is. Resolving the title is a
   * search, which is why this is a function rather than a declarative delete.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, { deleted, title, deeplinkRemoved, searchIndexRemoved })
   */
  deleteLocation(options, callback) {
    runAction(locationRemoval(LOCATION_BY_TITLE), options, callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of
   * deleteLocation, taking the location's record id instead of its title. Checks the id exists
   * first, so an unknown id is reported rather than silently doing nothing.
   * @param {{ locationId: string }} options
   * @param {function(Error=, object=)} callback - (error, { deleted, title, deeplinkRemoved, searchIndexRemoved })
   */
  deleteLocationByLocationId(options, callback) {
    runAction(locationRemoval(LOCATION_BY_ID), options, callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic; its advanced
   * alternative is deleteLocationSubscriberByLocationId. Stops one app user from getting a
   * location's update notifications, as the app (see locationSubscriberRemoval). The named user is
   * the target, not the actor, and removing someone from a notification list only ever sends them
   * less. Takes the user as a parameter, so it needs no signed-in session: uses only
   * buildfire.publicData and buildfire.auth, which behave the same in both frames and on the
   * server; confined to one list entry, so Background in both frames. Subscribing a user is
   * deliberately not offered: opting someone in to notifications is their decision to make.
   * @param {{ title: string, userId: string }} options
   * @param {function(Error=, object=)} callback - (error, { title, userId, wasSubscribed })
   */
  deleteLocationSubscriber(options, callback) {
    runAction(locationSubscriberRemoval(LOCATION_BY_TITLE), options, callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the alternative of
   * deleteLocationSubscriber, taking the location's record id instead of its title, via the same
   * locationSubscriberRemoval.
   * @param {{ locationId: string, userId: string }} options
   * @param {function(Error=, object=)} callback - (error, { title, userId, wasSubscribed })
   */
  deleteLocationSubscriberByLocationId(options, callback) {
    runAction(locationSubscriberRemoval(LOCATION_BY_ID), options, callback);
  },

  /**
   * hosts: widgetForeground, controlForeground, headlessSdk. usage: basic; its advanced
   * alternative is sendLocationNotificationByLocationId. Sends a push notification to everyone
   * following a location, on behalf of the app (see notifyLocationSubscribers). Uses
   * buildfire.datastore, buildfire.publicData and buildfire.notifications.pushNotification.schedule,
   * all server-safe, so it keeps headlessSdk; there the `dangerous` and `throttable` flags make
   * the app owner confirm it and requireUserApproval skips its own dialog. Foreground in both
   * frames because it reaches real people and cannot be recalled, so the person watching approves
   * it once the location and its subscribers are known.
   * @param {{ title: string, notificationTitle: string, notificationText: string }} options
   * @param {function(Error=, object=)} callback - (error, { title, recipientCount })
   */
  sendLocationNotification(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    notifyLocationSubscribers(options, findLocationByTitle(options), callback);
  },

  /**
   * hosts: widgetForeground, controlForeground, headlessSdk. usage: advanced; the alternative of
   * sendLocationNotification, taking the location's record id instead of its title. Same hosts,
   * approval, gate and result, via the same notifyLocationSubscribers.
   * @param {{ locationId: string, notificationTitle: string, notificationText: string }} options
   * @param {function(Error=, object=)} callback - (error, { title, recipientCount })
   */
  sendLocationNotificationByLocationId(options, callback) {
    if (!requireStringParams(options, ['locationId'], callback)) return;
    notifyLocationSubscribers(options, findLocationById(options), callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic, with no advanced alternative: it names
   * nothing by a handle. Adds a category, the control panel's "Add Category" form: a title, an
   * optional icon and optional subcategories given as one comma-separated list (the same split the
   * category CSV import does), each subcategory with a fresh id, then the category's analytics
   * events (best effort). Uses only buildfire.publicData plus optional analytics, so it runs in the
   * control panel and on the server; no widget host, because categories are managed only from the
   * control panel. Nothing about it needs to be watched, so Background.
   * Assumption: a title already used by a live category is refused. The control panel does not
   * check, but categories are named by title in every basic operation, so a duplicate would make
   * both unaddressable there.
   * @param {{ title: string, iconUrl?: string, subcategoryTitles?: string }} options
   * @param {function(Error=, object=)} callback - (error, created category)
   */
  createCategory(options, callback) {
    runAction(categoryCreation(), options, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; its advanced alternative is
   * updateCategoryByCategoryId. Edits one category, named by its exact current title (see
   * categoryUpdate). Uses only buildfire.publicData, so it runs in the control panel and on
   * the server; no widget host, because categories are managed only from the control panel.
   * Nothing about it needs to be watched, so Background. Resolving the title is a search, which
   * is why this is a function.
   * @param {{ title: string, newTitle?: string, newIconUrl?: string, addSubcategoryTitles?: string }} options
   * @param {function(Error=, object=)} callback - (error, updated category)
   */
  updateCategory(options, callback) {
    runAction(categoryUpdate(CATEGORY_BY_TITLE), options, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateCategory,
   * taking the category's record id instead of its title, via the same categoryUpdate. The
   * id must name a live category; a removed one counts as missing.
   * @param {{ categoryId: string, newTitle?: string, newIconUrl?: string, addSubcategoryTitles?: string }} options
   * @param {function(Error=, object=)} callback - (error, updated category)
   */
  updateCategoryByCategoryId(options, callback) {
    runAction(categoryUpdate(CATEGORY_BY_ID), options, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; its advanced alternative is
   * deleteCategoryByCategoryId. Removes one category, named by its exact title, the way the
   * control panel does (see categoryRemoval). Uses only buildfire.publicData, so it runs in the
   * control panel and on the server; no widget host, because categories are managed only from the
   * control panel. Nothing about it needs to be watched, so Background.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, { deleted, title })
   */
  deleteCategory(options, callback) {
    runAction(categoryRemoval(CATEGORY_BY_TITLE), options, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of deleteCategory,
   * taking the category's record id instead of its title, via the same categoryRemoval. The id
   * must name a live category; a removed one counts as missing.
   * @param {{ categoryId: string }} options
   * @param {function(Error=, object=)} callback - (error, { deleted, title })
   */
  deleteCategoryByCategoryId(options, callback) {
    runAction(categoryRemoval(CATEGORY_BY_ID), options, callback);
  },

  // ---------------------------------------------------------------------------------------------
  // Batch forms. Each one takes one list of entries shaped exactly like its single operation's
  // params and runs them through that operation's own action with runBatch: every entry is checked
  // and resolved before anything is written, a record named twice is refused, then each entry is
  // applied in turn and reported as { index, id, error }. Same hosts, crudMode and usage as the
  // single operation; throttable because it is a bulk write.
  // ---------------------------------------------------------------------------------------------

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic; the batch form of
   * createLocation (its advanced batch is createLocationsByCategoryId). The control panel's CSV
   * import and the AI seeder add many locations at once with publicData.bulkInsert, but that path
   * skips the locationCreated event; this runs each entry through createLocation's own
   * locationCreation instead, so every location gets the event, deeplink, search index and analytics.
   * @param {{ locations: Array<object> }} options - entries shaped like createLocation's params.
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  createLocations(options, callback) {
    runBatch(locationCreation(false), options, 'locations', callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the batch form of
   * createLocationByCategoryId, the alternative of createLocations.
   * @param {{ locations: Array<object> }} options - entries shaped like createLocationByCategoryId's params.
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  createLocationsByCategoryId(options, callback) {
    runBatch(locationCreation(true), options, 'locations', callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic; the batch form of
   * updateLocation (its advanced batch is updateLocationsByLocationId), via locationUpdate.
   * @param {{ locations: Array<object> }} options - entries shaped like updateLocation's params.
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  updateLocations(options, callback) {
    runBatch(locationUpdate(LOCATION_BY_TITLE, false), options, 'locations', callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the batch form of
   * updateLocationByLocationId, the alternative of updateLocations.
   * @param {{ locations: Array<object> }} options - entries shaped like updateLocationByLocationId's params.
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  updateLocationsByLocationId(options, callback) {
    runBatch(locationUpdate(LOCATION_BY_ID, true), options, 'locations', callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; the batch form of updateLocationPin (its
   * advanced batch is updateLocationsPinByLocationId), via locationPin. The three-pin limit is
   * checked again for each entry, so pinning a fourth fails that entry only.
   * @param {{ locations: Array<{ title: string, isPinned: boolean }> }} options
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  updateLocationsPin(options, callback) {
    runBatch(locationPin(LOCATION_BY_TITLE), options, 'locations', callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the batch form of
   * updateLocationPinByLocationId, the alternative of updateLocationsPin.
   * @param {{ locations: Array<{ locationId: string, isPinned: boolean }> }} options
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  updateLocationsPinByLocationId(options, callback) {
    runBatch(locationPin(LOCATION_BY_ID), options, 'locations', callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic; the batch form of
   * deleteLocation (its advanced batch is deleteLocationsByLocationId), via locationRemoval. Every
   * title is resolved before the first delete, so a typo deletes nothing.
   * @param {{ locations: Array<{ title: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  deleteLocations(options, callback) {
    runBatch(locationRemoval(LOCATION_BY_TITLE), options, 'locations', callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the batch form of
   * deleteLocationByLocationId, the alternative of deleteLocations.
   * @param {{ locations: Array<{ locationId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { locations, succeeded, failed })
   */
  deleteLocationsByLocationId(options, callback) {
    runBatch(locationRemoval(LOCATION_BY_ID), options, 'locations', callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: basic; the batch form of
   * deleteLocationSubscriber (its advanced batch is deleteLocationSubscribersByLocationId), via
   * locationSubscriberRemoval. Each entry is one user on one location; the result's id is the location's.
   * @param {{ subscribers: Array<{ title: string, userId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { subscribers, succeeded, failed })
   */
  deleteLocationSubscribers(options, callback) {
    runBatch(locationSubscriberRemoval(LOCATION_BY_TITLE), options, 'subscribers', callback);
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. usage: advanced; the batch form of
   * deleteLocationSubscriberByLocationId, the alternative of deleteLocationSubscribers.
   * @param {{ subscribers: Array<{ locationId: string, userId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { subscribers, succeeded, failed })
   */
  deleteLocationSubscribersByLocationId(options, callback) {
    runBatch(locationSubscriberRemoval(LOCATION_BY_ID), options, 'subscribers', callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; its advanced alternative is
   * updatePinnedLocationOrderByLocationId. The Introduction screen's drag-to-reorder of the pinned
   * locations (see reorderPinnedLocations). Already acts on every pinned location, so it has no
   * batch. Uses only buildfire.publicData plus optional services and the widget refresh, so it runs
   * in the control panel and on the server; no widget host, because the app offers no way to do it.
   * Background: a routine curation, undone by another reorder.
   * @param {{ firstTitle: string, secondTitle?: string, thirdTitle?: string }} options
   * @param {function(Error=, object=)} callback - (error, { pinned, widgetRefreshed })
   */
  updatePinnedLocationOrder(options, callback) {
    reorderPinnedLocations(options, ['firstTitle', 'secondTitle', 'thirdTitle'], resolveLocation, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of
   * updatePinnedLocationOrder, taking the locations' record ids instead of their titles.
   * @param {{ firstLocationId: string, secondLocationId?: string, thirdLocationId?: string }} options
   * @param {function(Error=, object=)} callback - (error, { pinned, widgetRefreshed })
   */
  updatePinnedLocationOrderByLocationId(options, callback) {
    reorderPinnedLocations(options, ['firstLocationId', 'secondLocationId', 'thirdLocationId'], requireLocationById, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; the batch form of createCategory, which has
   * no advanced alternative, so neither does this. The control panel's category CSV import, but
   * through createCategory's own categoryCreation: duplicate titles are refused and each category
   * gets its analytics events.
   * @param {{ categories: Array<{ title: string, iconUrl?: string, subcategoryTitles?: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  createCategories(options, callback) {
    runBatch(categoryCreation(), options, 'categories', callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; the batch form of updateCategory (its
   * advanced batch is updateCategoriesByCategoryId), via categoryUpdate.
   * @param {{ categories: Array<object> }} options - entries shaped like updateCategory's params.
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  updateCategories(options, callback) {
    runBatch(categoryUpdate(CATEGORY_BY_TITLE), options, 'categories', callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the batch form of
   * updateCategoryByCategoryId, the alternative of updateCategories.
   * @param {{ categories: Array<object> }} options - entries shaped like updateCategoryByCategoryId's params.
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  updateCategoriesByCategoryId(options, callback) {
    runBatch(categoryUpdate(CATEGORY_BY_ID), options, 'categories', callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; the batch form of deleteCategory (its
   * advanced batch is deleteCategoriesByCategoryId), via categoryRemoval. Flagged dangerous, unlike
   * the single soft delete, because removing many categories at once is broadly destructive.
   * @param {{ categories: Array<{ title: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  deleteCategories(options, callback) {
    runBatch(categoryRemoval(CATEGORY_BY_TITLE), options, 'categories', callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the batch form of
   * deleteCategoryByCategoryId, the alternative of deleteCategories.
   * @param {{ categories: Array<{ categoryId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { categories, succeeded, failed })
   */
  deleteCategoriesByCategoryId(options, callback) {
    runBatch(categoryRemoval(CATEGORY_BY_ID), options, 'categories', callback);
  },

  // ---------------------------------------------------------------------------------------------
  // Control panel: settings, design and the Introduction screen. All of them live in the one
  // settings document (datastore tag 'settings'), which every control-panel tab saves whole, so each
  // write here reads it, normalizes it the way new Settings(data).toJSON() does, changes only what
  // was passed and saves it whole, then refreshes the widget with the tab's own sync scope. No widget
  // host: app users must not change the owner's configuration. Background: none of them publishes
  // to or contacts anyone.
  // ---------------------------------------------------------------------------------------------

  /**
   * hosts: controlBackground, headlessSdk. usage: basic, with no advanced alternative: settings have
   * no handle. The plugin's current settings, with the plugin's defaults where nothing is saved yet
   * (see normalizeSettings and toPublicSettings for what is left out). Uses only buildfire.datastore.
   * It only reads, and unlike the control panel's own load it never saves the defaults or the migration.
   * @param {object} options - takes no params.
   * @param {function(Error=, object=)} callback - (error, settings)
   */
  getSettings(options, callback) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    readSettings((err, settings) => {
      if (err) return callback(err, undefined);
      callback(null, toPublicSettings(settings));
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic. The Settings tab: changes only the
   * settings passed (at least one), saved the way the tab does (see saveSettings). Pages and controls:
   * Global (subscriptionEnabled), Location Settings (openHoursEnabled, priceRangeEnabled — turning
   * one off also resets who may set it to nobody, as the page does), Sorting (defaultSorting and
   * the toggles in SORTING_TOGGLES — with allowSortByNearest off the default sort becomes
   * alphabetical, as the page forces), Filtering (FILTER_TOGGLES), Map (measurementUnit,
   * mapInitialAreaEnabled, and initialAreaAddress / initialAreaLat / initialAreaLng together, the
   * address picked on its map) and Bookmarks (bookmarksEnabled, allowBookmarkLocations,
   * allowBookmarkSearch). Left out: the Global and Location Editing Permissions pages, who may add
   * locations, photos, hours and prices, the charging options (permissions and billing), and
   * "Show Map's points of interest", whose toggle is disabled.
   * Refreshes the widget with sync 'settings', or 'locationSettings' (which reloads it) when the
   * opening-hours or price-range field was switched, as each page does.
   * @param {object} options - see SETTINGS_TOGGLES, SETTINGS_SELECTS and the initial-area trio.
   * @param {function(Error=, object=)} callback - (error, { settings, widgetRefreshed })
   */
  updateSettings(options, callback) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    if (options === null || typeof options !== 'object') return callback(new Error('options must be an object'), undefined);

    const values = {};
    // Every setting always holds a value (toggles, radio groups, an address picked on the map).
    const problem = findClearedProblem(options, [...SETTINGS_TOGGLES, ...Object.keys(SETTINGS_SELECTS), 'initialAreaAddress', 'initialAreaLat', 'initialAreaLng'])
      || readBooleans(options, SETTINGS_TOGGLES, values) || readSelects(options, SETTINGS_SELECTS, values);
    if (problem) return callback(new Error(problem), undefined);
    const picked = readPickedAddress(options, ['initialAreaAddress', 'initialAreaLat', 'initialAreaLng']);
    if (picked.problem) return callback(new Error(picked.problem), undefined);
    if (!Object.keys(values).length && !picked.address) return callback(new Error('Pass at least one setting to change'), undefined);

    readSettings((err, settings) => {
      if (err) return callback(err, undefined);
      const has = (name) => name in values;
      if (has('subscriptionEnabled')) settings.subscription.enabled = values.subscriptionEnabled;
      [['openHoursEnabled', 'openHours'], ['priceRangeEnabled', 'priceRange']].forEach(([name, block]) => {
        if (!has(name)) return;
        const entry = settings.globalEntries[block] || { enabled: true, inAppEnabled: 'all', tags: [] };
        entry.enabled = values[name];
        if (!values[name]) {
          entry.inAppEnabled = 'none';
          entry.tags = [];
        }
        settings.globalEntries[block] = entry;
      });
      SORTING_TOGGLES.forEach((name) => { if (has(name)) settings.sorting[name] = values[name]; });
      if (has('defaultSorting')) settings.sorting.defaultSorting = values.defaultSorting;
      if (settings.sorting.allowSortByNearest === false) {
        if (values.defaultSorting === 'distance') {
          return callback(new Error('defaultSorting cannot be distance while allowSortByNearest is off'), undefined);
        }
        settings.sorting.defaultSorting = 'alphabetical';
      }
      FILTER_TOGGLES.forEach((name) => { if (has(name)) settings.filter[name] = values[name]; });
      if (has('measurementUnit')) settings.measurementUnit = values.measurementUnit;
      if (has('mapInitialAreaEnabled')) settings.map.initialArea = values.mapInitialAreaEnabled;
      if (picked.address) {
        settings.map.initialAreaCoordinates = { lat: picked.address.lat, lng: picked.address.lng };
        settings.map.initialAreaDisplayAddress = picked.address.text;
      }
      if (has('bookmarksEnabled')) settings.bookmarks.enabled = values.bookmarksEnabled;
      if (has('allowBookmarkLocations')) settings.bookmarks.allowForLocations = values.allowBookmarkLocations;
      if (has('allowBookmarkSearch')) settings.bookmarks.allowForFilters = values.allowBookmarkSearch;

      const scope = has('openHoursEnabled') || has('priceRangeEnabled') ? 'locationSettings' : 'settings';
      saveSettings(settings, scope, callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic. The Design tab: changes only the design
   * options passed (at least one; see DESIGN_TOGGLES and DESIGN_SELECTS), saved the way the tab
   * does, then sync 'design'. Kept apart from updateSettings because it is its own tab with its own
   * refresh, though it is stored in the same document.
   * @param {object} options - see DESIGN_TOGGLES and DESIGN_SELECTS.
   * @param {function(Error=, object=)} callback - (error, { settings, widgetRefreshed })
   */
  updateDesign(options, callback) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    if (options === null || typeof options !== 'object') return callback(new Error('options must be an object'), undefined);
    const values = {};
    const problem = findClearedProblem(options, [...DESIGN_TOGGLES, ...Object.keys(DESIGN_SELECTS)])
      || readBooleans(options, DESIGN_TOGGLES, values) || readSelects(options, DESIGN_SELECTS, values);
    if (problem) return callback(new Error(problem), undefined);
    if (!Object.keys(values).length) return callback(new Error('Pass at least one design option to change'), undefined);

    readSettings((err, settings) => {
      if (err) return callback(err, undefined);
      settings.design = { ...settings.design, ...values };
      saveSettings(settings, 'design', callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic. The Content tab's Introduction screen:
   * its Location Source dropdown (locationSource), the Local Area centre and radius used when the
   * source is AreaRadius (areaCenterAddress / areaCenterLat / areaCenterLng together, the address
   * picked on its map, and areaRadiusMiles, which the page limits to 1–200), its Sort Locations by
   * dropdown (sorting) and its description (rich text; an empty string clears it). Changes only
   * what is passed, then sync 'intro'. The carousel is updateIntroScreenImages and the pinned order
   * updatePinnedLocationOrder; who may see the screen is an access setting and is left out.
   * @param {{ locationSource?: string, areaCenterAddress?: string, areaCenterLat?: number,
   *   areaCenterLng?: number, areaRadiusMiles?: number, sorting?: string, description?: string }} options
   * @param {function(Error=, object=)} callback - (error, { settings, widgetRefreshed })
   */
  updateIntroScreen(options, callback) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    if (options === null || typeof options !== 'object') return callback(new Error('options must be an object'), undefined);
    const values = {};
    const problem = findClearedProblem(options, [...Object.keys(INTRO_SELECTS), 'areaCenterAddress', 'areaCenterLat', 'areaCenterLng', 'areaRadiusMiles'])
      || readSelects(options, INTRO_SELECTS, values);
    if (problem) return callback(new Error(problem), undefined);
    const picked = readPickedAddress(options, ['areaCenterAddress', 'areaCenterLat', 'areaCenterLng']);
    if (picked.problem) return callback(new Error(picked.problem), undefined);
    if (isGiven(options.areaRadiusMiles) && (!isFiniteNumber(options.areaRadiusMiles)
      || options.areaRadiusMiles < MIN_AREA_RADIUS_MILES || options.areaRadiusMiles > MAX_AREA_RADIUS_MILES)) {
      return callback(new Error(`areaRadiusMiles must be a number from ${MIN_AREA_RADIUS_MILES} to ${MAX_AREA_RADIUS_MILES}`), undefined);
    }
    // The description is the one field here the page lets the owner empty; null or '' clears it.
    const descriptionGiven = options.description !== undefined;
    if (descriptionGiven && !isCleared(options.description) && typeof options.description !== 'string') {
      return callback(new Error('description must be text, null or an empty string'), undefined);
    }
    if (!Object.keys(values).length && !picked.address && !isGiven(options.areaRadiusMiles) && !descriptionGiven) {
      return callback(new Error('Pass at least one Introduction screen setting to change'), undefined);
    }

    readSettings((err, settings) => {
      if (err) return callback(err, undefined);
      const intro = settings.introductoryListView;
      intro.searchOptions = intro.searchOptions || { mode: 'UserPosition', areaRadiusOptions: {} };
      intro.searchOptions.areaRadiusOptions = intro.searchOptions.areaRadiusOptions || {};
      if (values.locationSource) intro.searchOptions.mode = values.locationSource;
      if (picked.address) {
        Object.assign(intro.searchOptions.areaRadiusOptions, {
          formattedLocation: picked.address.text, lat: picked.address.lat, lng: picked.address.lng
        });
      }
      if (isGiven(options.areaRadiusMiles)) intro.searchOptions.areaRadiusOptions.radius = options.areaRadiusMiles;
      if (values.sorting) intro.sorting = values.sorting;
      // An emptied editor saves '' (tinymce getContent in listView/index.js), so a cleared one does too.
      if (descriptionGiven) intro.description = isCleared(options.description) ? '' : options.description;
      saveSettings(settings, 'intro', callback);
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic. Replaces the Introduction screen's image
   * carousel with the items given, in order (an empty list clears it): what the page's carousel
   * editor stores, one action item with an image (iconUrl) each, saved with a fresh id as the editor
   * adds them. Then sync 'intro'. Dangerous: the previous carousel is not kept anywhere.
   * @param {{ images: Array<object> }} options - carousel items: action items with an iconUrl.
   * @param {function(Error=, object=)} callback - (error, { settings, widgetRefreshed })
   */
  updateIntroScreenImages(options, callback) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    const images = options && options.images;
    if (!Array.isArray(images)) return callback(new Error('images must be a list of carousel items'), undefined);
    const bad = images.findIndex((item) => !isCarouselItem(item));
    if (bad !== -1) {
      return callback(new Error(`images[${bad}] must be an action item with an action and an iconUrl image`), undefined);
    }

    readSettings((err, settings) => {
      if (err) return callback(err, undefined);
      settings.introductoryListView.images = images.map((item) => ({ ...item, id: generateUUID() }));
      saveSettings(settings, 'intro', callback);
    });
  },

  // ---------------------------------------------------------------------------------------------
  // Control panel: the location fields defined on the Settings tab's "Location Fields" page
  // (customFields in the settings document). Basic operations name a field by its exact label,
  // advanced ones by its id. Uses only buildfire.datastore and the widget refresh, so they run in
  // the control panel and on the server; no widget host; Background.
  // ---------------------------------------------------------------------------------------------

  /**
   * hosts: controlBackground, headlessSdk. usage: basic, with no advanced alternative: it names
   * nothing by a handle. Adds a location field (see fieldCreation).
   * @param {{ section: string, label: string, type: string, required?: boolean, enableCustomLabel?: boolean }} options
   * @param {function(Error=, object=)} callback - (error, field)
   */
  createLocationField(options, callback) {
    runAction(fieldCreation(), options, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; its advanced alternative is
   * updateLocationFieldByFieldId. Edits one location field, named by its exact label (see fieldUpdate).
   * @param {{ label: string, newLabel?: string, newType?: string, newRequired?: boolean,
   *   newEnableCustomLabel?: boolean, newPosition?: number }} options
   * @param {function(Error=, object=)} callback - (error, field)
   */
  updateLocationField(options, callback) {
    runAction(fieldUpdate(FIELD_BY_LABEL), options, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of updateLocationField,
   * taking the field's id instead of its label, via the same fieldUpdate.
   * @param {{ fieldId: string, newLabel?: string, newType?: string, newRequired?: boolean,
   *   newEnableCustomLabel?: boolean, newPosition?: number }} options
   * @param {function(Error=, object=)} callback - (error, field)
   */
  updateLocationFieldByFieldId(options, callback) {
    runAction(fieldUpdate(FIELD_BY_ID), options, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; its advanced alternative is
   * deleteLocationFieldByFieldId. Removes one location field, named by its exact label (see fieldRemoval).
   * @param {{ label: string }} options
   * @param {function(Error=, object=)} callback - (error, { deleted, label, widgetRefreshed })
   */
  deleteLocationField(options, callback) {
    runAction(fieldRemoval(FIELD_BY_LABEL), options, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the alternative of deleteLocationField,
   * taking the field's id instead of its label, via the same fieldRemoval.
   * @param {{ fieldId: string }} options
   * @param {function(Error=, object=)} callback - (error, { deleted, label, widgetRefreshed })
   */
  deleteLocationFieldByFieldId(options, callback) {
    runAction(fieldRemoval(FIELD_BY_ID), options, callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; the batch form of createLocationField. The
   * ten-field limit is checked again for each entry, so entries past it fail one by one.
   * @param {{ fields: Array<object> }} options - entries shaped like createLocationField's params.
   * @param {function(Error=, object=)} callback - (error, { fields, succeeded, failed })
   */
  createLocationFields(options, callback) {
    runBatch(fieldCreation(), options, 'fields', callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; the batch form of updateLocationField (its
   * advanced batch is updateLocationFieldsByFieldId). Entries apply in order, so moves stack.
   * @param {{ fields: Array<object> }} options - entries shaped like updateLocationField's params.
   * @param {function(Error=, object=)} callback - (error, { fields, succeeded, failed })
   */
  updateLocationFields(options, callback) {
    runBatch(fieldUpdate(FIELD_BY_LABEL), options, 'fields', callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the batch form of
   * updateLocationFieldByFieldId, the alternative of updateLocationFields.
   * @param {{ fields: Array<object> }} options - entries shaped like updateLocationFieldByFieldId's params.
   * @param {function(Error=, object=)} callback - (error, { fields, succeeded, failed })
   */
  updateLocationFieldsByFieldId(options, callback) {
    runBatch(fieldUpdate(FIELD_BY_ID), options, 'fields', callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: basic; the batch form of deleteLocationField (its
   * advanced batch is deleteLocationFieldsByFieldId).
   * @param {{ fields: Array<{ label: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { fields, succeeded, failed })
   */
  deleteLocationFields(options, callback) {
    runBatch(fieldRemoval(FIELD_BY_LABEL), options, 'fields', callback);
  },

  /**
   * hosts: controlBackground, headlessSdk. usage: advanced; the batch form of
   * deleteLocationFieldByFieldId, the alternative of deleteLocationFields.
   * @param {{ fields: Array<{ fieldId: string }> }} options
   * @param {function(Error=, object=)} callback - (error, { fields, succeeded, failed })
   */
  deleteLocationFieldsByFieldId(options, callback) {
    runBatch(fieldRemoval(FIELD_BY_ID), options, 'fields', callback);
  }
};

/**
 * What the control panel's frame (control/contract.html) dispatches to: init plus every function
 * whose hosts include controlForeground or controlBackground, in plugin.contract.json order. The
 * implementations are widgetContract's own; every function here has a control host, so all are
 * listed.
 */
controlContract = {
  init: widgetContract.init,
  searchLocations: widgetContract.searchLocations,
  searchLocationsByCategoryId: widgetContract.searchLocationsByCategoryId,
  searchLocationsNearPoint: widgetContract.searchLocationsNearPoint,
  getLocation: widgetContract.getLocation,
  getLocationByLocationId: widgetContract.getLocationByLocationId,
  createLocation: widgetContract.createLocation,
  createLocationByCategoryId: widgetContract.createLocationByCategoryId,
  createLocations: widgetContract.createLocations,
  createLocationsByCategoryId: widgetContract.createLocationsByCategoryId,
  updateLocation: widgetContract.updateLocation,
  updateLocationByLocationId: widgetContract.updateLocationByLocationId,
  updateLocations: widgetContract.updateLocations,
  updateLocationsByLocationId: widgetContract.updateLocationsByLocationId,
  updateLocationPin: widgetContract.updateLocationPin,
  updateLocationPinByLocationId: widgetContract.updateLocationPinByLocationId,
  updateLocationsPin: widgetContract.updateLocationsPin,
  updateLocationsPinByLocationId: widgetContract.updateLocationsPinByLocationId,
  updatePinnedLocationOrder: widgetContract.updatePinnedLocationOrder,
  updatePinnedLocationOrderByLocationId: widgetContract.updatePinnedLocationOrderByLocationId,
  deleteLocation: widgetContract.deleteLocation,
  deleteLocationByLocationId: widgetContract.deleteLocationByLocationId,
  deleteLocations: widgetContract.deleteLocations,
  deleteLocationsByLocationId: widgetContract.deleteLocationsByLocationId,
  deleteLocationSubscriber: widgetContract.deleteLocationSubscriber,
  deleteLocationSubscriberByLocationId: widgetContract.deleteLocationSubscriberByLocationId,
  deleteLocationSubscribers: widgetContract.deleteLocationSubscribers,
  deleteLocationSubscribersByLocationId: widgetContract.deleteLocationSubscribersByLocationId,
  sendLocationNotification: widgetContract.sendLocationNotification,
  sendLocationNotificationByLocationId: widgetContract.sendLocationNotificationByLocationId,
  createCategory: widgetContract.createCategory,
  createCategories: widgetContract.createCategories,
  updateCategory: widgetContract.updateCategory,
  updateCategoryByCategoryId: widgetContract.updateCategoryByCategoryId,
  updateCategories: widgetContract.updateCategories,
  updateCategoriesByCategoryId: widgetContract.updateCategoriesByCategoryId,
  deleteCategory: widgetContract.deleteCategory,
  deleteCategoryByCategoryId: widgetContract.deleteCategoryByCategoryId,
  deleteCategories: widgetContract.deleteCategories,
  deleteCategoriesByCategoryId: widgetContract.deleteCategoriesByCategoryId,
  getSettings: widgetContract.getSettings,
  updateSettings: widgetContract.updateSettings,
  updateDesign: widgetContract.updateDesign,
  updateIntroScreen: widgetContract.updateIntroScreen,
  updateIntroScreenImages: widgetContract.updateIntroScreenImages,
  createLocationField: widgetContract.createLocationField,
  updateLocationField: widgetContract.updateLocationField,
  updateLocationFieldByFieldId: widgetContract.updateLocationFieldByFieldId,
  deleteLocationField: widgetContract.deleteLocationField,
  deleteLocationFieldByFieldId: widgetContract.deleteLocationFieldByFieldId,
  createLocationFields: widgetContract.createLocationFields,
  updateLocationFields: widgetContract.updateLocationFields,
  updateLocationFieldsByFieldId: widgetContract.updateLocationFieldsByFieldId,
  deleteLocationFields: widgetContract.deleteLocationFields,
  deleteLocationFieldsByFieldId: widgetContract.deleteLocationFieldsByFieldId
};
