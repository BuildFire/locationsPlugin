// locations: every operation on locations, their pins and their field values, one block each, after the helpers they share.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);
const unique = (label) => `Post ${label} (${contract.host}) ${Date.now()}`;
const NO_SUCH_ID = '000000000000000000000000';

// A location with every required detail.
const place = (title, extra = {}) => ({
  title,
  address: '1 Market St, San Diego, CA',
  latitude: 32.7157,
  longitude: -117.1611,
  listImage: ['https://example.com/list.png'],
  description: '<p>A place to visit.</p>',
  ...extra
});
const make = (label, extra) => call('createLocation', place(unique(label), extra));
// What the contract's own search finds by that exact title.
const found = async (title) => (await call('searchLocations', { title })).locations;

// The plugin's own bookkeeping and the contract events get no answer here: spies stand in for them and only answer.
const quiet = () => {
  spyOn(buildfire.messaging, 'sendMessageToWidget');
  if (buildfire.analytics && buildfire.analytics.registerEvent) spyOn(buildfire.analytics, 'registerEvent');
  if (buildfire.deeplink && buildfire.deeplink.registerDeeplink) spyOn(buildfire.deeplink, 'registerDeeplink');
  if (buildfire.deeplink && buildfire.deeplink.unregisterDeeplink) spyOn(buildfire.deeplink, 'unregisterDeeplink');
  spyOn(buildfire.services.contract.events, 'send').and.callFake((eventName, data, callback) => callback && callback(null, []));
};
const sentEvents = () => buildfire.services.contract.events.send.calls.allArgs().map((args) => args.slice(0, 2));

// Pins are shared by every location of the instance (up to three): a spec that pins starts from none and leaves none.
const unpinAll = async () => {
  const { locations } = await call('searchLocations', { pinnedOnly: true });
  if (locations.length) {
    await call('updateLocationsAdvanced', { locations: locations.map((location) => ({ locationId: location.id, newPinned: false })) });
  }
};

// Only the control panel makes categories and location fields, and its run comes first: it makes these once, and the app's run finds them.
const categoryName = 'Post location category for the app';
const subcategoryName = 'Post location subcategory for the app';
let madeCategory;
const categoryForTheApp = () => {
  madeCategory = madeCategory || (contract.host === 'control'
    ? call('createCategory', { title: categoryName, subcategories: subcategoryName })
    : call('searchCategories', { title: categoryName }).then(({ result }) => (result[0]
      ? { id: result[0].id, ...result[0].data }
      : Promise.reject(new Error(`no category named "${categoryName}": the control run makes it`)))));
  return madeCategory;
};
const linkFieldLabel = 'Post link field for the app';
const emailFieldLabel = 'Post email field for the app';
let madeFields;
const fieldsForTheApp = () => {
  madeFields = madeFields || (contract.host === 'control'
    // One after the other: both are saved into the one settings record.
    ? call('createLocationField', { label: linkFieldLabel, section: 'content', type: 'URL', allowCustomLabel: true })
      .then((link) => call('createLocationField', { label: emailFieldLabel, section: 'quickActions', type: 'EMAIL', required: true })
        .then((email) => ({ link, email })))
    : call('getSettings', {}).then(({ locationFields }) => {
      const link = locationFields.find((field) => field.label === linkFieldLabel);
      const email = locationFields.find((field) => field.label === emailFieldLabel);
      return link && email ? { link, email } : Promise.reject(new Error('no location fields for the app: the control run makes them'));
    }));
  return madeFields;
};

