// settings: the plugin's one settings record, with its design and introduction screen options.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));

// A refresh message to the widget, which nothing here answers: the spy only answers.
const quiet = () => {
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') spyOn(buildfire.messaging, 'sendMessageToWidget');
};

contract.describe('getSettings', () => {
  it('shows the settings', async () => {
    expect(await call('getSettings', {})).toEqual(jasmine.objectContaining({
      followingEnabled: jasmine.any(Boolean), distanceUnit: jasmine.any(String), introImages: jasmine.any(Array), locationFields: jasmine.any(Array),
    }));
  });
});

contract.describe('updateSettings', () => {
  beforeEach(quiet);

  it('changes one setting', async () => {
    expect(await call('updateSettings', { distanceUnit: 'imperial' })).toEqual(jasmine.objectContaining({ distanceUnit: 'imperial' }));
  });

  it('changes every setting', async () => {
    expect(await call('updateSettings', {
      followingEnabled: true,
      allowCustomNotifications: false,
      defaultSorting: 'distance',
      hideSorting: false,
      allowSortByReverseAlphabetical: true,
      allowSortByNearest: true,
      allowSortByPriceLowToHigh: false,
      allowSortByPriceHighToLow: true,
      allowSortByDate: true,
      allowSortByRating: false,
      allowSortByViews: true,
      allowFilterByArea: true,
      allowFilterByBookmarks: false,
      hideOpeningHoursFilter: false,
      hidePriceFilter: true,
      distanceUnit: 'metric',
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
      listViewStyle: 'smallImage',
      defaultMapType: 'satellite',
      enableMapTerrainView: true,
      hideQuickFilter: false,
      allowMapStyleSelection: true,
      showDetailsCategory: true,
      showContributorName: false,
      detailsMapPosition: 'bottom',
      introDescription: '<p>Welcome to our places</p>',
      introSorting: 'alphabetical',
      introLocationsSource: 'AreaRadius',
      introAreaAddress: 'San Diego, CA',
      introAreaLatitude: 32.7157,
      introAreaLongitude: -117.1611,
      introAreaRadius: 25,
      introImages: [{ title: 'Welcome', iconUrl: 'https://example.com/pre-intro.png', action: 'noAction' }],
    })).toEqual(jasmine.objectContaining({ distanceUnit: 'metric', timeFormat: '24H', introAreaRadius: 25 }));
  });
});
