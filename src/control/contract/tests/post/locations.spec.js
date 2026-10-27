// locations: every operation on locations, their location field values and their pinned order, one block each, after the helpers they share.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);
const unique = (label) => `Post ${label} (${contract.host}) ${Date.now()}`;
// One word only this spec writes, for the searches that match any word.
const word = (label) => `${label}${contract.host}${Date.now()}${Math.floor(Math.random() * 1000)}`;

// A location with every required detail; extra details on top.
const place = (title, extra = {}) => ({
  title,
  address: '1549 El Prado, San Diego, CA 92101',
  latitude: 32.7341,
  longitude: -117.1446,
  description: '<p>A park in the middle of the city.</p>',
  listImage: ['https://example.com/location.png'],
  ...extra
});
// What the contract's own search finds by that exact title.
const found = async (title) => (await call('searchLocations', { title })).locations;
const removeAll = async (ids) => {
  for (const id of ids) await call('deleteLocationAdvanced', { locationId: id }).catch(() => null);
};

// Calls nothing here answers: the location events, the widget refresh, analytics and deep links answer through spies.
const quiet = () => {
  spyOn(buildfire.services.contract.events, 'send');
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') spyOn(buildfire.messaging, 'sendMessageToWidget');
  if (buildfire.analytics && typeof buildfire.analytics.registerEvent === 'function') spyOn(buildfire.analytics, 'registerEvent');
  if (buildfire.deeplink && typeof buildfire.deeplink.registerDeeplink === 'function') spyOn(buildfire.deeplink, 'registerDeeplink');
  if (buildfire.deeplink && typeof buildfire.deeplink.unregisterDeeplink === 'function') spyOn(buildfire.deeplink, 'unregisterDeeplink');
};
const events = () => buildfire.services.contract.events.send;

// Only the control panel makes categories and location fields, and its run comes first: it makes these, once, and the app's run finds them.
const categoryForTheApp = 'Post locations category for the app';
let madeCategory;
const appCategory = () => {
  madeCategory = madeCategory || (contract.host === 'control'
    ? call('createCategory', { title: categoryForTheApp })
      .then((category) => call('createSubcategory', { categoryTitle: categoryForTheApp, title: 'Gardens' }).then((sub) => ({ id: category.id, subcategoryId: sub.id })))
    : call('listCategories', { title: categoryForTheApp }).then(({ result: [record] }) => (record
      ? { id: record.id, subcategoryId: record.data.subcategories.find((sub) => sub.title === 'Gardens').id }
      : Promise.reject(new Error(`no category titled "${categoryForTheApp}": the control run makes it`)))));
  return madeCategory;
};
const fieldForTheApp = 'Post locations email for the app';
let madeField;
const appField = () => {
  madeField = madeField || (contract.host === 'control'
    ? call('createLocationField', { group: 'content', label: fieldForTheApp, type: 'EMAIL', enableCustomLabel: true })
    : call('getSettings', {}).then((settings) => settings.customFields.content.find((field) => field.label === fieldForTheApp)
      || Promise.reject(new Error(`no location field named "${fieldForTheApp}": the control run makes it`))));
  return madeField;
};