contract.describe('searchLocations', () => {
  const word = `post${contract.host}${Date.now()}`;
  const alpha = `${word} alpha`;
  const beta = `${word} beta`;
  let alphaId;
  let betaId;

  beforeAll(async () => {
    const category = await categoryForTheApp();
    alphaId = (await call('createLocation', place(alpha, { categories: `${category.title} -> ${subcategoryName}` }))).id;
    betaId = (await call('createLocation', place(beta))).id;
  }, 120000);
  beforeEach(quiet);

  it('finds a location by its exact title, with its details', async () => {
    const result = await call('searchLocations', { title: alpha });
    expect(result).toEqual(jasmine.objectContaining({
      locations: [jasmine.objectContaining({
        id: alphaId, title: alpha, address: '1 Market St, San Diego, CA', latitude: 32.7157, longitude: -117.1611, categoryTitles: [categoryName], subcategoryTitles: [subcategoryName]
      })],
      total: 1,
      page: 0,
      hasMore: false
    }));
  });

  it('finds locations whose text contains the search text', async () => {
    const { locations } = await call('searchLocations', { searchText: word });
    expect(locations.map((location) => location.id).sort()).toEqual([alphaId, betaId].sort());
  });

  it('narrows to a category, and to a subcategory', async () => {
    const byCategory = await call('searchLocations', { searchText: word, category: categoryName });
    expect(byCategory.locations.map((location) => location.id)).toEqual([alphaId]);
    const bySubcategory = await call('searchLocations', { searchText: word, category: categoryName, subcategory: subcategoryName });
    expect(bySubcategory.locations.map((location) => location.id)).toEqual([alphaId]);
  });

  it('sorts by name, or newest first', async () => {
    expect((await call('searchLocations', { searchText: word, sortBy: 'alphabetical' })).locations.map((l) => l.id)).toEqual([alphaId, betaId]);
    expect((await call('searchLocations', { searchText: word })).locations.map((l) => l.id)).toEqual([alphaId, betaId]);
    expect((await call('searchLocations', { searchText: word, sortBy: 'newest' })).locations.map((l) => l.id)).toEqual([betaId, alphaId]);
  });

  it('pages through the matches, with the total', async () => {
    const first = await call('searchLocations', { searchText: word, pageSize: 1 });
    expect(first).toEqual(jasmine.objectContaining({ total: 2, page: 0, hasMore: true }));
    expect(first.locations.length).toBe(1);
    const second = await call('searchLocations', { searchText: word, pageSize: 1, page: 1 });
    expect(second).toEqual(jasmine.objectContaining({ total: 2, page: 1, hasMore: false }));
    expect(second.locations.map((l) => l.id)).not.toContain(first.locations[0].id);
  });

  it('shows only pinned locations when asked, in their pinned order', async () => {
    await unpinAll();
    try {
      await call('updateLocationAdvanced', { locationId: betaId, newPinned: true });
      await call('updateLocationAdvanced', { locationId: alphaId, newPinned: true });
      const { locations } = await call('searchLocations', { pinnedOnly: true });
      expect(locations.map((l) => l.id)).toEqual([betaId, alphaId]);
      expect(locations.map((l) => l.pinPosition)).toEqual([1, 2]);
    } finally {
      await unpinAll();
    }
  }, 120000);

  it('finds nothing for a title no location has', async () => {
    expect(await call('searchLocations', { title: unique('nowhere') })).toEqual(jasmine.objectContaining({ locations: [], total: 0, hasMore: false }));
  });

  describe('refuses', () => {
    it('a category no one has, naming it', async () => {
      const name = unique('no category');
      expect(await refusal(call('searchLocations', { category: name }))).toContain(name);
    });

    it('a subcategory without its category', async () => {
      expect(await refusal(call('searchLocations', { subcategory: subcategoryName }))).toContain('category');
    });

    it('a page size above 50', async () => {
      expect(await refusal(call('searchLocations', { pageSize: 51 }))).toContain('pageSize');
    });

    it('a sorting it does not offer', async () => {
      expect(await refusal(call('searchLocations', { sortBy: 'distance' }))).toContain('sortBy');
    });

    it('a page that is not a number', async () => {
      expect(await refusal(call('searchLocations', { page: 'first' }))).toContain('page');
    });
  });
});

contract.describe('getLocation', () => {
  beforeEach(quiet);

  it('shows the location with that title', async () => {
    const created = await make('get', { subtitle: 'Open late' });
    expect(await call('getLocation', { title: created.title })).toEqual(jasmine.objectContaining({
      id: created.id, title: created.title, subtitle: 'Open late', listImage: 'https://example.com/list.png', description: '<p>A place to visit.</p>'
    }));
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

    it('without a title, or with an empty one', async () => {
      expect(await refusal(call('getLocation', {}))).toContain('title');
      expect(await refusal(call('getLocation', { title: '' }))).toContain('title');
      expect(await refusal(call('getLocation', { title: null }))).toContain('title');
    });
  });
});

contract.describe('getLocationAdvanced', () => {
  beforeEach(quiet);

  it('shows the location with that id', async () => {
    const created = await make('get by id');
    expect(await call('getLocationAdvanced', { locationId: created.id })).toEqual(jasmine.objectContaining({ id: created.id, title: created.title }));
  });

  it('refuses an id that matches nothing', async () => {
    expect(await refusal(call('getLocationAdvanced', { locationId: NO_SUCH_ID }))).toContain(NO_SUCH_ID);
  });

  it('refuses without an id', async () => {
    expect(await refusal(call('getLocationAdvanced', {}))).toContain('locationId');
  });
});

