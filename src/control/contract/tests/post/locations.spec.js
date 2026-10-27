// locations: every operation on locations (search, read, create, update, delete, pins and location field values), one block each,
// after the helpers they share.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);
let counter = 0;
const unique = (label) => `Post ${label} (${contract.host}) ${Date.now()}-${(counter += 1)}`;
// One word, for the text searches: searchText matches it anywhere in a title, subtitle or address.
const word = (label) => `${label}${Date.now()}x${(counter += 1)}${contract.host}`;

const ZERO_ID = '000000000000000000000000';
const UNKNOWN_FIELD_ID = '00000000-0000-4000-8000-000000000000';
const LIST_IMAGE = 'https://example.com/locations/list.png';
const OTHER_IMAGE = 'https://example.com/locations/other.png';
const ADDRESS = '350 Fifth Avenue, New York, NY 10118';
const DEFAULT_HOURS = {
  monday: '08:00-20:00',
  tuesday: '08:00-20:00',
  wednesday: '08:00-20:00',
  thursday: '08:00-20:00',
  friday: '08:00-20:00',
  saturday: '08:00-20:00',
  sunday: '08:00-20:00',
};
const ISO = jasmine.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

// The required details of a location; `token` goes into the address, so a location without a usable title is still found.
const place = (title, extra = {}, token = word('Addr')) => ({
  title,
  address: `${token} ${ADDRESS}`,
  latitude: 40.7484,
  longitude: -73.9857,
  description: '<p>An observation deck above Midtown.</p>',
  listImage: [LIST_IMAGE],
  ...extra,
});
const create = (label, extra) => call('createLocation', place(unique(label), extra));
// The contract's own reads.
const found = async (title) => (await call('searchLocations', { title })).locations;
const read = (locationId) => call('getLocationAdvanced', { locationId });
// Every call to the contract's events since the last reset, for one event.
const sent = (eventName) => buildfire.services.contract.events.send.calls.allArgs()
  .filter(([name]) => name === eventName).map(([, data]) => data);
const resetEvents = () => buildfire.services.contract.events.send.calls.reset();
// The declared payloads (plugin.contract.events.json). Nobody is signed in, so the contract records no user (null).
const createdEvent = (loc) => ({
  locationId: loc.id,
  title: loc.title,
  subtitle: loc.subtitle,
  address: loc.address,
  latitude: loc.latitude,
  longitude: loc.longitude,
  listImage: loc.listImage,
  createdOn: ISO,
  createdBy: null,
});
const updatedEvent = (loc) => ({
  locationId: loc.id,
  title: loc.title,
  subtitle: loc.subtitle,
  address: loc.address,
  latitude: loc.latitude,
  longitude: loc.longitude,
  listImage: loc.listImage,
  lastUpdatedOn: ISO,
  lastUpdatedBy: null,
});
// Applies a change to call options: a key set to undefined is left out.
const withChange = (options, change) => {
  const next = { ...options, ...change };
  Object.keys(change).forEach((key) => { if (change[key] === undefined) delete next[key]; });
  return next;
};
// Create options as the update operations name them: subtitle -> newSubtitle.
const asUpdate = (details) => Object.keys(details).reduce((all, key) => ({
  ...all, [`new${key.charAt(0).toUpperCase()}${key.slice(1)}`]: details[key],
}), {});

// Calls nothing here answers. The plugin's own bookkeeping the manifest never mentions (a refresh message to the widget,
// deep links, analytics) only gets answered; the contract's events are asserted where the manifest declares them.
const answerSideCalls = () => {
  const answer = (owner, name, fake) => {
    if (owner && typeof owner[name] === 'function') spyOn(owner, name).and.callFake(fake);
  };
  answer(buildfire.messaging, 'sendMessageToWidget', () => {});
  answer(buildfire.deeplink, 'registerDeeplink', (options, callback) => callback && callback(null, options));
  answer(buildfire.deeplink, 'unregisterDeeplink', (id, callback) => callback && callback(null, { id }));
  answer(buildfire.analytics, 'registerEvent', () => {});
  spyOn(buildfire.services.contract.events, 'send').and.callFake((eventName, data, callback) => callback && callback(null, []));
};

// Only the control panel makes categories, and its run comes first: it makes this one, once, and the app's run finds it.
const appCategoryTitle = 'Post locations category for the app';
let madeCategory;
const categoryForTheApp = () => {
  madeCategory = madeCategory || (contract.host === 'control'
    ? call('createCategory', { title: appCategoryTitle, subcategories: 'Pizza, Burgers' })
    : call('searchCategories', { title: appCategoryTitle }).then((answer) => {
      const [record] = (answer && answer.result) || [];
      if (!record) throw new Error(`no category titled "${appCategoryTitle}": the control run makes it`);
      return { id: record.id, title: record.data.title, subcategories: record.data.subcategories };
    }));
  return madeCategory;
};
const subcategory = (category, title) => category.subcategories.find((sub) => sub.title === title);

// Location fields live in the one settings record, at most 10. Only the control panel makes them, and its run comes first:
// it makes this one, once, and the app's run finds it through getSettings.
const appFieldLabel = 'Post locations field for the app';
const allFields = (settings) => [...settings.customFields.quickActions, ...settings.customFields.content];
// Room for `count` more fields: when the 10 are taken, existing ones (never one an app's run needs) are removed through the contract.
const makeRoom = async (count) => {
  const fields = allFields(await call('getSettings', {}));
  const excess = fields.length + count - 10;
  if (excess > 0) {
    const spare = fields.filter((field) => !/for the app/i.test(field.label)).slice(0, excess);
    await call('deleteLocationFieldsAdvanced', { fields: spare.map((field) => ({ fieldId: field.id })) });
  }
};
let madeField;
const fieldForTheApp = () => {
  madeField = madeField || (contract.host === 'control'
    ? makeRoom(1).then(() => call('createLocationField', { group: 'content', label: appFieldLabel, type: 'URL', allowCustomLabel: true }))
    : call('getSettings', {}).then((settings) => {
      const field = allFields(settings).find((item) => item.label === appFieldLabel);
      if (!field) throw new Error(`no location field labelled "${appFieldLabel}": the control run makes it`);
      return field;
    }));
  return madeField;
};
// Control only: fields a spec needs for itself, removed when it ends.
const withTempFields = async (optionsList, use) => {
  await makeRoom(optionsList.length);
  const made = [];
  try {
    for (const options of optionsList) made.push(await call('createLocationField', options));
    await use(made);
  } finally {
    if (made.length) await call('deleteLocationFieldsAdvanced', { fields: made.map((field) => ({ fieldId: field.id })) });
  }
};
const fieldValueOf = (loc, fieldId) => loc.fields.find((field) => field.fieldId === fieldId);

// Control only: at most 3 locations are pinned in the whole instance, so a pin spec unpins every one first.
const unpinAll = async () => {
  const { locations } = await call('searchLocations', { pinnedOnly: true });
  for (const loc of locations) await call('updateLocationPinAdvanced', { locationId: loc.id, pinned: false });
};

// Every detail a location can be given, and how the contract then shows it.
const everyDetail = (category) => ({
  subtitle: 'Open late on weekends',
  customName: 'The Empire State',
  images: ['https://example.com/locations/one.png', 'https://example.com/locations/two.png'],
  categories: `${category.title} -> Pizza`,
  markerType: 'image',
  markerImage: ['https://example.com/locations/marker.png'],
  markerColor: 'rgba(10,20,30,0.5)',
  showCategory: false,
  showOpeningHours: true,
  showPriceRange: true,
  showStarRating: true,
  priceRange: 3,
  priceCurrency: '€',
  mondayHours: '09:00-12:00, 13:00-18:00',
  tuesdayHours: 'closed',
  wednesdayHours: '07:30-11:00',
  thursdayHours: '10:00-22:00',
  fridayHours: '10:00-23:00',
  saturdayHours: '',
  sundayHours: 'Closed',
  actionItems: [{ title: 'Call us', action: 'callNumber', phoneNumber: '+15550100' }],
});
const everyDetailShown = (category) => ({
  subtitle: 'Open late on weekends',
  customName: 'The Empire State',
  images: ['https://example.com/locations/one.png', 'https://example.com/locations/two.png'],
  categories: `${category.title} -> Pizza`,
  categoryIds: [category.id],
  subcategoryIds: [subcategory(category, 'Pizza').id],
  markerType: 'image',
  markerImage: 'https://example.com/locations/marker.png',
  markerColor: 'rgba(10,20,30,0.5)',
  showCategory: false,
  showOpeningHours: true,
  showPriceRange: true,
  showStarRating: true,
  priceRange: 3,
  priceCurrency: '€',
  openingHours: {
    monday: '09:00-12:00, 13:00-18:00',
    tuesday: 'closed',
    wednesday: '07:30-11:00',
    thursday: '10:00-22:00',
    friday: '10:00-23:00',
    saturday: 'closed',
    sunday: 'closed',
  },
  actionItems: [jasmine.objectContaining({ title: 'Call us', action: 'callNumber', phoneNumber: '+15550100' })],
});

