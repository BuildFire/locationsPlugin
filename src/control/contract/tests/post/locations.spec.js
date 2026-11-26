// locations: every operation on locations and the values of their extra fields, one block each, after the helpers they share.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// How a call was refused: its code (ContractOperationInvokeError.CODES) and its reason; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => { fail('expected the call to be refused'); return {}; },
  (error) => ({ code: (error && error.code) || 'unknown', reason: reason(error) }));
// What a refusal is expected to be: its code, and a reason naming the text given.
const refused = (code, text) => ({ code, reason: jasmine.stringContaining(text) });
// Each required parameter left out, empty or nothing is refused, naming it, before anything is looked up or written.
const refusesEachRequired = async (operation, valid, names) => {
  for (const name of names) {
    for (const value of [undefined, null, '']) {
      expect(await refusal(call(operation, { ...valid, [name]: value }))).withContext(`${name}: ${value}`).toEqual(refused('validation', name));
    }
  }
};
const unique = (label) => `Post ${label} (${contract.host}) ${Date.now()}`;

const IMAGE = 'https://example.com/location-list.png';
// A location's required details, with a title only this spec uses.
const place = (title, extra = {}) => ({
  title, address: '1 Market St, San Diego', latitude: 32.7157, longitude: -117.1611, listImage: [IMAGE], description: '<p>A place to visit</p>', ...extra,
});
const create = (label, extra) => call('createLocation', place(unique(label), extra));
// What the contract's own read finds by that title.
const found = async (title) => (await call('searchLocations', { title })).locations;
const removeAll = (locations) => call('deleteLocationsAdvanced', { locations: locations.map(({ id }) => ({ locationId: id })) });
const pinnedCount = async () => (await call('searchLocations', { pinnedOnly: true })).total;

// Calls nothing here answers. The operations never wait for them: the spies only answer, but for the events they fire.
const answer = (object, method) => {
  if (object && typeof object[method] === 'function') {
    spyOn(object, method).and.callFake((...args) => {
      const callback = args.find((arg) => typeof arg === 'function');
      if (callback) callback(null, {});
    });
  }
};
const quiet = () => {
  answer(buildfire.messaging, 'sendMessageToWidget');
  answer(buildfire.analytics, 'registerEvent');
  answer(buildfire.deeplink, 'registerDeeplink');
  answer(buildfire.deeplink, 'unregisterDeeplink');
  spyOn(buildfire.services.contract.events, 'send').and.callFake((eventName, data, callback) => callback && callback(null, []));
};
const sent = () => buildfire.services.contract.events.send.calls.allArgs().map((args) => args.slice(0, 2));

// Only the control panel makes categories and location fields, and its run comes first: it makes these once, and the app's run finds them.
const forTheApp = { category: 'Post category for the app', subcategory: 'Post subcategory for the app', text: 'Post field for the app', website: 'Post website for the app' };
let madeCategory;
const categoryForTheApp = () => {
  madeCategory = madeCategory || (contract.host === 'control'
    ? call('createCategory', { title: forTheApp.category, subcategories: forTheApp.subcategory })
    : call('searchCategories', { title: forTheApp.category }).then(({ result }) => (result[0]
      ? { id: result[0].id, title: forTheApp.category, subcategories: result[0].data.subcategories }
      : Promise.reject(new Error(`no category named "${forTheApp.category}": the control run makes it`)))));
  return madeCategory;
};
let madeFields;
const fieldsForTheApp = () => {
  madeFields = madeFields || (contract.host === 'control'
    ? call('createLocationField', { label: forTheApp.text, section: 'content', type: 'TEXT', allowCustomLabel: true })
      .then((text) => call('createLocationField', { label: forTheApp.website, section: 'quickActions', type: 'URL', required: true })
        .then((website) => ({ text, website })))
    : call('getSettings', {}).then(({ locationFields }) => {
      const text = locationFields.find((field) => field.label === forTheApp.text);
      const website = locationFields.find((field) => field.label === forTheApp.website);
      return text && website ? { text, website } : Promise.reject(new Error('no location fields for the app: the control run makes them'));
    }));
  return madeFields;
};