contract.describe('createLocation', () => {
  beforeEach(quiet);

  it('adds a location from its required details, with the defaults the form uses', async () => {
    const title = unique('location');
    const created = await call('createLocation', place(title));
    expect(created).toEqual(jasmine.objectContaining({
      id: jasmine.any(String),
      title,
      address: '1 Market St, San Diego, CA',
      formattedAddress: '1 Market St, San Diego, CA',
      latitude: 32.7157,
      longitude: -117.1611,
      listImage: 'https://example.com/list.png',
      description: '<p>A place to visit.</p>',
      images: [],
      categories: '',
      markerType: 'pin',
      showCategory: true,
      showOpeningHours: false,
      priceRange: 1,
      priceCurrency: '$',
      pinned: false,
      actionItems: []
    }));
    expect(created.openingHours).toEqual({
      monday: '08:00-20:00', tuesday: '08:00-20:00', wednesday: '08:00-20:00', thursday: '08:00-20:00', friday: '08:00-20:00', saturday: '08:00-20:00', sunday: '08:00-20:00'
    });
    expect(await found(title)).toEqual([jasmine.objectContaining({ id: created.id, title })]);
  });

  it('adds a location with every optional detail', async () => {
    await unpinAll();
    const category = await categoryForTheApp();
    const title = unique('full');
    try {
      const created = await call('createLocation', place(title, {
        subtitle: 'By the bay',
        formattedAddress: '1 Market St, San Diego, CA 92101, USA',
        addressAlias: 'Market Corner',
        images: ['https://example.com/one.png', 'https://example.com/two.png'],
        categories: `${category.title} -> ${subcategoryName}`,
        markerType: 'circle',
        markerColor: 'rgba(0,128,255,1)',
        showCategory: false,
        showOpeningHours: true,
        showPriceRange: true,
        showStarRating: true,
        priceRange: 3,
        priceCurrency: '€',
        actionItems: [{ title: 'Call us', action: 'callNumber', phoneNumber: '+15550100' }],
        pinned: true,
        mondayHours: '09:00-12:00, 13:00-17:00',
        sundayHours: 'closed'
      }));
      expect(created).toEqual(jasmine.objectContaining({
        subtitle: 'By the bay',
        formattedAddress: '1 Market St, San Diego, CA 92101, USA',
        addressAlias: 'Market Corner',
        images: ['https://example.com/one.png', 'https://example.com/two.png'],
        categories: `${category.title} -> ${subcategoryName}`,
        categoryTitles: [category.title],
        subcategoryTitles: [subcategoryName],
        markerType: 'circle',
        markerColor: 'rgba(0,128,255,1)',
        showCategory: false,
        showOpeningHours: true,
        showPriceRange: true,
        showStarRating: true,
        priceRange: 3,
        priceCurrency: '€',
        actionItems: [jasmine.objectContaining({ title: 'Call us', action: 'callNumber', phoneNumber: '+15550100' })],
        pinned: true,
        pinPosition: 1
      }));
      expect(created.openingHours).toEqual(jasmine.objectContaining({ monday: '09:00-12:00, 13:00-17:00', sunday: 'closed', tuesday: '08:00-20:00' }));
      expect(await call('getLocation', { title })).toEqual(jasmine.objectContaining({ id: created.id, pinned: true, markerColor: 'rgba(0,128,255,1)' }));
    } finally {
      await unpinAll();
    }
  }, 120000);

  it('gives a circle marker the default color when none is given', async () => {
    expect((await make('circle', { markerType: 'circle' })).markerColor).toBe('rgba(253,35,5,1)');
  });

  it('announces the new location', async () => {
    const title = unique('announced');
    const created = await call('createLocation', place(title));
    expect(sentEvents()).toContain(['locationCreated', jasmine.objectContaining({
      locationId: created.id, title, address: '1 Market St, San Diego, CA', categoryNames: [], listImage: 'https://example.com/list.png', createdBy: null
    })]);
  });

  describe('refuses, stores nothing and announces nothing', () => {
    const refused = async (label, extra, named) => {
      const title = unique(label);
      expect(await refusal(call('createLocation', place(title, extra)))).toContain(named);
      expect(await found(title)).toEqual([]);
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
    };

    it('without a title, or with an empty one', async () => {
      const { title, ...rest } = place('x');
      expect(await refusal(call('createLocation', rest))).toContain('title');
      expect(await refusal(call('createLocation', { ...rest, title: '' }))).toContain('title');
      expect(await refusal(call('createLocation', { ...rest, title: null }))).toContain('title');
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
    });

    it('without an address', async () => {
      const title = unique('no address');
      const { address, ...rest } = place(title);
      expect(await refusal(call('createLocation', rest))).toContain('address');
      expect(await found(title)).toEqual([]);
    });

    it('without a description', async () => {
      const title = unique('no description');
      const { description, ...rest } = place(title);
      expect(await refusal(call('createLocation', rest))).toContain('description');
      expect(await found(title)).toEqual([]);
    });

    it('a latitude out of range', () => refused('latitude', { latitude: 91 }, 'latitude'));
    it('a longitude that is not a number', () => refused('longitude', { longitude: '-117' }, 'longitude'));
    it('a list image given as a bare URL', () => refused('bare image', { listImage: 'https://example.com/list.png' }, 'listImage'));
    it('no list image', () => refused('no image', { listImage: [] }, 'listImage'));
    it('two list images', () => refused('two images', { listImage: ['https://example.com/a.png', 'https://example.com/b.png'] }, 'listImage'));
    it('a marker type it does not offer', () => refused('marker', { markerType: 'star' }, 'markerType'));
    it('an image marker without its image', () => refused('image marker', { markerType: 'image' }, 'marker'));
    it('a marker color that is not a color', () => refused('color', { markerType: 'circle', markerColor: 'red' }, 'markerColor'));
    it('a price range it does not offer', () => refused('price', { priceRange: 5 }, 'priceRange'));
    it('a currency it does not offer', () => refused('currency', { priceCurrency: '£' }, 'priceCurrency'));
    it('a category no one has', () => refused('category', { categories: 'Post no such category' }, 'Post no such category'));
    it('hours that end before they start', () => refused('hours', { mondayHours: '18:00-09:00' }, 'mondayHours'));
    it('hours that are not times', () => refused('noon', { fridayHours: 'noon' }, 'fridayHours'));
    it('action items that are not a list', () => refused('action', { actionItems: { title: 'Call', action: 'callNumber' } }, 'actionItems'));
  });
});

