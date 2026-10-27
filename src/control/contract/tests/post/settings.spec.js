// settings: the plugin's one settings record (settings, design and list view tabs), read from both sides and changed in the control panel.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);

// The refresh messages to the widget nothing here answers: a spy stands in for them.
const quiet = () => {
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') spyOn(buildfire.messaging, 'sendMessageToWidget');
};

contract.describe('getSettings', () => {
  beforeEach(quiet);

  // Whatever the control run saved last, every setting reads back within what the settings tabs offer.
  it('shows the settings, design, list view and location fields', async () => {
    const settings = await call('getSettings', {});
    expect(settings.subscription.enabled).toEqual(jasmine.any(Boolean));
    expect(['metric', 'imperial']).toContain(settings.measurementUnit);
    expect(['distance', 'alphabetical']).toContain(settings.sorting.defaultSorting);
    expect(settings.filter.allowFilterByArea).toEqual(jasmine.any(Boolean));
    expect(settings.bookmarks.enabled).toEqual(jasmine.any(Boolean));
    expect(['expanded', 'collapsed', 'halfExpanded']).toContain(settings.design.listViewPosition);
    expect(['backgroundImage', 'smallImage']).toContain(settings.design.listViewStyle);
    expect(['streets', 'satellite']).toContain(settings.design.defaultMapType);
    expect(['distance', 'alphabetical', 'newest']).toContain(settings.introductoryListView.sorting);
    expect(['ALL', 'TAGS', 'NONE']).toContain(settings.introductoryListView.visibilityOptions.value);
    expect(settings.introductoryListView.images).toEqual(jasmine.any(Array));
    expect(settings.customFields).toEqual(jasmine.objectContaining({ quickActions: jasmine.any(Array), content: jasmine.any(Array) }));
    expect(settings.globalEntries.openHours.enabled).toEqual(jasmine.any(Boolean));
    expect(['12H', '24H']).toContain(settings.locationEditors.time);
  });

  it('changes nothing', async () => {
    const before = await call('getSettings', {});
    const after = await call('getSettings', {});
    expect(after.design).toEqual(before.design);
    expect(after.sorting).toEqual(before.sorting);
  });
});