contract.describe('searchLocations', () => {
  beforeEach(quiet);

  it('finds locations by a word, a page at a time, A to Z', async () => {
    const tag = word('search');
    const titles = [`Alpha ${tag}`, `Bravo ${tag}`, `Charlie ${tag}`];
    const { locations } = await call('createLocationsAdvanced', { locations: titles.map((title) => place(title)) });
    const first = await call('searchLocations', { search: tag, pageSize: 2 });
    expect(first).toEqual(jasmine.objectContaining({ total: 3, page: 0, hasMore: true }));
    expect(first.locations.map((location) => location.title)).toEqual(titles.slice(0, 2));
    const second = await call('searchLocations', { search: tag, pageSize: 2, page: 1 });
    expect(second).toEqual(jasmine.objectContaining({ total: 3, page: 1, hasMore: false }));
    expect(second.locations.map((location) => location.title)).toEqual([titles[2]]);
    const backwards = await call('searchLocations', { search: tag, sort: 'reverseAlphabetical' });
    expect(backwards.locations.map((location) => location.title)).toEqual(titles.slice().reverse());
    await removeAll(locations.map((location) => location.id));
  }, 120000);

  it('returns each location with its details', async () => {
    const title = unique('detailed');
    const created = await call('createLocation', place(title, { subtitle: 'Gardens', priceRange: 3 }));
    const { locations, total } = await call('searchLocations', { title });
    expect(total).toBe(1);
    expect(locations).toEqual([jasmine.objectContaining({
      id: created.id, title, subtitle: 'Gardens', address: '1549 El Prado, San Diego, CA 92101',
      coordinates: { lat: 32.7341, lng: -117.1446 }, listImage: 'https://example.com/location.png',
      price: jasmine.objectContaining({ range: 3 })
    })]);
    await removeAll([created.id]);
  });

  it('narrows to a category, a subcategory and a price range', async () => {
    const category = await appCategory();
    const tag = word('narrow');
    const inSub = await call('createLocation', place(`In sub ${tag}`, { categories: `${categoryForTheApp} -> Gardens`, priceRange: 2 }));
    const inCategory = await call('createLocation', place(`In category ${tag}`, { categories: categoryForTheApp, priceRange: 4 }));
    const outside = await call('createLocation', place(`Outside ${tag}`));
    const titles = async (params) => (await call('searchLocations', { search: tag, ...params })).locations.map((location) => location.title).sort();
    expect(await titles({})).toEqual([`In category ${tag}`, `In sub ${tag}`, `Outside ${tag}`]);
    expect(await titles({ categoryName: categoryForTheApp })).toEqual([`In category ${tag}`, `In sub ${tag}`]);
    expect(await titles({ categoryName: categoryForTheApp, subcategoryName: 'Gardens' })).toEqual([`In sub ${tag}`]);
    expect(await titles({ priceRange: 4 })).toEqual([`In category ${tag}`]);
    expect(category.id).toEqual(jasmine.any(String));
    await removeAll([inSub.id, inCategory.id, outside.id]);
  }, 120000);

  it('finds nothing for a title no location has', async () => {
    expect(await call('searchLocations', { title: unique('nowhere') })).toEqual(jasmine.objectContaining({ locations: [], total: 0, hasMore: false }));
  });

  describe('refuses', () => {
    it('a category no one has, naming it', async () => {
      const name = unique('no category');
      expect(await refusal(call('searchLocations', { categoryName: name }))).toContain(name);
    });

    it('a subcategory without its category', async () => {
      expect(await refusal(call('searchLocations', { subcategoryName: 'Gardens' }))).toContain('categoryName');
    });

    it('a page size over 50, and a page below 0', async () => {
      expect(await refusal(call('searchLocations', { pageSize: 51 }))).toContain('pageSize');
      expect(await refusal(call('searchLocations', { page: -1 }))).toContain('page');
    });

    it('a price range and a sort it does not offer', async () => {
      expect(await refusal(call('searchLocations', { priceRange: 5 }))).toContain('priceRange');
      expect(await refusal(call('searchLocations', { sort: 'distance' }))).toContain('sort');
    });

    it('a pinned choice that is not true or false', async () => {
      expect(await refusal(call('searchLocations', { pinnedOnly: 'yes' }))).toContain('pinnedOnly');
    });
  });
});

contract.describe('getLocation', () => {
  beforeEach(quiet);

  it('shows the location with that title', async () => {
    const title = unique('get');
    const created = await call('createLocation', place(title, { addressAlias: 'The park' }));
    expect(await call('getLocation', { title })).toEqual(jasmine.objectContaining({ id: created.id, title, addressAlias: 'The park' }));
    await removeAll([created.id]);
  });

  it('refuses a title no location has, naming it', async () => {
    const title = unique('missing');
    expect(await refusal(call('getLocation', { title }))).toContain(title);
  });

  it('refuses a title two locations share, saying how many', async () => {
    const title = unique('shared');
    const { locations } = await call('createLocationsAdvanced', { locations: [place(title), place(title)] });
    expect((await refusal(call('getLocation', { title }))).replace(title, '')).toContain('2');
    await removeAll(locations.map((location) => location.id));
  });

  it('refuses without a title', async () => {
    expect(await refusal(call('getLocation', {}))).toContain('title');
    expect(await refusal(call('getLocation', { title: '' }))).toContain('title');
    expect(await refusal(call('getLocation', { title: null }))).toContain('title');
  });
});

contract.describe('getLocationAdvanced', () => {
  beforeEach(quiet);

  it('shows the location with that id', async () => {
    const title = unique('get by id');
    const created = await call('createLocation', place(title));
    expect(await call('getLocationAdvanced', { locationId: created.id })).toEqual(jasmine.objectContaining({ id: created.id, title }));
    await removeAll([created.id]);
  });

  it('refuses an id that matches nothing', async () => {
    expect(await refusal(call('getLocationAdvanced', { locationId: '000000000000000000000000' }))).toContain('000000000000000000000000');
  });

  it('refuses without an id', async () => {
    expect(await refusal(call('getLocationAdvanced', {}))).toContain('locationId');
  });
});

