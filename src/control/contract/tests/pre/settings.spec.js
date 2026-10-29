// settings: the plugin's one settings record, as getSettings shows it and updateSettings changes it.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));

contract.describe('getSettings', () => {
  it('shows the settings', async () => {
    expect(await call('getSettings', {})).toEqual(jasmine.objectContaining({
      followingEnabled: jasmine.any(Boolean), listViewStyle: jasmine.any(String), locationFields: jasmine.any(Array)
    }));
  });
});

contract.describe('updateSettings', () => {
  // The refresh messages to the widget get no answer here: a spy stands in for them and only answers.
  beforeEach(() => spyOn(buildfire.messaging, 'sendMessageToWidget'));

  it('changes one setting', async () => {
    expect(await call('updateSettings', { listViewStyle: 'smallImage' })).toEqual(jasmine.objectContaining({ listViewStyle: 'smallImage' }));
  });

  it('changes every setting', async () => {
    const changes = {
      followingEnabled: true,
      allowCustomNotifications: false,
      defaultSorting: 'alphabetical',
      hideSorting: false,
      allowSortByReverseAlphabetical: true,
      allowSortByNearest: true,
      allowSortByPriceLowToHigh: false,
      allowSortByPriceHighToLow: true,
      allowSortByDate: true,
      allowSortByRating: false,
      allowSortByViews: true,
      allowFilterByArea: true,
      allowFilterByBookmarks: true,
      hideOpeningHoursFilter: false,
      hidePriceFilter: true,
      distanceUnit: 'imperial',
      showInitialArea: true,
      initialAreaAddress: 'San Diego, CA',
      initialAreaLatitude: 32.7157,
      initialAreaLongitude: -117.1611,
      bookmarksEnabled: true,
      allowBookmarkLocations: true,
      allowBookmarkSearches: false,
      allowOpeningHours: true,
      allowPriceRange: true,
      timeFormat: '24H',
      listViewPosition: 'halfExpanded',
      listViewStyle: 'backgroundImage',
      defaultMapType: 'satellite',
      enableMapTerrainView: true,
      hideQuickFilter: false,
      allowMapStyleSelection: true,
      showDetailsCategory: true,
      showContributorName: true,
      detailsMapPosition: 'bottom',
      introDescription: '<p>Welcome to our places.</p>',
      introSorting: 'newest',
      introLocationsSource: 'AreaRadius',
      introAreaAddress: '1 Market St, San Diego, CA',
      introAreaLatitude: 32.7157,
      introAreaLongitude: -117.1611,
      introAreaRadius: 25
    };
    expect(await call('updateSettings', {
      ...changes,
      introImages: [{ title: 'Pre beach', iconUrl: 'https://example.com/pre-beach.png', action: 'noAction' }]
    })).toEqual(jasmine.objectContaining(changes));
  });
});
