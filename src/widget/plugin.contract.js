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
 * refers to:
 *
 *   generic            no buildfire at all — pure logic, evaluated anywhere.
 *   headlessSdk        uses buildfire and chains several steps to build its result.
 *   widgetForeground   confined to the iframe under the app; never on the server.
 *   widgetBackground   Either it needs widget-frame state (device, localStorage,
 *                      bookmarks, the actual signed-in session), or it handles
 *                      user-sensitive data / critical behavior that must not be
 *                      reachable remotely. Foreground when someone has to be
 *                      watching it run — it surfaces UI, or reaches real people
 *                      unattended is itself a problem; Background otherwise.
 *   controlForeground  confined to the iframe under the control panel; never on
 *   controlBackground  the server. Either it needs CP-only localStorage or
 *                      CP-only APIs, or it is sensitive/critical enough to stay
 *                      behind the CP. Foreground/Background by the same rule.
 *
 * generic and headlessSdk operations are the ones exposed to the MCP.
 *
 * `buildfire` is resolved as a global: in the widget/control hosts it comes from
 * the injected SDK, and on the server the headless SDK provides it.
 * `widgetContract` and `frameId` are assigned as implicit globals for the
 * same reason — the consumer reaches them without importing this file.
 *
 * Every function is Node-style: callback(error, result), invoked exactly once,
 * never with both error and result populated. Invalid input is reported through
 * the callback rather than thrown synchronously.
 *
 * Every option a function reads here must be declared in that operation's
 * `parameters` block, or a caller cannot pass it: the MCP server refuses any
 * param the contract does not declare.
 */

const LOCATIONS_TAG = 'locations';   // must match the collection names in plugin.contract.json
const CATEGORIES_TAG = 'categories';
const SETTINGS_TAG = 'settings';

// The control panel walks categories 50 at a time until a short page comes back;
// the cap keeps a runaway collection from turning one call into an unbounded walk.
const CATEGORY_PAGE_SIZE = 50;
const CATEGORY_MAX_PAGES = 20;

// The in-app notification form caps the message at 300 characters.
const NOTIFICATION_MESSAGE_MAX_LENGTH = 300;

// Mirrors getCurrentDayName in src/utils/datetime.js: opening hours are keyed by
// lowercase day name, indexed the way Date returns the day of the week.
const WEEK_DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
];

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

/**
 * Assert that every named option is a finite number. Always called after
 * requireStringParams, which is what establishes that options is an object.
 * @returns {boolean} true when valid; false when the callback has already fired.
 */
const requireNumberParams = (options, names, callback) => {
  const missing = names.find((name) => typeof options[name] !== 'number' || !isFinite(options[name]));
  if (missing) {
    callback(new Error(`Missing or non-numeric required parameter: ${missing}`), undefined);
    return false;
  }
  return true;
};

/**
 * Assert that every named option, when present, has the given type.
 * @returns {boolean} true when valid; false when the callback has already fired.
 */
const checkOptionalParams = (options, type, names, callback) => {
  const wrong = names.find((name) => options[name] !== undefined && options[name] !== null
    // eslint-disable-next-line valid-typeof
    && (typeof options[name] !== type || (type === 'number' && !isFinite(options[name]))));
  if (wrong) {
    callback(new Error(`Parameter ${wrong} must be a ${type}`), undefined);
    return false;
  }
  return true;
};

/* eslint-disable no-bitwise */
/** Mirrors generateUUID in src/widget/js/global/helpers.js so ids are indistinguishable from the plugin's own. */
const generateUUID = () => {
  let dt = new Date().getTime();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const replace = (dt + Math.random() * 16) % 16 | 0;
    dt = Math.floor(dt / 16);
    return (c === 'x' ? replace : (replace & 0x3) | 0x8).toString(16);
  });
};
/* eslint-enable no-bitwise */

/** Paging arguments shared by every search this file issues; the widget pages locations 50 at a time. */
const pagingOf = (options) => ({
  page: typeof options.page === 'number' && options.page >= 0 ? Math.floor(options.page) : 0,
  pageSize: typeof options.pageSize === 'number' && options.pageSize > 0 ? Math.min(Math.floor(options.pageSize), 50) : 50
});

/**
 * Fire a contract event if this host carries the contract event service. The
 * widget emits the same events from its own UI paths (see sendContractEvent in
 * src/widget/js/global/helpers.js); this covers the same functions run through
 * the contract, where the service may be absent.
 */
const sendContractEvent = (name, data) => {
  const events = buildfire.services && buildfire.services.contract && buildfire.services.contract.events;
  if (events && typeof events.send === 'function') events.send(name, data);
};

/**
 * Rebuild the derived _buildfire block of a location record.
 * Mirrors Location.toJSON in src/widget/js/global/data/Location.js field for field —
 * including the unguarded address interpolation — so a record written here indexes
 * and geo-queries exactly like one written by the plugin's own forms.
 */