contract.describe('createLocationsAdvanced', () => {
  beforeEach(quiet);

  it('adds every location, and reports each', async () => {
    const titles = [unique('batch one'), unique('batch two')];
    const result = await call('createLocationsAdvanced', { locations: titles.map((title) => place(title)) });
    expect(result).toEqual(jasmine.objectContaining({
      locations: [jasmine.objectContaining({ index: 0, id: jasmine.any(String), error: null }), jasmine.objectContaining({ index: 1, id: jasmine.any(String), error: null })],
      succeeded: 2,
      failed: 0
    }));
    for (let i = 0; i < titles.length; i++) {
      expect(await found(titles[i])).toEqual([jasmine.objectContaining({ id: result.locations[i].id, title: titles[i] })]);
    }
    expect(sentEvents().filter(([name]) => name === 'locationCreated').length).toBe(2);
  });

  describe('refuses the whole list, and writes none of it', () => {
    it('when one entry is invalid', async () => {
      const valid = unique('valid entry');
      const locations = [place(valid), place(unique('invalid entry'), { priceRange: 9 })];
      expect(await refusal(call('createLocationsAdvanced', { locations }))).toContain('priceRange');
      expect(await found(valid)).toEqual([]);
    });

    it('when one entry names a category no one has', async () => {
      const valid = unique('valid with category');
      const locations = [place(valid), place(unique('bad category'), { categories: 'Post no such category' })];
      expect(await refusal(call('createLocationsAdvanced', { locations }))).toContain('Post no such category');
      expect(await found(valid)).toEqual([]);
    });

    it('when it is empty', async () => {
      expect(await refusal(call('createLocationsAdvanced', { locations: [] }))).toContain('locations');
    });

    it('when it is missing', async () => {
      expect(await refusal(call('createLocationsAdvanced', {}))).toContain('locations');
    });

    it('when it holds more than 50 entries', async () => {
      const locations = Array.from({ length: 51 }, (value, index) => place(unique(`entry ${index}`)));
      expect(await refusal(call('createLocationsAdvanced', { locations }))).toContain('locations');
      expect(await found(locations[0].title)).toEqual([]);
    });
  });
});