contract.describe('searchLocations', () => {
  const stamp = `(${contract.host}) ${Date.now()}`;
  const word = `postword${contract.host}${Date.now()}`;
  const alpha = `Post search alpha ${stamp}`;
  const beta = `Post search beta ${stamp}`;
  const titles = (result) => result.locations.map((location) => location.title);
  let made = [];

  beforeAll(async () => {
    const category = await categoryForTheApp();
    made = [
      await call('createLocation', place(alpha, { subtitle: word, categories: `${category.title} -> ${forTheApp.subcategory}` })),
      await call('createLocation', place(beta, { subtitle: word })),
    ];
  }, 120000);
  beforeEach(quiet);

  it('finds a location by its exact title, with its details', async () => {
    expect(await call('searchLocations', { title: alpha })).toEqual(jasmine.objectContaining({
      locations: [jasmine.objectContaining({
        id: made[0].id, title: alpha, subtitle: word, address: '1 Market St, San Diego', latitude: 32.7157, longitude: -117.1611, listImage: IMAGE, categoryTitles: [forTheApp.category], subcategoryTitles: [forTheApp.subcategory],
      })],
      total: 1,
      page: 0,
      hasMore: false,
    }));
  });

  it('finds the locations whose name, subtitle or address holds the text, by name', async () => {
    expect(titles(await call('searchLocations', { searchText: word }))).toEqual([alpha, beta]);
  });

  it('sorts them newest first', async () => {
    expect(titles(await call('searchLocations', { searchText: word, sortBy: 'newest' }))).toEqual([beta, alpha]);
  });

  it('narrows to a category, and to a subcategory within it', async () => {
    expect(titles(await call('searchLocations', { searchText: word, category: forTheApp.category }))).toEqual([alpha]);
    expect(titles(await call('searchLocations', { searchText: word, category: forTheApp.category, subcategory: forTheApp.subcategory }))).toEqual([alpha]);
  });

  it('pages through them', async () => {
    expect(await call('searchLocations', { searchText: word, pageSize: 1 })).toEqual(jasmine.objectContaining({ locations: [jasmine.objectContaining({ title: alpha })], total: 2, page: 0, hasMore: true }));
    expect(await call('searchLocations', { searchText: word, pageSize: 1, page: 1 })).toEqual(jasmine.objectContaining({ locations: [jasmine.objectContaining({ title: beta })], total: 2, page: 1, hasMore: false }));
  });

  it('shows every location, a page of up to 50, when nothing narrows it', async () => {
    const result = await call('searchLocations', {});
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.locations.length).toBe(Math.min(result.total, 50));
  });

  it('shows only the pinned locations, in their pinned order', async () => {
    const pinned = await create('pinned search', { pinned: true });
    try {
      const result = await call('searchLocations', { pinnedOnly: true });
      expect(result.locations).toContain(jasmine.objectContaining({ id: pinned.id, pinned: true }));
      expect(result.locations.every((location) => location.pinned)).toBe(true);
      const positions = result.locations.map((location) => location.pinPosition);
      expect(positions).toEqual(positions.slice().sort());
    } finally {
      await call('deleteLocationAdvanced', { locationId: pinned.id });
    }
  });

  it('finds nothing for a title no location has', async () => {
    expect(await call('searchLocations', { title: unique('no such location') })).toEqual(jasmine.objectContaining({ locations: [], total: 0, hasMore: false }));
  });

  describe('refuses', () => {
    it('a category no category has', async () => {
      const category = unique('missing category');
      expect(await refusal(call('searchLocations', { category }))).toEqual(refused('notFound', category));
    });

    it('a subcategory without its category', async () => {
      expect(await refusal(call('searchLocations', { subcategory: forTheApp.subcategory }))).toEqual(refused('validation', 'subcategory'));
    });

    it('an order it does not offer', async () => {
      expect(await refusal(call('searchLocations', { sortBy: 'distance' }))).toEqual(refused('validation', 'sortBy'));
    });

    it('a page size above 50, or a page that is not a whole number', async () => {
      expect(await refusal(call('searchLocations', { pageSize: 51 }))).toEqual(refused('validation', 'pageSize'));
      expect(await refusal(call('searchLocations', { page: -1 }))).toEqual(refused('validation', 'page'));
      expect(await refusal(call('searchLocations', { page: 1.5 }))).toEqual(refused('validation', 'page'));
    });

    it('a title that is not text', async () => {
      expect(await refusal(call('searchLocations', { title: 12 }))).toEqual(refused('validation', 'title'));
    });
  });
});

contract.describe('getLocation', () => {
  beforeEach(quiet);

  it("shows a location found by its title, with the plugin's defaults for what was left out", async () => {
    const made = await create('get');
    expect(await call('getLocation', { title: made.title })).toEqual(jasmine.objectContaining({
      id: made.id,
      title: made.title,
      address: '1 Market St, San Diego',
      formattedAddress: '1 Market St, San Diego',
      listImage: IMAGE,
      description: '<p>A place to visit</p>',
      images: [],
      categories: '',
      markerType: 'pin',
      showCategory: true,
      showOpeningHours: false,
      priceRange: 1,
      priceCurrency: '$',
      pinned: false,
      openingHours: jasmine.objectContaining({ monday: '08:00-20:00', sunday: '08:00-20:00' }),
      actionItems: [],
      rating: { average: 0, count: 0 },
      views: 0,
    }));
  });

  it('refuses a title no location has', async () => {
    const title = unique('missing');
    expect(await refusal(call('getLocation', { title }))).toEqual(refused('notFound', title));
  });

  it('refuses a title two locations share, saying how many', async () => {
    const title = unique('shared get');
    await call('createLocation', place(title));
    await call('createLocation', place(title));
    const { code, reason: why } = await refusal(call('getLocation', { title }));
    expect(code).toBe('conflict');
    expect(why.replace(title, '')).toContain('2');
  });

  it('refuses without a title, or with an empty one', async () => {
    expect(await refusal(call('getLocation', {}))).toEqual(refused('validation', 'title'));
    expect(await refusal(call('getLocation', { title: '' }))).toEqual(refused('validation', 'title'));
    expect(await refusal(call('getLocation', { title: null }))).toEqual(refused('validation', 'title'));
  });
});

contract.describe('getLocationAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('getLocationAdvanced', { locationId: '000000000000000000000000' }, ['locationId']));

  it("shows a location by its id", async () => {
    const made = await create('get by id');
    expect(await call('getLocationAdvanced', { locationId: made.id })).toEqual(jasmine.objectContaining({ id: made.id, title: made.title, listImage: IMAGE }));
  });

  it('refuses an id no location has', async () => {
    expect(await refusal(call('getLocationAdvanced', { locationId: '000000000000000000000000' }))).toEqual(refused('notFound', '000000000000000000000000'));
  });

  it('refuses without an id', async () => {
    expect(await refusal(call('getLocationAdvanced', {}))).toEqual(refused('validation', 'locationId'));
  });
});