const buildLocationIndex = (location) => {
  const title = location.title || '';
  const categories = location.categories || { main: [], subcategories: [] };
  const price = location.price || { range: 1, currency: '$' };
  const coordinates = location.coordinates || { lat: null, lng: null };

  return {
    index: {
      text: `${title.toLowerCase()} ${location.subtitle ? location.subtitle : ''} ${location.address} ${location.formattedAddress} ${location.addressAlias ? location.addressAlias : ''}`,
      string1: title.toLowerCase(),
      date1: location.createdOn,
      array1: [
        ...(categories.main || []).map((elemId) => ({ string1: `c_${elemId}` })),
        ...(categories.subcategories || []).map((elemId) => ({ string1: `s_${elemId}` })),
        { string1: `v_${location.views}` },
        { string1: `pr_${price.range}` },
        { string1: `cid_${location.clientId}` },
        { string1: `title_${title.toLowerCase()}` }
      ],
      number1: location.pinIndex
    },
    geo: {
      type: 'Point',
      coordinates: [coordinates.lng, coordinates.lat]
    }
  };
};

/** Mirrors the Location constructor's defaults so a record created here has the same shape as an in-app one. */
const buildLocationRecord = (values) => {
  const location = {
    clientId: values.clientId,
    title: values.title,
    subtitle: values.subtitle || null,
    pinIndex: null,
    address: values.address || null,
    formattedAddress: values.formattedAddress || null,
    addressAlias: values.addressAlias || null,
    subscribers: [],
    coordinates: values.coordinates || { lat: null, lng: null },
    marker: {
      type: 'pin', image: null, color: null, base64Image: null
    },
    categories: values.categories || { main: [], subcategories: [] },
    settings: {
      showCategory: true,
      showOpeningHours: false,
      showPriceRange: false,
      showStarRating: false
    },
    openingHours: { timezone: null, days: {} },
    editingPermissions: { active: false, editors: [], tags: [] },
    images: [],
    listImage: values.listImage || null,
    description: values.description || null,
    // The plugin tags descriptions by where they were authored; anything written through
    // the contract is not the control panel's WYSIWYG, so it is tagged like the app's own.
    wysiwygSource: 'widget',
    views: 0,
    price: { range: 1, currency: '$' },
    rating: { total: 0, count: 0, average: 0 },
    bookmarksCount: 0,
    actionItems: [],
    createdOn: values.createdOn,
    createdBy: values.createdBy || null,
    lastUpdatedOn: values.createdOn,
    lastUpdatedBy: values.createdBy || null,
    deletedOn: null,
    deletedBy: null,
    isActive: 1,
    additionalFields: { quickActions: [], content: [] }
  };

  location._buildfire = buildLocationIndex(location);
  return location;
};

/**
 * Resolve an app user named by id or by email into their profile. An email is
 * looked up through buildfire.auth.getUsersByEmail; anything else is taken as a
 * user id and read with getUserProfile.
 * @param {function(Error=, object=)} callback - (error, profile with userId set)
 */
const resolveUser = (handle, callback) => {
  const value = handle.trim();
  const withUserId = (user) => ({ ...user, userId: user.userId || user._id, _id: user._id || user.userId });

  if (value.includes('@')) {
    return buildfire.auth.getUsersByEmail({ emails: [value] }, (err, users) => {
      if (err) return callback(err, undefined);
      const list = Array.isArray(users) ? users : ((users && users.result) || []);
      const found = list.filter((user) => user && user.email && user.email.toLowerCase() === value.toLowerCase());
      if (!found.length) return callback(new Error(`No app user with email "${value}"`), undefined);
      return callback(null, withUserId(found[0]));
    });
  }

  return buildfire.auth.getUserProfile({ userId: value }, (err, user) => {
    if (err) return callback(err, undefined);
    if (!user) return callback(new Error(`No app user with id "${value}"`), undefined);
    return callback(null, withUserId(user));
  });
};

/**
 * The location a caller named by its exact title — the only handle a caller actually has.
 * Locations are hard-deleted, so every stored record is live. A title matching several
 * locations is refused rather than resolved to one of them: on a write, picking would mean
 * acting on a location the caller did not mean.
 * @param {function(Error=, object=)} callback - (error, { id, data })
 */
const resolveLocation = (title, callback) => {
  buildfire.publicData.search({
    filter: { '$json.title': title },
    page: 0,
    pageSize: 2,
    recordCount: true
  }, LOCATIONS_TAG, (err, response) => {
    if (err) return callback(err, undefined);

    const found = ((response && response.result) || []).filter((record) => record && record.data);
    const total = typeof response.totalRecord === 'number' ? response.totalRecord : found.length;

    if (!found.length) {
      return callback(new Error(`No location titled "${title}"`), undefined);
    }
    if (total > 1 || found.length > 1) {
      return callback(new Error(`${Math.max(total, found.length)} locations are titled "${title}"`), undefined);
    }
    return callback(null, found[0]);
  });
};

