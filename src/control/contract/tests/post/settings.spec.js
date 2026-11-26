// settings: the plugin's one settings record, with its design and introduction screen options.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// How a call was refused: its code (ContractOperationInvokeError.CODES) and its reason; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => { fail('expected the call to be refused'); return {}; },
  (error) => ({ code: (error && error.code) || 'unknown', reason: reason(error) }));
// What a refusal is expected to be: its code, and a reason naming the text given.
const refused = (code, text) => ({ code, reason: jasmine.stringContaining(text) });

// Every setting the plugin keeps, by what it holds.
const SWITCHES = ['followingEnabled', 'allowCustomNotifications', 'hideSorting', 'allowSortByReverseAlphabetical', 'allowSortByNearest', 'allowSortByPriceLowToHigh', 'allowSortByPriceHighToLow', 'allowSortByDate', 'allowSortByRating', 'allowSortByViews', 'allowFilterByArea', 'allowFilterByBookmarks', 'hideOpeningHoursFilter', 'hidePriceFilter', 'showInitialArea', 'bookmarksEnabled', 'allowBookmarkLocations', 'allowBookmarkSearches', 'allowOpeningHours', 'allowPriceRange', 'enableMapTerrainView', 'hideQuickFilter', 'allowMapStyleSelection', 'showDetailsCategory', 'showContributorName'];
const CHOICES = {
  defaultSorting: ['distance', 'alphabetical'],
  distanceUnit: ['metric', 'imperial'],
  timeFormat: ['12H', '24H'],
  listViewPosition: ['expanded', 'collapsed', 'halfExpanded'],
  listViewStyle: ['backgroundImage', 'smallImage'],
  defaultMapType: ['streets', 'satellite'],
  detailsMapPosition: ['top', 'bottom'],
  introSorting: ['distance', 'alphabetical', 'newest'],
  introLocationsSource: ['All', 'UserPosition', 'AreaRadius', 'MyLocations'],
};
const OPTIONAL = ['initialAreaAddress', 'initialAreaLatitude', 'initialAreaLongitude', 'introDescription', 'introAreaAddress', 'introAreaLatitude', 'introAreaLongitude', 'introAreaRadius'];
const PICTURE = {
  title: 'Welcome', iconUrl: 'https://example.com/intro.png', action: 'noAction',
};

// A refresh message to the widget the manifest never mentions: the spy only answers.
const quiet = () => {
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') spyOn(buildfire.messaging, 'sendMessageToWidget');
};

contract.describe('getSettings', () => {
  // Every control spec that saves the settings runs before the app's, so the app's run checks what any saved settings hold.
  it('shows every setting, each with a value it takes', async () => {
    const settings = await call('getSettings', {});
    SWITCHES.forEach((name) => expect(typeof settings[name]).withContext(name).toBe('boolean'));
    Object.keys(CHOICES).forEach((name) => expect(CHOICES[name]).withContext(name).toContain(settings[name]));
    OPTIONAL.forEach((name) => expect(name in settings).withContext(name).toBe(true));
    expect(settings.introImages).toEqual(jasmine.any(Array));
    expect(settings.locationFields).toEqual(jasmine.any(Array));
    settings.locationFields.forEach((field) => expect(field).toEqual({
      id: jasmine.any(String), label: jasmine.any(String), type: jasmine.any(String), section: jasmine.any(String), required: jasmine.any(Boolean), allowCustomLabel: jasmine.any(Boolean),
    }));
  });

  it('changes nothing', async () => {
    expect(await call('getSettings', {})).toEqual(await call('getSettings', {}));
  });
});