contract.describe('createLocation', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('createLocation', place('Post required'), ['title', 'address', 'latitude', 'longitude', 'listImage', 'description']), 120000);

  it('adds a location from its required details, returns it and announces it', async () => {
    const title = unique('create');
    const made = await call('createLocation', place(title));
    expect(made).toEqual(jasmine.objectContaining({
      id: jasmine.any(String), title, address: '1 Market St, San Diego', latitude: 32.7157, longitude: -117.1611, listImage: IMAGE, description: '<p>A place to visit</p>', pinned: false,
    }));
    expect(await found(title)).toEqual([jasmine.objectContaining({ id: made.id, title })]);
    expect(sent()).toContain(['locationCreated', jasmine.objectContaining({ locationId: made.id, title, address: '1 Market St, San Diego', listImage: IMAGE })]);
  });

  it('adds a location with every detail', async () => {
    const category = await categoryForTheApp();
    const title = unique('every detail');
    const actionItems = [{ title: 'Call us', action: 'callNumber', phoneNumber: '+15550100' }];
    const made = await call('createLocation', place(title, {
      subtitle: 'Fresh food',
      formattedAddress: '1 Market St, San Diego, CA 92101, USA',
      addressAlias: 'The market',
      images: ['https://example.com/one.png', 'https://example.com/two.png'],
      categories: `${category.title} -> ${forTheApp.subcategory}`,
      markerType: 'circle',
      markerColor: 'rgba(0,128,255,1)',
      showCategory: false,
      showOpeningHours: true,
      showPriceRange: true,
      showStarRating: true,
      priceRange: 3,
      priceCurrency: '€',
      actionItems,
      pinned: false,
      mondayHours: '09:00-12:00, 13:00-17:00',
      tuesdayHours: '08:00-20:00',
      wednesdayHours: '08:00-20:00',
      thursdayHours: '08:00-20:00',
      fridayHours: '08:00-22:00',
      saturdayHours: '10:00-14:00',
      sundayHours: 'closed',
    }));
    const expected = jasmine.objectContaining({
      title,
      subtitle: 'Fresh food',
      formattedAddress: '1 Market St, San Diego, CA 92101, USA',
      addressAlias: 'The market',
      images: ['https://example.com/one.png', 'https://example.com/two.png'],
      categories: `${category.title} -> ${forTheApp.subcategory}`,
      categoryTitles: [category.title],
      subcategoryTitles: [forTheApp.subcategory],
      markerType: 'circle',
      markerColor: 'rgba(0,128,255,1)',
      showCategory: false,
      showOpeningHours: true,
      showPriceRange: true,
      showStarRating: true,
      priceRange: 3,
      priceCurrency: '€',
      actionItems: [jasmine.objectContaining(actionItems[0])],
      openingHours: jasmine.objectContaining({ monday: '09:00-12:00, 13:00-17:00', friday: '08:00-22:00', saturday: '10:00-14:00', sunday: 'closed' }),
    });
    expect(made).toEqual(expected);
    expect(await call('getLocation', { title })).toEqual(expected);
  });

  it('marks it on the map with a picture', async () => {
    const made = await create('image marker', { markerType: 'image', markerImage: ['https://example.com/marker.png'] });
    expect(made).toEqual(jasmine.objectContaining({ markerType: 'image', markerImage: 'https://example.com/marker.png' }));
  });

  it('still takes a single picture that is not in a list', async () => {
    const made = await create('single image', { listImage: 'https://example.com/single.png' });
    expect((await call('getLocationAdvanced', { locationId: made.id })).listImage).toBe('https://example.com/single.png');
  });

  it('pins it after the pinned locations, and refuses a fourth pin', async () => {
    const pinned = [];
    try {
      while (await pinnedCount() < 3) pinned.push(await create(`pin ${pinned.length}`, { pinned: true }));
      expect(pinned.length).toBeGreaterThan(0);
      expect(pinned[pinned.length - 1]).toEqual(jasmine.objectContaining({ pinned: true, pinPosition: 3 }));
      const title = unique('fourth pin');
      expect((await refusal(call('createLocation', place(title, { pinned: true })))).code).toBe('limitExceeded');
      expect(await found(title)).toEqual([]);
    } finally {
      if (pinned.length) await removeAll(pinned);
    }
  }, 120000);

  describe('refuses, adds nothing and announces nothing', () => {
    const refusesWith = async (label, extra, code, text) => {
      const title = unique(label);
      buildfire.services.contract.events.send.calls.reset();
      expect(await refusal(call('createLocation', { ...place(title), ...extra }))).toEqual(refused(code, text));
      expect(await found(title)).toEqual([]);
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
    };

    it('without a title, or with an empty one', async () => {
      expect(await refusal(call('createLocation', { ...place('x'), title: undefined }))).toEqual(refused('validation', 'title'));
      expect(await refusal(call('createLocation', { ...place('x'), title: '' }))).toEqual(refused('validation', 'title'));
      expect(await refusal(call('createLocation', { ...place('x'), title: null }))).toEqual(refused('validation', 'title'));
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
    });

    it('without an address', () => refusesWith('no address', { address: undefined }, 'validation', 'address'));
    it('without a description', () => refusesWith('no description', { description: '' }, 'validation', 'description'));
    it('with a latitude off the map', () => refusesWith('latitude', { latitude: 91 }, 'validation', 'latitude'));
    it('with a longitude that is not a number', () => refusesWith('longitude', { longitude: 'east' }, 'validation', 'longitude'));
    it('without its list picture', () => refusesWith('no list image', { listImage: [] }, 'validation', 'listImage'));
    it('with two list pictures', () => refusesWith('two list images', { listImage: ['https://example.com/a.png', 'https://example.com/b.png'] }, 'validation', 'listImage'));
    it('with a marker type it does not offer', () => refusesWith('marker type', { markerType: 'star' }, 'validation', 'markerType'));
    it('with an image marker but no marker picture', () => refusesWith('marker image', { markerType: 'image' }, 'validation', 'marker image'));
    it('with a marker color that is not a color', () => refusesWith('marker color', { markerColor: 'red' }, 'validation', 'markerColor'));
    it('with a price range it does not offer', () => refusesWith('price range', { priceRange: 5 }, 'validation', 'priceRange'));
    it('with a currency it does not offer', () => refusesWith('currency', { priceCurrency: '£' }, 'validation', 'priceCurrency'));
    it('with hours that are not times', () => refusesWith('hours', { mondayHours: 'noon' }, 'validation', 'mondayHours'));
    it('with hours ending before they start', () => refusesWith('backward hours', { tuesdayHours: '20:00-08:00' }, 'validation', 'tuesdayHours'));
    it('with a button that does nothing it knows', () => refusesWith('action', { actionItems: [{ title: 'Call us' }] }, 'validation', 'actionItems'));
    it('with a category no category has', async () => {
      const category = unique('missing category');
      await refusesWith('missing category', { categories: category }, 'notFound', category);
    });
  });
});

