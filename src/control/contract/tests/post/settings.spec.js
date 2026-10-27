// settings: the plugin's one settings record, in the datastore: read from both sides, changed in the control panel.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);
const oneOf = (...values) => ({ asymmetricMatch: (actual) => values.includes(actual), jasmineToString: () => `one of ${values.join(', ')}` });
const read = () => call('getSettings', {});

contract.describe('getSettings', () => {
  it('shows every group of settings, each with a value it allows', async () => {
    const settings = await read();
    expect(settings).toEqual(jasmine.objectContaining({
      subscription: jasmine.objectContaining({ enabled: jasmine.any(Boolean), allowCustomNotifications: jasmine.any(Boolean) }),
      measurementUnit: oneOf('metric', 'imperial'),
      introductoryListView: jasmine.objectContaining({
        images: jasmine.any(Array),
        sorting: oneOf('distance', 'alphabetical', 'newest'),
        searchOptions: jasmine.objectContaining({ mode: oneOf('All', 'UserPosition', 'AreaRadius', 'MyLocations') }),
        visibilityOptions: jasmine.objectContaining({ value: oneOf('NONE', 'TAGS', 'ALL') })
      }),
      sorting: jasmine.objectContaining({
        defaultSorting: oneOf('distance', 'alphabetical'),
        hideSorting: jasmine.any(Boolean),
        allowSortByNearest: jasmine.any(Boolean),
        allowSortByReverseAlphabetical: jasmine.any(Boolean),
        allowSortByPriceLowToHigh: jasmine.any(Boolean),
        allowSortByPriceHighToLow: jasmine.any(Boolean),
        allowSortByDate: jasmine.any(Boolean),
        allowSortByRating: jasmine.any(Boolean),
        allowSortByViews: jasmine.any(Boolean)
      }),
      filter: jasmine.objectContaining({
        allowFilterByArea: jasmine.any(Boolean), allowFilterByBookmarks: jasmine.any(Boolean), hideOpeningHoursFilter: jasmine.any(Boolean), hidePriceFilter: jasmine.any(Boolean)
      }),
      map: jasmine.objectContaining({ initialArea: jasmine.any(Boolean), initialAreaCoordinates: jasmine.any(Object) }),
      bookmarks: jasmine.objectContaining({ enabled: jasmine.any(Boolean), allowForLocations: jasmine.any(Boolean), allowForFilters: jasmine.any(Boolean) }),
      customFields: jasmine.objectContaining({ quickActions: jasmine.any(Array), content: jasmine.any(Array) }),
      design: jasmine.objectContaining({
        listViewPosition: oneOf('expanded', 'collapsed', 'halfExpanded'),
        listViewStyle: oneOf('backgroundImage', 'smallImage'),
        defaultMapType: oneOf('streets', 'satellite'),
        detailsMapPosition: oneOf('top', 'bottom'),
        enableMapTerrainView: jasmine.any(Boolean),
        hideQuickFilter: jasmine.any(Boolean),
        allowStyleSelection: jasmine.any(Boolean),
        showDetailsCategory: jasmine.any(Boolean),
        showContributorName: jasmine.any(Boolean)
      }),
      globalEntries: jasmine.objectContaining({
        locations: jasmine.objectContaining({ allowAdding: oneOf('none', 'limited', 'all') }),
        photos: jasmine.objectContaining({ allowAdding: oneOf('none', 'limited', 'all') }),
        openHours: jasmine.objectContaining({ enabled: jasmine.any(Boolean) }),
        priceRange: jasmine.objectContaining({ enabled: jasmine.any(Boolean) }),
        charging: jasmine.objectContaining({ enabled: oneOf('none', 'limited', 'all') })
      }),
      locationEditors: jasmine.objectContaining({ time: oneOf('12H', '24H') })
    }));
  });

  it('changes nothing', async () => {
    const first = await read();
    const second = await read();
    ['subscription', 'measurementUnit', 'introductoryListView', 'sorting', 'filter', 'map', 'bookmarks', 'customFields', 'design', 'globalEntries', 'locationEditors']
      .forEach((group) => expect(second[group]).toEqual(first[group]));
  });
});