contract.describe('updateLocation', () => {
  beforeEach(quiet);

  it('changes only the details it is given, and returns the location', async () => {
    const created = await make('update', { subtitle: 'First' });
    const updated = await call('updateLocation', { title: created.title, newSubtitle: 'Second', newPriceRange: 4 });
    expect(updated).toEqual(jasmine.objectContaining({
      id: created.id, title: created.title, subtitle: 'Second', priceRange: 4, address: created.address, description: created.description
    }));
    expect(await found(created.title)).toEqual([jasmine.objectContaining({ subtitle: 'Second', priceRange: 4, listImage: 'https://example.com/list.png' })]);
  });

  it('renames the location', async () => {
    const created = await make('rename');
    await call('updateLocation', { title: created.title, newTitle: `${created.title} renamed` });
    expect(await found(created.title)).toEqual([]);
    expect(await found(`${created.title} renamed`)).toEqual([jasmine.objectContaining({ id: created.id })]);
  });

  it('clears the subtitle with null, and with an empty string', async () => {
    const created = await make('clear', { subtitle: 'Something' });
    expect((await call('updateLocation', { title: created.title, newSubtitle: null })).subtitle).toBeNull();
    await call('updateLocation', { title: created.title, newSubtitle: 'Something else' });
    await call('updateLocation', { title: created.title, newSubtitle: '' });
    expect((await found(created.title))[0].subtitle).toBeNull();
  });

  it('replaces the pictures with the list it is given, and empties them with an empty list', async () => {
    const created = await make('pictures', { images: ['https://example.com/a.png', 'https://example.com/b.png'] });
    expect((await call('updateLocation', { title: created.title, newImages: ['https://example.com/c.png'] })).images).toEqual(['https://example.com/c.png']);
    expect((await call('updateLocation', { title: created.title, newImages: [] })).images).toEqual([]);
  });

  it('changes and clears the categories', async () => {
    const category = await categoryForTheApp();
    const created = await make('recategorize');
    expect((await call('updateLocation', { title: created.title, newCategories: category.title })).categoryTitles).toEqual([category.title]);
    expect((await call('updateLocation', { title: created.title, newCategories: null })).categoryTitles).toEqual([]);
  });

  it('changes one day of opening hours and keeps the rest', async () => {
    const created = await make('hours', { tuesdayHours: '10:00-14:00' });
    const updated = await call('updateLocation', { title: created.title, newMondayHours: 'closed' });
    expect(updated.openingHours).toEqual(jasmine.objectContaining({ monday: 'closed', tuesday: '10:00-14:00', wednesday: '08:00-20:00' }));
  });

  it('pins and unpins the location, up to three pinned locations', async () => {
    await unpinAll();
    try {
      const result = await call('createLocationsAdvanced', { locations: [1, 2, 3, 4].map((n) => place(unique(`pin ${n}`))) });
      const ids = result.locations.map((entry) => entry.id);
      for (let i = 0; i < 3; i++) {
        expect((await call('updateLocationAdvanced', { locationId: ids[i], newPinned: true })).pinPosition).toBe(i + 1);
      }
      const fourth = await call('getLocationAdvanced', { locationId: ids[3] });
      expect(await refusal(call('updateLocation', { title: fourth.title, newPinned: true }))).toContain('3');
      expect((await call('getLocationAdvanced', { locationId: ids[3] })).pinned).toBe(false);
      const unpinned = await call('updateLocationAdvanced', { locationId: ids[0], newPinned: false });
      expect(unpinned).toEqual(jasmine.objectContaining({ pinned: false, pinPosition: null }));
    } finally {
      await unpinAll();
    }
  }, 120000);

  it('announces the change, with the previous title', async () => {
    const created = await make('announce update');
    buildfire.services.contract.events.send.calls.reset();
    await call('updateLocation', { title: created.title, newTitle: `${created.title} new` });
    expect(sentEvents()).toEqual([['locationUpdated', jasmine.objectContaining({
      locationId: created.id, title: `${created.title} new`, previousTitle: created.title, updatedBy: null
    })]]);
  });

  describe('refuses, and changes nothing', () => {
    it('a title no location has', async () => {
      const title = unique('missing');
      expect(await refusal(call('updateLocation', { title, newSubtitle: 'x' }))).toContain(title);
    });

    it('a title two locations share, saying how many', async () => {
      const title = unique('shared');
      await call('createLocation', place(title));
      await call('createLocation', place(title));
      buildfire.services.contract.events.send.calls.reset();
      expect((await refusal(call('updateLocation', { title, newSubtitle: 'x' }))).replace(title, '')).toContain('2');
      expect((await found(title)).map((location) => location.subtitle)).toEqual([null, null]);
      expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
    });

    it('removing the title, the address or the description', async () => {
      const created = await make('keep');
      expect(await refusal(call('updateLocation', { title: created.title, newTitle: null }))).toContain('newTitle');
      expect(await refusal(call('updateLocation', { title: created.title, newAddress: '' }))).toContain('newAddress');
      expect(await refusal(call('updateLocation', { title: created.title, newDescription: null }))).toContain('newDescription');
      expect(await found(created.title)).toEqual([jasmine.objectContaining({ address: created.address, description: created.description })]);
    });

    it('removing the list image', async () => {
      const created = await make('keep image');
      expect(await refusal(call('updateLocation', { title: created.title, newListImage: [] }))).toContain('newListImage');
      expect((await found(created.title))[0].listImage).toBe('https://example.com/list.png');
    });

    it('a latitude out of range', async () => {
      const created = await make('bad latitude');
      expect(await refusal(call('updateLocation', { title: created.title, newLatitude: -91 }))).toContain('newLatitude');
      expect((await found(created.title))[0].latitude).toBe(32.7157);
    });

    it('a call that changes nothing', async () => {
      const created = await make('nothing');
      expect(await refusal(call('updateLocation', { title: created.title }))).toContain('change');
    });

    it('without a title', async () => {
      expect(await refusal(call('updateLocation', { newSubtitle: 'x' }))).toContain('title');
    });
  });
});

contract.describe('updateLocationAdvanced', () => {
  beforeEach(quiet);

  it('changes the location with that id', async () => {
    const created = await make('update by id');
    expect(await call('updateLocationAdvanced', { locationId: created.id, newAddressAlias: 'Corner' })).toEqual(jasmine.objectContaining({ id: created.id, addressAlias: 'Corner' }));
    expect((await found(created.title))[0].addressAlias).toBe('Corner');
  });

  it('refuses an id that matches nothing', async () => {
    expect(await refusal(call('updateLocationAdvanced', { locationId: NO_SUCH_ID, newSubtitle: 'x' }))).toContain(NO_SUCH_ID);
  });

  it('refuses without an id, and a call that changes nothing', async () => {
    const created = await make('advanced nothing');
    expect(await refusal(call('updateLocationAdvanced', { newSubtitle: 'x' }))).toContain('locationId');
    expect(await refusal(call('updateLocationAdvanced', { locationId: created.id }))).toContain('change');
  });
});