// What a location's details are refused for, in create's names; each case: [spec name, change, text the reason names].
const detailRefusals = (prefix) => {
  const n = (name) => (prefix ? `new${name.charAt(0).toUpperCase()}${name.slice(1)}` : name);
  const address = { [n('address')]: ADDRESS, [n('latitude')]: 40.7484, [n('longitude')]: -73.9857 };
  return [
    [`a ${n('latitude')} that is not a number`, { ...address, [n('latitude')]: '40.7' }, n('latitude')],
    [`a ${n('latitude')} above 90`, { ...address, [n('latitude')]: 90.1 }, n('latitude')],
    [`a ${n('latitude')} below -90`, { ...address, [n('latitude')]: -90.1 }, n('latitude')],
    [`a ${n('longitude')} that is not a number`, { ...address, [n('longitude')]: '-73' }, n('longitude')],
    [`a ${n('longitude')} above 180`, { ...address, [n('longitude')]: 180.1 }, n('longitude')],
    [`a ${n('longitude')} below -180`, { ...address, [n('longitude')]: -180.1 }, n('longitude')],
    [`a ${n('listImage')} given as a bare string`, { [n('listImage')]: OTHER_IMAGE }, n('listImage')],
    [`an empty ${n('listImage')} list`, { [n('listImage')]: [] }, n('listImage')],
    [`two ${n('listImage')} images`, { [n('listImage')]: [LIST_IMAGE, OTHER_IMAGE] }, n('listImage')],
    [`a ${n('listImage')} entry that is not a URL`, { [n('listImage')]: [5] }, n('listImage')],
    [`${n('images')} given as a bare string`, { [n('images')]: OTHER_IMAGE }, n('images')],
    [`two ${n('markerImage')} images`, { [n('markerImage')]: [LIST_IMAGE, OTHER_IMAGE] }, n('markerImage')],
    [`a ${n('markerImage')} given as a bare string`, { [n('markerImage')]: OTHER_IMAGE }, n('markerImage')],
    [`a ${n('subtitle')} that is not text`, { [n('subtitle')]: 5 }, n('subtitle')],
    [`a ${n('customName')} that is not text`, { [n('customName')]: 5 }, n('customName')],
    [`a ${n('markerType')} it does not offer`, { [n('markerType')]: 'star' }, n('markerType')],
    ['an image marker without a marker image', { [n('markerType')]: 'image' }, 'marker'],
    [`a ${n('markerColor')} that is not a color`, { [n('markerColor')]: 'red' }, n('markerColor')],
    [`a ${n('showCategory')} that is not true or false`, { [n('showCategory')]: 'yes' }, n('showCategory')],
    [`a ${n('showOpeningHours')} that is not true or false`, { [n('showOpeningHours')]: 1 }, n('showOpeningHours')],
    [`a ${n('showPriceRange')} that is not true or false`, { [n('showPriceRange')]: 'no' }, n('showPriceRange')],
    [`a ${n('showStarRating')} that is not true or false`, { [n('showStarRating')]: 0 }, n('showStarRating')],
    [`a ${n('priceRange')} it does not offer`, { [n('priceRange')]: 5 }, n('priceRange')],
    [`a ${n('priceRange')} given as text`, { [n('priceRange')]: '2' }, n('priceRange')],
    [`a ${n('priceCurrency')} it does not offer`, { [n('priceCurrency')]: '£' }, n('priceCurrency')],
    [`${n('mondayHours')} that are not hours`, { [n('mondayHours')]: '9am to 5pm' }, n('mondayHours')],
    [`${n('tuesdayHours')} ending before they start`, { [n('tuesdayHours')]: '20:00-08:00' }, n('tuesdayHours')],
    [`${n('wednesdayHours')} with a time that is not a time of day`, { [n('wednesdayHours')]: '08:00-25:00' }, n('wednesdayHours')],
    [`duplicated ${n('thursdayHours')}`, { [n('thursdayHours')]: '08:00-10:00, 08:30-11:00' }, n('thursdayHours')],
    [`${n('sundayHours')} that are not text`, { [n('sundayHours')]: 8 }, n('sundayHours')],
    [`${n('actionItems')} without their kind`, { [n('actionItems')]: [{ title: 'Call us' }] }, n('actionItems')],
    [`${n('actionItems')} that are not a list`, { [n('actionItems')]: { title: 'Call us', action: 'callNumber' } }, n('actionItems')],
    [`${n('categories')} that are not text`, { [n('categories')]: ['Food'] }, n('categories')],
  ];
};

contract.describe('searchLocations', () => {
  beforeEach(answerSideCalls);

  it('finds a location by its exact title, with every detail, on one page', async () => {
    const created = await create('search');
    const result = await call('searchLocations', { title: created.title });
    expect(result).toEqual({ locations: [created], total: 1, page: 0, hasMore: false });
  });

  it('lists every location, a page of at most 50, when nothing narrows it', async () => {
    const created = await create('search all');
    const result = await call('searchLocations', {});
    expect(result).toEqual(jasmine.objectContaining({ locations: jasmine.any(Array), total: jasmine.any(Number), page: 0, hasMore: jasmine.any(Boolean) }));
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.locations.length).toBeLessThanOrEqual(50);
    expect(result.hasMore).toBe(result.total > 50);
    if (!result.hasMore) expect(result.locations.map((loc) => loc.id)).toContain(created.id);
  });

  it('finds nothing for a title no location has', async () => {
    expect(await call('searchLocations', { title: unique('no such location') })).toEqual({ locations: [], total: 0, page: 0, hasMore: false });
  });

  it('matches the search text in a title, subtitle or address, whatever its case', async () => {
    const token = word('Lookup');
    const inTitle = await call('createLocation', place(`${unique('in title')} ${token}`));
    const inSubtitle = await call('createLocation', place(unique('in subtitle'), { subtitle: `Near ${token}` }));
    const inAddress = await call('createLocation', place(unique('in address'), {}, token));
    const other = await create('not matching');
    for (const text of [token, token.toUpperCase(), token.toLowerCase()]) {
      const result = await call('searchLocations', { searchText: text });
      expect(result.locations.map((loc) => loc.id).sort()).toEqual([inTitle.id, inSubtitle.id, inAddress.id].sort());
      expect(result.total).toBe(3);
      expect(result.locations.map((loc) => loc.id)).not.toContain(other.id);
    }
  }, 120000);

  it('matches the search text literally, regex characters included', async () => {
    const token = word('Literal');
    const created = await call('createLocation', place(`${unique('literal')} ${token}(1).*`));
    expect((await call('searchLocations', { searchText: `${token}(1).*` })).locations.map((loc) => loc.id)).toEqual([created.id]);
    expect(await call('searchLocations', { searchText: `${token}.*` })).toEqual(jasmine.objectContaining({ locations: [], total: 0 }));
  });

  it('lists the locations found in title order', async () => {
    const token = word('Order');
    const second = await call('createLocation', place(`${token} b second`));
    const first = await call('createLocation', place(`${token} A first`));
    const third = await call('createLocation', place(`${token} c third`));
    expect((await call('searchLocations', { searchText: token })).locations.map((loc) => loc.id)).toEqual([first.id, second.id, third.id]);
  });

  it('narrows to a category, and to a subcategory within it', async () => {
    const category = await categoryForTheApp();
    const token = word('Category');
    const inPizza = await call('createLocation', place(`${token} pizza`, { categories: `${category.title} -> Pizza` }));
    const inCategory = await call('createLocation', place(`${token} category`, { categories: category.title }));
    const inNone = await call('createLocation', place(`${token} none`));
    const ids = async (options) => (await call('searchLocations', { searchText: token, ...options })).locations.map((loc) => loc.id);
    expect(await ids({ categoryTitle: category.title })).toEqual([inCategory.id, inPizza.id]);
    expect(await ids({ categoryTitle: category.title, subcategoryTitle: 'Pizza' })).toEqual([inPizza.id]);
    expect(await ids({ categoryTitle: category.title, subcategoryTitle: 'Burgers' })).toEqual([]);
    expect(await ids({})).toEqual([inCategory.id, inNone.id, inPizza.id]);
  }, 120000);

  it('pages through more locations than a page holds, 50 at a time', async () => {
    // More locations than a page, made through the contract's batch operation within its limit, given the time that takes.
    const token = word('Paged');
    const titles = Array.from({ length: 51 }, (value, index) => `${token} ${String(index).padStart(2, '0')}`);
    const batch = await call('createLocationsAdvanced', { locations: titles.slice(0, 50).map((title) => place(title)) });
    expect(batch).toEqual(jasmine.objectContaining({ succeeded: 50, failed: 0 }));
    await call('createLocation', place(titles[50]));
    const first = await call('searchLocations', { searchText: token });
    expect(first).toEqual(jasmine.objectContaining({ total: 51, page: 0, hasMore: true }));
    expect(first.locations.map((loc) => loc.title)).toEqual(titles.slice(0, 50));
    const second = await call('searchLocations', { searchText: token, page: 1 });
    expect(second).toEqual(jasmine.objectContaining({ total: 51, page: 1, hasMore: false }));
    expect(second.locations.map((loc) => loc.title)).toEqual([titles[50]]);
    expect(await call('searchLocations', { searchText: token, page: 2 })).toEqual({ locations: [], total: 51, page: 2, hasMore: false });
  }, 300000);

  if (contract.host === 'control') {
    it('lists only the pinned locations, in pinned order', async () => {
      await unpinAll();
      const later = await create('pinned second');
      const earlier = await create('pinned first');
      await call('updateLocationPinAdvanced', { locationId: later.id, pinned: true });
      await call('updateLocationPinAdvanced', { locationId: earlier.id, pinned: true, position: 1 });
      const { locations } = await call('searchLocations', { pinnedOnly: true });
      expect(locations.map((loc) => [loc.id, loc.pinPosition])).toEqual([[earlier.id, 1], [later.id, 2]]);
      expect((await call('searchLocations', { title: later.title, pinnedOnly: true })).locations.map((loc) => loc.id)).toEqual([later.id]);
      expect((await call('searchLocations', { title: later.title, pinnedOnly: false })).locations.map((loc) => loc.id)).toEqual([later.id]);
      await unpinAll();
      expect((await call('searchLocations', { title: later.title, pinnedOnly: true })).locations).toEqual([]);
    }, 180000);

    it('refuses a category title two categories share, saying how many', async () => {
      const title = unique('shared category');
      await call('createCategory', { title });
      await call('createCategory', { title });
      expect((await refusal(call('searchLocations', { categoryTitle: title }))).replace(title, '')).toContain('2');
    });
  } else {
    it('lists only the pinned locations, in pinned order', async () => {
      const { locations } = await call('searchLocations', { pinnedOnly: true });
      const positions = locations.map((loc) => loc.pinPosition);
      positions.forEach((position) => expect([1, 2, 3]).toContain(position));
      expect(positions).toEqual([...positions].sort());
    });
  }

  describe('refuses', () => {
    it('a category title no category has, naming it', async () => {
      const title = unique('no such category');
      expect(await refusal(call('searchLocations', { categoryTitle: title }))).toContain(title);
    });

    it('a subcategory title the category does not have, naming it', async () => {
      const category = await categoryForTheApp();
      const title = unique('no such subcategory');
      expect(await refusal(call('searchLocations', { categoryTitle: category.title, subcategoryTitle: title }))).toContain(title);
    });

    it('a subcategory title without its category', async () => {
      expect(await refusal(call('searchLocations', { subcategoryTitle: 'Pizza' }))).toContain('categoryTitle');
    });

    it('an empty search text', async () => {
      expect(await refusal(call('searchLocations', { searchText: '' }))).toContain('searchText');
    });

    it('a search text that is not text', async () => {
      expect(await refusal(call('searchLocations', { searchText: 5 }))).toContain('searchText');
    });

    it('an empty title', async () => {
      expect(await refusal(call('searchLocations', { title: '' }))).toContain('title');
    });

    it('a title that is not text', async () => {
      expect(await refusal(call('searchLocations', { title: 5 }))).toContain('title');
    });

    it('an empty category title', async () => {
      expect(await refusal(call('searchLocations', { categoryTitle: '' }))).toContain('categoryTitle');
    });

    it('a pinnedOnly that is not true or false', async () => {
      expect(await refusal(call('searchLocations', { pinnedOnly: 'yes' }))).toContain('pinnedOnly');
    });

    it('a page below 0', async () => {
      expect(await refusal(call('searchLocations', { page: -1 }))).toContain('page');
    });

    it('a page that is not a whole number', async () => {
      expect(await refusal(call('searchLocations', { page: 1.5 }))).toContain('page');
    });

    it('a page given as text', async () => {
      expect(await refusal(call('searchLocations', { page: '1' }))).toContain('page');
    });
  });
});

