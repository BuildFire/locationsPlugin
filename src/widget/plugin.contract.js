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
const DEFAULT_NEAR_RADIUS_KM = 100; // Mirrors introSearchService's user-position radius.
const EARTH_RADIUS_KM = 6378.1;

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

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
  const missing = names.find((name) => typeof options[name] !== 'string' || !options[name].trim());
  if (missing) {
    callback(new Error(`Missing required parameter: ${missing}`), undefined);
    return false;
  }
  return true;
};

const isGiven = (value) => value !== undefined && value !== null && value !== '';

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
 * Resolves an optional category title (and optional subcategory title inside it) to the
 * `categories` block a location stores. Neither given → null, meaning "leave unchanged".
 * @param {function(Error=, object=)} callback - (error, { main, subcategories } | null)
 */
const resolveLocationCategories = (categoryTitle, subcategoryTitle, callback) => {
  if (!isGiven(categoryTitle)) {
    if (isGiven(subcategoryTitle)) return callback(new Error('subcategoryTitle needs categoryTitle'), undefined);
    return callback(null, null);
  }
  resolveCategory(categoryTitle, (err, category) => {
    if (err) return callback(err, undefined);
    if (!isGiven(subcategoryTitle)) return callback(null, { main: [category.id], subcategories: [] });

    const wanted = subcategoryTitle.trim().toLowerCase();
    const matches = (category.data.subcategories || []).filter((s) => s && s.title && s.title.toLowerCase() === wanted);
    if (!matches.length) return callback(new Error(`Category "${categoryTitle}" has no subcategory titled "${subcategoryTitle}"`), undefined);
    if (matches.length > 1) return callback(new Error(`${matches.length} subcategories of "${categoryTitle}" are titled "${subcategoryTitle}"`), undefined);
    callback(null, { main: [category.id], subcategories: [matches[0].id] });
  });
};

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
   * hosts: widgetBackground, controlBackground, headlessSdk. The one paged search over
   * locations, every filter optional (title, text, category, subcategory, price range,
   * creator, pinned, open now). Uses only buildfire.publicData and buildfire.auth, which
   * behave the same in both frames and on the server; it only reads, so nothing about it
   * needs to be watched — Background in both frames.
   * It is a function, not a declarative search, because a category is named by title and
   * has to be resolved to its id first, and the open-now filter keys on the day name
   * (`openingHours.days.<day>.intervals`), which a static query cannot express.
   * Assumption: when several filters are given they all apply (category, subcategory and
   * price are required together through `$all`); the widget's own quick filter unions its
   * category and price chips into one `$in`, which reads as "any of these".
   * @param {{ title?: string, text?: string, categoryTitle?: string, subcategoryTitle?: string,
   *   priceRange?: number, createdByUserId?: string, pinnedOnly?: boolean, openNow?: boolean,
   *   at?: string, utcOffsetMinutes?: number, sortBy?: string, page?: number, pageSize?: number }} options
   * @param {function(Error=, object=)} callback - (error, { locations, total, page, hasMore })
   */
  searchLocations(options, callback) {
    if (!requireStringParams(options, [], callback)) return;
    const paging = readPaging(options, callback);
    if (!paging) return;

    if (isGiven(options.sortBy) && !SORTS[options.sortBy]) {
      return callback(new Error(`sortBy must be one of: ${Object.keys(SORTS).join(', ')}`), undefined);
    }
    if (isGiven(options.priceRange) && !isValidPriceRange(options.priceRange)) {
      return callback(new Error('priceRange must be a whole number from 1 to 4'), undefined);
    }
    if (isGiven(options.utcOffsetMinutes) && !isFiniteNumber(options.utcOffsetMinutes)) {
      return callback(new Error('utcOffsetMinutes must be a number'), undefined);
    }
    const moment = resolveOpeningMoment(options.at, options.utcOffsetMinutes);
    if (!moment) return callback(new Error(`Invalid timestamp: ${options.at}`), undefined);

    resolveLocationCategories(options.categoryTitle, options.subcategoryTitle, (catErr, categories) => {
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
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Locations within a radius of a
   * point, nearest first, each with its distance. Kept apart from searchLocations because it
   * answers a different shape (every location carries a distance). Uses only
   * buildfire.publicData.aggregate, which behaves the same in both frames and on the server;
   * it only reads, so Background in both frames. It is a function because the radius is taken
   * in kilometres and converted to the radians $centerSphere expects, the same conversion
   * introSearchService does.
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
   * hosts: widgetBackground, controlBackground, headlessSdk. One location, named by its exact
   * title, with its category and subcategory titles resolved and whether it is open at the
   * given moment. Uses only buildfire.publicData, which behaves the same in both frames and on
   * the server; it only reads, so Background in both frames. Multi-step: the title is resolved
   * by a search, then the category ids on the record are resolved to titles by a second
   * search, which is why it is not a declarative operation.
   * @param {{ title: string, at?: string, utcOffsetMinutes?: number }} options
   * @param {function(Error=, object=)} callback - (error, location)
   */
  getLocation(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    if (isGiven(options.utcOffsetMinutes) && !isFiniteNumber(options.utcOffsetMinutes)) {
      return callback(new Error('utcOffsetMinutes must be a number'), undefined);
    }
    const moment = resolveOpeningMoment(options.at, options.utcOffsetMinutes);
    if (!moment) return callback(new Error(`Invalid timestamp: ${options.at}`), undefined);

    resolveLocation(options.title, (err, location) => {
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
  },

  /**
   * hosts: widgetForeground, controlForeground, headlessSdk. Adds a location the way the
   * widget's and control panel's create forms do: the same required fields, a fresh clientId,
   * the default 08:00–20:00 opening hours, then the deeplink, search-index and analytics
   * registrations (best effort, as in the plugin) and the locationCreated event. Uses only
   * buildfire.publicData plus optional services, so it runs in both frames and on the server,
   * where the MCP server does the confirming and this skips its own. Foreground in both frames
   * because it publishes a location every app user sees, so the person watching approves it
   * once the categories are resolved and before anything is written.
   * The creator is left unset: createdBy grants edit rights in accessManager.canEditLocations,
   * and a caller outside the app is not an app user, so the location is created as the app.
   * @param {{ title: string, description: string, address: string, lat: number, lng: number,
   *   listImage: string, subtitle?: string, addressAlias?: string, categoryTitle?: string,
   *   subcategoryTitle?: string, priceRange?: number, currency?: string }} options
   * @param {function(Error=, object=)} callback - (error, created location)
   */
  createLocation(options, callback) {
    if (!requireStringParams(options, ['title', 'description', 'address', 'listImage'], callback)) return;
    if (!isFiniteNumber(options.lat) || options.lat < -90 || options.lat > 90) {
      return callback(new Error('lat must be a number from -90 to 90'), undefined);
    }
    if (!isFiniteNumber(options.lng) || options.lng < -180 || options.lng > 180) {
      return callback(new Error('lng must be a number from -180 to 180'), undefined);
    }
    if (isGiven(options.priceRange) && !isValidPriceRange(options.priceRange)) {
      return callback(new Error('priceRange must be a whole number from 1 to 4'), undefined);
    }

    resolveLocationCategories(options.categoryTitle, options.subcategoryTitle, (catErr, categories) => {
      if (catErr) return callback(catErr, undefined);

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
        categories: categories || { main: [], subcategories: [] },
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
    });
  },

  /**
   * hosts: widgetForeground, controlForeground, headlessSdk. Edits one location, named by its
   * exact current title, changing only the fields the caller passes; the edit forms save the
   * whole document, so this reads the record, applies the changes, rebuilds the index the same
   * way Location.toJSON() does and writes it back, then refreshes the deeplink and search index
   * (best effort) and fires locationUpdated — the same steps as updateLocation in editView.js
   * and the control panel's controller. Uses only buildfire.publicData plus optional services,
   * so it runs in both frames and on the server, where the MCP server does the confirming and
   * this skips its own. Foreground in both frames because the change is published to every app
   * user, so the person watching approves it after the location and categories are resolved.
   * Resolving the title is a search, which is why this is a function rather than a declarative
   * update.
   * @param {{ title: string, newTitle?: string, newSubtitle?: string, newDescription?: string,
   *   newAddress?: string, newLat?: number, newLng?: number, newAddressAlias?: string,
   *   newListImage?: string, newPriceRange?: number, newCurrency?: string,
   *   newCategoryTitle?: string, newSubcategoryTitle?: string }} options
   * @param {function(Error=, object=)} callback - (error, updated location)
   */
  updateLocation(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;

    const textParams = ['newTitle', 'newSubtitle', 'newDescription', 'newAddressAlias', 'newListImage', 'newCurrency',
      'newCategoryTitle', 'newSubcategoryTitle'];
    const notText = textParams.find((name) => isGiven(options[name]) && typeof options[name] !== 'string');
    if (notText) return callback(new Error(`${notText} must be text`), undefined);

    const changes = {};
    if (isGiven(options.newTitle)) {
      if (!options.newTitle.trim()) return callback(new Error('newTitle cannot be blank'), undefined);
      changes.title = options.newTitle.trim();
    }
    if (isGiven(options.newSubtitle)) changes.subtitle = options.newSubtitle;
    if (isGiven(options.newDescription)) changes.description = options.newDescription;
    if (isGiven(options.newAddressAlias)) changes.addressAlias = options.newAddressAlias;
    if (isGiven(options.newListImage)) changes.listImage = options.newListImage;
    if (isGiven(options.newCurrency)) changes.currency = options.newCurrency;
    if (isGiven(options.newPriceRange)) {
      if (!isValidPriceRange(options.newPriceRange)) return callback(new Error('newPriceRange must be a whole number from 1 to 4'), undefined);
      changes.priceRange = options.newPriceRange;
    }

    // The address and its coordinates change together, as they do when a new address is picked on the map.
    const addressParts = [options.newAddress, options.newLat, options.newLng].filter(isGiven).length;
    if (addressParts && addressParts !== 3) {
      return callback(new Error('newAddress, newLat and newLng must be given together'), undefined);
    }
    if (addressParts) {
      if (typeof options.newAddress !== 'string') return callback(new Error('newAddress must be text'), undefined);
      if (!isFiniteNumber(options.newLat) || options.newLat < -90 || options.newLat > 90) {
        return callback(new Error('newLat must be a number from -90 to 90'), undefined);
      }
      if (!isFiniteNumber(options.newLng) || options.newLng < -180 || options.newLng > 180) {
        return callback(new Error('newLng must be a number from -180 to 180'), undefined);
      }
      changes.address = options.newAddress;
    }
    const categoryGiven = isGiven(options.newCategoryTitle) || isGiven(options.newSubcategoryTitle);

    if (!Object.keys(changes).length && !categoryGiven) {
      return callback(new Error('Pass at least one field to change'), undefined);
    }

    resolveLocation(options.title, (err, location) => {
      if (err) return callback(err, undefined);

      resolveLocationCategories(options.newCategoryTitle, options.newSubcategoryTitle, (catErr, categories) => {
        if (catErr) return callback(catErr, undefined);

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
        if (categories) doc.categories = categories;
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
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Pins a location to the top of the list or unpins
   * it, the control panel's "Pin to Top" / "Unpin" action: at most three locations are
   * pinned, a newly pinned one takes the next position (pinned count + 1, as the control
   * panel assigns it), and unpinning clears the position without renumbering the others.
   * Kept separate from updateLocation because it has its own check (the three-pin limit).
   * Uses only buildfire.publicData, so it runs in the control panel and on the server; no
   * widget host, because pinning is an owner's curation of the list and the app offers no way
   * to do it. Nothing about it needs to be watched and it is undone by the opposite call, so
   * Background.
   * @param {{ title: string, isPinned: boolean }} options
   * @param {function(Error=, object=)} callback - (error, { title, isPinned, pinPosition })
   */
  updateLocationPin(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    if (typeof options.isPinned !== 'boolean') return callback(new Error('isPinned must be true or false'), undefined);

    resolveLocation(options.title, (err, location) => {
      if (err) return callback(err, undefined);
      const current = location.data.pinIndex || null;
      const writePin = (pinIndex) => {
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
          if (updateErr) return callback(updateErr, undefined);
          sendContractEvent('locationUpdated', { locationId: location.id, title: doc.title });
          callback(null, { title: doc.title, isPinned: pinIndex !== null, pinPosition: pinIndex });
        });
      };

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
    });
  },

  /**
   * hosts: widgetForeground, controlForeground, headlessSdk. Permanently deletes one location,
   * named by its exact title: the record is hard-deleted (publicData.delete, as both the
   * control panel and the widget's report-abuse flow do), its deeplink is unregistered and its
   * search-index entry removed (best effort, as the plugin's Promise.allSettled chain treats
   * them), and locationDeleted fires. Uses only buildfire.publicData plus optional services, so
   * it runs in both frames and on the server, where the `dangerous` flag makes the app owner
   * confirm it and this skips its own approval. Foreground in both frames because it removes,
   * for good, a location every app user sees, so the person watching approves it once the title
   * is resolved. Resolving the title is a search, which is why this is a function rather than a
   * declarative delete.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, { deleted, title, deeplinkRemoved, searchIndexRemoved })
   */
  deleteLocation(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;

    resolveLocation(options.title, (err, location) => {
      if (err) return callback(err, undefined);

      buildfire.publicData.delete(location.id, LOCATIONS_TAG, (deleteErr) => {
        if (deleteErr) return callback(deleteErr, undefined);
        sendContractEvent('locationDeleted', { locationId: location.id });
        const deeplinkRemoved = unregisterDeeplink(location.id);
        const searchIndexRemoved = deleteSearchIndex(location.id);
        callback(null, {
          deleted: true, title: location.data.title, deeplinkRemoved, searchIndexRemoved
        });
      });
    });
  },

  /**
   * hosts: widgetBackground, controlBackground, headlessSdk. Stops one app user from getting a
   * location's update notifications, as the app: the same `$pull` from `subscribers` as the
   * widget's unfollow button, then locationUnsubscribed. The named user is the target, not the
   * actor, and removing someone from a notification list only ever sends them less. Takes the
   * user as a parameter, so it needs no signed-in session: uses only buildfire.publicData and
   * buildfire.auth, which behave the same in both frames and on the server; confined to one
   * list entry, so Background in both frames. Subscribing a user is deliberately not offered:
   * opting someone in to notifications is their decision to make.
   * @param {{ title: string, userId: string }} options
   * @param {function(Error=, object=)} callback - (error, { title, userId, wasSubscribed })
   */
  deleteLocationSubscriber(options, callback) {
    if (!requireStringParams(options, ['title', 'userId'], callback)) return;

    resolveUserId(options.userId, (userErr, userId) => {
      if (userErr) return callback(userErr, undefined);
      resolveLocation(options.title, (err, location) => {
        if (err) return callback(err, undefined);
        const wasSubscribed = (location.data.subscribers || []).includes(userId);
        if (!wasSubscribed) return callback(null, { title: location.data.title, userId, wasSubscribed: false });

        buildfire.publicData.update(location.id, { $pull: { subscribers: userId } }, LOCATIONS_TAG, (updateErr) => {
          if (updateErr) return callback(updateErr, undefined);
          sendContractEvent('locationUnsubscribed', { locationId: location.id, userId });
          callback(null, { title: location.data.title, userId, wasSubscribed: true });
        });
      });
    });
  },

  /**
   * hosts: widgetForeground, controlForeground, headlessSdk. Sends a push notification to
   * everyone following a location, on behalf of the app — the widget's "Notify Subscribers"
   * form: the same settings gate (subscriptions enabled and custom notifications allowed), the
   * same refusal when the location has no subscribers, and the same deep link back to the
   * location. Uses buildfire.datastore, buildfire.publicData and
   * buildfire.notifications.pushNotification.schedule, all server-safe, so it keeps
   * headlessSdk; there the `dangerous` and `throttable` flags make the app owner confirm it.
   * Foreground in both frames because it reaches real people and cannot be recalled, so the
   * person watching approves it once the location and its subscribers are known.
   * @param {{ title: string, notificationTitle: string, notificationText: string }} options
   * @param {function(Error=, object=)} callback - (error, { title, recipientCount })
   */
  sendLocationNotification(options, callback) {
    if (!requireStringParams(options, ['title', 'notificationTitle', 'notificationText'], callback)) return;
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

      resolveLocation(options.title, (err, location) => {
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
  },

  /**
   * hosts: controlBackground, headlessSdk. Adds a category, the control panel's "Add
   * Category" form: a title, an optional icon and optional subcategories given as one
   * comma-separated list (the same split the category CSV import does), each subcategory with
   * a fresh id, then the category's analytics events (best effort). Uses only
   * buildfire.publicData plus optional analytics, so it runs in the control panel and on the
   * server; no widget host, because categories are managed only from the control panel.
   * Nothing about it needs to be watched, so Background.
   * Assumption: a title already used by a live category is refused. The control panel does not
   * check, but categories are named by title everywhere in this contract, so a duplicate would
   * make both unaddressable.
   * @param {{ title: string, iconUrl?: string, subcategoryTitles?: string }} options
   * @param {function(Error=, object=)} callback - (error, created category)
   */
  createCategory(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    const title = options.title.trim();

    resolveCategory(title, (lookupErr) => {
      if (!lookupErr) return callback(new Error(`A category titled "${title}" already exists`), undefined);
      if (!/^No category titled/.test(lookupErr.message)) return callback(lookupErr, undefined);

      const subcategories = (isGiven(options.subcategoryTitles) ? options.subcategoryTitles.split(',') : [])
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => ({
          id: generateUUID(), title: t, iconUrl: null, iconClassName: null
        }));
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
        // Mirrors CategoriesController.createCategory's analytics registrations.
        registerAnalyticsEvent(`${title} (Category Selected)`, `categories_${record.id}_selected`);
        subcategories.forEach((s) => registerAnalyticsEvent(`${s.title} (Subcategory Selected)`, `subcategories_${s.id}_selected`));
        callback(null, {
          id: record.id, title, iconUrl: doc.iconUrl, subcategories: subcategories.map((s) => s.title)
        });
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Edits one category, named by its exact current
   * title: renames it, changes its icon and/or appends subcategories (comma-separated), leaving
   * everything else as stored; the control panel saves the whole document, so this reads it,
   * applies the changes and writes it back with a new lastUpdatedOn. Uses only
   * buildfire.publicData, so it runs in the control panel and on the server; no widget host,
   * because categories are managed only from the control panel. Nothing about it needs to be
   * watched, so Background. Resolving the title is a search, which is why this is a function.
   * @param {{ title: string, newTitle?: string, newIconUrl?: string, addSubcategoryTitles?: string }} options
   * @param {function(Error=, object=)} callback - (error, updated category)
   */
  updateCategory(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    const newTitle = isGiven(options.newTitle) ? String(options.newTitle).trim() : '';
    const added = (isGiven(options.addSubcategoryTitles) ? String(options.addSubcategoryTitles).split(',') : [])
      .map((t) => t.trim())
      .filter(Boolean);
    if (!newTitle && !isGiven(options.newIconUrl) && !added.length) {
      return callback(new Error('Pass at least one of newTitle, newIconUrl or addSubcategoryTitles'), undefined);
    }

    resolveCategory(options.title, (err, category) => {
      if (err) return callback(err, undefined);

      const write = () => {
        const doc = { ...category.data };
        delete doc._buildfire;
        if (newTitle) doc.title = newTitle;
        if (isGiven(options.newIconUrl)) {
          doc.iconUrl = options.newIconUrl;
          doc.iconClassName = null;
        }
        const newSubcategories = added.map((t) => ({
          id: generateUUID(), title: t, iconUrl: null, iconClassName: null
        }));
        doc.subcategories = [...(doc.subcategories || []), ...newSubcategories];
        doc.quickAccess = [0, 1].includes(doc.quickAccess) ? doc.quickAccess : 0;
        doc.deletedOn = doc.deletedOn || null;
        doc.lastUpdatedOn = new Date();
        doc.lastUpdatedBy = null;
        doc._buildfire = buildCategoryIndex(doc);

        buildfire.publicData.update(category.id, doc, CATEGORIES_TAG, (updateErr) => {
          if (updateErr) return callback(updateErr, undefined);
          newSubcategories.forEach((s) => registerAnalyticsEvent(`${s.title} (Subcategory Selected)`, `subcategories_${s.id}_selected`));
          callback(null, {
            id: category.id,
            title: doc.title,
            iconUrl: doc.iconUrl || null,
            subcategories: doc.subcategories.map((s) => s.title)
          });
        });
      };

      if (!newTitle || newTitle.toLowerCase() === category.data.title.toLowerCase()) return write();
      // Same reason createCategory refuses duplicates: the new title must stay a unique handle.
      resolveCategory(newTitle, (clashErr) => {
        if (!clashErr) return callback(new Error(`A category titled "${newTitle}" already exists`), undefined);
        if (!/^No category titled/.test(clashErr.message)) return callback(clashErr, undefined);
        write();
      });
    });
  },

  /**
   * hosts: controlBackground, headlessSdk. Removes one category, named by its exact title, the
   * way the control panel does: a soft delete that writes deletedOn (mirrored into the date1
   * index the app filters on) and keeps the record, so it disappears from the app but can be
   * restored. Locations keep the category id, exactly as they do after an in-app delete. Uses
   * only buildfire.publicData, so it runs in the control panel and on the server; no widget
   * host, because categories are managed only from the control panel. Nothing about it needs
   * to be watched, so Background.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, { deleted, title })
   */
  deleteCategory(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;

    resolveCategory(options.title, (err, category) => {
      if (err) return callback(err, undefined);
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
    });
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
  searchLocationsNearPoint: widgetContract.searchLocationsNearPoint,
  getLocation: widgetContract.getLocation,
  createLocation: widgetContract.createLocation,
  updateLocation: widgetContract.updateLocation,
  updateLocationPin: widgetContract.updateLocationPin,
  deleteLocation: widgetContract.deleteLocation,
  deleteLocationSubscriber: widgetContract.deleteLocationSubscriber,
  sendLocationNotification: widgetContract.sendLocationNotification,
  createCategory: widgetContract.createCategory,
  updateCategory: widgetContract.updateCategory,
  deleteCategory: widgetContract.deleteCategory
};