contract.describe('createLocation', () => {
  beforeEach(quiet);

  it('adds a location from its required details, with the form\'s starting values, and announces it', async () => {
    const title = unique('create');
    const created = await call('createLocation', place(title));
    expect(created).toEqual(jasmine.objectContaining({
      id: jasmine.any(String), title, address: '1549 El Prado, San Diego, CA 92101', formattedAddress: '1549 El Prado, San Diego, CA 92101',
      coordinates: { lat: 32.7341, lng: -117.1446 }, listImage: 'https://example.com/location.png', description: '<p>A park in the middle of the city.</p>',
      marker: jasmine.objectContaining({ type: 'pin' }), price: { range: 1, currency: '$' }, pinIndex: null,
      categories: { main: [], subcategories: [] }
    }));
    expect(created.openingHours.days.monday).toEqual(jasmine.objectContaining({
      active: true, intervals: [{ from: '1970-01-01T08:00:00.000Z', to: '1970-01-01T20:00:00.000Z' }]
    }));
    expect(await found(title)).toEqual([jasmine.objectContaining({ id: created.id, title })]);
    expect(events()).toHaveBeenCalledWith('locationCreated', jasmine.objectContaining({
      locationId: created.id, title, address: '1549 El Prado, San Diego, CA 92101', listImage: 'https://example.com/location.png',
      latitude: 32.7341, longitude: -117.1446, pinned: false, createdAt: jasmine.any(String)
    }));
    await removeAll([created.id]);
  });

  it('adds a location with every optional detail', async () => {
    await appCategory();
    const title = unique('full');
    const created = await call('createLocation', place(title, {
      subtitle: 'Gardens and museums',
      addressAlias: 'The park',
      images: ['https://example.com/photo-1.png', 'https://example.com/photo-2.png'],
      categories: `${categoryForTheApp} -> Gardens`,
      markerType: 'image',
      markerImage: ['https://example.com/marker.png'],
      showCategory: false,
      showOpeningHours: true,
      showPriceRange: true,
      showStarRating: true,
      priceRange: 4,
      priceCurrency: '€',
      actionItems: [{ title: 'Website', action: 'linkToWeb', url: 'https://example.com', openIn: '_blank' }],
      pinned: false,
      mondayHours: '08:00-12:00, 13:00-20:00',
      sundayHours: 'closed'
    }));
    const [stored] = await found(title);
    expect(stored).toEqual(jasmine.objectContaining({
      id: created.id, subtitle: 'Gardens and museums', addressAlias: 'The park',
      marker: jasmine.objectContaining({ type: 'image', image: 'https://example.com/marker.png' }),
      settings: { showCategory: false, showOpeningHours: true, showPriceRange: true, showStarRating: true },
      price: { range: 4, currency: '€' }
    }));
    expect(stored.images.map((image) => image.imageUrl)).toEqual(['https://example.com/photo-1.png', 'https://example.com/photo-2.png']);
    expect(stored.categories.main.length).toBe(1);
    expect(stored.categories.subcategories.length).toBe(1);
    expect(stored.actionItems).toEqual([jasmine.objectContaining({ title: 'Website', action: 'linkToWeb', url: 'https://example.com', id: jasmine.any(String) })]);
    expect(stored.openingHours.days.monday.intervals).toEqual([
      { from: '1970-01-01T08:00:00.000Z', to: '1970-01-01T12:00:00.000Z' },
      { from: '1970-01-01T13:00:00.000Z', to: '1970-01-01T20:00:00.000Z' }
    ]);
    expect(stored.openingHours.days.sunday.active).toBe(false);
    await removeAll([created.id]);
  }, 90000);

  it('gives a circle marker the red color when none is given', async () => {
    const title = unique('circle');
    const created = await call('createLocation', place(title, { markerType: 'circle' }));
    expect(created.marker.color).toEqual(jasmine.objectContaining({ color: 'rgba(253,35,5,1)', colorHex: '#fd2305' }));
    await removeAll([created.id]);
  });

  describe('refuses, and stores nothing', () => {
    const refusedWith = async (params, name) => {
      const title = params.title || unique('refused');
      expect(await refusal(call('createLocation', { ...place(title), ...params }))).toContain(name);
      expect(await found(title)).toEqual([]);
      expect(events()).not.toHaveBeenCalled();
    };

    it('without a title', async () => {
      const params = place(undefined);
      delete params.title;
      expect(await refusal(call('createLocation', params))).toContain('title');
      expect(await refusal(call('createLocation', place('')))).toContain('title');
      expect(await refusal(call('createLocation', place(null)))).toContain('title');
    });

    it('without an address, latitude, longitude, description or list image', async () => {
      for (const name of ['address', 'latitude', 'longitude', 'description', 'listImage']) {
        const title = unique(`no ${name}`);
        const params = place(title);
        delete params[name];
        expect(await refusal(call('createLocation', params))).toContain(name);
        expect(await found(title)).toEqual([]);
      }
    }, 90000);

    it('a list image that is not a list, or holds two', async () => {
      await refusedWith({ listImage: 'https://example.com/location.png' }, 'listImage');
      await refusedWith({ listImage: ['https://example.com/a.png', 'https://example.com/b.png'] }, 'listImage');
    });

    it('a latitude out of range', async () => {
      await refusedWith({ latitude: 91 }, 'latitude');
    });

    it('a marker type or price it does not offer', async () => {
      await refusedWith({ markerType: 'star' }, 'markerType');
      await refusedWith({ priceRange: 5 }, 'priceRange');
      await refusedWith({ priceCurrency: '£' }, 'priceCurrency');
    });

    it('an image marker without its image', async () => {
      await refusedWith({ markerType: 'image' }, 'markerImage');
    });

    it('a marker color that is not a color', async () => {
      await refusedWith({ markerColor: 'red' }, 'markerColor');
    });

    it('opening hours that overlap, end before they start, or are not hours', async () => {
      await refusedWith({ mondayHours: '08:00-12:00, 11:00-14:00' }, 'mondayHours');
      await refusedWith({ tuesdayHours: '20:00-08:00' }, 'tuesdayHours');
      await refusedWith({ fridayHours: 'all day' }, 'fridayHours');
    });

    it('a category no one has, naming it', async () => {
      const name = unique('no category');
      await refusedWith({ categories: name }, name);
    });

    it('a switch that is not true or false', async () => {
      await refusedWith({ showStarRating: 'yes' }, 'showStarRating');
    });
  });
});