// controlBackground only: the owner's configuration is changed from the control panel.
contract.describe('updateSettings', () => {
  beforeEach(quiet);

  it('changes only the settings it is given, and returns them all', async () => {
    await call('updateSettings', { distanceUnit: 'metric', hideSorting: false });
    const result = await call('updateSettings', { distanceUnit: 'imperial', listViewStyle: 'smallImage' });
    expect(result).toEqual(jasmine.objectContaining({ distanceUnit: 'imperial', listViewStyle: 'smallImage', hideSorting: false }));
    expect(await call('getSettings', {})).toEqual(result);
  });

  it('changes the design and the introduction screen', async () => {
    const result = await call('updateSettings', {
      listViewPosition: 'halfExpanded', defaultMapType: 'satellite', detailsMapPosition: 'bottom', introDescription: '<p>Welcome</p>', introSorting: 'newest', introLocationsSource: 'AreaRadius', introAreaAddress: 'San Diego, CA', introAreaLatitude: 32.7157, introAreaLongitude: -117.1611, introAreaRadius: 25, introImages: [PICTURE],
    });
    expect(result).toEqual(jasmine.objectContaining({
      listViewPosition: 'halfExpanded', defaultMapType: 'satellite', detailsMapPosition: 'bottom', introDescription: '<p>Welcome</p>', introSorting: 'newest', introLocationsSource: 'AreaRadius', introAreaAddress: 'San Diego, CA', introAreaLatitude: 32.7157, introAreaLongitude: -117.1611, introAreaRadius: 25, introImages: [jasmine.objectContaining(PICTURE)],
    }));
    expect((await call('getSettings', {})).introImages).toEqual([jasmine.objectContaining(PICTURE)]);
  });

  it('still takes a single introduction picture that is not in a list', async () => {
    expect((await call('updateSettings', { introImages: PICTURE })).introImages).toEqual([jasmine.objectContaining(PICTURE)]);
  });

  it('removes what can be emptied', async () => {
    await call('updateSettings', { initialAreaAddress: 'San Diego', introDescription: '<p>Hi</p>', introImages: [PICTURE] });
    const result = await call('updateSettings', { initialAreaAddress: null, introDescription: '', introImages: [] });
    expect(result).toEqual(jasmine.objectContaining({ initialAreaAddress: null, introDescription: '', introImages: [] }));
  });

  it('sorts by name first once sorting by distance is turned off', async () => {
    await call('updateSettings', { allowSortByNearest: true, defaultSorting: 'distance' });
    expect(await call('updateSettings', { allowSortByNearest: false })).toEqual(jasmine.objectContaining({ allowSortByNearest: false, defaultSorting: 'alphabetical' }));
    expect(await call('updateSettings', { allowSortByNearest: true, defaultSorting: 'distance' })).toEqual(jasmine.objectContaining({ allowSortByNearest: true, defaultSorting: 'distance' }));
  });

  describe('refuses, and changes nothing', () => {
    beforeEach(async () => {
      await call('updateSettings', { allowSortByNearest: true, defaultSorting: 'distance', distanceUnit: 'metric', introAreaRadius: 10 });
    });

    it('sorting by distance first while sorting by distance is off', async () => {
      expect(await refusal(call('updateSettings', { allowSortByNearest: false, defaultSorting: 'distance' }))).toEqual(refused('validation', 'defaultSorting'));
      await call('updateSettings', { allowSortByNearest: false });
      expect(await refusal(call('updateSettings', { defaultSorting: 'distance' }))).toEqual(refused('conflict', 'defaultSorting'));
      expect(await call('getSettings', {})).toEqual(jasmine.objectContaining({ allowSortByNearest: false, defaultSorting: 'alphabetical' }));
      await call('updateSettings', { allowSortByNearest: true, defaultSorting: 'distance' });
    });

    it('a choice it does not offer', async () => {
      expect(await refusal(call('updateSettings', { distanceUnit: 'miles' }))).toEqual(refused('validation', 'distanceUnit'));
      expect(await refusal(call('updateSettings', { introLocationsSource: 'Everywhere' }))).toEqual(refused('validation', 'introLocationsSource'));
      expect((await call('getSettings', {})).distanceUnit).toBe('metric');
    });

    it('a radius out of range, or a switch that is not true or false', async () => {
      expect(await refusal(call('updateSettings', { introAreaRadius: 201 }))).toEqual(refused('validation', 'introAreaRadius'));
      expect(await refusal(call('updateSettings', { followingEnabled: 'yes' }))).toEqual(refused('validation', 'followingEnabled'));
      expect((await call('getSettings', {})).introAreaRadius).toBe(10);
    });

    it('removing a setting that cannot be empty', async () => {
      expect(await refusal(call('updateSettings', { hideSorting: null }))).toEqual(refused('validation', 'hideSorting'));
      expect(await refusal(call('updateSettings', { distanceUnit: null }))).toEqual(refused('validation', 'distanceUnit'));
    });

    it('an introduction picture that does nothing it knows', async () => {
      expect(await refusal(call('updateSettings', { introImages: [{ title: 'Broken' }] }))).toEqual(refused('validation', 'introImages'));
    });

    it('a call with no setting in it', async () => {
      expect((await refusal(call('updateSettings', {}))).code).toBe('validation');
    });
  });
});
