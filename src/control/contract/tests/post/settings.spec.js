// settings: the plugin's one settings record (settings, design and introduction screen), read by getSettings on both
// hosts and changed by updateSettings in the control panel only.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);
const unique = (label) => `Post ${label} (${contract.host}) ${Date.now()}`;

const settingsNow = () => call('getSettings', {});

// Values of the declared kinds, for the checks any saved state must pass.
const oneOf = (...values) => ({
  asymmetricMatch: (actual) => values.indexOf(actual) > -1,
  jasmineToString: () => `<one of ${values.join(', ')}>`,
});
const textOrNull = {
  asymmetricMatch: (actual) => actual === null || typeof actual === 'string',
  jasmineToString: () => '<text or null>',
};
const numberOrNull = {
  asymmetricMatch: (actual) => actual === null || typeof actual === 'number',
  jasmineToString: () => '<number or null>',
};
const flag = jasmine.any(Boolean);
const FIELD_TYPES = {
  quickActions: ['EMAIL', 'PHONE', 'URL'],
  content: ['EMAIL', 'PHONE', 'URL', 'TEXT', 'RICH_TEXT'],
};

// What any saved settings look like: each declared field of its type, or among the values its description allows.
const expectSettingsShape = (settings) => {
  expect(settings).toEqual(jasmine.objectContaining({
    subscription: jasmine.objectContaining({ enabled: flag }),
    measurementUnit: oneOf('metric', 'imperial'),
    introductoryListView: jasmine.objectContaining({
      images: jasmine.any(Array),
      description: textOrNull,
      sorting: oneOf('distance', 'alphabetical', 'newest'),
      searchOptions: jasmine.objectContaining({
        mode: oneOf('All', 'UserPosition', 'AreaRadius', 'MyLocations'),
        areaRadiusOptions: jasmine.any(Object),
      }),
    }),
    sorting: jasmine.objectContaining({
      defaultSorting: oneOf('distance', 'alphabetical'),
      hideSorting: flag,
      allowSortByReverseAlphabetical: flag,
      allowSortByNearest: flag,
      allowSortByPriceLowToHigh: flag,
      allowSortByPriceHighToLow: flag,
      allowSortByDate: flag,
      allowSortByRating: flag,
      allowSortByViews: flag,
    }),
    filter: jasmine.objectContaining({
      allowFilterByArea: flag, allowFilterByBookmarks: flag, hideOpeningHoursFilter: flag, hidePriceFilter: flag,
    }),
    map: jasmine.objectContaining({
      initialArea: flag,
      initialAreaCoordinates: jasmine.objectContaining({ lat: numberOrNull, lng: numberOrNull }),
      initialAreaDisplayAddress: textOrNull,
    }),
    bookmarks: jasmine.objectContaining({ enabled: flag, allowForLocations: flag, allowForFilters: flag }),
    customFields: jasmine.objectContaining({ quickActions: jasmine.any(Array), content: jasmine.any(Array) }),
    design: jasmine.objectContaining({
      listViewPosition: oneOf('expanded', 'collapsed', 'halfExpanded'),
      listViewStyle: oneOf('backgroundImage', 'smallImage'),
      defaultMapType: oneOf('streets', 'satellite'),
      detailsMapPosition: oneOf('top', 'bottom'),
      enableMapTerrainView: flag,
      hideQuickFilter: flag,
      allowStyleSelection: flag,
      showDetailsCategory: flag,
      showContributorName: flag,
    }),
    globalEntries: jasmine.objectContaining({
      openHours: jasmine.objectContaining({ enabled: flag }),
      priceRange: jasmine.objectContaining({ enabled: flag }),
      charging: jasmine.objectContaining({ description: jasmine.any(String) }),
    }),
    locationEditors: jasmine.objectContaining({ time: oneOf('12H', '24H') }),
  }));
  settings.introductoryListView.images.forEach((image) => {
    expect(image).toEqual(jasmine.objectContaining({ iconUrl: jasmine.any(String), action: jasmine.any(String) }));
  });
  const area = settings.introductoryListView.searchOptions.areaRadiusOptions;
  ['lat', 'lng', 'radius'].filter((key) => area[key] !== undefined).forEach((key) => expect(area[key]).toEqual(numberOrNull));
  Object.keys(FIELD_TYPES).forEach((group) => settings.customFields[group].forEach((field) => {
    expect(field).toEqual(jasmine.objectContaining({
      id: jasmine.any(String),
      group,
      label: jasmine.any(String),
      type: oneOf(...FIELD_TYPES[group]),
      required: flag,
      allowCustomLabel: flag,
    }));
  }));
};