contract.describe('createLocationsAdvanced', () => {
  beforeEach(quiet);

  it('adds every location, reports each, and announces each', async () => {
    const titles = [unique('batch one'), unique('batch two')];
    const result = await call('createLocationsAdvanced', { locations: titles.map((title) => place(title)) });
    expect(result).toEqual(jasmine.objectContaining({
      locations: [jasmine.objectContaining({ index: 0, id: jasmine.any(String), error: null }), jasmine.objectContaining({ index: 1, id: jasmine.any(String), error: null })],
      succeeded: 2,
      failed: 0
    }));
    for (const title of titles) expect(await found(title)).toEqual([jasmine.objectContaining({ title })]);
    expect(events().calls.allArgs().filter(([name]) => name === 'locationCreated').length).toBe(2);
    await removeAll(result.locations.map((entry) => entry.id));
  });

  describe('refuses the whole list, and writes none of it', () => {
    it('when one entry is invalid', async () => {
      const valid = unique('valid entry');
      const invalid = place(unique('invalid entry'));
      delete invalid.address;
      expect(await refusal(call('createLocationsAdvanced', { locations: [place(valid), invalid] }))).toContain('address');
      expect(await found(valid)).toEqual([]);
    });

    it('when it is empty, or not a list', async () => {
      await expectAsync(call('createLocationsAdvanced', { locations: [] })).toBeRejected();
      await expectAsync(call('createLocationsAdvanced', {})).toBeRejected();
    });

    it('when it holds more than 50 entries', async () => {
      const locations = Array.from({ length: 51 }, (value, index) => place(unique(`entry ${index}`)));
      await expectAsync(call('createLocationsAdvanced', { locations })).toBeRejected();
      expect(await found(locations[0].title)).toEqual([]);
    });
  });
});