contract.describe('getLocation', () => {
  beforeEach(answerSideCalls);

  it('shows the location with that exact title, with every detail', async () => {
    const category = await categoryForTheApp();
    const created = await create('get', everyDetail(category));
    const shown = await call('getLocation', { title: created.title });
    expect(shown).toEqual(created);
    expect(shown).toEqual(jasmine.objectContaining({ id: created.id, title: created.title, ...everyDetailShown(category) }));
  });

  it('changes nothing by reading', async () => {
    const created = await create('get twice');
    const first = await call('getLocation', { title: created.title });
    expect(await call('getLocation', { title: created.title })).toEqual(first);
    expect(first.lastUpdatedOn).toBe(created.lastUpdatedOn);
  });

  describe('refuses', () => {
    it('a title no location has, naming it', async () => {
      const title = unique('missing');
      expect(await refusal(call('getLocation', { title }))).toContain(title);
    });

    it('a title two locations share, saying how many', async () => {
      const title = unique('shared');
      await call('createLocation', place(title));
      await call('createLocation', place(title));
      expect((await refusal(call('getLocation', { title }))).replace(title, '')).toContain('2');
    });

    it('without a title', async () => {
      expect(await refusal(call('getLocation', {}))).toContain('title');
    });

    it('a title of null', async () => {
      expect(await refusal(call('getLocation', { title: null }))).toContain('title');
    });

    it('an empty title', async () => {
      expect(await refusal(call('getLocation', { title: '' }))).toContain('title');
    });

    it('a title that is not text', async () => {
      expect(await refusal(call('getLocation', { title: 5 }))).toContain('title');
    });
  });
});

contract.describe('getLocationAdvanced', () => {
  beforeEach(answerSideCalls);

  it('shows the location with that id, with every detail', async () => {
    const category = await categoryForTheApp();
    const created = await create('get by id', everyDetail(category));
    const shown = await call('getLocationAdvanced', { locationId: created.id });
    expect(shown).toEqual(created);
    expect(shown).toEqual(jasmine.objectContaining({ id: created.id, ...everyDetailShown(category) }));
  });

  describe('refuses', () => {
    it('an id no location has', async () => {
      expect(await refusal(call('getLocationAdvanced', { locationId: ZERO_ID }))).toContain(ZERO_ID);
    });

    it('the id of a deleted location', async () => {
      const created = await create('get deleted');
      await call('deleteLocationAdvanced', { locationId: created.id });
      expect(await refusal(call('getLocationAdvanced', { locationId: created.id }))).toContain(created.id);
    });

    it('without a locationId', async () => {
      expect(await refusal(call('getLocationAdvanced', {}))).toContain('locationId');
    });

    it('a locationId of null', async () => {
      expect(await refusal(call('getLocationAdvanced', { locationId: null }))).toContain('locationId');
    });

    it('an empty locationId', async () => {
      expect(await refusal(call('getLocationAdvanced', { locationId: '' }))).toContain('locationId');
    });

    it('a locationId that is not text', async () => {
      expect(await refusal(call('getLocationAdvanced', { locationId: 5 }))).toContain('locationId');
    });
  });
});

contract.describe('createLocation', () => {
  beforeEach(answerSideCalls);

  it('adds a location from its required details, with the defaults its description gives, and returns it', async () => {
    const title = unique('create');
    const options = place(title);
    const created = await call('createLocation', options);
    expect(created).toEqual(jasmine.objectContaining({
      id: jasmine.any(String),
      title,
      subtitle: null,
      address: options.address,
      formattedAddress: options.address,
      customName: null,
      latitude: 40.7484,
      longitude: -73.9857,
      description: options.description,
      listImage: LIST_IMAGE,
      images: [],
      categories: '',
      categoryIds: [],
      subcategoryIds: [],
      markerType: 'pin',
      markerImage: null,
      showCategory: true,
      showOpeningHours: false,
      showPriceRange: false,
      showStarRating: false,
      priceRange: 1,
      priceCurrency: '$',
      openingHours: DEFAULT_HOURS,
      actionItems: [],
      pinPosition: null,
      rating: { average: 0, count: 0 },
      views: 0,
      bookmarksCount: 0,
      fields: jasmine.any(Array),
      createdOn: ISO,
      lastUpdatedOn: ISO,
    }));
    expect(await found(title)).toEqual([created]);
    expect(await call('getLocation', { title })).toEqual(created);
  });

  it('adds a location with every optional detail', async () => {
    const category = await categoryForTheApp();
    const title = unique('create all');
    const created = await call('createLocation', place(title, everyDetail(category)));
    expect(created).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title, ...everyDetailShown(category) }));
    expect(await read(created.id)).toEqual(created);
  });

  it('gives a circle marker without a color the default red', async () => {
    const created = await create('circle', { markerType: 'circle' });
    expect(created).toEqual(jasmine.objectContaining({ markerType: 'circle', markerColor: 'rgba(253,35,5,1)' }));
    expect((await read(created.id)).markerColor).toBe('rgba(253,35,5,1)');
  });

  it('keeps a location in a category alone, and in several subcategories', async () => {
    const category = await categoryForTheApp();
    const alone = await create('category alone', { categories: category.title });
    expect(alone).toEqual(jasmine.objectContaining({ categories: category.title, categoryIds: [category.id], subcategoryIds: [] }));
    const both = await create('both subcategories', { categories: `${category.title} -> Pizza, ${category.title} -> Burgers` });
    expect((await read(both.id))).toEqual(jasmine.objectContaining({
      categories: `${category.title} -> Pizza, ${category.title} -> Burgers`,
      categoryIds: [category.id],
      subcategoryIds: [subcategory(category, 'Pizza').id, subcategory(category, 'Burgers').id],
    }));
  });

  it('gives the new location an empty value for every location field', async () => {
    const field = await fieldForTheApp();
    const created = await create('fields');
    expect(created.fields).toContain({ fieldId: field.id, label: appFieldLabel, value: null, customLabel: null });
    expect(fieldValueOf(await read(created.id), field.id)).toEqual({ fieldId: field.id, label: appFieldLabel, value: null, customLabel: null });
  });

  it('announces the new location', async () => {
    const created = await create('announced', { subtitle: 'Announced' });
    expect(sent('locationCreated')).toEqual([createdEvent(created)]);
  });

  describe('refuses, stores nothing and announces nothing', () => {
    const cases = [
      ['without a title', { title: undefined }, 'title'],
      ['a title of null', { title: null }, 'title'],
      ['an empty title', { title: '' }, 'title'],
      ['a title that is not text', { title: 5 }, 'title'],
      ['without an address', { address: undefined }, 'address'],
      ['an address of null', { address: null }, 'address'],
      ['an empty address', { address: '' }, 'address'],
      ['without a latitude', { latitude: undefined }, 'latitude'],
      ['a latitude of null', { latitude: null }, 'latitude'],
      ['an empty latitude', { latitude: '' }, 'latitude'],
      ['without a longitude', { longitude: undefined }, 'longitude'],
      ['a longitude of null', { longitude: null }, 'longitude'],
      ['an empty longitude', { longitude: '' }, 'longitude'],
      ['without a description', { description: undefined }, 'description'],
      ['a description of null', { description: null }, 'description'],
      ['an empty description', { description: '' }, 'description'],
      ['a description that is not text', { description: 5 }, 'description'],
      ['without a list image', { listImage: undefined }, 'listImage'],
      ['a list image of null', { listImage: null }, 'listImage'],
      ['an empty list image', { listImage: '' }, 'listImage'],
      ['an address that is not text', { address: 5 }, 'address'],
      ...detailRefusals(false),
    ];
    cases.forEach(([name, change, named]) => {
      it(name, async () => {
        const token = word('Refused');
        const options = withChange(place(unique('refused'), {}, token), change);
        resetEvents();
        expect(await refusal(call('createLocation', options))).toContain(named);
        expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
        const lookup = typeof options.title === 'string' && options.title ? { title: options.title } : { searchText: token };
        expect((await call('searchLocations', lookup)).total).toBe(0);
      });
    });

    it('categories naming no category, naming it', async () => {
      const title = unique('no category');
      const missing = unique('no such category');
      expect(await refusal(call('createLocation', place(title, { categories: missing })))).toContain(missing);
      expect(await found(title)).toEqual([]);
    });

    it('categories naming a subcategory the category does not have, naming it', async () => {
      const category = await categoryForTheApp();
      const title = unique('no subcategory');
      const missing = unique('no such subcategory');
      expect(await refusal(call('createLocation', place(title, { categories: `${category.title} -> ${missing}` })))).toContain(missing);
      expect(await found(title)).toEqual([]);
    });

    if (contract.host === 'control') {
      it('categories naming a title two categories share, saying how many', async () => {
        const shared = unique('shared category');
        await call('createCategory', { title: shared });
        await call('createCategory', { title: shared });
        const title = unique('shared category location');
        resetEvents();
        expect((await refusal(call('createLocation', place(title, { categories: shared })))).replace(shared, '')).toContain('2');
        expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
        expect(await found(title)).toEqual([]);
      });
    }
  });
});