contract.describe('createLocationsAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('createLocationsAdvanced', {}, ['locations']));

  it('adds every location, and reports each', async () => {
    const titles = [unique('batch one'), unique('batch two')];
    const result = await call('createLocationsAdvanced', { locations: [place(titles[0]), place(titles[1], { priceRange: 2 })] });
    expect(result).toEqual({
      locations: [jasmine.objectContaining({ index: 0, id: jasmine.any(String) }), jasmine.objectContaining({ index: 1, id: jasmine.any(String) })],
      succeeded: 2,
      failed: 0,
    });
    expect(await found(titles[0])).toEqual([jasmine.objectContaining({ id: result.locations[0].id })]);
    expect(await found(titles[1])).toEqual([jasmine.objectContaining({ id: result.locations[1].id, priceRange: 2 })]);
    expect(sent()).toContain(['locationCreated', jasmine.objectContaining({ locationId: result.locations[1].id, title: titles[1] })]);
  });

  describe('refuses the whole list, and adds none of it', () => {
    it('when one entry is invalid', async () => {
      const valid = unique('valid entry');
      expect(await refusal(call('createLocationsAdvanced', { locations: [place(valid), place(unique('invalid entry'), { priceRange: 9 })] }))).toEqual(refused('validation', 'priceRange'));
      expect(await found(valid)).toEqual([]);
    });

    it('when an entry names a category no category has', async () => {
      const valid = unique('valid with missing');
      const category = unique('missing category');
      expect(await refusal(call('createLocationsAdvanced', { locations: [place(valid), place(unique('missing'), { categories: category })] }))).toEqual(refused('notFound', category));
      expect(await found(valid)).toEqual([]);
    });

    it('when it is empty', async () => {
      expect(await refusal(call('createLocationsAdvanced', { locations: [] }))).toEqual(refused('validation', 'locations'));
    });

    it('when it holds more than 50 entries', async () => {
      const locations = Array.from({ length: 51 }, (value, index) => place(unique(`entry ${index}`)));
      expect(await refusal(call('createLocationsAdvanced', { locations }))).toEqual(refused('validation', 'locations'));
      expect(await found(locations[0].title)).toEqual([]);
    });

    it('when it would pin more than three locations', async () => {
      const locations = [0, 1, 2, 3].map((index) => place(unique(`over pinned ${index}`), { pinned: true }));
      expect((await refusal(call('createLocationsAdvanced', { locations }))).code).toBe('limitExceeded');
      expect(await found(locations[0].title)).toEqual([]);
    });
  });
});