/**
 * Collect the live categories, paging the way the control panel's own category load does
 * (keep asking until a short page comes back). Categories are soft-deleted: the widget keeps
 * only records whose indexed deletion date (_buildfire.index.date1) is still null.
 * @param {function(Error=, object[]=)} callback - (error, category records)
 */
const collectLiveCategories = (page, collected, callback) => {
  buildfire.publicData.search({
    filter: { '_buildfire.index.date1': { $type: 10 } },
    sort: { '_buildfire.index.string1': 1 },
    page,
    pageSize: CATEGORY_PAGE_SIZE,
    recordCount: false
  }, CATEGORIES_TAG, (err, response) => {
    if (err) return callback(err, undefined);

    const records = Array.isArray(response) ? response : ((response && response.result) || []);
    const all = collected.concat(records.filter((record) => record && record.data));

    if (records.length < CATEGORY_PAGE_SIZE || page + 1 >= CATEGORY_MAX_PAGES) {
      return callback(null, all);
    }
    return collectLiveCategories(page + 1, all, callback);
  });
};

/**
 * The live category a caller named by its exact title, refusing no match and several matches.
 * @param {function(Error=, object=)} callback - (error, { id, data })
 */
const resolveCategory = (title, callback) => {
  collectLiveCategories(0, [], (err, categories) => {
    if (err) return callback(err, undefined);

    const found = categories.filter((record) => record.data.title === title);
    if (!found.length) return callback(new Error(`No category titled "${title}"`), undefined);
    if (found.length > 1) return callback(new Error(`${found.length} categories are titled "${title}"`), undefined);
    return callback(null, found[0]);
  });
};

/**
 * Resolve an optional category title, plus an optional subcategory title inside it, into the
 * { main, subcategories } id lists a location stores. Mirrors the in-app category picker, which
 * files a location under the main category and whichever of its subcategories were chosen.
 * @param {function(Error=, object=)} callback - (error, { main, subcategories, category, subcategory })
 */
const resolveFiling = (categoryTitle, subcategoryTitle, callback) => {
  if (!categoryTitle) {
    if (subcategoryTitle) return callback(new Error('subcategoryTitle needs a categoryTitle to look inside'), undefined);
    return callback(null, {
      main: [], subcategories: [], category: null, subcategory: null
    });
  }

  return resolveCategory(categoryTitle, (err, category) => {
    if (err) return callback(err, undefined);
    if (!subcategoryTitle) {
      return callback(null, {
        main: [category.id], subcategories: [], category, subcategory: null
      });
    }

    const matches = (category.data.subcategories || []).filter((sub) => sub && sub.title === subcategoryTitle);
    if (!matches.length) return callback(new Error(`Category "${categoryTitle}" has no subcategory titled "${subcategoryTitle}"`), undefined);
    if (matches.length > 1) return callback(new Error(`${matches.length} subcategories of "${categoryTitle}" are titled "${subcategoryTitle}"`), undefined);
    return callback(null, {
      main: [category.id], subcategories: [matches[0].id], category, subcategory: matches[0]
    });
  });
};

/**
 * Read this instance's settings document. A brand-new instance has none; the Settings model
 * then defaults subscriptions on and bookmarks on (see Settings.get in
 * src/widget/js/global/repository/Settings.js), which is what `initialized: false` stands for.
 * @param {function(Error=, object=)} callback - (error, { initialized, data, subscription, bookmarks })
 */
const getSettings = (callback) => {
  buildfire.datastore.get(SETTINGS_TAG, (err, result) => {
    if (err) return callback(err, undefined);
    const data = (result && result.data) || {};
    const initialized = Object.keys(data).length > 0;
    return callback(null, {
      initialized,
      data,
      subscription: data.subscription || (initialized
        ? { enabled: false, allowCustomNotifications: false }
        : { enabled: true, allowCustomNotifications: true }),
      bookmarks: data.bookmarks || { enabled: true, allowForLocations: true, allowForFilters: true }
    });
  });
};

/**
 * Keep the in-app search engine in step with a location write, the way the plugin's own
 * create, edit and delete paths do. buildfire.services.searchEngine only exists where its
 * script is loaded, so this is best effort and reports whether it ran rather than failing a
 * write that has already landed.
 * Mirrors SearchEngine.add / update / delete in src/widget/js/global/repository/searchEngine.js.
 * @param {function(boolean)} done - whether the search index was brought up to date
 */
const syncSearchIndex = (action, locationId, data, done) => {
  const service = buildfire.services && buildfire.services.searchEngine;
  if (!service) return done(false);

  if (action === 'delete') {
    return service.delete({ id: locationId, tag: LOCATIONS_TAG }, (err) => done(!err));
  }

  return service.save({
    tag: LOCATIONS_TAG,
    key: locationId,
    data: { locationId },
    title: data.title,
    description: data.description ? data.description.replace(/(<([^>]+)>)/gi, '') : '',
    imageUrl: data.listImage,
    keywords: [data.address, data.formattedAddress, data.addressAlias, data.subtitle].join(',')
  }, (err) => done(!err));
};