contract.describe('updateLocation', () => {
  beforeEach(quiet);

  it('changes only the details it is given, keeps the rest, and announces it', async () => {
    const title = unique('update');
    const created = await call('createLocation', place(title, { subtitle: 'Before', priceRange: 2 }));
    events().calls.reset();
    const updated = await call('updateLocation', { title, subtitle: 'After', showStarRating: true });
    expect(updated).toEqual(jasmine.objectContaining({ id: created.id, title, subtitle: 'After', price: jasmine.objectContaining({ range: 2 }) }));
    expect(updated.settings.showStarRating).toBe(true);
    expect(await found(title)).toEqual([jasmine.objectContaining({ subtitle: 'After', listImage: 'https://example.com/location.png' })]);
    expect(events()).toHaveBeenCalledWith('locationUpdated', jasmine.objectContaining({ locationId: created.id, title, subtitle: 'After', updatedAt: jasmine.any(String) }));
    await removeAll([created.id]);
  });

  it('renames, moves and re-pictures the location', async () => {
    const title = unique('rename');
    const created = await call('createLocation', place(title));
    await call('updateLocation', {
      title, newTitle: `${title} renamed`, address: '2 Harbor Dr, San Diego, CA', latitude: 32.7, longitude: -117.17,
      listImage: ['https://example.com/new.png'], description: '<p>Changed.</p>'
    });
    expect(await found(title)).toEqual([]);
    expect(await found(`${title} renamed`)).toEqual([jasmine.objectContaining({
      id: created.id, address: '2 Harbor Dr, San Diego, CA', coordinates: { lat: 32.7, lng: -117.17 }, listImage: 'https://example.com/new.png', description: '<p>Changed.</p>'
    })]);
    await removeAll([created.id]);
  });

  it('clears the subtitle, custom name and categories with null or an empty value', async () => {
    await appCategory();
    const title = unique('clear');
    const created = await call('createLocation', place(title, { subtitle: 'Something', addressAlias: 'Alias', categories: categoryForTheApp }));
    await call('updateLocation', { title, subtitle: null, addressAlias: '', categories: '' });
    expect(await found(title)).toEqual([jasmine.objectContaining({ subtitle: null, addressAlias: null, categories: { main: [], subcategories: [] } })]);
    await removeAll([created.id]);
  });

  it('replaces the pictures and actions with the lists given', async () => {
    const title = unique('replace');
    const created = await call('createLocation', place(title, {
      images: ['https://example.com/a.png', 'https://example.com/b.png'],
      actionItems: [{ title: 'Call', action: 'callNumber', phoneNumber: '+15550100' }]
    }));
    await call('updateLocation', { title, images: ['https://example.com/b.png'], actionItems: [] });
    const [stored] = await found(title);
    expect(stored.images.map((image) => image.imageUrl)).toEqual(['https://example.com/b.png']);
    expect(stored.actionItems).toEqual([]);
    await removeAll([created.id]);
  });

  it('closes one day and keeps the others', async () => {
    const title = unique('hours');
    const created = await call('createLocation', place(title, { tuesdayHours: '10:00-18:00' }));
    await call('updateLocation', { title, mondayHours: 'closed' });
    const [stored] = await found(title);
    expect(stored.openingHours.days.monday.active).toBe(false);
    expect(stored.openingHours.days.tuesday).toEqual(jasmine.objectContaining({ active: true, intervals: [{ from: '1970-01-01T10:00:00.000Z', to: '1970-01-01T18:00:00.000Z' }] }));
    await removeAll([created.id]);
  });

  describe('refuses, and changes nothing', () => {
    it('a title no location has, naming it', async () => {
      const title = unique('missing');
      expect(await refusal(call('updateLocation', { title, subtitle: 'x' }))).toContain(title);
    });

    it('a title two locations share, saying how many', async () => {
      const title = unique('shared');
      const { locations } = await call('createLocationsAdvanced', { locations: [place(title), place(title)] });
      expect((await refusal(call('updateLocation', { title, subtitle: 'x' }))).replace(title, '')).toContain('2');
      expect(await found(title)).not.toContain(jasmine.objectContaining({ subtitle: 'x' }));
      await removeAll(locations.map((location) => location.id));
    });

    it('removing the title, address, description or list image', async () => {
      const title = unique('keep');
      const created = await call('createLocation', place(title));
      events().calls.reset();
      expect(await refusal(call('updateLocation', { title, newTitle: null }))).toContain('newTitle');
      expect(await refusal(call('updateLocation', { title, address: '' }))).toContain('address');
      expect(await refusal(call('updateLocation', { title, description: null }))).toContain('description');
      expect(await refusal(call('updateLocation', { title, listImage: [] }))).toContain('listImage');
      expect(await found(title)).toEqual([jasmine.objectContaining({ title, address: '1549 El Prado, San Diego, CA 92101' })]);
      expect(events()).not.toHaveBeenCalled();
      await removeAll([created.id]);
    });

    it('a call that changes nothing', async () => {
      const title = unique('nothing');
      const created = await call('createLocation', place(title));
      await expectAsync(call('updateLocation', { title })).toBeRejected();
      await removeAll([created.id]);
    });

    it('without a title', async () => {
      expect(await refusal(call('updateLocation', { subtitle: 'x' }))).toContain('title');
    });

    it('a value of the wrong kind', async () => {
      const title = unique('wrong');
      const created = await call('createLocation', place(title));
      expect(await refusal(call('updateLocation', { title, longitude: 'east' }))).toContain('longitude');
      expect(await refusal(call('updateLocation', { title, images: 'https://example.com/a.png' }))).toContain('images');
      expect(await found(title)).toEqual([jasmine.objectContaining({ coordinates: { lat: 32.7341, lng: -117.1446 }, images: [] })]);
      await removeAll([created.id]);
    });
  });
});

contract.describe('updateLocationAdvanced', () => {
  beforeEach(quiet);

  it('changes the location with that id', async () => {
    const title = unique('update by id');
    const created = await call('createLocation', place(title));
    expect(await call('updateLocationAdvanced', { locationId: created.id, subtitle: 'By id' })).toEqual(jasmine.objectContaining({ id: created.id, subtitle: 'By id' }));
    expect(await found(title)).toEqual([jasmine.objectContaining({ subtitle: 'By id' })]);
    await removeAll([created.id]);
  });

  it('refuses an id that matches nothing, and writes nothing', async () => {
    expect(await refusal(call('updateLocationAdvanced', { locationId: '000000000000000000000000', subtitle: 'x' }))).toContain('000000000000000000000000');
    expect(events()).not.toHaveBeenCalled();
  });

  it('refuses without an id', async () => {
    expect(await refusal(call('updateLocationAdvanced', { subtitle: 'x' }))).toContain('locationId');
  });
});