contract.describe('createLocationsAdvanced', () => {
  beforeEach(answerSideCalls);

  it('adds every location, reports each, and announces each', async () => {
    const category = await categoryForTheApp();
    const titles = [unique('batch one'), unique('batch two')];
    resetEvents();
    const result = await call('createLocationsAdvanced', { locations: [place(titles[0]), place(titles[1], everyDetail(category))] });
    expect(result).toEqual({
      locations: [
        jasmine.objectContaining({ index: 0, id: jasmine.any(String), error: null }),
        jasmine.objectContaining({ index: 1, id: jasmine.any(String), error: null }),
      ],
      succeeded: 2,
      failed: 0,
    });
    const first = await read(result.locations[0].id);
    const second = await read(result.locations[1].id);
    expect(first).toEqual(jasmine.objectContaining({ title: titles[0], subtitle: null, markerType: 'pin', openingHours: DEFAULT_HOURS }));
    expect(second).toEqual(jasmine.objectContaining({ title: titles[1], ...everyDetailShown(category) }));
    expect(await found(titles[0])).toEqual([first]);
    expect(sent('locationCreated')).toEqual([createdEvent(first), createdEvent(second)]);
  });

  describe('refuses the whole list, writes none of it and announces nothing', () => {
    it('when one entry is invalid, naming the entry', async () => {
      const valid = unique('valid entry');
      const invalid = unique('invalid entry');
      resetEvents();
      const why = await refusal(call('createLocationsAdvanced', { locations: [place(valid), place(invalid, { latitude: 91 })] }));
      expect(why).toContain('entry 1');
      expect(why).toContain('latitude');
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect(await found(valid)).toEqual([]);
      expect(await found(invalid)).toEqual([]);
    });

    it('when an entry misses a required detail', async () => {
      const valid = unique('valid entry');
      const entry = withChange(place(unique('no description')), { description: undefined });
      expect(await refusal(call('createLocationsAdvanced', { locations: [place(valid), entry] }))).toContain('description');
      expect(await found(valid)).toEqual([]);
    });

    it('when an entry is not an object', async () => {
      const valid = unique('valid entry');
      await expectAsync(call('createLocationsAdvanced', { locations: [place(valid), 'not a location'] })).toBeRejected();
      expect(await found(valid)).toEqual([]);
    });

    it('when it is empty', async () => {
      resetEvents();
      expect(await refusal(call('createLocationsAdvanced', { locations: [] }))).toContain('locations');
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
    });

    it('when it holds more than 50 entries', async () => {
      const token = word('TooMany');
      const locations = Array.from({ length: 51 }, (value, index) => place(`${token} ${index}`));
      resetEvents();
      expect(await refusal(call('createLocationsAdvanced', { locations }))).toContain('locations');
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect((await call('searchLocations', { searchText: token })).total).toBe(0);
    });

    it('without a list', async () => {
      expect(await refusal(call('createLocationsAdvanced', {}))).toContain('locations');
    });

    it('a list of null', async () => {
      expect(await refusal(call('createLocationsAdvanced', { locations: null }))).toContain('locations');
    });

    it('a list that is not a list', async () => {
      expect(await refusal(call('createLocationsAdvanced', { locations: place(unique('not a list')) }))).toContain('locations');
    });
  });
});

contract.describe('updateLocation', () => {
  beforeEach(answerSideCalls);

  it('changes only the detail it is given, returns the location and announces it', async () => {
    const created = await create('update');
    const before = await read(created.id);
    resetEvents();
    const changed = await call('updateLocation', { title: created.title, newSubtitle: 'Now with a view' });
    const expected = { ...before, subtitle: 'Now with a view', lastUpdatedOn: ISO };
    expect(changed).toEqual(expected);
    expect(await read(created.id)).toEqual(expected);
    expect(sent('locationUpdated')).toEqual([updatedEvent(changed)]);
  });

  it('changes every detail it is given', async () => {
    const category = await categoryForTheApp();
    const created = await create('update all');
    const newTitle = unique('updated all');
    const changed = await call('updateLocation', {
      title: created.title,
      newTitle,
      newAddress: '20 W 34th St, New York, NY 10001',
      newLatitude: 40.7486,
      newLongitude: -73.9864,
      newDescription: '<p>Changed.</p>',
      newListImage: [OTHER_IMAGE],
      ...asUpdate(everyDetail(category)),
    });
    const expected = jasmine.objectContaining({
      id: created.id,
      title: newTitle,
      address: '20 W 34th St, New York, NY 10001',
      formattedAddress: '20 W 34th St, New York, NY 10001',
      latitude: 40.7486,
      longitude: -73.9864,
      description: '<p>Changed.</p>',
      listImage: OTHER_IMAGE,
      ...everyDetailShown(category),
    });
    expect(changed).toEqual(expected);
    expect(await call('getLocation', { title: newTitle })).toEqual(expected);
    expect(await found(created.title)).toEqual([]);
  });

  it('clears every removable detail with null', async () => {
    const category = await categoryForTheApp();
    const created = await create('clear null', { ...everyDetail(category), markerType: 'pin' });
    await call('updateLocation', {
      title: created.title,
      newSubtitle: null,
      newCustomName: null,
      newImages: null,
      newCategories: null,
      newMarkerImage: null,
      newMarkerColor: null,
      newMondayHours: null,
      newActionItems: null,
    });
    expect(await read(created.id)).toEqual(jasmine.objectContaining({
      subtitle: null,
      customName: null,
      images: [],
      categories: '',
      categoryIds: [],
      subcategoryIds: [],
      markerImage: null,
      markerColor: null,
      openingHours: jasmine.objectContaining({ monday: 'closed', wednesday: '07:30-11:00' }),
      actionItems: [],
    }));
  });

  it('clears every removable detail with an empty value', async () => {
    const category = await categoryForTheApp();
    const created = await create('clear empty', { ...everyDetail(category), markerType: 'pin' });
    await call('updateLocation', {
      title: created.title,
      newSubtitle: '',
      newCustomName: '',
      newImages: [],
      newCategories: '',
      newMarkerImage: [],
      newMarkerColor: '',
      newMondayHours: '',
      newActionItems: [],
    });
    expect(await read(created.id)).toEqual(jasmine.objectContaining({
      subtitle: null,
      customName: null,
      images: [],
      categories: '',
      categoryIds: [],
      subcategoryIds: [],
      markerImage: null,
      markerColor: null,
      openingHours: jasmine.objectContaining({ monday: 'closed', wednesday: '07:30-11:00' }),
      actionItems: [],
    }));
  });

  it('replaces the pictures, actions and categories, never merging them', async () => {
    const category = await categoryForTheApp();
    const created = await create('replace', everyDetail(category));
    await call('updateLocation', {
      title: created.title,
      newImages: [OTHER_IMAGE],
      newActionItems: [{ title: 'Website', action: 'linkToWeb', url: 'https://example.com' }],
      newCategories: `${category.title} -> Burgers`,
    });
    const after = await read(created.id);
    expect(after.images).toEqual([OTHER_IMAGE]);
    expect(after.actionItems).toEqual([jasmine.objectContaining({ title: 'Website', action: 'linkToWeb', url: 'https://example.com' })]);
    expect(after).toEqual(jasmine.objectContaining({
      categories: `${category.title} -> Burgers`, categoryIds: [category.id], subcategoryIds: [subcategory(category, 'Burgers').id],
    }));
  });

  describe('refuses, changes nothing and announces nothing', () => {
    const cases = [
      ['a newTitle of null', { newTitle: null }, 'newTitle'],
      ['an empty newTitle', { newTitle: '' }, 'newTitle'],
      ['a newTitle that is not text', { newTitle: 5 }, 'newTitle'],
      ['a newDescription of null', { newDescription: null }, 'newDescription'],
      ['an empty newDescription', { newDescription: '' }, 'newDescription'],
      ['a newListImage of null', { newListImage: null }, 'newListImage'],
      ['a newAddress of null', { newAddress: null, newLatitude: 40.7484, newLongitude: -73.9857 }, 'newAddress'],
      ['a newAddress without its coordinates', { newAddress: ADDRESS }, 'newLatitude'],
      ['a newMarkerType of null', { newMarkerType: null }, 'newMarkerType'],
      ['a newPriceRange of null', { newPriceRange: null }, 'newPriceRange'],
      ['a newShowCategory of null', { newShowCategory: null }, 'newShowCategory'],
      ...detailRefusals(true),
    ];
    cases.forEach(([name, change, named]) => {
      it(name, async () => {
        const created = await create('refused update');
        const before = await read(created.id);
        resetEvents();
        expect(await refusal(call('updateLocation', { title: created.title, ...change }))).toContain(named);
        expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
        expect(await read(created.id)).toEqual(before);
      });
    });

    it('a call that changes nothing', async () => {
      const created = await create('nothing');
      const before = await read(created.id);
      resetEvents();
      await expectAsync(call('updateLocation', { title: created.title })).toBeRejected();
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect(await read(created.id)).toEqual(before);
    });

    it('newCategories naming no category, naming it', async () => {
      const created = await create('no category');
      const before = await read(created.id);
      const missing = unique('no such category');
      expect(await refusal(call('updateLocation', { title: created.title, newCategories: missing }))).toContain(missing);
      expect(await read(created.id)).toEqual(before);
    });

    it('a title no location has, naming it', async () => {
      const title = unique('missing');
      resetEvents();
      expect(await refusal(call('updateLocation', { title, newSubtitle: 'x' }))).toContain(title);
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
    });

    it('a title two locations share, saying how many, and changes neither', async () => {
      const title = unique('shared');
      await call('createLocation', place(title));
      await call('createLocation', place(title));
      resetEvents();
      expect((await refusal(call('updateLocation', { title, newSubtitle: 'x' }))).replace(title, '')).toContain('2');
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect((await found(title)).map((loc) => loc.subtitle)).toEqual([null, null]);
    });

    it('without a title', async () => {
      expect(await refusal(call('updateLocation', { newSubtitle: 'x' }))).toContain('title');
    });

    it('a title of null', async () => {
      expect(await refusal(call('updateLocation', { title: null, newSubtitle: 'x' }))).toContain('title');
    });

    it('an empty title', async () => {
      expect(await refusal(call('updateLocation', { title: '', newSubtitle: 'x' }))).toContain('title');
    });

    it('a title that is not text', async () => {
      expect(await refusal(call('updateLocation', { title: 5, newSubtitle: 'x' }))).toContain('title');
    });
  });
});