// Every setting updateSettings takes, two ways round: `on` and its opposite give each one a different value.
const everySetting = (on, stamp) => ({
  subscriptionEnabled: on,
  measurementUnit: on ? 'imperial' : 'metric',
  initialArea: on,
  initialAreaAddress: `${on ? 'San Diego, CA' : 'Los Angeles, CA'} ${stamp}`,
  initialAreaLatitude: on ? 32.7157 : 34.0522,
  initialAreaLongitude: on ? -117.1611 : -118.2437,
  defaultSorting: on ? 'distance' : 'alphabetical',
  hideSorting: on,
  allowSortByReverseAlphabetical: !on,
  allowSortByNearest: on,
  allowSortByPriceLowToHigh: !on,
  allowSortByPriceHighToLow: on,
  allowSortByDate: !on,
  allowSortByRating: on,
  allowSortByViews: !on,
  allowFilterByArea: !on,
  allowFilterByBookmarks: on,
  hideOpeningHoursFilter: on,
  hidePriceFilter: !on,
  bookmarksEnabled: !on,
  allowBookmarkLocations: on,
  allowBookmarkSearch: !on,
  openHoursEnabled: !on,
  priceRangeEnabled: on,
  paymentDetails: `<p>Pay at the front desk ${stamp}</p>`,
  timeFormat: on ? '24H' : '12H',
  listViewPosition: on ? 'halfExpanded' : 'expanded',
  listViewStyle: on ? 'smallImage' : 'backgroundImage',
  mapType: on ? 'satellite' : 'streets',
  detailsMapPosition: on ? 'bottom' : 'top',
  enableMapTerrainView: on,
  hideQuickFilter: !on,
  allowStyleSelection: on,
  showDetailsCategory: !on,
  showContributorName: on,
  introImages: [{ title: 'Welcome', action: 'noAction', iconUrl: `https://example.com/welcome-${on ? 'on' : 'off'}.png` }],
  introDescription: `<p>Welcome ${stamp}</p>`,
  introSorting: on ? 'newest' : 'alphabetical',
  introLocationSource: on ? 'AreaRadius' : 'MyLocations',
  introAreaAddress: `${on ? 'Austin, TX' : 'Denver, CO'} ${stamp}`,
  introAreaLatitude: on ? 30.2672 : 39.7392,
  introAreaLongitude: on ? -97.7431 : -104.9903,
  introAreaRadius: on ? 25 : 120,
});
// Those settings as getSettings shows them.
const asShown = (s) => jasmine.objectContaining({
  subscription: jasmine.objectContaining({ enabled: s.subscriptionEnabled }),
  measurementUnit: s.measurementUnit,
  introductoryListView: jasmine.objectContaining({
    images: [jasmine.objectContaining({ iconUrl: s.introImages[0].iconUrl, action: s.introImages[0].action })],
    description: s.introDescription,
    sorting: s.introSorting,
    searchOptions: jasmine.objectContaining({
      mode: s.introLocationSource,
      areaRadiusOptions: jasmine.objectContaining({
        formattedLocation: s.introAreaAddress, lat: s.introAreaLatitude, lng: s.introAreaLongitude, radius: s.introAreaRadius,
      }),
    }),
  }),
  sorting: jasmine.objectContaining({
    defaultSorting: s.defaultSorting,
    hideSorting: s.hideSorting,
    allowSortByReverseAlphabetical: s.allowSortByReverseAlphabetical,
    allowSortByNearest: s.allowSortByNearest,
    allowSortByPriceLowToHigh: s.allowSortByPriceLowToHigh,
    allowSortByPriceHighToLow: s.allowSortByPriceHighToLow,
    allowSortByDate: s.allowSortByDate,
    allowSortByRating: s.allowSortByRating,
    allowSortByViews: s.allowSortByViews,
  }),
  filter: jasmine.objectContaining({
    allowFilterByArea: s.allowFilterByArea,
    allowFilterByBookmarks: s.allowFilterByBookmarks,
    hideOpeningHoursFilter: s.hideOpeningHoursFilter,
    hidePriceFilter: s.hidePriceFilter,
  }),
  map: jasmine.objectContaining({
    initialArea: s.initialArea,
    initialAreaCoordinates: jasmine.objectContaining({ lat: s.initialAreaLatitude, lng: s.initialAreaLongitude }),
    initialAreaDisplayAddress: s.initialAreaAddress,
  }),
  bookmarks: jasmine.objectContaining({
    enabled: s.bookmarksEnabled, allowForLocations: s.allowBookmarkLocations, allowForFilters: s.allowBookmarkSearch,
  }),
  design: jasmine.objectContaining({
    listViewPosition: s.listViewPosition,
    listViewStyle: s.listViewStyle,
    defaultMapType: s.mapType,
    detailsMapPosition: s.detailsMapPosition,
    enableMapTerrainView: s.enableMapTerrainView,
    hideQuickFilter: s.hideQuickFilter,
    allowStyleSelection: s.allowStyleSelection,
    showDetailsCategory: s.showDetailsCategory,
    showContributorName: s.showContributorName,
  }),
  globalEntries: jasmine.objectContaining({
    openHours: jasmine.objectContaining({ enabled: s.openHoursEnabled }),
    priceRange: jasmine.objectContaining({ enabled: s.priceRangeEnabled }),
    charging: jasmine.objectContaining({ description: s.paymentDetails }),
  }),
  locationEditors: jasmine.objectContaining({ time: s.timeFormat }),
});