// controlBackground only: the datastore is written from the control panel.
contract.describe('updateSettings', () => {
  beforeEach(quiet);

  it('changes only the settings it is given, and keeps the rest', async () => {
    await call('updateSettings', { listViewStyle: 'smallImage', defaultMapType: 'satellite', distanceUnit: 'imperial' });
    const result = await call('updateSettings', { listViewStyle: 'backgroundImage', hideQuickFilter: true });
    expect(result.design).toEqual(jasmine.objectContaining({ listViewStyle: 'backgroundImage', defaultMapType: 'satellite', hideQuickFilter: true }));
    expect(result.measurementUnit).toBe('imperial');
    const stored = await call('getSettings', {});
    expect(stored.design).toEqual(jasmine.objectContaining({ listViewStyle: 'backgroundImage', defaultMapType: 'satellite', hideQuickFilter: true }));
    expect(stored.measurementUnit).toBe('imperial');
  });

  it('changes the list view: pictures, text, who sees it, its order and its area', async () => {
    const result = await call('updateSettings', {
      introImages: ['https://example.com/banner-1.png', 'https://example.com/banner-2.png'],
      introDescription: '<p>Places to visit.</p>',
      introVisibility: 'NONE',
      introSorting: 'newest',
      introLocationsSource: 'AreaRadius',
      introAreaAddress: 'San Diego, CA, USA',
      introAreaLatitude: 32.7157,
      introAreaLongitude: -117.1611,
      introAreaRadius: 25
    });
    const list = (await call('getSettings', {})).introductoryListView;
    expect(result.introductoryListView).toEqual(list);
    expect(list.images.map((image) => image.iconUrl)).toEqual(['https://example.com/banner-1.png', 'https://example.com/banner-2.png']);
    expect(list).toEqual(jasmine.objectContaining({ description: '<p>Places to visit.</p>', sorting: 'newest' }));
    expect(list.visibilityOptions.value).toBe('NONE');
    expect(list.searchOptions).toEqual(jasmine.objectContaining({ mode: 'AreaRadius' }));
    expect(list.searchOptions.areaRadiusOptions).toEqual(jasmine.objectContaining({ formattedLocation: 'San Diego, CA, USA', lat: 32.7157, lng: -117.1611, radius: 25 }));
    await call('updateSettings', { introImages: ['https://example.com/banner-2.png'] });
    expect((await call('getSettings', {})).introductoryListView.images.map((image) => image.iconUrl)).toEqual(['https://example.com/banner-2.png']);
  });

  it('clears the list view text with null, and with an empty value', async () => {
    await call('updateSettings', { introDescription: '<p>Something</p>' });
    expect((await call('updateSettings', { introDescription: null })).introductoryListView.description).toBeNull();
    await call('updateSettings', { introDescription: '<p>Something else</p>' });
    expect((await call('updateSettings', { introDescription: '' })).introductoryListView.description).toBe('');
  });

  it('makes alphabetical the first sort when nearest sorting is turned off', async () => {
    await call('updateSettings', { allowSortByNearest: true, defaultSorting: 'distance' });
    const result = await call('updateSettings', { allowSortByNearest: false });
    expect(result.sorting).toEqual(jasmine.objectContaining({ allowSortByNearest: false, defaultSorting: 'alphabetical' }));
    expect(await refusal(call('updateSettings', { defaultSorting: 'distance' }))).toContain('defaultSorting');
    expect((await call('getSettings', {})).sorting.defaultSorting).toBe('alphabetical');
    await call('updateSettings', { allowSortByNearest: true });
  });

  it('turns the opening hours and price range off for locations', async () => {
    const result = await call('updateSettings', { openingHoursEnabled: false, priceRangeEnabled: true });
    expect(result.globalEntries.openHours).toEqual(jasmine.objectContaining({ enabled: false, inAppEnabled: 'none' }));
    expect(result.globalEntries.priceRange.enabled).toBe(true);
    await call('updateSettings', { openingHoursEnabled: true });
  });

  it('changes the map, bookmarks, sorting, filtering and time settings', async () => {
    const result = await call('updateSettings', {
      mapInitialArea: true, mapInitialAreaAddress: 'Balboa Park, San Diego', mapInitialAreaLatitude: 32.7341, mapInitialAreaLongitude: -117.1446,
      bookmarksEnabled: true, allowBookmarkLocations: false, allowBookmarkSearches: true,
      hideSorting: true, allowSortByViews: false, allowFilterByBookmarks: true, hidePriceFilter: true,
      subscriptionEnabled: false, timeFormat: '24H', listViewPosition: 'expanded', detailsMapPosition: 'bottom',
      enableMapTerrainView: true, allowMapStyleSelection: false, showDetailsCategory: false, showContributorName: true,
      paymentDetails: '<p>Pay once.</p>'
    });
    expect(result.map).toEqual(jasmine.objectContaining({ initialArea: true, initialAreaDisplayAddress: 'Balboa Park, San Diego', initialAreaCoordinates: { lat: 32.7341, lng: -117.1446 } }));
    expect(result.bookmarks).toEqual({ enabled: true, allowForLocations: false, allowForFilters: true });
    expect(result.sorting).toEqual(jasmine.objectContaining({ hideSorting: true, allowSortByViews: false }));
    expect(result.filter).toEqual(jasmine.objectContaining({ allowFilterByBookmarks: true, hidePriceFilter: true }));
    expect(result.subscription.enabled).toBe(false);
    expect(result.locationEditors.time).toBe('24H');
    expect(result.design).toEqual(jasmine.objectContaining({
      listViewPosition: 'expanded', detailsMapPosition: 'bottom', enableMapTerrainView: true, allowStyleSelection: false, showDetailsCategory: false, showContributorName: true
    }));
    expect(result.globalEntries.charging.description).toBe('<p>Pay once.</p>');
    expect((await call('getSettings', {})).locationEditors.time).toBe('24H');
  });

  describe('refuses, and changes nothing', () => {
    beforeEach(async () => {
      await call('updateSettings', { listViewStyle: 'smallImage', introAreaRadius: 10, distanceUnit: 'metric' });
    });

    const unchanged = async () => {
      const settings = await call('getSettings', {});
      expect(settings.design.listViewStyle).toBe('smallImage');
      expect(settings.introductoryListView.searchOptions.areaRadiusOptions.radius).toBe(10);
      expect(settings.measurementUnit).toBe('metric');
    };

    it('a call with no setting in it', async () => {
      await expectAsync(call('updateSettings', {})).toBeRejected();
      await unchanged();
    });

    it('a choice it does not offer', async () => {
      expect(await refusal(call('updateSettings', { listViewStyle: 'carousel' }))).toContain('listViewStyle');
      expect(await refusal(call('updateSettings', { distanceUnit: 'miles', listViewStyle: 'backgroundImage' }))).toContain('distanceUnit');
      await unchanged();
    });

    it('a switch that is not true or false', async () => {
      expect(await refusal(call('updateSettings', { hideQuickFilter: 'yes' }))).toContain('hideQuickFilter');
      await unchanged();
    });

    it('an area radius outside 1 to 200 miles', async () => {
      expect(await refusal(call('updateSettings', { introAreaRadius: 0 }))).toContain('introAreaRadius');
      expect(await refusal(call('updateSettings', { introAreaRadius: 201 }))).toContain('introAreaRadius');
      await unchanged();
    });

    it('pictures that are not a list', async () => {
      expect(await refusal(call('updateSettings', { introImages: 'https://example.com/banner.png' }))).toContain('introImages');
      await unchanged();
    });

    it('removing a setting that cannot be empty', async () => {
      expect(await refusal(call('updateSettings', { distanceUnit: null }))).toContain('distanceUnit');
      await unchanged();
    });

    it('charging while app users cannot add locations', async () => {
      const settings = await call('getSettings', {});
      expect(settings.globalEntries.locations.allowAdding).toBe('none');
      expect(await refusal(call('updateSettings', { chargeForNewLocations: 'all' }))).toContain('chargeForNewLocations');
      expect((await call('getSettings', {})).globalEntries.charging.enabled).toBe('none');
    });
  });
});