contract.describe('updateLocationAdvanced', () => {
  beforeEach(answerSideCalls);

  it('changes only the detail it is given, returns the location and announces it', async () => {
    const created = await create('update by id');
    const before = await read(created.id);
    resetEvents();
    const changed = await call('updateLocationAdvanced', { locationId: created.id, newCustomName: 'Midtown deck' });
    const expected = { ...before, customName: 'Midtown deck', lastUpdatedOn: ISO };
    expect(changed).toEqual(expected);
    expect(await read(created.id)).toEqual(expected);
    expect(sent('locationUpdated')).toEqual([updatedEvent(changed)]);
  });

  it('changes every detail it is given', async () => {
    const category = await categoryForTheApp();
    const created = await create('update all by id');
    const newTitle = unique('updated all by id');
    const changed = await call('updateLocationAdvanced', {
      locationId: created.id,
      newTitle,
      newAddress: '20 W 34th St, New York, NY 10001',
      newLatitude: -33.8568,
      newLongitude: 151.2153,
      newDescription: '<p>Changed by id.</p>',
      newListImage: [OTHER_IMAGE],
      ...asUpdate(everyDetail(category)),
    });
    const expected = jasmine.objectContaining({
      id: created.id,
      title: newTitle,
      address: '20 W 34th St, New York, NY 10001',
      latitude: -33.8568,
      longitude: 151.2153,
      description: '<p>Changed by id.</p>',
      listImage: OTHER_IMAGE,
      ...everyDetailShown(category),
    });
    expect(changed).toEqual(expected);
    expect(await read(created.id)).toEqual(expected);
  });

  it('clears a removable detail with null, and with an empty value', async () => {
    const created = await create('clear by id', { subtitle: 'Something', customName: 'Some name' });
    await call('updateLocationAdvanced', { locationId: created.id, newSubtitle: null });
    expect(await read(created.id)).toEqual(jasmine.objectContaining({ subtitle: null, customName: 'Some name' }));
    await call('updateLocationAdvanced', { locationId: created.id, newCustomName: '' });
    expect(await read(created.id)).toEqual(jasmine.objectContaining({ subtitle: null, customName: null }));
  });

  describe('refuses, changes nothing and announces nothing', () => {
    const cases = [
      ['a newTitle of null', { newTitle: null }, 'newTitle'],
      ['a newDescription of null', { newDescription: null }, 'newDescription'],
      ['a newListImage of null', { newListImage: null }, 'newListImage'],
      ['a newLatitude above 90', { newAddress: ADDRESS, newLatitude: 95, newLongitude: 0 }, 'newLatitude'],
      ['a newMarkerType it does not offer', { newMarkerType: 'flag' }, 'newMarkerType'],
      ['a newListImage given as a bare string', { newListImage: OTHER_IMAGE }, 'newListImage'],
      ['newActionItems without their kind', { newActionItems: [{ title: 'Visit' }] }, 'newActionItems'],
    ];
    cases.forEach(([name, change, named]) => {
      it(name, async () => {
        const created = await create('refused by id');
        const before = await read(created.id);
        resetEvents();
        expect(await refusal(call('updateLocationAdvanced', { locationId: created.id, ...change }))).toContain(named);
        expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
        expect(await read(created.id)).toEqual(before);
      });
    });

    it('a call that changes nothing', async () => {
      const created = await create('nothing by id');
      const before = await read(created.id);
      resetEvents();
      await expectAsync(call('updateLocationAdvanced', { locationId: created.id })).toBeRejected();
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect(await read(created.id)).toEqual(before);
    });

    it('an id no location has', async () => {
      resetEvents();
      expect(await refusal(call('updateLocationAdvanced', { locationId: ZERO_ID, newSubtitle: 'x' }))).toContain(ZERO_ID);
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
    });

    it('without a locationId', async () => {
      expect(await refusal(call('updateLocationAdvanced', { newSubtitle: 'x' }))).toContain('locationId');
    });

    it('a locationId of null', async () => {
      expect(await refusal(call('updateLocationAdvanced', { locationId: null, newSubtitle: 'x' }))).toContain('locationId');
    });

    it('an empty locationId', async () => {
      expect(await refusal(call('updateLocationAdvanced', { locationId: '', newSubtitle: 'x' }))).toContain('locationId');
    });

    it('a locationId that is not text', async () => {
      expect(await refusal(call('updateLocationAdvanced', { locationId: 5, newSubtitle: 'x' }))).toContain('locationId');
    });
  });
});

contract.describe('updateLocationsAdvanced', () => {
  beforeEach(answerSideCalls);

  it('changes every location, reports each, and announces each', async () => {
    const first = await create('batch update one');
    const second = await create('batch update two', { subtitle: 'Kept' });
    const newTitle = unique('batch renamed');
    resetEvents();
    const result = await call('updateLocationsAdvanced', {
      locations: [
        { locationId: first.id, newSubtitle: 'First changed', newPriceRange: 2 },
        { locationId: second.id, newTitle },
      ],
    });
    expect(result).toEqual({
      locations: [
        jasmine.objectContaining({ index: 0, id: first.id, error: null }),
        jasmine.objectContaining({ index: 1, id: second.id, error: null }),
      ],
      succeeded: 2,
      failed: 0,
    });
    const firstAfter = await read(first.id);
    const secondAfter = await read(second.id);
    expect(firstAfter).toEqual(jasmine.objectContaining({ title: first.title, subtitle: 'First changed', priceRange: 2 }));
    expect(secondAfter).toEqual(jasmine.objectContaining({ title: newTitle, subtitle: 'Kept' }));
    expect(sent('locationUpdated')).toEqual([updatedEvent(firstAfter), updatedEvent(secondAfter)]);
  });

  it('clears a removable detail with null', async () => {
    const created = await create('batch clear', { subtitle: 'To clear' });
    await call('updateLocationsAdvanced', { locations: [{ locationId: created.id, newSubtitle: null }] });
    expect((await read(created.id)).subtitle).toBeNull();
  });

  describe('refuses the whole list, writes none of it and announces nothing', () => {
    const twoLocations = async () => {
      const first = await create('batch kept one');
      const second = await create('batch kept two');
      return [first, second, await read(first.id), await read(second.id)];
    };

    it('when one entry is invalid, naming the entry', async () => {
      const [first, second, firstBefore, secondBefore] = await twoLocations();
      resetEvents();
      const why = await refusal(call('updateLocationsAdvanced', {
        locations: [{ locationId: first.id, newSubtitle: 'x' }, { locationId: second.id, newLatitude: 100, newLongitude: 0, newAddress: ADDRESS }],
      }));
      expect(why).toContain('entry 1');
      expect(why).toContain('newLatitude');
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect(await read(first.id)).toEqual(firstBefore);
      expect(await read(second.id)).toEqual(secondBefore);
    });

    it('when an entry changes nothing', async () => {
      const [first, second, firstBefore] = await twoLocations();
      await expectAsync(call('updateLocationsAdvanced', { locations: [{ locationId: first.id, newSubtitle: 'x' }, { locationId: second.id }] })).toBeRejected();
      expect(await read(first.id)).toEqual(firstBefore);
    });

    it('when an id matches no location', async () => {
      const [first, , firstBefore] = await twoLocations();
      resetEvents();
      expect(await refusal(call('updateLocationsAdvanced', {
        locations: [{ locationId: first.id, newSubtitle: 'x' }, { locationId: ZERO_ID, newSubtitle: 'y' }],
      }))).toContain(ZERO_ID);
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect(await read(first.id)).toEqual(firstBefore);
    });

    it('when the same location is listed twice', async () => {
      const [first, , firstBefore] = await twoLocations();
      resetEvents();
      await expectAsync(call('updateLocationsAdvanced', {
        locations: [{ locationId: first.id, newSubtitle: 'x' }, { locationId: first.id, newCustomName: 'y' }],
      })).toBeRejected();
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect(await read(first.id)).toEqual(firstBefore);
    });

    it('when an entry has no locationId', async () => {
      const [first, , firstBefore] = await twoLocations();
      expect(await refusal(call('updateLocationsAdvanced', { locations: [{ locationId: first.id, newSubtitle: 'x' }, { newSubtitle: 'y' }] }))).toContain('locationId');
      expect(await read(first.id)).toEqual(firstBefore);
    });

    it('when an entry is not an object', async () => {
      const [first, , firstBefore] = await twoLocations();
      await expectAsync(call('updateLocationsAdvanced', { locations: [{ locationId: first.id, newSubtitle: 'x' }, first.id] })).toBeRejected();
      expect(await read(first.id)).toEqual(firstBefore);
    });

    it('when it is empty', async () => {
      expect(await refusal(call('updateLocationsAdvanced', { locations: [] }))).toContain('locations');
    });

    it('when it holds more than 50 entries', async () => {
      const created = await create('batch too many');
      const before = await read(created.id);
      const locations = [{ locationId: created.id, newSubtitle: 'x' }]
        .concat(Array.from({ length: 50 }, (value, index) => ({ locationId: `${ZERO_ID.slice(0, 22)}${String(index).padStart(2, '0')}`, newSubtitle: 'x' })));
      resetEvents();
      expect(await refusal(call('updateLocationsAdvanced', { locations }))).toContain('locations');
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect(await read(created.id)).toEqual(before);
    });

    it('without a list', async () => {
      expect(await refusal(call('updateLocationsAdvanced', {}))).toContain('locations');
    });

    it('a list of null', async () => {
      expect(await refusal(call('updateLocationsAdvanced', { locations: null }))).toContain('locations');
    });
  });
});

contract.describe('deleteLocation', () => {
  beforeEach(answerSideCalls);

  it('removes the location with that title, returns its id and announces it', async () => {
    const created = await create('delete');
    resetEvents();
    expect(await call('deleteLocation', { title: created.title })).toEqual({ id: created.id });
    expect(await found(created.title)).toEqual([]);
    await expectAsync(call('getLocationAdvanced', { locationId: created.id })).toBeRejected();
    expect(sent('locationDeleted')).toEqual([{ locationId: created.id }]);
  });

  it('leaves every other location alone', async () => {
    const kept = await create('kept');
    const removed = await create('removed');
    await call('deleteLocation', { title: removed.title });
    expect(await found(kept.title)).toEqual([kept]);
  });

  describe('refuses, removes nothing and announces nothing', () => {
    it('a title no location has, naming it', async () => {
      const title = unique('missing');
      resetEvents();
      expect(await refusal(call('deleteLocation', { title }))).toContain(title);
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
    });

    it('a title two locations share, saying how many, and keeps both', async () => {
      const title = unique('shared');
      await call('createLocation', place(title));
      await call('createLocation', place(title));
      resetEvents();
      expect((await refusal(call('deleteLocation', { title }))).replace(title, '')).toContain('2');
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect((await found(title)).length).toBe(2);
    });

    it('without a title', async () => {
      expect(await refusal(call('deleteLocation', {}))).toContain('title');
    });

    it('a title of null', async () => {
      expect(await refusal(call('deleteLocation', { title: null }))).toContain('title');
    });

    it('an empty title', async () => {
      expect(await refusal(call('deleteLocation', { title: '' }))).toContain('title');
    });

    it('a title that is not text', async () => {
      expect(await refusal(call('deleteLocation', { title: 5 }))).toContain('title');
    });
  });
});