contract.describe('updateLocationsAdvanced', () => {
  beforeEach(quiet);

  it('changes every location, and reports each', async () => {
    const one = await make('batch update one');
    const two = await make('batch update two');
    const result = await call('updateLocationsAdvanced', { locations: [{ locationId: one.id, newSubtitle: 'One' }, { locationId: two.id, newSubtitle: 'Two' }] });
    expect(result).toEqual(jasmine.objectContaining({
      locations: [jasmine.objectContaining({ index: 0, id: one.id, error: null }), jasmine.objectContaining({ index: 1, id: two.id, error: null })],
      succeeded: 2,
      failed: 0
    }));
    expect((await found(one.title))[0].subtitle).toBe('One');
    expect((await found(two.title))[0].subtitle).toBe('Two');
  });

  describe('refuses the whole list, and changes none of it', () => {
    it('when one id matches nothing', async () => {
      const one = await make('batch known');
      expect(await refusal(call('updateLocationsAdvanced', { locations: [{ locationId: one.id, newSubtitle: 'x' }, { locationId: NO_SUCH_ID, newSubtitle: 'x' }] }))).toContain(NO_SUCH_ID);
      expect((await found(one.title))[0].subtitle).toBeNull();
    });

    it('when one entry is invalid', async () => {
      const one = await make('batch valid');
      const two = await make('batch invalid');
      expect(await refusal(call('updateLocationsAdvanced', { locations: [{ locationId: one.id, newSubtitle: 'x' }, { locationId: two.id, newTitle: null }] }))).toContain('newTitle');
      expect((await found(one.title))[0].subtitle).toBeNull();
    });

    it('when the same location is listed twice', async () => {
      const one = await make('batch twice');
      await expectAsync(call('updateLocationsAdvanced', { locations: [{ locationId: one.id, newSubtitle: 'a' }, { locationId: one.id, newSubtitle: 'b' }] })).toBeRejected();
      expect((await found(one.title))[0].subtitle).toBeNull();
    });

    it('when it is empty, or holds more than 50 entries', async () => {
      expect(await refusal(call('updateLocationsAdvanced', { locations: [] }))).toContain('locations');
      const locations = Array.from({ length: 51 }, () => ({ locationId: NO_SUCH_ID, newSubtitle: 'x' }));
      expect(await refusal(call('updateLocationsAdvanced', { locations }))).toContain('locations');
    });
  });
});

contract.describe('deleteLocation', () => {
  beforeEach(quiet);

  it('removes the location with that title, and announces it', async () => {
    const created = await make('delete');
    buildfire.services.contract.events.send.calls.reset();
    expect(await call('deleteLocation', { title: created.title })).toEqual(jasmine.objectContaining({ id: created.id, title: created.title }));
    expect(await found(created.title)).toEqual([]);
    expect(sentEvents()).toEqual([['locationDeleted', jasmine.objectContaining({ locationId: created.id, title: created.title, deletedAt: jasmine.any(String) })]]);
  });

  it('leaves every other location alone', async () => {
    const kept = await make('kept');
    const removed = await make('removed');
    await call('deleteLocation', { title: removed.title });
    expect(await found(kept.title)).toEqual([jasmine.objectContaining({ id: kept.id })]);
  });

  describe('refuses, and removes nothing', () => {
    it('a title no location has', async () => {
      const title = unique('missing');
      expect(await refusal(call('deleteLocation', { title }))).toContain(title);
    });

    it('a title two locations share, saying how many', async () => {
      const title = unique('shared');
      await call('createLocation', place(title));
      await call('createLocation', place(title));
      expect((await refusal(call('deleteLocation', { title }))).replace(title, '')).toContain('2');
      expect((await found(title)).length).toBe(2);
    });

    it('without a title', async () => {
      expect(await refusal(call('deleteLocation', {}))).toContain('title');
    });
  });
});

contract.describe('deleteLocationAdvanced', () => {
  beforeEach(quiet);

  it('removes the location with that id', async () => {
    const created = await make('delete by id');
    expect(await call('deleteLocationAdvanced', { locationId: created.id })).toEqual(jasmine.objectContaining({ id: created.id, title: created.title }));
    expect(await found(created.title)).toEqual([]);
  });

  it('refuses an id that matches nothing, and none at all', async () => {
    expect(await refusal(call('deleteLocationAdvanced', { locationId: NO_SUCH_ID }))).toContain(NO_SUCH_ID);
    expect(await refusal(call('deleteLocationAdvanced', {}))).toContain('locationId');
  });
});

contract.describe('deleteLocationsAdvanced', () => {
  beforeEach(quiet);

  it('removes every location, and reports each', async () => {
    const one = await make('batch delete one');
    const two = await make('batch delete two');
    expect(await call('deleteLocationsAdvanced', { locations: [{ locationId: one.id }, { locationId: two.id }] })).toEqual(jasmine.objectContaining({
      locations: [jasmine.objectContaining({ index: 0, id: one.id, error: null }), jasmine.objectContaining({ index: 1, id: two.id, error: null })],
      succeeded: 2,
      failed: 0
    }));
    expect(await found(one.title)).toEqual([]);
    expect(await found(two.title)).toEqual([]);
  });

  describe('refuses the whole list, and removes none of it', () => {
    it('when one id matches nothing', async () => {
      const one = await make('batch delete known');
      expect(await refusal(call('deleteLocationsAdvanced', { locations: [{ locationId: one.id }, { locationId: NO_SUCH_ID }] }))).toContain(NO_SUCH_ID);
      expect((await found(one.title)).length).toBe(1);
    });

    it('when the same location is listed twice', async () => {
      const one = await make('batch delete twice');
      await expectAsync(call('deleteLocationsAdvanced', { locations: [{ locationId: one.id }, { locationId: one.id }] })).toBeRejected();
      expect((await found(one.title)).length).toBe(1);
    });

    it('when it is empty', async () => {
      expect(await refusal(call('deleteLocationsAdvanced', { locations: [] }))).toContain('locations');
    });
  });
});