contract.describe('updateLocation', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateLocation', { title: 'Post required', newSubtitle: 'x' }, ['title']));

  it('changes only what it is given, returns the location and announces it', async () => {
    const made = await create('update', { subtitle: 'Before' });
    buildfire.services.contract.events.send.calls.reset();
    const result = await call('updateLocation', { title: made.title, newDescription: '<p>Changed</p>', newPriceRange: 4 });
    expect(result).toEqual(jasmine.objectContaining({
      id: made.id, title: made.title, subtitle: 'Before', description: '<p>Changed</p>', priceRange: 4, listImage: IMAGE,
    }));
    expect(await call('getLocation', { title: made.title })).toEqual(jasmine.objectContaining({ subtitle: 'Before', description: '<p>Changed</p>', priceRange: 4 }));
    expect(sent()).toEqual([['locationUpdated', jasmine.objectContaining({ locationId: made.id, title: made.title, previousTitle: made.title })]]);
  });

  it('renames it', async () => {
    const made = await create('rename');
    await call('updateLocation', { title: made.title, newTitle: `${made.title} renamed` });
    expect(await found(made.title)).toEqual([]);
    expect(await found(`${made.title} renamed`)).toEqual([jasmine.objectContaining({ id: made.id })]);
  });

  it('removes the subtitle with an empty value, and the address name with nothing', async () => {
    const made = await create('clear', { subtitle: 'Something', addressAlias: 'The spot' });
    await call('updateLocation', { title: made.title, newSubtitle: '', newAddressAlias: null });
    expect(await call('getLocation', { title: made.title })).toEqual(jasmine.objectContaining({ subtitle: null, addressAlias: null }));
  });

  it('replaces its pictures, buttons and hours, and moves it on the map', async () => {
    const made = await create('replace', { images: ['https://example.com/old.png'] });
    const actionItems = [{ title: 'Website', action: 'linkToWeb', url: 'https://example.com' }];
    const result = await call('updateLocation', {
      title: made.title, newImages: ['https://example.com/new.png'], newActionItems: actionItems, newSundayHours: 'closed', newLatitude: 40.7128, newLongitude: -74.006, newListImage: 'https://example.com/new-list.png',
    });
    expect(result).toEqual(jasmine.objectContaining({
      images: ['https://example.com/new.png'], actionItems: [jasmine.objectContaining(actionItems[0])], latitude: 40.7128, longitude: -74.006, listImage: 'https://example.com/new-list.png', openingHours: jasmine.objectContaining({ sunday: 'closed', monday: '08:00-20:00' }),
    }));
    await call('updateLocation', { title: made.title, newImages: [], newActionItems: null });
    expect(await call('getLocation', { title: made.title })).toEqual(jasmine.objectContaining({ images: [], actionItems: [] }));
  });

  it('puts it in a category, and takes it out again', async () => {
    const category = await categoryForTheApp();
    const made = await create('categorize');
    expect(await call('updateLocation', { title: made.title, newCategories: category.title })).toEqual(jasmine.objectContaining({ categoryTitles: [category.title] }));
    expect(await call('updateLocation', { title: made.title, newCategories: null })).toEqual(jasmine.objectContaining({ categoryTitles: [], categories: '' }));
  });

  it('pins it, and unpins it', async () => {
    const made = await create('pin update');
    try {
      expect(await call('updateLocation', { title: made.title, newPinned: true })).toEqual(jasmine.objectContaining({ pinned: true, pinPosition: jasmine.any(Number) }));
      expect(await call('updateLocation', { title: made.title, newPinned: false })).toEqual(jasmine.objectContaining({ pinned: false, pinPosition: null }));
    } finally {
      await call('updateLocation', { title: made.title, newPinned: false });
    }
  });

  describe('refuses, and changes nothing', () => {
    it('a title no location has', async () => {
      const title = unique('missing');
      expect(await refusal(call('updateLocation', { title, newSubtitle: 'x' }))).toEqual(refused('notFound', title));
    });

    it('a title two locations share, saying how many', async () => {
      const title = unique('shared update');
      await call('createLocation', place(title));
      await call('createLocation', place(title));
      buildfire.services.contract.events.send.calls.reset();
      const { code, reason: why } = await refusal(call('updateLocation', { title, newSubtitle: 'x' }));
      expect(code).toBe('conflict');
      expect(why.replace(title, '')).toContain('2');
      expect((await found(title)).map((location) => location.subtitle)).toEqual([null, null]);
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
    });

    it('removing the title or the list picture', async () => {
      const made = await create('keep');
      expect(await refusal(call('updateLocation', { title: made.title, newTitle: null }))).toEqual(refused('validation', 'newTitle'));
      expect(await refusal(call('updateLocation', { title: made.title, newListImage: [] }))).toEqual(refused('validation', 'newListImage'));
      expect(await call('getLocation', { title: made.title })).toEqual(jasmine.objectContaining({ title: made.title, listImage: IMAGE }));
    });

    it('a value it does not offer', async () => {
      const made = await create('bad value');
      expect(await refusal(call('updateLocation', { title: made.title, newMarkerType: 'star' }))).toEqual(refused('validation', 'newMarkerType'));
      expect(await refusal(call('updateLocation', { title: made.title, newLatitude: -91 }))).toEqual(refused('validation', 'newLatitude'));
      expect((await call('getLocation', { title: made.title })).markerType).toBe('pin');
    });

    it('a call that changes nothing', async () => {
      const made = await create('nothing');
      expect((await refusal(call('updateLocation', { title: made.title }))).code).toBe('validation');
    });

    it('without a title', async () => {
      expect(await refusal(call('updateLocation', { newSubtitle: 'x' }))).toEqual(refused('validation', 'title'));
    });
  });
});

contract.describe('updateLocationAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateLocationAdvanced', { locationId: '000000000000000000000000', newSubtitle: 'x' }, ['locationId']));

  it('changes the location with that id', async () => {
    const made = await create('update by id');
    expect(await call('updateLocationAdvanced', { locationId: made.id, newSubtitle: 'By id', newShowStarRating: true })).toEqual(jasmine.objectContaining({ id: made.id, subtitle: 'By id', showStarRating: true }));
    expect(await call('getLocationAdvanced', { locationId: made.id })).toEqual(jasmine.objectContaining({ subtitle: 'By id', showStarRating: true }));
    expect(sent()).toContain(['locationUpdated', jasmine.objectContaining({ locationId: made.id })]);
  });

  it('refuses an id no location has', async () => {
    expect(await refusal(call('updateLocationAdvanced', { locationId: '000000000000000000000000', newSubtitle: 'x' }))).toEqual(refused('notFound', '000000000000000000000000'));
  });

  it('refuses without an id, or with nothing to change', async () => {
    expect(await refusal(call('updateLocationAdvanced', { newSubtitle: 'x' }))).toEqual(refused('validation', 'locationId'));
    const made = await create('nothing by id');
    expect((await refusal(call('updateLocationAdvanced', { locationId: made.id }))).code).toBe('validation');
  });
});

contract.describe('updateLocationsAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateLocationsAdvanced', {}, ['locations']));

  it('changes every location, and reports each', async () => {
    const one = await create('batch update one');
    const two = await create('batch update two');
    expect(await call('updateLocationsAdvanced', { locations: [{ locationId: one.id, newSubtitle: 'First' }, { locationId: two.id, newPriceRange: 2, newSubtitle: null }] })).toEqual({
      locations: [jasmine.objectContaining({ index: 0, id: one.id }), jasmine.objectContaining({ index: 1, id: two.id })], succeeded: 2, failed: 0,
    });
    expect(await call('getLocationAdvanced', { locationId: one.id })).toEqual(jasmine.objectContaining({ subtitle: 'First', priceRange: 1 }));
    expect(await call('getLocationAdvanced', { locationId: two.id })).toEqual(jasmine.objectContaining({ subtitle: null, priceRange: 2 }));
  });

  describe('refuses the whole list, and changes none of it', () => {
    it('when one id matches no location', async () => {
      const made = await create('batch unknown');
      expect(await refusal(call('updateLocationsAdvanced', { locations: [{ locationId: made.id, newSubtitle: 'x' }, { locationId: '000000000000000000000000', newSubtitle: 'x' }] }))).toEqual(refused('notFound', '000000000000000000000000'));
      expect((await call('getLocationAdvanced', { locationId: made.id })).subtitle).toBeNull();
    });

    it('when one entry is invalid', async () => {
      const made = await create('batch invalid');
      expect(await refusal(call('updateLocationsAdvanced', { locations: [{ locationId: made.id, newSubtitle: 'x' }, { locationId: made.id }] }))).toEqual(refused('validation', 'entry 1'));
      expect((await call('getLocationAdvanced', { locationId: made.id })).subtitle).toBeNull();
    });

    it('when the same location is listed twice', async () => {
      const made = await create('batch twice');
      expect((await refusal(call('updateLocationsAdvanced', { locations: [{ locationId: made.id, newSubtitle: 'x' }, { locationId: made.id, newSubtitle: 'y' }] }))).code).toBe('validation');
      expect((await call('getLocationAdvanced', { locationId: made.id })).subtitle).toBeNull();
    });

    it('when it is empty', async () => {
      expect(await refusal(call('updateLocationsAdvanced', { locations: [] }))).toEqual(refused('validation', 'locations'));
    });
  });
});