contract.describe('deleteLocationAdvanced', () => {
  beforeEach(answerSideCalls);

  it('removes the location with that id, returns its id and announces it', async () => {
    const created = await create('delete by id');
    resetEvents();
    expect(await call('deleteLocationAdvanced', { locationId: created.id })).toEqual({ id: created.id });
    expect(await found(created.title)).toEqual([]);
    expect(sent('locationDeleted')).toEqual([{ locationId: created.id }]);
  });

  it('leaves every other location alone', async () => {
    const kept = await create('kept by id');
    const removed = await create('removed by id');
    await call('deleteLocationAdvanced', { locationId: removed.id });
    expect(await found(kept.title)).toEqual([kept]);
  });

  describe('refuses, removes nothing and announces nothing', () => {
    it('an id no location has', async () => {
      resetEvents();
      expect(await refusal(call('deleteLocationAdvanced', { locationId: ZERO_ID }))).toContain(ZERO_ID);
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
    });

    it('the id of a location already removed', async () => {
      const created = await create('removed twice');
      await call('deleteLocationAdvanced', { locationId: created.id });
      resetEvents();
      expect(await refusal(call('deleteLocationAdvanced', { locationId: created.id }))).toContain(created.id);
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
    });

    it('without a locationId', async () => {
      expect(await refusal(call('deleteLocationAdvanced', {}))).toContain('locationId');
    });

    it('a locationId of null', async () => {
      expect(await refusal(call('deleteLocationAdvanced', { locationId: null }))).toContain('locationId');
    });

    it('an empty locationId', async () => {
      expect(await refusal(call('deleteLocationAdvanced', { locationId: '' }))).toContain('locationId');
    });

    it('a locationId that is not text', async () => {
      expect(await refusal(call('deleteLocationAdvanced', { locationId: 5 }))).toContain('locationId');
    });
  });
});

contract.describe('deleteLocationsAdvanced', () => {
  beforeEach(answerSideCalls);

  it('removes every location, reports each, and announces each', async () => {
    const first = await create('batch delete one');
    const second = await create('batch delete two');
    resetEvents();
    const result = await call('deleteLocationsAdvanced', { locations: [{ locationId: first.id }, { locationId: second.id }] });
    expect(result).toEqual({
      locations: [
        jasmine.objectContaining({ index: 0, id: first.id, error: null }),
        jasmine.objectContaining({ index: 1, id: second.id, error: null }),
      ],
      succeeded: 2,
      failed: 0,
    });
    expect(await found(first.title)).toEqual([]);
    expect(await found(second.title)).toEqual([]);
    expect(sent('locationDeleted')).toEqual([{ locationId: first.id }, { locationId: second.id }]);
  });

  describe('refuses the whole list, removes none of it and announces nothing', () => {
    it('when an id matches no location', async () => {
      const kept = await create('batch delete kept');
      resetEvents();
      expect(await refusal(call('deleteLocationsAdvanced', { locations: [{ locationId: kept.id }, { locationId: ZERO_ID }] }))).toContain(ZERO_ID);
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect(await found(kept.title)).toEqual([kept]);
    });

    it('when the same location is listed twice', async () => {
      const kept = await create('batch delete twice');
      resetEvents();
      await expectAsync(call('deleteLocationsAdvanced', { locations: [{ locationId: kept.id }, { locationId: kept.id }] })).toBeRejected();
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect(await found(kept.title)).toEqual([kept]);
    });

    it('when an entry has no locationId', async () => {
      const kept = await create('batch delete no id');
      expect(await refusal(call('deleteLocationsAdvanced', { locations: [{ locationId: kept.id }, {}] }))).toContain('locationId');
      expect(await found(kept.title)).toEqual([kept]);
    });

    it('when an entry is not an object', async () => {
      const kept = await create('batch delete bare id');
      await expectAsync(call('deleteLocationsAdvanced', { locations: [{ locationId: kept.id }, kept.id] })).toBeRejected();
      expect(await found(kept.title)).toEqual([kept]);
    });

    it('when it is empty', async () => {
      expect(await refusal(call('deleteLocationsAdvanced', { locations: [] }))).toContain('locations');
    });

    it('when it holds more than 50 entries', async () => {
      const kept = await create('batch delete too many');
      const locations = [{ locationId: kept.id }]
        .concat(Array.from({ length: 50 }, (value, index) => ({ locationId: `${ZERO_ID.slice(0, 22)}${String(index).padStart(2, '0')}` })));
      resetEvents();
      expect(await refusal(call('deleteLocationsAdvanced', { locations }))).toContain('locations');
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect(await found(kept.title)).toEqual([kept]);
    });

    it('without a list', async () => {
      expect(await refusal(call('deleteLocationsAdvanced', {}))).toContain('locations');
    });

    it('a list of null', async () => {
      expect(await refusal(call('deleteLocationsAdvanced', { locations: null }))).toContain('locations');
    });
  });
});

// controlBackground only: this block runs in the control frame. Each spec unpins every location first: at most 3 are pinned.
contract.describe('updateLocationPin', () => {
  beforeEach(answerSideCalls);
  const order = (result) => result.locations.map((loc) => [loc.id, loc.pinPosition]);

  it('pins a location last, returns the pinned locations in order and announces the change', async () => {
    await unpinAll();
    const first = await create('pin first');
    const second = await create('pin second');
    expect(order(await call('updateLocationPin', { title: first.title, pinned: true }))).toEqual([[first.id, 1]]);
    resetEvents();
    const result = await call('updateLocationPin', { title: second.title, pinned: true });
    expect(order(result)).toEqual([[first.id, 1], [second.id, 2]]);
    expect(result.locations[1]).toEqual(jasmine.objectContaining({ id: second.id, title: second.title, address: second.address }));
    expect(sent('locationUpdated')).toEqual([updatedEvent(result.locations[1])]);
    expect((await call('getLocation', { title: second.title })).pinPosition).toBe(2);
    expect(order(await call('searchLocations', { pinnedOnly: true }))).toEqual([[first.id, 1], [second.id, 2]]);
    await unpinAll();
  }, 180000);

  it('pins a location at the position given, moving the others down', async () => {
    await unpinAll();
    const first = await create('pin a');
    const second = await create('pin b');
    const third = await create('pin c');
    await call('updateLocationPin', { title: first.title, pinned: true });
    await call('updateLocationPin', { title: second.title, pinned: true });
    resetEvents();
    const result = await call('updateLocationPin', { title: third.title, pinned: true, position: 1 });
    expect(order(result)).toEqual([[third.id, 1], [first.id, 2], [second.id, 3]]);
    expect(sent('locationUpdated').map((data) => data.locationId)).toContain(third.id);
    expect(order(await call('searchLocations', { pinnedOnly: true }))).toEqual([[third.id, 1], [first.id, 2], [second.id, 3]]);
    await unpinAll();
  }, 180000);

  it('moves a pinned location, and keeps its place when pinned again without a position', async () => {
    await unpinAll();
    const first = await create('move a');
    const second = await create('move b');
    await call('updateLocationPin', { title: first.title, pinned: true });
    await call('updateLocationPin', { title: second.title, pinned: true });
    expect(order(await call('updateLocationPin', { title: second.title, pinned: true, position: 1 }))).toEqual([[second.id, 1], [first.id, 2]]);
    expect(order(await call('updateLocationPin', { title: first.title, pinned: true }))).toEqual([[second.id, 1], [first.id, 2]]);
    await unpinAll();
  }, 180000);

  it('unpins a location, leaving the others pinned', async () => {
    await unpinAll();
    const first = await create('unpin a');
    const second = await create('unpin b');
    await call('updateLocationPin', { title: first.title, pinned: true });
    await call('updateLocationPin', { title: second.title, pinned: true });
    resetEvents();
    const result = await call('updateLocationPin', { title: first.title, pinned: false });
    expect(result.locations.map((loc) => loc.id)).toEqual([second.id]);
    expect(sent('locationUpdated').map((data) => data.locationId)).toEqual([first.id]);
    expect((await read(first.id)).pinPosition).toBeNull();
    expect((await call('searchLocations', { pinnedOnly: true })).locations.map((loc) => loc.id)).toEqual([second.id]);
    await unpinAll();
  }, 180000);

  describe('refuses, pins nothing and announces nothing', () => {
    it('a fourth pinned location, saying 3 are pinned', async () => {
      await unpinAll();
      const pinned = [await create('pinned 1'), await create('pinned 2'), await create('pinned 3')];
      for (const loc of pinned) await call('updateLocationPin', { title: loc.title, pinned: true });
      const fourth = await create('pinned 4');
      resetEvents();
      expect(await refusal(call('updateLocationPin', { title: fourth.title, pinned: true }))).toContain('3');
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect((await read(fourth.id)).pinPosition).toBeNull();
      expect((await call('searchLocations', { pinnedOnly: true })).locations.map((loc) => loc.id)).toEqual(pinned.map((loc) => loc.id));
      await unpinAll();
    }, 240000);

    const cases = [
      ['without pinned', { pinned: undefined }, 'pinned'],
      ['pinned of null', { pinned: null }, 'pinned'],
      ['pinned that is not true or false', { pinned: 'yes' }, 'pinned'],
      ['a position below 1', { position: 0 }, 'position'],
      ['a position above 3', { position: 4 }, 'position'],
      ['a position that is not a whole number', { position: 1.5 }, 'position'],
      ['a position given as text', { position: '1' }, 'position'],
      ['a position when unpinning', { pinned: false, position: 1 }, 'position'],
    ];
    cases.forEach(([name, change, named]) => {
      it(name, async () => {
        await unpinAll();
        const created = await create('pin refused');
        resetEvents();
        expect(await refusal(call('updateLocationPin', withChange({ title: created.title, pinned: true }, change)))).toContain(named);
        expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
        expect((await read(created.id)).pinPosition).toBeNull();
        expect((await call('searchLocations', { pinnedOnly: true })).locations).toEqual([]);
      }, 120000);
    });

    it('a title no location has, naming it', async () => {
      const title = unique('missing');
      expect(await refusal(call('updateLocationPin', { title, pinned: true }))).toContain(title);
    });

    it('a title two locations share, saying how many, and pins neither', async () => {
      const title = unique('shared');
      await call('createLocation', place(title));
      await call('createLocation', place(title));
      resetEvents();
      expect((await refusal(call('updateLocationPin', { title, pinned: true }))).replace(title, '')).toContain('2');
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect((await found(title)).map((loc) => loc.pinPosition)).toEqual([null, null]);
    });

    it('without a title', async () => {
      expect(await refusal(call('updateLocationPin', { pinned: true }))).toContain('title');
    });

    it('a title of null', async () => {
      expect(await refusal(call('updateLocationPin', { title: null, pinned: true }))).toContain('title');
    });

    it('an empty title', async () => {
      expect(await refusal(call('updateLocationPin', { title: '', pinned: true }))).toContain('title');
    });

    it('a title that is not text', async () => {
      expect(await refusal(call('updateLocationPin', { title: 5, pinned: true }))).toContain('title');
    });
  });
});