/**
 * Encode a moment as the time of day the plugin stores opening hours in.
 * Mirrors convertTimeToDate / openingNowDate in src/utils/datetime.js: intervals are
 * kept as instants on 1970-01-01 UTC carrying only hours and minutes, so anything
 * compared against them has to be flattened onto the same day first.
 */
const toStoredTimeOfDay = (date) => new Date(Date.UTC(1970, 0, 1, date.getUTCHours(), date.getUTCMinutes()));

/** Parse an optional ISO instant, defaulting to now. Returns null when the caller sent something unparseable. */
const parseAt = (value) => {
  const at = value ? new Date(value) : new Date();
  return isNaN(at.getTime()) ? null : at;
};

/**
 * Whether a location is open at a moment, by isLocationOpen in src/widget/js/util/helpers.js:
 * the weekday has to be active and the moment has to fall inside one of its intervals.
 */
const openingStateAt = (data, at) => {
  const dayName = WEEK_DAY_NAMES[at.getUTCDay()];
  const days = (data.openingHours && data.openingHours.days) || {};
  const day = days[dayName];
  const now = toStoredTimeOfDay(at);
  const isOpen = Boolean(day && day.active && Array.isArray(day.intervals) && day.intervals.some((interval) => (
    interval && new Date(interval.from) <= now && new Date(interval.to) > now
  )));
  return { isOpen, day: dayName, at: at.toISOString() };
};