contract.describe('deleteLocation', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('deleteLocation', { title: 'Post required' }, ['title']));

  it('removes the location with that title, and announces it', async () => {
    const made = await create('delete');
    buildfire.services.contract.events.send.calls.reset();
    expect(await call('deleteLocation', { title: made.title })).toEqual({ id: made.id, title: made.title });
    expect(await found(made.title)).toEqual([]);
    expect(sent()).toEqual([['locationDeleted', jasmine.objectContaining({ locationId: made.id, title: made.title })]]);
  });

  it('leaves every other location alone', async () => {
    const kept = await create('kept');
    const gone = await create('gone');
    await call('deleteLocation', { title: gone.title });
    expect(await found(kept.title)).toEqual([jasmine.objectContaining({ id: kept.id })]);
  });

  it('refuses a title no location has', async () => {
    const title = unique('missing');
    expect(await refusal(call('deleteLocation', { title }))).toEqual(refused('notFound', title));
    expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
  });

  it('refuses a title two locations share, and removes neither', async () => {
    const title = unique('shared delete');
    await call('createLocation', place(title));
    await call('createLocation', place(title));
    const { code, reason: why } = await refusal(call('deleteLocation', { title }));
    expect(code).toBe('conflict');
    expect(why.replace(title, '')).toContain('2');
    expect((await found(title)).length).toBe(2);
  });

  it('refuses without a title', async () => {
    expect(await refusal(call('deleteLocation', {}))).toEqual(refused('validation', 'title'));
  });
});

contract.describe('deleteLocationAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('deleteLocationAdvanced', { locationId: '000000000000000000000000' }, ['locationId']));

  it('removes the location with that id', async () => {
    const made = await create('delete by id');
    expect(await call('deleteLocationAdvanced', { locationId: made.id })).toEqual({ id: made.id, title: made.title });
    expect(await found(made.title)).toEqual([]);
    expect(sent()).toContain(['locationDeleted', jasmine.objectContaining({ locationId: made.id })]);
  });

  it('refuses an id no location has', async () => {
    expect(await refusal(call('deleteLocationAdvanced', { locationId: '000000000000000000000000' }))).toEqual(refused('notFound', '000000000000000000000000'));
  });

  it('refuses without an id', async () => {
    expect(await refusal(call('deleteLocationAdvanced', {}))).toEqual(refused('validation', 'locationId'));
  });
});

contract.describe('deleteLocationsAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('deleteLocationsAdvanced', {}, ['locations']));

  it('removes every location, and reports each', async () => {
    const one = await create('batch delete one');
    const two = await create('batch delete two');
    expect(await call('deleteLocationsAdvanced', { locations: [{ locationId: one.id }, { locationId: two.id }] })).toEqual({
      locations: [jasmine.objectContaining({ index: 0, id: one.id }), jasmine.objectContaining({ index: 1, id: two.id })], succeeded: 2, failed: 0,
    });
    expect(await found(one.title)).toEqual([]);
    expect(await found(two.title)).toEqual([]);
  });

  describe('refuses the whole list, and removes none of it', () => {
    it('when one id matches no location', async () => {
      const made = await create('batch delete unknown');
      expect(await refusal(call('deleteLocationsAdvanced', { locations: [{ locationId: made.id }, { locationId: '000000000000000000000000' }] }))).toEqual(refused('notFound', '000000000000000000000000'));
      expect(await found(made.title)).toEqual([jasmine.objectContaining({ id: made.id })]);
    });

    it('when the same location is listed twice', async () => {
      const made = await create('batch delete twice');
      expect((await refusal(call('deleteLocationsAdvanced', { locations: [{ locationId: made.id }, { locationId: made.id }] }))).code).toBe('validation');
      expect(await found(made.title)).toEqual([jasmine.objectContaining({ id: made.id })]);
    });

    it('when an entry has no id, or the list is empty', async () => {
      expect(await refusal(call('deleteLocationsAdvanced', { locations: [{}] }))).toEqual(refused('validation', 'locationId'));
      expect(await refusal(call('deleteLocationsAdvanced', { locations: [] }))).toEqual(refused('validation', 'locations'));
    });
  });
});