// Refused, naming what the contract documents (when given), and the settings are exactly as they were.
const expectRefused = async (parameters, named) => {
  const before = await settingsNow();
  const why = await refusal(call('updateSettings', parameters));
  if (named) expect(why).toContain(named);
  expect(await settingsNow()).toEqual(before);
};

const BOOLEAN_SETTINGS = [
  'subscriptionEnabled', 'initialArea', 'hideSorting', 'allowSortByReverseAlphabetical', 'allowSortByNearest',
  'allowSortByPriceLowToHigh', 'allowSortByPriceHighToLow', 'allowSortByDate', 'allowSortByRating', 'allowSortByViews',
  'allowFilterByArea', 'allowFilterByBookmarks', 'hideOpeningHoursFilter', 'hidePriceFilter', 'bookmarksEnabled',
  'allowBookmarkLocations', 'allowBookmarkSearch', 'openHoursEnabled', 'priceRangeEnabled', 'enableMapTerrainView',
  'hideQuickFilter', 'allowStyleSelection', 'showDetailsCategory', 'showContributorName',
];
const SELECT_SETTINGS = [
  'measurementUnit', 'defaultSorting', 'timeFormat', 'listViewPosition', 'listViewStyle', 'mapType',
  'detailsMapPosition', 'introSorting', 'introLocationSource',
];

contract.describe('getSettings', () => {
  it('shows the settings, each of its declared type or among its allowed values', async () => {
    expectSettingsShape(await settingsNow());
  });

  it('changes nothing: two reads in a row agree', async () => {
    const first = await settingsNow();
    expect(await settingsNow()).toEqual(first);
  });
});