// controlBackground only: the settings are written in the control panel.
contract.describe('updateSettings', () => {
  // The refresh message to the widget is the plugin's own bookkeeping, which the manifest never mentions: the spy only answers.
  beforeEach(() => spyOn(buildfire.messaging, 'sendMessageToWidget'));

  it('changes only the settings it is given, and returns them', async () => {
    await call('updateSettings', { hideSorting: true, distanceUnit: 'imperial' });
    const result = await call('updateSettings', { listViewStyle: 'smallImage' });
    expect(result).toEqual(jasmine.objectContaining({
      measurementUnit: 'imperial',
      sorting: jasmine.objectContaining({ hideSorting: true }),
      design: jasmine.objectContaining({ listViewStyle: 'smallImage' })
    }));
    expect(await read()).toEqual(jasmine.objectContaining({
      measurementUnit: 'imperial',
      sorting: jasmine.objectContaining({ hideSorting: true }),
      design: jasmine.objectContaining({ listViewStyle: 'smallImage' })
    }));
    await call('updateSettings', { hideSorting: false, distanceUnit: 'metric', listViewStyle: 'backgroundImage' });
    expect(await read()).toEqual(jasmine.objectContaining({
      measurementUnit: 'metric',
      sorting: jasmine.objectContaining({ hideSorting: false }),
      design: jasmine.objectContaining({ listViewStyle: 'backgroundImage' })
    }));
  });

  it('takes every setting at once, and stores each where the plugin reads it', async () => {
    const before = await read();
    const charging = before.globalEntries.locations.allowAdding === 'none' ? 'none' : 'all';
    await call('updateSettings', {
      allowSubscriptions: true,
      timeFormat: '24H',
      defaultSorting: 'distance',
      hideSorting: false,
      allowSortByReverseAlphabetical: false,
      allowSortByNearest: true,
      allowSortByPriceHighToLow: false,
      allowSortByPriceLowToHigh: true,
      allowSortByViews: false,
      allowSortByDate: true,
      allowSortByRating: false,
      allowFilterByArea: false,
      hideOpeningHoursFilter: true,
      hidePriceFilter: true,
      allowFilterByBookmarks: true,
      distanceUnit: 'imperial',
      enableInitialArea: true,
      initialAreaLatitude: 32.7157,
      initialAreaLongitude: -117.1611,
      initialAreaAddress: 'San Diego, CA, USA',
      enableBookmarks: true,
      allowBookmarkLocations: false,
      allowBookmarkSearch: true,
      enableOpenHours: true,
      enablePriceRange: true,
      chargeForNewLocations: charging,
      paymentDetails: '<p>Post payment terms</p>',
      listViewPosition: 'halfExpanded',
      listViewStyle: 'smallImage',
      defaultMapType: 'satellite',
      enableMapTerrainView: true,
      hideQuickFilter: true,
      allowMapStyleSelection: false,
      showDetailsCategory: false,
      showContributorName: true,
      detailsMapPosition: 'bottom',
      introVisibility: 'ALL',
      introDescription: '<p>Post introduction</p>',
      introImages: [{ title: 'Post slide', iconUrl: 'https://example.com/post-slide.png', action: 'noAction' }],
      introSorting: 'newest',
      introLocationSource: 'AreaRadius',
      introAreaLatitude: 40.758,
      introAreaLongitude: -73.9855,
      introAreaAddress: 'Times Square, New York, NY, USA',
      introAreaRadius: 25
    });
    expect(await read()).toEqual(jasmine.objectContaining({
      subscription: jasmine.objectContaining({ enabled: true }),
      locationEditors: jasmine.objectContaining({ time: '24H' }),
      measurementUnit: 'imperial',
      sorting: jasmine.objectContaining({
        defaultSorting: 'distance',
        hideSorting: false,
        allowSortByReverseAlphabetical: false,
        allowSortByNearest: true,
        allowSortByPriceHighToLow: false,
        allowSortByPriceLowToHigh: true,
        allowSortByViews: false,
        allowSortByDate: true,
        allowSortByRating: false
      }),
      filter: jasmine.objectContaining({
        allowFilterByArea: false, hideOpeningHoursFilter: true, hidePriceFilter: true, allowFilterByBookmarks: true
      }),
      map: jasmine.objectContaining({
        initialArea: true, initialAreaCoordinates: { lat: 32.7157, lng: -117.1611 }, initialAreaDisplayAddress: 'San Diego, CA, USA'
      }),
      bookmarks: jasmine.objectContaining({ enabled: true, allowForLocations: false, allowForFilters: true }),
      globalEntries: jasmine.objectContaining({
        openHours: jasmine.objectContaining({ enabled: true }),
        priceRange: jasmine.objectContaining({ enabled: true }),
        charging: jasmine.objectContaining({ enabled: charging, description: '<p>Post payment terms</p>' })
      }),
      design: jasmine.objectContaining({
        listViewPosition: 'halfExpanded',
        listViewStyle: 'smallImage',
        defaultMapType: 'satellite',
        enableMapTerrainView: true,
        hideQuickFilter: true,
        allowStyleSelection: false,
        showDetailsCategory: false,
        showContributorName: true,
        detailsMapPosition: 'bottom'
      }),
      introductoryListView: jasmine.objectContaining({
        description: '<p>Post introduction</p>',
        images: [jasmine.objectContaining({ title: 'Post slide', iconUrl: 'https://example.com/post-slide.png', action: 'noAction' })],
        sorting: 'newest',
        searchOptions: jasmine.objectContaining({
          mode: 'AreaRadius',
          areaRadiusOptions: jasmine.objectContaining({
            lat: 40.758, lng: -73.9855, formattedLocation: 'Times Square, New York, NY, USA', radius: 25
          })
        }),
        visibilityOptions: jasmine.objectContaining({ value: 'ALL' })
      })
    }));
  });

  it('clears the introduction text and the payment details with an empty value', async () => {
    await call('updateSettings', { introDescription: '<p>Post text</p>', paymentDetails: '<p>Post terms</p>' });
    await call('updateSettings', { introDescription: null, paymentDetails: null });
    let settings = await read();
    expect(settings.introductoryListView.description).toBeNull();
    expect(settings.globalEntries.charging.description).toBeNull();
    await call('updateSettings', { introDescription: '<p>Post text</p>', paymentDetails: '<p>Post terms</p>' });
    await call('updateSettings', { introDescription: '', paymentDetails: '' });
    settings = await read();
    expect(settings.introductoryListView.description).toBe('');
    expect(settings.globalEntries.charging.description).toBe('');
  });

  it('replaces the introduction carousel with the list given', async () => {
    await call('updateSettings', {
      introImages: [{ title: 'Post one', iconUrl: 'https://example.com/one.png' }, { title: 'Post two', iconUrl: 'https://example.com/two.png' }]
    });
    expect((await read()).introductoryListView.images.map((item) => item.iconUrl)).toEqual(['https://example.com/one.png', 'https://example.com/two.png']);
    await call('updateSettings', { introImages: [{ title: 'Post three', iconUrl: 'https://example.com/three.png' }] });
    expect((await read()).introductoryListView.images.map((item) => item.iconUrl)).toEqual(['https://example.com/three.png']);
    await call('updateSettings', { introImages: [] });
    expect((await read()).introductoryListView.images).toEqual([]);
  });

  it('sorts alphabetically at first once nearest first is turned off', async () => {
    await call('updateSettings', { allowSortByNearest: true, defaultSorting: 'distance' });
    const result = await call('updateSettings', { allowSortByNearest: false });
    expect(result.sorting).toEqual(jasmine.objectContaining({ allowSortByNearest: false, defaultSorting: 'alphabetical' }));
    expect(await refusal(call('updateSettings', { defaultSorting: 'distance' }))).toContain('defaultSorting');
    expect((await read()).sorting.defaultSorting).toBe('alphabetical');
    await call('updateSettings', { allowSortByNearest: true, defaultSorting: 'distance' });
    expect((await read()).sorting).toEqual(jasmine.objectContaining({ allowSortByNearest: true, defaultSorting: 'distance' }));
  });

  it('charges for new locations only while adding them is allowed', async () => {
    const { globalEntries } = await read();
    if (globalEntries.locations.allowAdding === 'none') {
      expect(await refusal(call('updateSettings', { chargeForNewLocations: 'all' }))).toContain('chargeForNewLocations');
      expect((await read()).globalEntries.charging.enabled).toBe(globalEntries.charging.enabled);
    } else {
      expect((await call('updateSettings', { chargeForNewLocations: 'all' })).globalEntries.charging.enabled).toBe('all');
    }
    expect((await call('updateSettings', { chargeForNewLocations: 'none' })).globalEntries.charging.enabled).toBe('none');
  });

  it('turning open hours or price range off also takes them away from app users', async () => {
    await call('updateSettings', { enableOpenHours: false, enablePriceRange: false });
    const { globalEntries } = await read();
    expect(globalEntries.openHours).toEqual(jasmine.objectContaining({ enabled: false, inAppEnabled: 'none' }));
    expect(globalEntries.priceRange).toEqual(jasmine.objectContaining({ enabled: false, inAppEnabled: 'none' }));
    await call('updateSettings', { enableOpenHours: true, enablePriceRange: true });
    expect((await read()).globalEntries.openHours.enabled).toBe(true);
  });

  describe('refuses, and changes nothing', () => {
    let before;
    beforeEach(async () => {
      before = await call('updateSettings', { distanceUnit: 'metric', introAreaRadius: 10, hideSorting: false });
    });
    const unchanged = async () => {
      const after = await read();
      expect(after.measurementUnit).toBe(before.measurementUnit);
      expect(after.sorting).toEqual(before.sorting);
      expect(after.map).toEqual(before.map);
      expect(after.introductoryListView).toEqual(before.introductoryListView);
    };

    it('a call with no setting in it', async () => {
      await expectAsync(call('updateSettings', {})).toBeRejected();
      await unchanged();
    });

    it('a switch that is not yes or no', async () => {
      expect(await refusal(call('updateSettings', { hideSorting: 'yes', distanceUnit: 'imperial' }))).toContain('hideSorting');
      await unchanged();
    });

    it('a choice it does not offer', async () => {
      expect(await refusal(call('updateSettings', { distanceUnit: 'nautical' }))).toContain('distanceUnit');
      expect(await refusal(call('updateSettings', { timeFormat: '36H' }))).toContain('timeFormat');
      expect(await refusal(call('updateSettings', { introLocationSource: 'Everywhere' }))).toContain('introLocationSource');
      await unchanged();
    });

    it('a starting point without both its latitude and its longitude', async () => {
      expect(await refusal(call('updateSettings', { initialAreaLatitude: 10 }))).toContain('initialAreaLongitude');
      expect(await refusal(call('updateSettings', { introAreaLongitude: 10 }))).toContain('introAreaLatitude');
      await unchanged();
    });

    it('a latitude or longitude out of range', async () => {
      expect(await refusal(call('updateSettings', { initialAreaLatitude: 91, initialAreaLongitude: 0 }))).toContain('initialAreaLatitude');
      expect(await refusal(call('updateSettings', { introAreaLatitude: 0, introAreaLongitude: -181 }))).toContain('introAreaLongitude');
      await unchanged();
    });

    it('a radius outside 1 to 200 miles', async () => {
      expect(await refusal(call('updateSettings', { introAreaRadius: 0 }))).toContain('introAreaRadius');
      expect(await refusal(call('updateSettings', { introAreaRadius: 201 }))).toContain('introAreaRadius');
      expect(await refusal(call('updateSettings', { introAreaRadius: '20' }))).toContain('introAreaRadius');
      await unchanged();
    });

    it('an empty address', async () => {
      expect(await refusal(call('updateSettings', { initialAreaAddress: '' }))).toContain('initialAreaAddress');
      await unchanged();
    });

    it('a text that is not text', async () => {
      expect(await refusal(call('updateSettings', { introDescription: 42 }))).toContain('introDescription');
      await unchanged();
    });

    it('a carousel that is not a list of items with pictures', async () => {
      expect(await refusal(call('updateSettings', { introImages: { iconUrl: 'https://example.com/one.png' } }))).toContain('introImages');
      expect(await refusal(call('updateSettings', { introImages: [{ title: 'Post no picture' }] }))).toContain('introImages');
      expect(await refusal(call('updateSettings', { introImages: ['https://example.com/one.png'] }))).toContain('introImages');
      await unchanged();
    });
  });
});