contract.describe('updateLocationsAdvanced', () => {
  beforeEach(quiet);

  it('changes every location and reports each', async () => {
    const titles = [unique('many one'), unique('many two')];
    const { locations } = await call('createLocationsAdvanced', { locations: titles.map((title) => place(title)) });
    const result = await call('updateLocationsAdvanced', { locations: locations.map((entry) => ({ locationId: entry.id, subtitle: 'Changed together' })) });
    expect(result).toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0, locations: [jasmine.objectContaining({ index: 0, id: locations[0].id }), jasmine.objectContaining({ index: 1, id: locations[1].id })] }));
    for (const title of titles) expect(await found(title)).toEqual([jasmine.objectContaining({ subtitle: 'Changed together' })]);
    await removeAll(locations.map((entry) => entry.id));
  });

  describe('refuses the whole list, and changes none of it', () => {
    it('when an id matches nothing', async () => {
      const title = unique('kept');
      const created = await call('createLocation', place(title));
      await expectAsync(call('updateLocationsAdvanced', { locations: [{ locationId: created.id, subtitle: 'x' }, { locationId: '000000000000000000000000', subtitle: 'x' }] })).toBeRejected();
      expect(await found(title)).toEqual([jasmine.objectContaining({ subtitle: null })]);
      await removeAll([created.id]);
    });

    it('when the same location is listed twice', async () => {
      const title = unique('twice');
      const created = await call('createLocation', place(title));
      await expectAsync(call('updateLocationsAdvanced', { locations: [{ locationId: created.id, subtitle: 'a' }, { locationId: created.id, subtitle: 'b' }] })).toBeRejected();
      expect(await found(title)).toEqual([jasmine.objectContaining({ subtitle: null })]);
      await removeAll([created.id]);
    });

    it('when one entry is invalid, or the list is empty', async () => {
      const title = unique('invalid change');
      const created = await call('createLocation', place(title));
      expect(await refusal(call('updateLocationsAdvanced', { locations: [{ locationId: created.id, subtitle: 'x' }, { locationId: created.id, priceRange: 9 }] }))).toContain('priceRange');
      await expectAsync(call('updateLocationsAdvanced', { locations: [] })).toBeRejected();
      expect(await found(title)).toEqual([jasmine.objectContaining({ subtitle: null })]);
      await removeAll([created.id]);
    });
  });
});

contract.describe('deleteLocation', () => {
  beforeEach(quiet);

  it('removes the location with that title for good, and announces it', async () => {
    const title = unique('delete');
    const created = await call('createLocation', place(title));
    events().calls.reset();
    expect(await call('deleteLocation', { title })).toEqual(jasmine.objectContaining({ id: created.id, title }));
    expect(await found(title)).toEqual([]);
    expect(events()).toHaveBeenCalledWith('locationDeleted', jasmine.objectContaining({ locationId: created.id, title, address: '1549 El Prado, San Diego, CA 92101' }));
  });

  it('refuses a title no location has, naming it', async () => {
    const title = unique('missing');
    expect(await refusal(call('deleteLocation', { title }))).toContain(title);
    expect(events()).not.toHaveBeenCalled();
  });

  it('refuses a title two locations share, saying how many, and deletes neither', async () => {
    const title = unique('shared');
    const { locations } = await call('createLocationsAdvanced', { locations: [place(title), place(title)] });
    expect((await refusal(call('deleteLocation', { title }))).replace(title, '')).toContain('2');
    expect((await found(title)).length).toBe(2);
    await removeAll(locations.map((location) => location.id));
  });

  it('refuses without a title', async () => {
    expect(await refusal(call('deleteLocation', {}))).toContain('title');
  });
});

contract.describe('deleteLocationAdvanced', () => {
  beforeEach(quiet);

  it('removes the location with that id, and leaves the others', async () => {
    const kept = unique('kept');
    const keptLocation = await call('createLocation', place(kept));
    const title = unique('deleted');
    const created = await call('createLocation', place(title));
    expect(await call('deleteLocationAdvanced', { locationId: created.id })).toEqual(jasmine.objectContaining({ id: created.id, title }));
    expect(await found(title)).toEqual([]);
    expect(await found(kept)).toEqual([jasmine.objectContaining({ title: kept })]);
    await removeAll([keptLocation.id]);
  });

  it('refuses an id that matches nothing', async () => {
    expect(await refusal(call('deleteLocationAdvanced', { locationId: '000000000000000000000000' }))).toContain('000000000000000000000000');
    expect(events()).not.toHaveBeenCalled();
  });
});

