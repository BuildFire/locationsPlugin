// settings: the plugin's one settings record, as getSettings shows it and updateSettings changes it.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);

const BOOLEANS = [
  'followingEnabled', 'allowCustomNotifications', 'hideSorting', 'allowSortByReverseAlphabetical', 'allowSortByNearest', 'allowSortByPriceLowToHigh',
  'allowSortByPriceHighToLow', 'allowSortByDate', 'allowSortByRating', 'allowSortByViews', 'allowFilterByArea', 'allowFilterByBookmarks',
  'hideOpeningHoursFilter', 'hidePriceFilter', 'showInitialArea', 'bookmarksEnabled', 'allowBookmarkLocations', 'allowBookmarkSearches',
  'allowOpeningHours', 'allowPriceRange', 'enableMapTerrainView', 'hideQuickFilter', 'allowMapStyleSelection', 'showDetailsCategory', 'showContributorName'
];
const CHOICES = {
  defaultSorting: ['distance', 'alphabetical'],
  distanceUnit: ['metric', 'imperial'],
  timeFormat: ['12H', '24H'],
  listViewPosition: ['expanded', 'collapsed', 'halfExpanded'],
  listViewStyle: ['backgroundImage', 'smallImage'],
  defaultMapType: ['streets', 'satellite'],
  detailsMapPosition: ['top', 'bottom'],
  introSorting: ['distance', 'alphabetical', 'newest'],
  introLocationsSource: ['All', 'UserPosition', 'AreaRadius', 'MyLocations']
};
const settings = () => call('getSettings', {});

contract.describe('getSettings', () => {
  it('shows every setting with a value of its kind', async () => {
    const current = await settings();
    BOOLEANS.forEach((name) => expect(typeof current[name]).withContext(name).toBe('boolean'));
    Object.keys(CHOICES).forEach((name) => expect(CHOICES[name]).withContext(name).toContain(current[name]));
    expect(Array.isArray(current.introImages)).toBe(true);
    expect(Array.isArray(current.locationFields)).toBe(true);
    current.locationFields.forEach((field) => expect(field).toEqual(jasmine.objectContaining({
      id: jasmine.any(String), label: jasmine.any(String), section: jasmine.any(String), type: jasmine.any(String), required: jasmine.any(Boolean), allowCustomLabel: jasmine.any(Boolean)
    })));
  });

  it('changes nothing when read', async () => {
    expect(await settings()).toEqual(await settings());
  });
});