// controlBackground only: the content tab reorders pins.
contract.describe('updatePinnedLocationOrder', () => {
  let titles;
  beforeEach(async () => {
    quiet();
    await unpinAll();
    titles = [unique('pinned one'), unique('pinned two'), unique('pinned three')];
    await call('createLocationsAdvanced', { locations: titles.map((title) => place(title, { pinned: true })) });
  }, 60000);
  afterEach(() => unpinAll(), 60000);

  it('moves a pinned location to the top and renumbers the rest', async () => {
    const result = await call('updatePinnedLocationOrder', { title: titles[2], position: 1 });
    expect(result.locations.map((l) => l.title)).toEqual([titles[2], titles[0], titles[1]]);
    expect(result.locations.map((l) => l.pinPosition)).toEqual([1, 2, 3]);
    expect((await call('searchLocations', { pinnedOnly: true })).locations.map((l) => l.title)).toEqual([titles[2], titles[0], titles[1]]);
  }, 120000);

  describe('refuses, and moves nothing', () => {
    it('a location that is not pinned', async () => {
      const loose = await make('not pinned');
      expect(await refusal(call('updatePinnedLocationOrder', { title: loose.title, position: 1 }))).toContain('pinned');
      expect((await call('searchLocations', { pinnedOnly: true })).locations.map((l) => l.title)).toEqual(titles);
    }, 120000);

    it('a position past three', async () => {
      expect(await refusal(call('updatePinnedLocationOrder', { title: titles[0], position: 4 }))).toContain('position');
    });

    it('a position that is not a number, or none', async () => {
      expect(await refusal(call('updatePinnedLocationOrder', { title: titles[0], position: 'top' }))).toContain('position');
      expect(await refusal(call('updatePinnedLocationOrder', { title: titles[0] }))).toContain('position');
    });

    it('a title no location has', async () => {
      const title = unique('missing');
      expect(await refusal(call('updatePinnedLocationOrder', { title, position: 1 }))).toContain(title);
    });
  });
});

contract.describe('updatePinnedLocationOrderAdvanced', () => {
  beforeEach(async () => {
    quiet();
    await unpinAll();
  });
  afterEach(() => unpinAll(), 60000);

  it('moves the pinned location with that id', async () => {
    const result = await call('createLocationsAdvanced', { locations: [unique('first pin'), unique('second pin')].map((title) => place(title, { pinned: true })) });
    const [first, second] = result.locations.map((entry) => entry.id);
    const moved = await call('updatePinnedLocationOrderAdvanced', { locationId: second, position: 1 });
    expect(moved.locations.map((l) => l.id)).toEqual([second, first]);
  }, 120000);

  it('refuses an id that matches nothing, and a position past the pinned ones', async () => {
    expect(await refusal(call('updatePinnedLocationOrderAdvanced', { locationId: NO_SUCH_ID, position: 1 }))).toContain(NO_SUCH_ID);
    const only = await make('only pin', { pinned: true });
    expect(await refusal(call('updatePinnedLocationOrderAdvanced', { locationId: only.id, position: 2 }))).toContain('position');
  }, 120000);
});

contract.describe('updateLocationFieldValue', () => {
  beforeEach(quiet);

  it('sets a field value and its own label, as the form keeps them', async () => {
    const { link } = await fieldsForTheApp();
    const created = await make('field value');
    const updated = await call('updateLocationFieldValue', {
      title: created.title, fieldLabel: linkFieldLabel, newValue: 'example.com/menu', newCustomLabel: 'Menu'
    });
    expect(updated.fieldValues).toContain({ fieldId: link.id, value: 'https://example.com/menu', customLabel: 'Menu' });
    expect((await call('getLocation', { title: created.title })).fieldValues).toContain({ fieldId: link.id, value: 'https://example.com/menu', customLabel: 'Menu' });
  });

  it('keeps what it is not given, and clears with null', async () => {
    const { link } = await fieldsForTheApp();
    const created = await make('field clear');
    await call('updateLocationFieldValue', { title: created.title, fieldLabel: linkFieldLabel, newValue: 'https://example.com', newCustomLabel: 'Site' });
    expect((await call('updateLocationFieldValue', { title: created.title, fieldLabel: linkFieldLabel, newCustomLabel: 'Web' })).fieldValues)
      .toContain({ fieldId: link.id, value: 'https://example.com', customLabel: 'Web' });
    expect((await call('updateLocationFieldValue', { title: created.title, fieldLabel: linkFieldLabel, newValue: null })).fieldValues)
      .toContain({ fieldId: link.id, value: null, customLabel: 'Web' });
  });

  describe('refuses, and changes nothing', () => {
    it('a value that does not fit the field', async () => {
      await fieldsForTheApp();
      const created = await make('field bad email');
      expect(await refusal(call('updateLocationFieldValue', { title: created.title, fieldLabel: emailFieldLabel, newValue: 'not an email' }))).toContain('email');
      expect((await call('getLocation', { title: created.title })).fieldValues).toEqual([]);
    });

    it('removing the value of a required field', async () => {
      await fieldsForTheApp();
      const created = await make('field required');
      await call('updateLocationFieldValue', { title: created.title, fieldLabel: emailFieldLabel, newValue: 'hello@example.com' });
      expect(await refusal(call('updateLocationFieldValue', { title: created.title, fieldLabel: emailFieldLabel, newValue: '' }))).toContain('required');
    });

    it('a label of its own on a field that takes none', async () => {
      await fieldsForTheApp();
      const created = await make('field label');
      expect(await refusal(call('updateLocationFieldValue', { title: created.title, fieldLabel: emailFieldLabel, newCustomLabel: 'Mail' }))).toContain(emailFieldLabel);
    });

    it('a field no one has', async () => {
      const created = await make('field missing');
      const label = unique('no field');
      expect(await refusal(call('updateLocationFieldValue', { title: created.title, fieldLabel: label, newValue: 'x' }))).toContain(label);
    });

    it('a location no one has', async () => {
      await fieldsForTheApp();
      const title = unique('no location');
      expect(await refusal(call('updateLocationFieldValue', { title, fieldLabel: linkFieldLabel, newValue: 'https://example.com' }))).toContain(title);
    });

    it('a call that changes nothing, and one without its field', async () => {
      const created = await make('field nothing');
      expect(await refusal(call('updateLocationFieldValue', { title: created.title, fieldLabel: linkFieldLabel }))).toContain('newValue');
      expect(await refusal(call('updateLocationFieldValue', { title: created.title, newValue: 'x' }))).toContain('fieldLabel');
    });
  });
});