contract.describe('deleteLocationsAdvanced', () => {
  beforeEach(quiet);

  it('removes every location and reports each', async () => {
    const titles = [unique('gone one'), unique('gone two')];
    const { locations } = await call('createLocationsAdvanced', { locations: titles.map((title) => place(title)) });
    expect(await call('deleteLocationsAdvanced', { locations: locations.map((entry) => ({ locationId: entry.id })) }))
      .toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
    for (const title of titles) expect(await found(title)).toEqual([]);
  });

  it('refuses the whole list when an id matches nothing, or is listed twice, and deletes none of it', async () => {
    const title = unique('survivor');
    const created = await call('createLocation', place(title));
    await expectAsync(call('deleteLocationsAdvanced', { locations: [{ locationId: created.id }, { locationId: '000000000000000000000000' }] })).toBeRejected();
    await expectAsync(call('deleteLocationsAdvanced', { locations: [{ locationId: created.id }, { locationId: created.id }] })).toBeRejected();
    expect(await found(title)).toEqual([jasmine.objectContaining({ title })]);
    await removeAll([created.id]);
  });

  it('refuses an empty list', async () => {
    await expectAsync(call('deleteLocationsAdvanced', { locations: [] })).toBeRejected();
  });
});

contract.describe('updateLocationFieldValue', () => {
  beforeEach(quiet);

  it('fills in a field on the location, checking it as the field\'s type', async () => {
    await appField();
    const title = unique('field value');
    const created = await call('createLocation', place(title));
    const updated = await call('updateLocationFieldValue', { locationTitle: title, fieldName: fieldForTheApp, value: 'hello@example.com', customLabel: 'Write to us' });
    expect(updated.id).toBe(created.id);
    const [stored] = await found(title);
    const field = await appField();
    expect(stored.additionalFields.content).toContain(jasmine.objectContaining({ id: field.id, value: 'hello@example.com', customLabel: 'Write to us' }));
    expect(events()).toHaveBeenCalledWith('locationUpdated', jasmine.objectContaining({ locationId: created.id }));
    await removeAll([created.id]);
  });

  it('clears the value with null, and keeps the custom label when it is left out', async () => {
    const field = await appField();
    const title = unique('clear value');
    const created = await call('createLocation', place(title));
    await call('updateLocationFieldValue', { locationTitle: title, fieldName: fieldForTheApp, value: 'a@example.com', customLabel: 'Mail' });
    await call('updateLocationFieldValue', { locationTitle: title, fieldName: fieldForTheApp, value: null });
    const [stored] = await found(title);
    expect(stored.additionalFields.content).toContain(jasmine.objectContaining({ id: field.id, value: null, customLabel: 'Mail' }));
    await removeAll([created.id]);
  });

  describe('refuses, and changes nothing', () => {
    it('a value the field does not take', async () => {
      await appField();
      const title = unique('bad value');
      const created = await call('createLocation', place(title));
      expect(await refusal(call('updateLocationFieldValue', { locationTitle: title, fieldName: fieldForTheApp, value: 'not an email' }))).toContain('email');
      const [stored] = await found(title);
      expect(stored.additionalFields.content.every((entry) => entry.value !== 'not an email')).toBe(true);
      await removeAll([created.id]);
    });

    it('a field name no field has, naming it', async () => {
      const title = unique('no field');
      const created = await call('createLocation', place(title));
      const fieldName = unique('no such field');
      expect(await refusal(call('updateLocationFieldValue', { locationTitle: title, fieldName, value: 'x' }))).toContain(fieldName);
      await removeAll([created.id]);
    });

    it('a location title no location has, naming it', async () => {
      await appField();
      const locationTitle = unique('no location');
      expect(await refusal(call('updateLocationFieldValue', { locationTitle, fieldName: fieldForTheApp, value: 'a@example.com' }))).toContain(locationTitle);
    });

    it('without a location title, field name or value', async () => {
      expect(await refusal(call('updateLocationFieldValue', { fieldName: fieldForTheApp, value: 'a@example.com' }))).toContain('locationTitle');
      expect(await refusal(call('updateLocationFieldValue', { locationTitle: 'x', value: 'a@example.com' }))).toContain('fieldName');
      expect(await refusal(call('updateLocationFieldValue', { locationTitle: 'x', fieldName: fieldForTheApp }))).toContain('value');
    });
  });
});

contract.describe('updateLocationFieldValueAdvanced', () => {
  beforeEach(quiet);

  it('fills in a field on the location, by their ids', async () => {
    const field = await appField();
    const title = unique('value by id');
    const created = await call('createLocation', place(title));
    expect(await call('updateLocationFieldValueAdvanced', { locationId: created.id, fieldId: field.id, value: 'id@example.com' }))
      .toEqual(jasmine.objectContaining({ id: created.id }));
    expect((await found(title))[0].additionalFields.content).toContain(jasmine.objectContaining({ id: field.id, value: 'id@example.com' }));
    await removeAll([created.id]);
  });

  it('refuses a location id or field id that matches nothing', async () => {
    const field = await appField();
    expect(await refusal(call('updateLocationFieldValueAdvanced', { locationId: '000000000000000000000000', fieldId: field.id, value: 'a@example.com' }))).toContain('000000000000000000000000');
    const title = unique('unknown field');
    const created = await call('createLocation', place(title));
    expect(await refusal(call('updateLocationFieldValueAdvanced', { locationId: created.id, fieldId: 'no-such-field', value: 'a@example.com' }))).toContain('no-such-field');
    await removeAll([created.id]);
  });
});