// controlBackground only: this block runs in the control frame.
contract.describe('updateLocationPinAdvanced', () => {
  beforeEach(answerSideCalls);

  it('pins, moves and unpins the location with that id', async () => {
    await unpinAll();
    const first = await create('pin by id a');
    const second = await create('pin by id b');
    await call('updateLocationPinAdvanced', { locationId: first.id, pinned: true });
    resetEvents();
    const result = await call('updateLocationPinAdvanced', { locationId: second.id, pinned: true, position: 1 });
    expect(result.locations.map((loc) => [loc.id, loc.pinPosition])).toEqual([[second.id, 1], [first.id, 2]]);
    expect(sent('locationUpdated').map((data) => data.locationId)).toContain(second.id);
    expect((await read(second.id)).pinPosition).toBe(1);
    expect((await call('updateLocationPinAdvanced', { locationId: second.id, pinned: false })).locations.map((loc) => loc.id)).toEqual([first.id]);
    expect((await read(second.id)).pinPosition).toBeNull();
    await unpinAll();
  }, 180000);

  describe('refuses, pins nothing and announces nothing', () => {
    it('an id no location has', async () => {
      resetEvents();
      expect(await refusal(call('updateLocationPinAdvanced', { locationId: ZERO_ID, pinned: true }))).toContain(ZERO_ID);
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
    });

    it('without pinned', async () => {
      const created = await create('pin by id refused');
      resetEvents();
      expect(await refusal(call('updateLocationPinAdvanced', { locationId: created.id }))).toContain('pinned');
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect((await read(created.id)).pinPosition).toBeNull();
    });

    it('a position above 3', async () => {
      await unpinAll();
      const created = await create('pin by id position');
      expect(await refusal(call('updateLocationPinAdvanced', { locationId: created.id, pinned: true, position: 4 }))).toContain('position');
      expect((await read(created.id)).pinPosition).toBeNull();
    });

    it('without a locationId', async () => {
      expect(await refusal(call('updateLocationPinAdvanced', { pinned: true }))).toContain('locationId');
    });

    it('a locationId of null', async () => {
      expect(await refusal(call('updateLocationPinAdvanced', { locationId: null, pinned: true }))).toContain('locationId');
    });

    it('an empty locationId', async () => {
      expect(await refusal(call('updateLocationPinAdvanced', { locationId: '', pinned: true }))).toContain('locationId');
    });

    it('a locationId that is not text', async () => {
      expect(await refusal(call('updateLocationPinAdvanced', { locationId: 5, pinned: true }))).toContain('locationId');
    });
  });
});

contract.describe('updateLocationFieldValue', () => {
  beforeEach(answerSideCalls);

  it("sets a location's value for the field with that label, returns it and announces the change", async () => {
    const field = await fieldForTheApp();
    const created = await create('field value');
    resetEvents();
    const result = await call('updateLocationFieldValue', { title: created.title, fieldLabel: appFieldLabel, value: 'https://example.com/book' });
    expect(result).toEqual({ locationId: created.id, fieldId: field.id, label: appFieldLabel, value: 'https://example.com/book', customLabel: null });
    const after = await read(created.id);
    expect(fieldValueOf(after, field.id)).toEqual({ fieldId: field.id, label: appFieldLabel, value: 'https://example.com/book', customLabel: null });
    expect(sent('locationUpdated')).toEqual([updatedEvent(after)]);
  });

  it('adds https:// to a URL given without it', async () => {
    const field = await fieldForTheApp();
    const created = await create('field scheme');
    expect((await call('updateLocationFieldValue', { title: created.title, fieldLabel: appFieldLabel, value: 'example.com/menu' })).value)
      .toBe('https://example.com/menu');
    expect(fieldValueOf(await read(created.id), field.id).value).toBe('https://example.com/menu');
  });

  it('sets a custom label, keeping the value left out', async () => {
    const field = await fieldForTheApp();
    const created = await create('field label');
    await call('updateLocationFieldValue', { title: created.title, fieldLabel: appFieldLabel, value: 'https://example.com/a' });
    const result = await call('updateLocationFieldValue', { title: created.title, fieldLabel: appFieldLabel, customLabel: 'Book a table' });
    expect(result).toEqual(jasmine.objectContaining({ value: 'https://example.com/a', customLabel: 'Book a table' }));
    expect(fieldValueOf(await read(created.id), field.id)).toEqual(jasmine.objectContaining({ value: 'https://example.com/a', customLabel: 'Book a table' }));
  });

  it('clears the value and custom label with null, and with an empty value', async () => {
    const field = await fieldForTheApp();
    const created = await create('field clear');
    const set = { title: created.title, fieldLabel: appFieldLabel, value: 'https://example.com/a', customLabel: 'Visit' };
    await call('updateLocationFieldValue', set);
    await call('updateLocationFieldValue', { title: created.title, fieldLabel: appFieldLabel, value: null });
    expect(fieldValueOf(await read(created.id), field.id)).toEqual(jasmine.objectContaining({ value: null, customLabel: 'Visit' }));
    await call('updateLocationFieldValue', { title: created.title, fieldLabel: appFieldLabel, customLabel: null });
    expect(fieldValueOf(await read(created.id), field.id)).toEqual(jasmine.objectContaining({ value: null, customLabel: null }));
    await call('updateLocationFieldValue', set);
    await call('updateLocationFieldValue', { title: created.title, fieldLabel: appFieldLabel, value: '', customLabel: '' });
    expect(fieldValueOf(await read(created.id), field.id)).toEqual(jasmine.objectContaining({ value: null, customLabel: null }));
  }, 120000);

  describe('refuses, changes nothing and announces nothing', () => {
    const cases = [
      ['a call that changes nothing', {}, 'value'],
      ['a value that is not a URL', { value: 'not a url' }, 'URL'],
      ['a value longer than 150 characters', { value: `https://example.com/${'a'.repeat(140)}` }, '150'],
      ['a value that is not text', { value: 5 }, 'value'],
      ['a custom label longer than 50 characters', { customLabel: 'a'.repeat(51) }, 'customLabel'],
      ['a custom label that is not text', { customLabel: 5 }, 'customLabel'],
    ];
    cases.forEach(([name, change, named]) => {
      it(name, async () => {
        const field = await fieldForTheApp();
        const created = await create('field refused');
        const before = await read(created.id);
        resetEvents();
        expect(await refusal(call('updateLocationFieldValue', { title: created.title, fieldLabel: appFieldLabel, ...change }))).toContain(named);
        expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
        expect(await read(created.id)).toEqual(before);
        expect(fieldValueOf(before, field.id).value).toBeNull();
      });
    });

    it('a field label no field has, naming it', async () => {
      const created = await create('field missing');
      const label = unique('no such field');
      resetEvents();
      expect(await refusal(call('updateLocationFieldValue', { title: created.title, fieldLabel: label, value: 'https://example.com' }))).toContain(label);
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
    });

    it('a title no location has, naming it', async () => {
      await fieldForTheApp();
      const title = unique('missing');
      expect(await refusal(call('updateLocationFieldValue', { title, fieldLabel: appFieldLabel, value: 'https://example.com' }))).toContain(title);
    });

    it('a title two locations share, saying how many, and changes neither', async () => {
      const field = await fieldForTheApp();
      const title = unique('shared');
      await call('createLocation', place(title));
      await call('createLocation', place(title));
      resetEvents();
      expect((await refusal(call('updateLocationFieldValue', { title, fieldLabel: appFieldLabel, value: 'https://example.com' }))).replace(title, '')).toContain('2');
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect((await found(title)).map((loc) => fieldValueOf(loc, field.id).value)).toEqual([null, null]);
    });

    if (contract.host === 'control') {
      it('a field label two fields share, saying how many', async () => {
        const label = unique('shared field');
        const created = await create('shared field');
        await withTempFields([{ group: 'content', label, type: 'TEXT' }, { group: 'quickActions', label, type: 'PHONE' }], async () => {
          resetEvents();
          expect((await refusal(call('updateLocationFieldValue', { title: created.title, fieldLabel: label, value: 'x' }))).replace(label, '')).toContain('2');
          expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
        });
      }, 120000);
    }

    const params = [['title', 'field missing title'], ['fieldLabel', 'field missing label']];
    params.forEach(([name]) => {
      [['without', undefined], ['of null', null], ['empty', ''], ['not text', 5]].forEach(([how, value]) => {
        it(`a ${name} ${how}`, async () => {
          const options = withChange({ title: unique('field param'), fieldLabel: appFieldLabel, value: 'https://example.com' }, { [name]: value });
          expect(await refusal(call('updateLocationFieldValue', options))).toContain(name);
        });
      });
    });
  });
});