contract.describe('updateLocationFieldValueAdvanced', () => {
  beforeEach(quiet);

  it('sets the value of the field with that id, on the location with that id', async () => {
    const { email } = await fieldsForTheApp();
    const created = await make('field by id');
    const updated = await call('updateLocationFieldValueAdvanced', { locationId: created.id, fieldId: email.id, newValue: ' hello@example.com ' });
    expect(updated.fieldValues).toContain({ fieldId: email.id, value: 'hello@example.com', customLabel: null });
  });

  it('refuses ids that match nothing', async () => {
    const { email } = await fieldsForTheApp();
    const created = await make('field unknown id');
    expect(await refusal(call('updateLocationFieldValueAdvanced', { locationId: NO_SUCH_ID, fieldId: email.id, newValue: 'a@b.co' }))).toContain(NO_SUCH_ID);
    expect(await refusal(call('updateLocationFieldValueAdvanced', { locationId: created.id, fieldId: 'no-such-field', newValue: 'a@b.co' }))).toContain('no-such-field');
  });
});

contract.describe('updateLocationsFieldValueAdvanced', () => {
  beforeEach(quiet);

  it('sets every value, and reports each', async () => {
    const { link, email } = await fieldsForTheApp();
    const one = await make('values one');
    const two = await make('values two');
    const result = await call('updateLocationsFieldValueAdvanced', {
      values: [
        { locationId: one.id, fieldId: link.id, newValue: 'https://example.com/one' },
        { locationId: one.id, fieldId: email.id, newValue: 'one@example.com' },
        { locationId: two.id, fieldId: link.id, newValue: 'https://example.com/two' }
      ]
    });
    expect(result).toEqual(jasmine.objectContaining({ succeeded: 3, failed: 0 }));
    expect(result.values.map((entry) => entry.index)).toEqual([0, 1, 2]);
    const first = await call('getLocationAdvanced', { locationId: one.id });
    expect(first.fieldValues).toContain({ fieldId: link.id, value: 'https://example.com/one', customLabel: null });
    expect(first.fieldValues).toContain({ fieldId: email.id, value: 'one@example.com', customLabel: null });
    expect((await call('getLocationAdvanced', { locationId: two.id })).fieldValues).toContain({ fieldId: link.id, value: 'https://example.com/two', customLabel: null });
  }, 120000);

  describe('refuses the whole list, and changes none of it', () => {
    it('when one value does not fit its field', async () => {
      const { link, email } = await fieldsForTheApp();
      const one = await make('values invalid');
      expect(await refusal(call('updateLocationsFieldValueAdvanced', {
        values: [{ locationId: one.id, fieldId: link.id, newValue: 'https://example.com' }, { locationId: one.id, fieldId: email.id, newValue: 'nope' }]
      }))).toContain('email');
      expect((await call('getLocationAdvanced', { locationId: one.id })).fieldValues).toEqual([]);
    });

    it('when one location id matches nothing', async () => {
      const { link } = await fieldsForTheApp();
      expect(await refusal(call('updateLocationsFieldValueAdvanced', { values: [{ locationId: NO_SUCH_ID, fieldId: link.id, newValue: 'https://example.com' }] }))).toContain(NO_SUCH_ID);
    });

    it('when the same field of the same location is listed twice', async () => {
      const { link } = await fieldsForTheApp();
      const one = await make('values twice');
      await expectAsync(call('updateLocationsFieldValueAdvanced', {
        values: [{ locationId: one.id, fieldId: link.id, newValue: 'https://a.com' }, { locationId: one.id, fieldId: link.id, newValue: 'https://b.com' }]
      })).toBeRejected();
      expect((await call('getLocationAdvanced', { locationId: one.id })).fieldValues).toEqual([]);
    });

    it('when it is empty', async () => {
      expect(await refusal(call('updateLocationsFieldValueAdvanced', { values: [] }))).toContain('values');
    });
  });
});