contract.describe('updateLocationFieldValuesAdvanced', () => {
  beforeEach(quiet);

  it('fills in every value and reports each', async () => {
    const field = await appField();
    const titles = [unique('values one'), unique('values two')];
    const { locations } = await call('createLocationsAdvanced', { locations: titles.map((title) => place(title)) });
    const result = await call('updateLocationFieldValuesAdvanced', { values: locations.map((entry) => ({ locationId: entry.id, fieldId: field.id, value: 'team@example.com' })) });
    expect(result).toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
    for (const title of titles) expect((await found(title))[0].additionalFields.content).toContain(jasmine.objectContaining({ id: field.id, value: 'team@example.com' }));
    await removeAll(locations.map((entry) => entry.id));
  }, 90000);

  it('refuses the whole list when one value is invalid, and writes none of it', async () => {
    const field = await appField();
    const title = unique('values refused');
    const created = await call('createLocation', place(title));
    const values = [{ locationId: created.id, fieldId: field.id, value: 'ok@example.com' }, { locationId: created.id, fieldId: 'no-such-field', value: 'x' }];
    await expectAsync(call('updateLocationFieldValuesAdvanced', { values })).toBeRejected();
    expect((await found(title))[0].additionalFields.content).not.toContain(jasmine.objectContaining({ value: 'ok@example.com' }));
    await expectAsync(call('updateLocationFieldValuesAdvanced', { values: [] })).toBeRejected();
    await removeAll([created.id]);
  });
});

// controlBackground only: the pinned order is arranged in the control panel's list view tab.
contract.describe('updatePinnedLocationOrder', () => {
  beforeEach(quiet);

  it('moves a pinned location up, renumbering the others, and refuses a fourth pin', async () => {
    const tag = word('pins');
    const made = [];
    try {
      const existing = (await call('searchLocations', { pinnedOnly: true })).total;
      for (let i = existing; i < 3; i += 1) made.push(await call('createLocation', place(`Pinned ${i} ${tag}`, { pinned: true })));
      const pinned = await call('searchLocations', { pinnedOnly: true });
      expect(pinned.total).toBe(3);
      const last = pinned.locations[2];
      const result = await call('updatePinnedLocationOrder', { title: last.title, position: 1 });
      expect(result.locations[0]).toEqual(jasmine.objectContaining({ id: last.id, pinIndex: 1 }));
      expect(result.locations.map((location) => location.pinIndex)).toEqual([1, 2, 3]);
      expect((await call('searchLocations', { pinnedOnly: true })).locations[0].id).toBe(last.id);
      const fourth = unique('fourth pin');
      expect(await refusal(call('createLocation', place(fourth, { pinned: true })))).toContain('3');
      expect(await found(fourth)).toEqual([]);
    } finally {
      await removeAll(made.map((location) => location.id));
    }
  }, 120000);

  it('refuses a location that is not pinned', async () => {
    const title = unique('not pinned');
    const created = await call('createLocation', place(title));
    expect(await refusal(call('updatePinnedLocationOrder', { title, position: 1 }))).toContain('not pinned');
    await removeAll([created.id]);
  });

  it('refuses a position out of range, or none', async () => {
    const title = unique('pinned range');
    const created = await call('createLocation', place(title, { pinned: true }));
    try {
      expect(await refusal(call('updatePinnedLocationOrder', { title, position: 4 }))).toContain('position');
      expect(await refusal(call('updatePinnedLocationOrder', { title }))).toContain('position');
    } finally {
      await removeAll([created.id]);
    }
  });

  it('refuses a title no location has, naming it', async () => {
    const title = unique('missing');
    expect(await refusal(call('updatePinnedLocationOrder', { title, position: 1 }))).toContain(title);
  });
});

contract.describe('updatePinnedLocationOrderAdvanced', () => {
  beforeEach(quiet);

  it('moves the pinned location with that id', async () => {
    const tag = word('pinid');
    const made = [];
    try {
      made.push(await call('createLocation', place(`First ${tag}`, { pinned: true })));
      made.push(await call('createLocation', place(`Second ${tag}`, { pinned: true })));
      const result = await call('updatePinnedLocationOrderAdvanced', { locationId: made[1].id, position: 1 });
      expect(result.locations[0]).toEqual(jasmine.objectContaining({ id: made[1].id, pinIndex: 1 }));
    } finally {
      await removeAll(made.map((location) => location.id));
    }
  }, 90000);

  it('refuses an id that matches nothing', async () => {
    expect(await refusal(call('updatePinnedLocationOrderAdvanced', { locationId: '000000000000000000000000', position: 1 }))).toContain('000000000000000000000000');
  });
});