/** The subset of a stored location a caller gets back — the fields the detail screen shows. */
const toLocationSummary = (record) => ({
  title: record.data.title,
  subtitle: record.data.subtitle,
  address: record.data.address,
  formattedAddress: record.data.formattedAddress,
  addressAlias: record.data.addressAlias,
  description: record.data.description,
  listImage: record.data.listImage,
  latitude: record.data.coordinates ? record.data.coordinates.lat : null,
  longitude: record.data.coordinates ? record.data.coordinates.lng : null,
  rating: record.data.rating ? record.data.rating.average : 0,
  ratingCount: record.data.rating ? record.data.rating.count : 0,
  subscriberCount: (record.data.subscribers || []).length,
  views: record.data.views || 0,
  createdOn: record.data.createdOn,
  lastUpdatedOn: record.data.lastUpdatedOn
});

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
   * hosts: headlessSdk. Returns one location, named by its exact title, with the titles of the
   * categories it is filed under and whether it is open at a moment. The title has to be searched
   * before the record can be read, and the record stores only category ids, so the categories are
   * fetched after it comes back.
   * @param {{ title: string, at?: string }} options
   * @param {function(Error=, object=)} callback - (error, { location, categories, subcategories, openNow })
   */
  getLocation(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    if (!checkOptionalParams(options, 'string', ['at'], callback)) return;

    const at = parseAt(options.at);
    if (!at) return callback(new Error(`Invalid timestamp: ${options.at}`), undefined);

    return resolveLocation(options.title, (err, record) => {
      if (err) return callback(err, undefined);

      const filed = record.data.categories || { main: [], subcategories: [] };
      const mainIds = filed.main || [];
      const subIds = filed.subcategories || [];
      const answer = (categories, subcategories) => callback(null, {
        location: toLocationSummary(record),
        categories,
        subcategories,
        openNow: openingStateAt(record.data, at)
      });

      if (!mainIds.length && !subIds.length) return answer([], []);

      return collectLiveCategories(0, [], (searchErr, categoryRecords) => {
        if (searchErr) return callback(searchErr, undefined);

        const categories = [];
        const subcategories = [];
        categoryRecords.forEach((category) => {
          if (mainIds.includes(category.id)) categories.push(category.data.title);
          (category.data.subcategories || []).forEach((sub) => {
            if (sub && subIds.includes(sub.id)) subcategories.push(sub.title);
          });
        });
        return answer(categories, subcategories);
      });
    });
  },

  /**
   * hosts: headlessSdk. One page of locations, narrowed by any combination of the optional filters
   * the widget's own lists offer. Category titles have to be resolved to ids before the 'c_' / 's_'
   * index token can be composed, and the open-now filter key names the weekday being asked about,
   * so the query is built after those lookups — which an interpolated query cannot do.
   * @param {{ title?: string, searchText?: string, categoryTitle?: string, subcategoryTitle?: string, creatorUserId?: string, pinnedOnly?: boolean, openAt?: string, page?: number, pageSize?: number }} options
   * The list comes back wrapped as { locations, total, page, hasMore }, not in the raw
   * publicData envelope, so it reads like every other list this contract hands back.
   * @param {function(Error=, object=)} callback - (error, { locations, total, page, hasMore })
   */
  searchLocations(options, callback) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    if (options === null || typeof options !== 'object') {
      return callback(new Error('options must be an object'), undefined);
    }
    if (!checkOptionalParams(options, 'string', [
      'title', 'searchText', 'categoryTitle', 'subcategoryTitle', 'creatorUserId', 'openAt'
    ], callback)) return;
    if (!checkOptionalParams(options, 'number', ['page', 'pageSize'], callback)) return;
    if (!checkOptionalParams(options, 'boolean', ['pinnedOnly'], callback)) return;

    const at = options.openAt ? parseAt(options.openAt) : null;
    if (options.openAt && !at) return callback(new Error(`Invalid timestamp: ${options.openAt}`), undefined);

    const withCreator = (done) => {
      if (!options.creatorUserId || !options.creatorUserId.trim()) return done(null, null);
      return resolveUser(options.creatorUserId, (err, user) => done(err, user ? user.userId : undefined));
    };

    return resolveFiling(options.categoryTitle, options.subcategoryTitle, (filingErr, filing) => {
      if (filingErr) return callback(filingErr, undefined);

      return withCreator((userErr, creatorId) => {
        if (userErr) return callback(userErr, undefined);

        const filter = {};
        if (options.title) filter['$json.title'] = options.title;
        // Mirrors buildSearchCriteria in src/widget/services/search/shared.js: the widget lowercases
        // the term and matches it as a case-insensitive regex over the indexed text blob.
        if (options.searchText) {
          filter['_buildfire.index.text'] = { $regex: options.searchText.toLowerCase(), $options: 'i' };
        }
        if (filing.subcategories.length) {
          filter['_buildfire.index.array1.string1'] = { $in: [`s_${filing.subcategories[0]}`] };
        } else if (filing.main.length) {
          filter['_buildfire.index.array1.string1'] = { $in: [`c_${filing.main[0]}`] };
        }
        // The intro list's My Locations mode matches createdBy.userId (introSearchService.js).
        if (creatorId) filter['$json.createdBy.userId'] = creatorId;
        // Pin slots are 1-3, mirrored into _buildfire.index.number1 (widget.controller.js).
        if (options.pinnedOnly === true) filter['_buildfire.index.number1'] = { $in: [1, 2, 3] };
        // Mirrors buildOpenNowCriteria in src/widget/services/search/shared.js, which runs inside an
        // aggregate $match; a search filter reaches the same data fields through the $json. prefix.
        if (at) {
          const dayName = WEEK_DAY_NAMES[at.getUTCDay()];
          const openingNow = toStoredTimeOfDay(at);
          filter[`$json.openingHours.days.${dayName}.intervals`] = {
            $elemMatch: { from: { $lte: openingNow }, to: { $gt: openingNow } }
          };
          filter[`$json.openingHours.days.${dayName}.active`] = true;
        }

        const { page, pageSize } = pagingOf(options);
        return buildfire.publicData.search({
          filter,
          sort: options.pinnedOnly === true ? { '_buildfire.index.number1': 1 } : { '_buildfire.index.string1': 1 },
          page,
          pageSize,
          recordCount: true
        }, LOCATIONS_TAG, (err, response) => {
          if (err) return callback(err, undefined);
          const locations = ((response && response.result) || []).filter((record) => record && record.data);
          const total = response && typeof response.totalRecord === 'number' ? response.totalRecord : locations.length;
          return callback(null, {
            locations,
            total,
            page,
            hasMore: (page + 1) * pageSize < total
          });
        });
      });
    });
  },

  /**
   * hosts: headlessSdk. Creates a location the way the plugin's create paths do: resolves the
   * category filing, stamps a fresh clientId, inserts a record whose index and geo
   * blocks are composed from the values written, then adds it to the in-app search engine. Each
   * step needs the one before it, which is why it is not a declarative insert. Created as the app:
   * createdBy stays null, because accessManager.canEditLocations grants edit access to the creator.
   * It does not apply the in-app creation permission or the paid-subscription gate: both govern app
   * users adding locations from the widget, and this runs as the app, like the control panel's Add.
   * @param {{ title: string, address: string, latitude: number, longitude: number, subtitle?: string, formattedAddress?: string, addressAlias?: string, description?: string, listImage?: string, categoryTitle?: string, subcategoryTitle?: string }} options
   * @param {function(Error=, object=)} callback - (error, { location, searchIndexSynced })
   */
  createLocation(options, callback) {
    if (!requireStringParams(options, ['title', 'address'], callback)) return;
    if (!requireNumberParams(options, ['latitude', 'longitude'], callback)) return;
    if (!checkOptionalParams(options, 'string', [
      'subtitle', 'formattedAddress', 'addressAlias', 'description', 'listImage',
      'categoryTitle', 'subcategoryTitle'
    ], callback)) return;

    resolveFiling(options.categoryTitle, options.subcategoryTitle, (filingErr, filing) => {
      if (filingErr) return callback(filingErr, undefined);

      const record = buildLocationRecord({
        clientId: generateUUID(),
        title: options.title,
        subtitle: options.subtitle,
        address: options.address,
        // The in-app address picker always stores a formatted address; fall back to the
        // plain one so the index text never reads "undefined".
        formattedAddress: options.formattedAddress || options.address,
        addressAlias: options.addressAlias,
        description: options.description,
        listImage: options.listImage,
        coordinates: { lat: options.latitude, lng: options.longitude },
        categories: { main: filing.main, subcategories: filing.subcategories },
        createdOn: new Date(),
        createdBy: null
      });

      return buildfire.publicData.insert(record, LOCATIONS_TAG, (err, result) => {
        if (err) return callback(err, undefined);

        sendContractEvent('locationCreated', { locationId: result.id, title: result.data.title });
        return syncSearchIndex('save', result.id, result.data, (searchIndexSynced) => callback(null, {
          location: toLocationSummary(result),
          searchIndexSynced
        }));
      });
    });
  },

  /**
   * hosts: headlessSdk. Edits a location's details, named by its exact current title. Resolves
   * the title, merges the supplied fields over the stored record, recomputes the index text, sort
   * key and geo point from the result, writes the whole record back as the in-app edit form does,
   * then refreshes its search-engine entry. Edited as the app, so lastUpdatedBy is cleared.
   * @param {{ title: string, newTitle?: string, subtitle?: string, address?: string, formattedAddress?: string, addressAlias?: string, description?: string, listImage?: string, latitude?: number, longitude?: number }} options
   * @param {function(Error=, object=)} callback - (error, { location, searchIndexSynced })
   */
  updateLocationDetails(options, callback) {
    const textFields = ['subtitle', 'address', 'formattedAddress', 'addressAlias', 'description', 'listImage'];
    if (!requireStringParams(options, ['title'], callback)) return;
    if (!checkOptionalParams(options, 'string', ['newTitle', ...textFields], callback)) return;
    if (!checkOptionalParams(options, 'number', ['latitude', 'longitude'], callback)) return;
    if (typeof options.newTitle === 'string' && !options.newTitle.trim()) {
      return callback(new Error('newTitle must not be empty'), undefined);
    }

    resolveLocation(options.title, (err, record) => {
      if (err) return callback(err, undefined);

      const merged = { ...record.data };
      if (typeof options.newTitle === 'string') merged.title = options.newTitle;
      textFields.forEach((field) => {
        if (typeof options[field] === 'string') merged[field] = options[field];
      });
      if (typeof options.latitude === 'number' || typeof options.longitude === 'number') {
        const coordinates = merged.coordinates || { lat: null, lng: null };
        merged.coordinates = {
          lat: typeof options.latitude === 'number' ? options.latitude : coordinates.lat,
          lng: typeof options.longitude === 'number' ? options.longitude : coordinates.lng
        };
      }
      merged.lastUpdatedOn = new Date();
      merged.lastUpdatedBy = null;
      merged._buildfire = buildLocationIndex(merged);

      return buildfire.publicData.update(record.id, merged, LOCATIONS_TAG, (updateErr) => {
        if (updateErr) return callback(updateErr, undefined);

        sendContractEvent('locationUpdated', { locationId: record.id, title: merged.title });
        return syncSearchIndex('save', record.id, merged, (searchIndexSynced) => callback(null, {
          location: toLocationSummary({ id: record.id, data: merged }),
          searchIndexSynced
        }));
      });
    });
  },

  /**
   * hosts: headlessSdk. Permanently deletes a location, named by its exact title, then clears its
   * search-engine entry — the plugin hard-deletes locations. The delete is the authoritative step:
   * a cleanup that fails afterwards is reported in the result, not as an error, so the caller is
   * never told the removal failed when the record is already gone. App users' bookmarks of the
   * location are not removed; they live in each user's own session and cannot be reached from here.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, { title, searchIndexCleared })
   */
  deleteLocation(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;

    resolveLocation(options.title, (err, record) => {
      if (err) return callback(err, undefined);

      return buildfire.publicData.delete(record.id, LOCATIONS_TAG, (deleteErr) => {
        if (deleteErr) return callback(deleteErr, undefined);

        sendContractEvent('locationDeleted', { locationId: record.id });
        return syncSearchIndex('delete', record.id, null, (searchIndexCleared) => callback(null, {
          title: record.data.title,
          searchIndexCleared
        }));
      });
    });
  },

  /**
   * hosts: headlessSdk. Removes the named app user from a location's followers, as the app — the
   * same write as the detail view's Following button. Resolves the user and the title first; not following is a no-op.
   * crudMode stays update: the write is a $pull on the location record, not the removal of a record of its own.
   * Allowed even while subscriptions are disabled, so nobody is left stuck on a list.
   * @param {{ title: string, userId: string }} options
   * @param {function(Error=, object=)} callback - (error, { title, userId, wasSubscribed })
   */
  deleteLocationSubscriber(options, callback) {
    if (!requireStringParams(options, ['title', 'userId'], callback)) return;

    resolveUser(options.userId, (userErr, user) => {
      if (userErr) return callback(userErr, undefined);

      return resolveLocation(options.title, (err, record) => {
        if (err) return callback(err, undefined);

        const done = (wasSubscribed) => callback(null, {
          title: record.data.title, userId: user.userId, wasSubscribed
        });
        if (!(record.data.subscribers || []).includes(user.userId)) return done(false);

        return buildfire.publicData.update(record.id, { $pull: { subscribers: user.userId } }, LOCATIONS_TAG, (updateErr) => {
          if (updateErr) return callback(updateErr, undefined);
          sendContractEvent('locationUnsubscribed', { locationId: record.id, userId: user.userId });
          return done(true);
        });
      });
    });
  },

  /**
   * hosts: headlessSdk. Sends a push notification to everyone following a location, with a deep
   * link back to it, exactly as the in-app notification form does. Checks the settings (the form
   * is only offered while subscriptions and custom notifications are both on), then resolves the
   * title, then schedules to the subscriber list — each step needs the one before it.
   * @param {{ title: string, notificationTitle: string, message: string }} options
   * @param {function(Error=, object=)} callback - (error, { title, notifiedUserCount })
   */
  sendLocationNotification(options, callback) {
    if (!requireStringParams(options, ['title', 'notificationTitle', 'message'], callback)) return;
    if (options.message.length > NOTIFICATION_MESSAGE_MAX_LENGTH) {
      return callback(new Error(`message must be at most ${NOTIFICATION_MESSAGE_MAX_LENGTH} characters`), undefined);
    }

    getSettings((settingsErr, settings) => {
      if (settingsErr) return callback(settingsErr, undefined);
      if (!settings.subscription.enabled || !settings.subscription.allowCustomNotifications) {
        return callback(new Error('Subscriber notifications are disabled for this instance'), undefined);
      }

      return resolveLocation(options.title, (err, record) => {
        if (err) return callback(err, undefined);

        const subscribers = record.data.subscribers || [];
        if (!subscribers.length) {
          return callback(new Error(`Location "${record.data.title}" has no subscribers to notify`), undefined);
        }

        return buildfire.notifications.pushNotification.schedule({
          title: options.notificationTitle,
          text: options.message,
          users: subscribers,
          queryString: `&dld=${encodeURIComponent(JSON.stringify({ locationId: record.id }))}`
        }, (scheduleErr) => {
          if (scheduleErr) return callback(scheduleErr, undefined);
          return callback(null, { title: record.data.title, notifiedUserCount: subscribers.length });
        });
      });
    });
  },

  /**
   * hosts: widgetBackground. Adds a location, named by its exact title, to the signed-in app user's
   * bookmarks. Can never run on the server: buildfire.bookmarks resolves against the real session
   * inside the widget frame, so this is widget-only and excluded from the MCP; nothing about it needs
   * to be watched, so widgetBackground. Backfills the location's clientId first when it has none,
   * because that id is what the bookmark is stored under — the same backfill the widget does.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, { title, alreadyBookmarked })
   */
  createLocationBookmark(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;

    getSettings((settingsErr, settings) => {
      if (settingsErr) return callback(settingsErr, undefined);
      if (!settings.bookmarks.enabled || !settings.bookmarks.allowForLocations) {
        return callback(new Error('Location bookmarks are disabled for this instance'), undefined);
      }

      return resolveLocation(options.title, (err, record) => {
        if (err) return callback(err, undefined);

        return buildfire.bookmarks.getAll((listErr, bookmarks) => {
          if (listErr) return callback(listErr, undefined);

          const existing = (bookmarks || []).find((entry) => entry && entry.payload && entry.payload.locationId === record.id);
          if (existing) return callback(null, { title: record.data.title, alreadyBookmarked: true });

          const addBookmark = (clientId) => buildfire.bookmarks.add({
            id: clientId,
            title: record.data.title,
            icon: record.data.listImage,
            payload: { locationId: record.id }
          }, (bookmarkErr) => {
            if (bookmarkErr) return callback(bookmarkErr, undefined);
            sendContractEvent('locationBookmarked', { locationId: record.id, bookmarkId: clientId });
            return callback(null, { title: record.data.title, alreadyBookmarked: false });
          });

          if (record.data.clientId) return addBookmark(record.data.clientId);

          const clientId = generateUUID();
          const merged = { ...record.data, clientId };
          merged._buildfire = buildLocationIndex(merged);
          return buildfire.publicData.update(record.id, merged, LOCATIONS_TAG, (updateErr) => {
            if (updateErr) return callback(updateErr, undefined);
            return addBookmark(clientId);
          });
        });
      });
    });
  },

  /**
   * hosts: widgetBackground. Removes a location, named by its exact title, from the signed-in app
   * user's bookmarks. Can never run on the server: buildfire.bookmarks resolves against the real
   * session inside the widget frame, so this is widget-only and excluded from the MCP; nothing about
   * it needs to be watched, so widgetBackground. The bookmark is found by its payload, the way the
   * plugin's own takedown path finds it, so entries stored before a clientId existed are found too.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, { title, wasBookmarked })
   */
  deleteLocationBookmark(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;

    resolveLocation(options.title, (err, record) => {
      if (err) return callback(err, undefined);

      return buildfire.bookmarks.getAll((listErr, bookmarks) => {
        if (listErr) return callback(listErr, undefined);

        const bookmark = (bookmarks || []).find((entry) => entry && entry.payload && entry.payload.locationId === record.id);
        if (!bookmark) return callback(null, { title: record.data.title, wasBookmarked: false });

        return buildfire.bookmarks.delete(bookmark.id, (deleteErr) => {
          if (deleteErr) return callback(deleteErr, undefined);
          sendContractEvent('locationUnbookmarked', { locationId: record.id, bookmarkId: bookmark.id });
          return callback(null, { title: record.data.title, wasBookmarked: true });
        });
      });
    });
  },

  /**
   * hosts: headlessSdk. Creates a category, as the control panel's Add Category does. The record's
   * sort key is the lowercased title and its indexed deletion date has to start null for the widget
   * to list it, so the index block is derived from the title being written — which an interpolated
   * insert cannot compose.
   * @param {{ title: string, iconClassName?: string }} options
   * @param {function(Error=, object=)} callback - (error, { title, iconClassName })
   */
  createCategory(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;
    if (!checkOptionalParams(options, 'string', ['iconClassName'], callback)) return;

    const now = new Date();
    // Mirrors Category.toJSON in src/widget/js/global/data/Category.js.
    const record = {
      title: options.title,
      iconUrl: null,
      iconClassName: options.iconClassName || null,
      subcategories: [],
      quickAccess: 0,
      createdOn: now,
      createdBy: null,
      lastUpdatedOn: now,
      lastUpdatedBy: null,
      deletedOn: null,
      deletedBy: null,
      isActive: 1,
      _buildfire: {
        index: {
          string1: options.title.toLowerCase(),
          date1: null,
          number1: 0
        }
      }
    };

    buildfire.publicData.insert(record, CATEGORIES_TAG, (err, result) => {
      if (err) return callback(err, undefined);
      return callback(null, { title: result.data.title, iconClassName: result.data.iconClassName });
    });
  },

  /**
   * hosts: headlessSdk. Renames a category, named by its exact current title; subcategories are untouched. Resolving the title
   * is a search over the live categories, and the indexed lowercase title has to be rewritten with
   * it; written as a $set so the stored subcategories are not replaced along with the title.
   * @param {{ title: string, newTitle: string }} options
   * @param {function(Error=, object=)} callback - (error, { previousTitle, title })
   */
  updateCategoryTitle(options, callback) {
    if (!requireStringParams(options, ['title', 'newTitle'], callback)) return;

    resolveCategory(options.title, (err, category) => {
      if (err) return callback(err, undefined);

      return buildfire.publicData.update(category.id, {
        $set: {
          title: options.newTitle,
          lastUpdatedOn: new Date(),
          '_buildfire.index.string1': options.newTitle.toLowerCase()
        }
      }, CATEGORIES_TAG, (updateErr) => {
        if (updateErr) return callback(updateErr, undefined);
        return callback(null, { previousTitle: category.data.title, title: options.newTitle });
      });
    });
  },

  /**
   * hosts: headlessSdk. Retires a category, named by its exact title — a soft delete, as the control
   * panel's delete is: it stamps deletedOn and mirrors it into _buildfire.index.date1, which is the
   * field the widget filters live categories on. Locations filed under it keep the stale id, exactly
   * as they do after an in-app delete. The plugin offers no restore, so the description says the
   * category is kept behind the scenes rather than that it can be brought back.
   * @param {{ title: string }} options
   * @param {function(Error=, object=)} callback - (error, { title, deletedOn })
   */
  deleteCategory(options, callback) {
    if (!requireStringParams(options, ['title'], callback)) return;

    resolveCategory(options.title, (err, category) => {
      if (err) return callback(err, undefined);

      const now = new Date();
      return buildfire.publicData.update(category.id, {
        $set: {
          deletedOn: now,
          lastUpdatedOn: now,
          '_buildfire.index.date1': now
        }
      }, CATEGORIES_TAG, (updateErr) => {
        if (updateErr) return callback(updateErr, undefined);
        return callback(null, { title: category.data.title, deletedOn: now.toISOString() });
      });
    });
  }
};