// controlBackground only: the app may not write the settings.
contract.describe('updateSettings', () => {
  // The refresh messages to the widget get no answer here: a spy stands in for them and only answers.
  beforeEach(() => spyOn(buildfire.messaging, 'sendMessageToWidget'));

  it('changes only the settings it is given, and returns them all', async () => {
    await call('updateSettings', { listViewStyle: 'smallImage', hidePriceFilter: true });
    const updated = await call('updateSettings', { listViewStyle: 'backgroundImage', distanceUnit: 'imperial' });
    expect(updated).toEqual(jasmine.objectContaining({ listViewStyle: 'backgroundImage', distanceUnit: 'imperial', hidePriceFilter: true }));
    expect(await settings()).toEqual(jasmine.objectContaining({ listViewStyle: 'backgroundImage', distanceUnit: 'imperial', hidePriceFilter: true }));
  });

  it('sets every kind of setting', async () => {
    const changes = {
      followingEnabled: false,
      defaultSorting: 'alphabetical',
      timeFormat: '24H',
      listViewPosition: 'halfExpanded',
      defaultMapType: 'satellite',
      detailsMapPosition: 'bottom',
      introSorting: 'newest',
      introLocationsSource: 'AreaRadius',
      introAreaAddress: '1 Market St, San Diego, CA',
      introAreaLatitude: 32.7157,
      introAreaLongitude: -117.1611,
      introAreaRadius: 25,
      initialAreaAddress: 'San Diego, CA',
      initialAreaLatitude: 32.7,
      initialAreaLongitude: -117.2,
      introDescription: '<p>Welcome to our places.</p>'
    };
    expect(await call('updateSettings', changes)).toEqual(jasmine.objectContaining(changes));
    expect(await settings()).toEqual(jasmine.objectContaining(changes));
  });

  it('replaces the introduction pictures, giving each an id, and empties them', async () => {
    const pictures = [{ title: 'Beach', iconUrl: 'https://example.com/beach.png', action: 'noAction' }, { title: 'Park', iconUrl: 'https://example.com/park.png', action: 'noAction' }];
    const updated = await call('updateSettings', { introImages: pictures });
    expect(updated.introImages).toEqual(pictures.map((picture) => jasmine.objectContaining({ ...picture, id: jasmine.any(String) })));
    expect((await call('updateSettings', { introImages: [pictures[1]] })).introImages).toEqual([jasmine.objectContaining(pictures[1])]);
    expect((await call('updateSettings', { introImages: [] })).introImages).toEqual([]);
  });

  it('clears what can be emptied, with null or an empty text', async () => {
    await call('updateSettings', { introDescription: '<p>Hello</p>', initialAreaAddress: 'Somewhere', introAreaRadius: 10 });
    const cleared = await call('updateSettings', { introDescription: '', initialAreaAddress: null, introAreaRadius: null });
    expect(cleared).toEqual(jasmine.objectContaining({ introDescription: '', initialAreaAddress: null, introAreaRadius: null }));
  });

  it('makes the default sorting alphabetical when sorting by distance is turned off', async () => {
    await call('updateSettings', { allowSortByNearest: true, defaultSorting: 'distance' });
    expect(await call('updateSettings', { allowSortByNearest: false })).toEqual(jasmine.objectContaining({ allowSortByNearest: false, defaultSorting: 'alphabetical' }));
    await call('updateSettings', { allowSortByNearest: true });
  });

  it('turns opening hours and price range on and off', async () => {
    expect(await call('updateSettings', { allowOpeningHours: false, allowPriceRange: false })).toEqual(jasmine.objectContaining({ allowOpeningHours: false, allowPriceRange: false }));
    expect(await call('updateSettings', { allowOpeningHours: true, allowPriceRange: true })).toEqual(jasmine.objectContaining({ allowOpeningHours: true, allowPriceRange: true }));
  });

  it('keeps the location fields', async () => {
    const before = (await settings()).locationFields;
    expect((await call('updateSettings', { hideQuickFilter: true })).locationFields).toEqual(before);
  });

  describe('refuses, and changes nothing', () => {
    beforeEach(async () => {
      await call('updateSettings', {
        listViewStyle: 'smallImage', allowSortByNearest: true, introAreaRadius: 15, timeFormat: '12H'
      });
    });

    const unchanged = async () => expect(await settings()).toEqual(jasmine.objectContaining({ listViewStyle: 'smallImage', introAreaRadius: 15, timeFormat: '12H' }));

    it('a call with no setting in it', async () => {
      expect(await refusal(call('updateSettings', {}))).toContain('setting');
      await unchanged();
    });

    it('a choice it does not offer', async () => {
      expect(await refusal(call('updateSettings', { listViewStyle: 'carousel' }))).toContain('listViewStyle');
      expect(await refusal(call('updateSettings', { timeFormat: '36H' }))).toContain('timeFormat');
      await unchanged();
    });

    it('a toggle that is not true or false', async () => {
      expect(await refusal(call('updateSettings', { hideSorting: 'yes', listViewStyle: 'backgroundImage' }))).toContain('hideSorting');
      await unchanged();
    });

    it('a radius out of range', async () => {
      expect(await refusal(call('updateSettings', { introAreaRadius: 201 }))).toContain('introAreaRadius');
      expect(await refusal(call('updateSettings', { introAreaRadius: 0 }))).toContain('introAreaRadius');
      await unchanged();
    });

    it('removing a setting that cannot be emptied', async () => {
      expect(await refusal(call('updateSettings', { listViewStyle: null }))).toContain('listViewStyle');
      await unchanged();
    });

    it('introduction pictures that are not a list of action items', async () => {
      expect(await refusal(call('updateSettings', { introImages: 'https://example.com/a.png' }))).toContain('introImages');
      expect(await refusal(call('updateSettings', { introImages: [{ iconUrl: 'https://example.com/a.png' }] }))).toContain('introImages');
      await unchanged();
    });

    it('distance as the default sorting while sorting by distance is off', async () => {
      await call('updateSettings', { allowSortByNearest: false });
      expect(await refusal(call('updateSettings', { defaultSorting: 'distance' }))).toContain('distance');
      expect((await settings()).defaultSorting).toBe('alphabetical');
    });
  });
});