contract.describe('updateLocationFieldValueAdvanced', () => {
  beforeEach(answerSideCalls);

  it("sets a location's value for the field with that id, returns it and announces the change", async () => {
    const field = await fieldForTheApp();
    const created = await create('field value by id');
    resetEvents();
    const result = await call('updateLocationFieldValueAdvanced', {
      locationId: created.id, fieldId: field.id, value: 'https://example.com/reserve', customLabel: 'Reserve',
    });
    expect(result).toEqual({ locationId: created.id, fieldId: field.id, label: appFieldLabel, value: 'https://example.com/reserve', customLabel: 'Reserve' });
    const after = await read(created.id);
    expect(fieldValueOf(after, field.id)).toEqual({ fieldId: field.id, label: appFieldLabel, value: 'https://example.com/reserve', customLabel: 'Reserve' });
    expect(sent('locationUpdated')).toEqual([updatedEvent(after)]);
  });

  it('keeps what is left out, and clears with null', async () => {
    const field = await fieldForTheApp();
    const created = await create('field keep by id');
    await call('updateLocationFieldValueAdvanced', { locationId: created.id, fieldId: field.id, value: 'https://example.com/a', customLabel: 'Visit' });
    await call('updateLocationFieldValueAdvanced', { locationId: created.id, fieldId: field.id, value: 'https://example.com/b' });
    expect(fieldValueOf(await read(created.id), field.id)).toEqual(jasmine.objectContaining({ value: 'https://example.com/b', customLabel: 'Visit' }));
    await call('updateLocationFieldValueAdvanced', { locationId: created.id, fieldId: field.id, customLabel: null });
    expect(fieldValueOf(await read(created.id), field.id)).toEqual(jasmine.objectContaining({ value: 'https://example.com/b', customLabel: null }));
  });

  describe('refuses, changes nothing and announces nothing', () => {
    it('a location id no location has', async () => {
      const field = await fieldForTheApp();
      resetEvents();
      expect(await refusal(call('updateLocationFieldValueAdvanced', { locationId: ZERO_ID, fieldId: field.id, value: 'https://example.com' }))).toContain(ZERO_ID);
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
    });

    it('a field id no field has', async () => {
      const created = await create('field unknown id');
      const before = await read(created.id);
      resetEvents();
      expect(await refusal(call('updateLocationFieldValueAdvanced', { locationId: created.id, fieldId: UNKNOWN_FIELD_ID, value: 'https://example.com' })))
        .toContain(UNKNOWN_FIELD_ID);
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect(await read(created.id)).toEqual(before);
    });

    it('a call that changes nothing', async () => {
      const field = await fieldForTheApp();
      const created = await create('field nothing by id');
      const before = await read(created.id);
      await expectAsync(call('updateLocationFieldValueAdvanced', { locationId: created.id, fieldId: field.id })).toBeRejected();
      expect(await read(created.id)).toEqual(before);
    });

    it('a value that is not a URL', async () => {
      const field = await fieldForTheApp();
      const created = await create('field bad url by id');
      const before = await read(created.id);
      resetEvents();
      expect(await refusal(call('updateLocationFieldValueAdvanced', { locationId: created.id, fieldId: field.id, value: 'nowhere' }))).toContain('URL');
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect(await read(created.id)).toEqual(before);
    });

    if (contract.host === 'control') {
      it('removing the value of a required field, and a custom label where the field allows none', async () => {
        const created = await create('required field');
        await withTempFields([{ group: 'quickActions', label: unique('required field'), type: 'EMAIL', required: true }], async ([field]) => {
          await call('updateLocationFieldValueAdvanced', { locationId: created.id, fieldId: field.id, value: 'hello@example.com' });
          const before = await read(created.id);
          resetEvents();
          expect(await refusal(call('updateLocationFieldValueAdvanced', { locationId: created.id, fieldId: field.id, value: null }))).toContain(field.label);
          expect(await refusal(call('updateLocationFieldValueAdvanced', { locationId: created.id, fieldId: field.id, value: '' }))).toContain(field.label);
          expect(await refusal(call('updateLocationFieldValueAdvanced', { locationId: created.id, fieldId: field.id, customLabel: 'Mail us' }))).toContain(field.label);
          expect(await refusal(call('updateLocationFieldValueAdvanced', { locationId: created.id, fieldId: field.id, value: 'not an email' }))).toContain('email');
          expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
          expect(await read(created.id)).toEqual(before);
          expect(fieldValueOf(before, field.id).value).toBe('hello@example.com');
        });
      }, 120000);
    }

    const params = ['locationId', 'fieldId'];
    params.forEach((name) => {
      [['without', undefined], ['of null', null], ['empty', ''], ['not text', 5]].forEach(([how, value]) => {
        it(`a ${name} ${how}`, async () => {
          const options = withChange({ locationId: ZERO_ID, fieldId: UNKNOWN_FIELD_ID, value: 'https://example.com' }, { [name]: value });
          expect(await refusal(call('updateLocationFieldValueAdvanced', options))).toContain(name);
        });
      });
    });
  });
});

contract.describe('updateLocationsFieldValueAdvanced', () => {
  beforeEach(answerSideCalls);

  it('sets the value on every location, reports each, and announces each', async () => {
    const field = await fieldForTheApp();
    const first = await create('batch field one');
    const second = await create('batch field two');
    resetEvents();
    const result = await call('updateLocationsFieldValueAdvanced', {
      locations: [
        { locationId: first.id, fieldId: field.id, value: 'https://example.com/one' },
        { locationId: second.id, fieldId: field.id, value: 'example.com/two', customLabel: 'Two' },
      ],
    });
    expect(result).toEqual({
      locations: [
        jasmine.objectContaining({ index: 0, id: first.id, error: null }),
        jasmine.objectContaining({ index: 1, id: second.id, error: null }),
      ],
      succeeded: 2,
      failed: 0,
    });
    const firstAfter = await read(first.id);
    const secondAfter = await read(second.id);
    expect(fieldValueOf(firstAfter, field.id)).toEqual(jasmine.objectContaining({ value: 'https://example.com/one', customLabel: null }));
    expect(fieldValueOf(secondAfter, field.id)).toEqual(jasmine.objectContaining({ value: 'https://example.com/two', customLabel: 'Two' }));
    expect(sent('locationUpdated')).toEqual([updatedEvent(firstAfter), updatedEvent(secondAfter)]);
  });

  describe('refuses the whole list, writes none of it and announces nothing', () => {
    const twoLocations = async () => {
      const field = await fieldForTheApp();
      const first = await create('batch field kept one');
      const second = await create('batch field kept two');
      return [field, first, second, await read(first.id)];
    };

    it('when one entry is invalid, naming the entry', async () => {
      const [field, first, second, firstBefore] = await twoLocations();
      resetEvents();
      const why = await refusal(call('updateLocationsFieldValueAdvanced', {
        locations: [{ locationId: first.id, fieldId: field.id, value: 'https://example.com' }, { locationId: second.id, fieldId: field.id, value: 'not a url' }],
      }));
      expect(why).toContain('entry 1');
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect(await read(first.id)).toEqual(firstBefore);
    });

    it('when an entry changes nothing', async () => {
      const [field, first, second, firstBefore] = await twoLocations();
      await expectAsync(call('updateLocationsFieldValueAdvanced', {
        locations: [{ locationId: first.id, fieldId: field.id, value: 'https://example.com' }, { locationId: second.id, fieldId: field.id }],
      })).toBeRejected();
      expect(await read(first.id)).toEqual(firstBefore);
    });

    it('when a field id matches no field', async () => {
      const [field, first, second, firstBefore] = await twoLocations();
      expect(await refusal(call('updateLocationsFieldValueAdvanced', {
        locations: [{ locationId: first.id, fieldId: field.id, value: 'https://example.com' }, { locationId: second.id, fieldId: UNKNOWN_FIELD_ID, value: 'https://example.com' }],
      }))).toContain(UNKNOWN_FIELD_ID);
      expect(await read(first.id)).toEqual(firstBefore);
    });

    it('when a location id matches no location', async () => {
      const [field, first, , firstBefore] = await twoLocations();
      resetEvents();
      expect(await refusal(call('updateLocationsFieldValueAdvanced', {
        locations: [{ locationId: first.id, fieldId: field.id, value: 'https://example.com' }, { locationId: ZERO_ID, fieldId: field.id, value: 'https://example.com' }],
      }))).toContain(ZERO_ID);
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect(await read(first.id)).toEqual(firstBefore);
    });

    it('when the same location is listed twice', async () => {
      const [field, first, , firstBefore] = await twoLocations();
      await expectAsync(call('updateLocationsFieldValueAdvanced', {
        locations: [{ locationId: first.id, fieldId: field.id, value: 'https://example.com/a' }, { locationId: first.id, fieldId: field.id, value: 'https://example.com/b' }],
      })).toBeRejected();
      expect(await read(first.id)).toEqual(firstBefore);
    });

    it('when an entry has no locationId', async () => {
      const [field, first, , firstBefore] = await twoLocations();
      expect(await refusal(call('updateLocationsFieldValueAdvanced', {
        locations: [{ locationId: first.id, fieldId: field.id, value: 'https://example.com' }, { fieldId: field.id, value: 'https://example.com' }],
      }))).toContain('locationId');
      expect(await read(first.id)).toEqual(firstBefore);
    });

    it('when an entry has no fieldId', async () => {
      const [field, first, second, firstBefore] = await twoLocations();
      expect(await refusal(call('updateLocationsFieldValueAdvanced', {
        locations: [{ locationId: first.id, fieldId: field.id, value: 'https://example.com' }, { locationId: second.id, value: 'https://example.com' }],
      }))).toContain('fieldId');
      expect(await read(first.id)).toEqual(firstBefore);
    });

    it('when an entry is not an object', async () => {
      const [field, first, , firstBefore] = await twoLocations();
      await expectAsync(call('updateLocationsFieldValueAdvanced', {
        locations: [{ locationId: first.id, fieldId: field.id, value: 'https://example.com' }, 'https://example.com'],
      })).toBeRejected();
      expect(await read(first.id)).toEqual(firstBefore);
    });

    it('when it is empty', async () => {
      expect(await refusal(call('updateLocationsFieldValueAdvanced', { locations: [] }))).toContain('locations');
    });

    it('when it holds more than 50 entries', async () => {
      const field = await fieldForTheApp();
      const created = await create('batch field too many');
      const before = await read(created.id);
      const locations = [{ locationId: created.id, fieldId: field.id, value: 'https://example.com' }]
        .concat(Array.from({ length: 50 }, (value, index) => ({
          locationId: `${ZERO_ID.slice(0, 22)}${String(index).padStart(2, '0')}`, fieldId: field.id, value: 'https://example.com',
        })));
      resetEvents();
      expect(await refusal(call('updateLocationsFieldValueAdvanced', { locations }))).toContain('locations');
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      expect(await read(created.id)).toEqual(before);
    });

    it('without a list', async () => {
      expect(await refusal(call('updateLocationsFieldValueAdvanced', {}))).toContain('locations');
    });

    it('a list of null', async () => {
      expect(await refusal(call('updateLocationsFieldValueAdvanced', { locations: null }))).toContain('locations');
    });
  });
});