// controlBackground only: the control panel reorders the pinned locations.
contract.describe('updatePinnedLocationOrder', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updatePinnedLocationOrder', { title: 'Post required', position: 1 }, ['title', 'position']));

  it('moves a pinned location to another place, renumbering the others', async () => {
    expect(await pinnedCount()).toBeLessThan(2);
    const first = await create('pin first', { pinned: true });
    const second = await create('pin second', { pinned: true });
    try {
      const { locations } = await call('updatePinnedLocationOrder', { title: second.title, position: 1 });
      const order = locations.map((location) => location.id);
      expect(order.indexOf(second.id)).toBe(0);
      expect(order.indexOf(first.id)).toBeGreaterThan(0);
      expect(locations.map((location) => location.pinPosition)).toEqual(locations.map((location, index) => index + 1));
      expect((await call('getLocation', { title: second.title })).pinPosition).toBe(1);
    } finally {
      await removeAll([first, second]);
    }
  }, 120000);

  describe('refuses', () => {
    it('a location that is not pinned', async () => {
      const made = await create('not pinned');
      expect(await refusal(call('updatePinnedLocationOrder', { title: made.title, position: 1 }))).toEqual(refused('conflict', 'not pinned'));
    });

    it('a place outside the three pins, or past the pinned ones', async () => {
      const made = await create('pin place', { pinned: true });
      try {
        expect(await refusal(call('updatePinnedLocationOrder', { title: made.title, position: 4 }))).toEqual(refused('validation', 'position'));
        expect(await refusal(call('updatePinnedLocationOrder', { title: made.title, position: 0 }))).toEqual(refused('validation', 'position'));
        const pinned = await pinnedCount();
        if (pinned < 3) expect(await refusal(call('updatePinnedLocationOrder', { title: made.title, position: pinned + 1 }))).toEqual(refused('validation', 'position'));
      } finally {
        await removeAll([made]);
      }
    });

    it('a title no location has', async () => {
      const title = unique('missing');
      expect(await refusal(call('updatePinnedLocationOrder', { title, position: 1 }))).toEqual(refused('notFound', title));
    });

    it('without a title or a place', async () => {
      expect(await refusal(call('updatePinnedLocationOrder', { position: 1 }))).toEqual(refused('validation', 'title'));
      expect(await refusal(call('updatePinnedLocationOrder', { title: unique('no place') }))).toEqual(refused('validation', 'position'));
    });
  });
});

contract.describe('updatePinnedLocationOrderAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updatePinnedLocationOrderAdvanced', { locationId: '000000000000000000000000', position: 1 }, ['locationId', 'position']));

  it('moves the pinned location with that id', async () => {
    const made = await create('pin by id', { pinned: true });
    try {
      const { locations } = await call('updatePinnedLocationOrderAdvanced', { locationId: made.id, position: 1 });
      expect(locations[0]).toEqual(jasmine.objectContaining({ id: made.id, title: made.title, pinPosition: 1 }));
    } finally {
      await removeAll([made]);
    }
  });

  it('refuses an id no location has', async () => {
    expect(await refusal(call('updatePinnedLocationOrderAdvanced', { locationId: '000000000000000000000000', position: 1 }))).toEqual(refused('notFound', '000000000000000000000000'));
  });

  it('refuses without an id', async () => {
    expect(await refusal(call('updatePinnedLocationOrderAdvanced', { position: 1 }))).toEqual(refused('validation', 'locationId'));
  });
});

contract.describe('updateLocationFieldValue', () => {
  beforeEach(quiet);
  const valueOf = (location, field) => location.fieldValues.find((entry) => entry.fieldId === field.id);
  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateLocationFieldValue', { title: 'Post required', fieldLabel: 'Post required', newValue: 'x' }, ['title', 'fieldLabel']));

  it("fills in a location's field, with its own label", async () => {
    const { text } = await fieldsForTheApp();
    const made = await create('field value');
    const result = await call('updateLocationFieldValue', { title: made.title, fieldLabel: text.label, newValue: 'Open late on Fridays', newCustomLabel: 'Note' });
    expect(valueOf(result, text)).toEqual({ fieldId: text.id, value: 'Open late on Fridays', customLabel: 'Note' });
    expect(valueOf(await call('getLocation', { title: made.title }), text)).toEqual({ fieldId: text.id, value: 'Open late on Fridays', customLabel: 'Note' });
    expect(sent()).toContain(['locationUpdated', jasmine.objectContaining({ locationId: made.id })]);
  });

  it('keeps the label when only the value changes, and removes the value with nothing', async () => {
    const { text } = await fieldsForTheApp();
    const made = await create('field clear');
    await call('updateLocationFieldValue', { title: made.title, fieldLabel: text.label, newValue: 'Something', newCustomLabel: 'Label' });
    await call('updateLocationFieldValue', { title: made.title, fieldLabel: text.label, newValue: null });
    expect(valueOf(await call('getLocation', { title: made.title }), text)).toEqual({ fieldId: text.id, value: null, customLabel: 'Label' });
  });

  it('completes a website address as the location form does', async () => {
    const { website } = await fieldsForTheApp();
    const made = await create('website');
    expect(valueOf(await call('updateLocationFieldValue', { title: made.title, fieldLabel: website.label, newValue: 'example.com' }), website).value).toBe('https://example.com');
  });

  describe('refuses, and changes nothing', () => {
    it('a website address that is not one', async () => {
      const { website } = await fieldsForTheApp();
      const made = await create('bad website');
      expect(await refusal(call('updateLocationFieldValue', { title: made.title, fieldLabel: website.label, newValue: 'not a website' }))).toEqual(refused('validation', website.label));
      expect(valueOf(await call('getLocation', { title: made.title }), website)).toBeUndefined();
    });

    it('removing the value of a required field', async () => {
      const { website } = await fieldsForTheApp();
      const made = await create('required website');
      await call('updateLocationFieldValue', { title: made.title, fieldLabel: website.label, newValue: 'https://example.com' });
      expect(await refusal(call('updateLocationFieldValue', { title: made.title, fieldLabel: website.label, newValue: null }))).toEqual(refused('validation', website.label));
      expect(valueOf(await call('getLocation', { title: made.title }), website).value).toBe('https://example.com');
    });

    it('a label of its own on a field that takes none', async () => {
      const { website } = await fieldsForTheApp();
      const made = await create('website label');
      expect(await refusal(call('updateLocationFieldValue', { title: made.title, fieldLabel: website.label, newCustomLabel: 'Site' }))).toEqual(refused('validation', website.label));
    });

    it('a field or a location no one has', async () => {
      const { text } = await fieldsForTheApp();
      const made = await create('missing field');
      const label = unique('missing field');
      expect(await refusal(call('updateLocationFieldValue', { title: made.title, fieldLabel: label, newValue: 'x' }))).toEqual(refused('notFound', label));
      const title = unique('missing location');
      expect(await refusal(call('updateLocationFieldValue', { title, fieldLabel: text.label, newValue: 'x' }))).toEqual(refused('notFound', title));
    });

    it('a call that changes nothing, or names nothing', async () => {
      const { text } = await fieldsForTheApp();
      const made = await create('field nothing');
      expect((await refusal(call('updateLocationFieldValue', { title: made.title, fieldLabel: text.label }))).code).toBe('validation');
      expect(await refusal(call('updateLocationFieldValue', { title: made.title, newValue: 'x' }))).toEqual(refused('validation', 'fieldLabel'));
      expect(await refusal(call('updateLocationFieldValue', { fieldLabel: text.label, newValue: 'x' }))).toEqual(refused('validation', 'title'));
    });
  });
});