// controlBackground only: this block runs in the control frame, where the datastore is writable.
contract.describe('updateSettings', () => {
  // Nothing in the frame answers messaging: the refresh messages each save sends the widget are the plugin's own
  // bookkeeping, which the manifest never mentions, so the spy only answers.
  beforeEach(() => {
    spyOn(buildfire.messaging, 'sendMessageToWidget');
  });

  it('changes the one setting it is given, and returns the settings', async () => {
    const imperial = await call('updateSettings', { measurementUnit: 'imperial' });
    expectSettingsShape(imperial);
    expect(imperial.measurementUnit).toBe('imperial');
    expect((await call('updateSettings', { measurementUnit: 'metric' })).measurementUnit).toBe('metric');
    expect((await settingsNow()).measurementUnit).toBe('metric');
  });

  it('changes every setting it is given at once, and getSettings then shows them', async () => {
    const stamp = unique('every');
    const on = everySetting(true, stamp);
    expect(await call('updateSettings', on)).toEqual(asShown(on));
    expect(await settingsNow()).toEqual(asShown(on));
    const off = everySetting(false, stamp);
    expect(await call('updateSettings', off)).toEqual(asShown(off));
    const shown = await settingsNow();
    expect(shown).toEqual(asShown(off));
    expectSettingsShape(shown);
  });

  it('keeps every setting it is not given', async () => {
    await call('updateSettings', { measurementUnit: 'imperial', timeFormat: '24H', mapType: 'satellite' });
    const before = await settingsNow();
    await call('updateSettings', { timeFormat: '12H' });
    expect(await settingsNow()).toEqual({ ...before, locationEditors: { ...before.locationEditors, time: '12H' } });
  });

  it('turns opening hours and price range off and back on', async () => {
    await call('updateSettings', { openHoursEnabled: false, priceRangeEnabled: false });
    expect((await settingsNow()).globalEntries).toEqual(jasmine.objectContaining({
      openHours: jasmine.objectContaining({ enabled: false }), priceRange: jasmine.objectContaining({ enabled: false }),
    }));
    await call('updateSettings', { openHoursEnabled: true, priceRangeEnabled: true });
    expect((await settingsNow()).globalEntries).toEqual(jasmine.objectContaining({
      openHours: jasmine.objectContaining({ enabled: true }), priceRange: jasmine.objectContaining({ enabled: true }),
    }));
  });

  describe('sorting', () => {
    it('takes distance as the default while nearest first is offered', async () => {
      await call('updateSettings', { allowSortByNearest: true, defaultSorting: 'alphabetical' });
      const saved = await call('updateSettings', { defaultSorting: 'distance' });
      expect(saved.sorting).toEqual(jasmine.objectContaining({ allowSortByNearest: true, defaultSorting: 'distance' }));
      expect((await settingsNow()).sorting).toEqual(jasmine.objectContaining({ allowSortByNearest: true, defaultSorting: 'distance' }));
    });

    it('makes alphabetical the default when nearest first is turned off', async () => {
      await call('updateSettings', { allowSortByNearest: true, defaultSorting: 'distance' });
      const saved = await call('updateSettings', { allowSortByNearest: false });
      expect(saved.sorting).toEqual(jasmine.objectContaining({ allowSortByNearest: false, defaultSorting: 'alphabetical' }));
      expect((await settingsNow()).sorting).toEqual(jasmine.objectContaining({ allowSortByNearest: false, defaultSorting: 'alphabetical' }));
    });

    it('refuses distance as the default while nearest first is off, and changes nothing', async () => {
      await call('updateSettings', { allowSortByNearest: false });
      await expectRefused({ defaultSorting: 'distance' }, 'defaultSorting');
      expect((await settingsNow()).sorting).toEqual(jasmine.objectContaining({ allowSortByNearest: false, defaultSorting: 'alphabetical' }));
    });

    it('refuses turning nearest first off with distance as the default in the same call, and changes nothing', async () => {
      await call('updateSettings', { allowSortByNearest: true, defaultSorting: 'distance' });
      await expectRefused({ allowSortByNearest: false, defaultSorting: 'distance' }, 'defaultSorting');
      expect((await settingsNow()).sorting).toEqual(jasmine.objectContaining({ allowSortByNearest: true, defaultSorting: 'distance' }));
    });
  });

  describe('areas', () => {
    it("sets the map's starting area from its address, latitude and longitude together", async () => {
      const address = unique('Chicago');
      const saved = await call('updateSettings', {
        initialArea: true, initialAreaAddress: address, initialAreaLatitude: 41.8781, initialAreaLongitude: -87.6298,
      });
      const expected = jasmine.objectContaining({
        initialArea: true,
        initialAreaDisplayAddress: address,
        initialAreaCoordinates: jasmine.objectContaining({ lat: 41.8781, lng: -87.6298 }),
      });
      expect(saved.map).toEqual(expected);
      expect((await settingsNow()).map).toEqual(expected);
    });

    it("sets the introduction screen's local area and its radius", async () => {
      const address = unique('Boston');
      await call('updateSettings', {
        introLocationSource: 'AreaRadius', introAreaAddress: address, introAreaLatitude: 42.3601, introAreaLongitude: -71.0589,
      });
      await call('updateSettings', { introAreaRadius: 200 });
      expect((await settingsNow()).introductoryListView.searchOptions).toEqual(jasmine.objectContaining({
        mode: 'AreaRadius',
        areaRadiusOptions: jasmine.objectContaining({ formattedLocation: address, lat: 42.3601, lng: -71.0589, radius: 200 }),
      }));
    });

    describe('refuses, and changes nothing', () => {
      const cases = [
        ['a starting address without its latitude and longitude', { initialAreaAddress: 'Chicago, IL' }, 'initialAreaLatitude'],
        ['a starting latitude and longitude without the address', { initialAreaLatitude: 41.8781, initialAreaLongitude: -87.6298 }, 'initialAreaAddress'],
        ['a starting address and latitude without the longitude', { initialAreaAddress: 'Chicago, IL', initialAreaLatitude: 41.8781 }, 'initialAreaLongitude'],
        ['an empty starting address', { initialAreaAddress: '', initialAreaLatitude: 41.8781, initialAreaLongitude: -87.6298 }, 'initialAreaAddress'],
        ['a starting address that is not text', { initialAreaAddress: 5, initialAreaLatitude: 41.8781, initialAreaLongitude: -87.6298 }, 'initialAreaAddress'],
        ['a starting latitude above 90', { initialAreaAddress: 'Chicago, IL', initialAreaLatitude: 90.5, initialAreaLongitude: -87.6298 }, 'initialAreaLatitude'],
        ['a starting latitude below -90', { initialAreaAddress: 'Chicago, IL', initialAreaLatitude: -91, initialAreaLongitude: -87.6298 }, 'initialAreaLatitude'],
        ['a starting longitude above 180', { initialAreaAddress: 'Chicago, IL', initialAreaLatitude: 41.8781, initialAreaLongitude: 181 }, 'initialAreaLongitude'],
        ['a starting longitude below -180', { initialAreaAddress: 'Chicago, IL', initialAreaLatitude: 41.8781, initialAreaLongitude: -180.5 }, 'initialAreaLongitude'],
        ['a starting latitude that is not a number', { initialAreaAddress: 'Chicago, IL', initialAreaLatitude: '41.8781', initialAreaLongitude: -87.6298 }, 'initialAreaLatitude'],
        ['an area address without its latitude and longitude', { introAreaAddress: 'Boston, MA' }, 'introAreaLatitude'],
        ['an area latitude and longitude without the address', { introAreaLatitude: 42.3601, introAreaLongitude: -71.0589 }, 'introAreaAddress'],
        ['an empty area address', { introAreaAddress: '', introAreaLatitude: 42.3601, introAreaLongitude: -71.0589 }, 'introAreaAddress'],
        ['an area latitude above 90', { introAreaAddress: 'Boston, MA', introAreaLatitude: 95, introAreaLongitude: -71.0589 }, 'introAreaLatitude'],
        ['an area longitude below -180', { introAreaAddress: 'Boston, MA', introAreaLatitude: 42.3601, introAreaLongitude: -200 }, 'introAreaLongitude'],
        ['an area longitude that is not a number', { introAreaAddress: 'Boston, MA', introAreaLatitude: 42.3601, introAreaLongitude: null }, 'introAreaLongitude'],
        ['an area radius below 1', { introAreaRadius: 0 }, 'introAreaRadius'],
        ['an area radius above 200', { introAreaRadius: 201 }, 'introAreaRadius'],
        ['an area radius that is not a number', { introAreaRadius: '25' }, 'introAreaRadius'],
      ];
      cases.forEach(([name, parameters, named]) => {
        it(name, async () => {
          await expectRefused(parameters, named);
        });
      });
    });
  });

  describe('the introduction screen', () => {
    const picture = (name) => ({ title: name, action: 'noAction', iconUrl: `https://example.com/${name}.png` });

    it('replaces the pictures with the list given, never adding to them', async () => {
      await call('updateSettings', { introImages: [picture('first'), picture('second')] });
      await call('updateSettings', { introImages: [picture('third')] });
      expect((await settingsNow()).introductoryListView.images).toEqual([
        jasmine.objectContaining({ iconUrl: 'https://example.com/third.png', action: 'noAction' }),
      ]);
    });

    it('keeps the pictures in the order given', async () => {
      await call('updateSettings', { introImages: [picture('one'), picture('two')] });
      expect((await settingsNow()).introductoryListView.images.map((image) => image.iconUrl))
        .toEqual(['https://example.com/one.png', 'https://example.com/two.png']);
    });

    it('removes the pictures with an empty list, and with null', async () => {
      await call('updateSettings', { introImages: [picture('gone')] });
      await call('updateSettings', { introImages: [] });
      expect((await settingsNow()).introductoryListView.images).toEqual([]);
      await call('updateSettings', { introImages: [picture('gone again')] });
      await call('updateSettings', { introImages: null });
      expect((await settingsNow()).introductoryListView.images).toEqual([]);
    });

    it('keeps the pictures and text when they are left out', async () => {
      const description = `<p>${unique('kept text')}</p>`;
      await call('updateSettings', { introImages: [picture('kept')], introDescription: description });
      await call('updateSettings', { introSorting: 'newest' });
      expect((await settingsNow()).introductoryListView).toEqual(jasmine.objectContaining({
        images: [jasmine.objectContaining({ iconUrl: 'https://example.com/kept.png' })],
        description,
        sorting: 'newest',
      }));
    });

    it('removes the text with an empty one, and with null', async () => {
      await call('updateSettings', { introDescription: `<p>${unique('text')}</p>` });
      await call('updateSettings', { introDescription: '' });
      expect((await settingsNow()).introductoryListView.description).toBe('');
      await call('updateSettings', { introDescription: `<p>${unique('text again')}</p>` });
      await call('updateSettings', { introDescription: null });
      expect([null, '']).toContain((await settingsNow()).introductoryListView.description);
    });

    describe('refuses, and changes nothing', () => {
      const cases = [
        ['pictures that are not a list', { introImages: picture('bare') }, 'introImages'],
        ['a picture without its image', { introImages: [picture('fine'), { title: 'No image', action: 'noAction' }] }, 'introImages'],
        ['a picture without an action', { introImages: [{ title: 'No action', iconUrl: 'https://example.com/no-action.png' }] }, 'introImages'],
        ['a picture that is not an object', { introImages: ['https://example.com/bare.png'] }, 'introImages'],
        ['a text that is not text', { introDescription: 5 }, 'introDescription'],
      ];
      cases.forEach(([name, parameters, named]) => {
        it(name, async () => {
          await expectRefused(parameters, named);
        });
      });
    });
  });

  describe('payment details', () => {
    it('sets them, and removes them with null or an empty text', async () => {
      const details = `<p>${unique('payment')}</p>`;
      await call('updateSettings', { paymentDetails: details });
      expect((await settingsNow()).globalEntries.charging.description).toBe(details);
      await call('updateSettings', { paymentDetails: null });
      expect((await settingsNow()).globalEntries.charging.description).toBe('');
      await call('updateSettings', { paymentDetails: details });
      await call('updateSettings', { paymentDetails: '' });
      expect((await settingsNow()).globalEntries.charging.description).toBe('');
    });

    it('refuses details that are not text, and changes nothing', async () => {
      await expectRefused({ paymentDetails: 5 }, 'paymentDetails');
    });
  });

  describe('refuses a setting that is not true or false, and changes nothing', () => {
    BOOLEAN_SETTINGS.forEach((name) => {
      it(name, async () => {
        await expectRefused({ [name]: 'yes' }, name);
        await expectRefused({ [name]: null }, name);
      });
    });
  });

  describe('refuses a choice it does not offer, and changes nothing', () => {
    SELECT_SETTINGS.forEach((name) => {
      it(name, async () => {
        await expectRefused({ [name]: 'other' }, name);
        await expectRefused({ [name]: null }, name);
      });
    });
  });

  it('refuses a call that changes nothing', async () => {
    await expectRefused({}, null);
  });
});