contract.describe('updateLocationFieldValueAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateLocationFieldValueAdvanced', { locationId: '000000000000000000000000', fieldId: 'x', newValue: 'x' }, ['locationId', 'fieldId']));

  it("fills in a location's field, using their ids", async () => {
    const { text } = await fieldsForTheApp();
    const made = await create('field value by id');
    const result = await call('updateLocationFieldValueAdvanced', { locationId: made.id, fieldId: text.id, newValue: 'By id' });
    expect(result.fieldValues).toContain({ fieldId: text.id, value: 'By id', customLabel: null });
  });

  it('refuses ids no location or field has', async () => {
    const { text } = await fieldsForTheApp();
    const made = await create('field unknown id');
    expect(await refusal(call('updateLocationFieldValueAdvanced', { locationId: '000000000000000000000000', fieldId: text.id, newValue: 'x' }))).toEqual(refused('notFound', '000000000000000000000000'));
    expect(await refusal(call('updateLocationFieldValueAdvanced', { locationId: made.id, fieldId: 'no-such-field', newValue: 'x' }))).toEqual(refused('notFound', 'no-such-field'));
  });

  it('refuses without the ids', async () => {
    expect(await refusal(call('updateLocationFieldValueAdvanced', { fieldId: 'x', newValue: 'x' }))).toEqual(refused('validation', 'locationId'));
    expect(await refusal(call('updateLocationFieldValueAdvanced', { locationId: '000000000000000000000000', newValue: 'x' }))).toEqual(refused('validation', 'fieldId'));
  });
});

contract.describe('updateLocationsFieldValueAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateLocationsFieldValueAdvanced', {}, ['values']));

  it('fills in every field, and reports each', async () => {
    const { text, website } = await fieldsForTheApp();
    const made = await create('batch field values');
    expect(await call('updateLocationsFieldValueAdvanced', { values: [{ locationId: made.id, fieldId: text.id, newValue: 'Batch text' }, { locationId: made.id, fieldId: website.id, newValue: 'https://example.com/batch' }] })).toEqual({
      values: [jasmine.objectContaining({ index: 0, id: made.id }), jasmine.objectContaining({ index: 1, id: made.id })], succeeded: 2, failed: 0,
    });
    const { fieldValues } = await call('getLocationAdvanced', { locationId: made.id });
    expect(fieldValues).toEqual(jasmine.arrayContaining([jasmine.objectContaining({ fieldId: text.id, value: 'Batch text' }), jasmine.objectContaining({ fieldId: website.id, value: 'https://example.com/batch' })]));
  });

  describe('refuses the whole list, and fills in none of it', () => {
    it('when one id matches nothing', async () => {
      const { text } = await fieldsForTheApp();
      const made = await create('batch field unknown');
      expect(await refusal(call('updateLocationsFieldValueAdvanced', { values: [{ locationId: made.id, fieldId: text.id, newValue: 'x' }, { locationId: '000000000000000000000000', fieldId: text.id, newValue: 'x' }] }))).toEqual(refused('notFound', '000000000000000000000000'));
      expect((await call('getLocationAdvanced', { locationId: made.id })).fieldValues).toEqual([]);
    });

    it('when the same field of the same location is listed twice', async () => {
      const { text } = await fieldsForTheApp();
      const made = await create('batch field twice');
      expect((await refusal(call('updateLocationsFieldValueAdvanced', { values: [{ locationId: made.id, fieldId: text.id, newValue: 'x' }, { locationId: made.id, fieldId: text.id, newValue: 'y' }] }))).code).toBe('validation');
      expect((await call('getLocationAdvanced', { locationId: made.id })).fieldValues).toEqual([]);
    });

    it('when one value does not fit its field', async () => {
      const { text, website } = await fieldsForTheApp();
      const made = await create('batch field invalid');
      expect(await refusal(call('updateLocationsFieldValueAdvanced', { values: [{ locationId: made.id, fieldId: text.id, newValue: 'x' }, { locationId: made.id, fieldId: website.id, newValue: 'not a website' }] }))).toEqual(refused('validation', website.label));
      expect((await call('getLocationAdvanced', { locationId: made.id })).fieldValues).toEqual([]);
    });

    it('when it is empty', async () => {
      expect(await refusal(call('updateLocationsFieldValueAdvanced', { values: [] }))).toEqual(refused('validation', 'values'));
    });
  });
});
