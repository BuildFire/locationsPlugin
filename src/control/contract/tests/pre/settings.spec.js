// settings: the plugin's one settings record, in the datastore: read from both sides, changed in the control panel.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));

contract.describe('getSettings', () => {
  it('shows the settings', async () => {
    expect(await call('getSettings', {})).toEqual(jasmine.objectContaining({
      subscription: jasmine.any(Object),
      sorting: jasmine.any(Object),
      filter: jasmine.any(Object),
      map: jasmine.any(Object),
      bookmarks: jasmine.any(Object),
      customFields: jasmine.objectContaining({ quickActions: jasmine.any(Array), content: jasmine.any(Array) }),
      design: jasmine.any(Object),
      introductoryListView: jasmine.any(Object)
    }));
  });
});

contract.describe('updateSettings', () => {
  beforeEach(() => spyOn(buildfire.messaging, 'sendMessageToWidget'));

  it('changes one setting', async () => {
    expect(await call('updateSettings', { distanceUnit: 'imperial' })).toEqual(jasmine.objectContaining({ measurementUnit: 'imperial' }));
  });

  it('changes every setting at once', async () => {
    expect(await call('updateSettings', {
      allowSubscriptions: true,
      timeFormat: '12H',
      defaultSorting: 'alphabetical',
      hideSorting: false,
      allowSortByReverseAlphabetical: true,
      allowSortByNearest: true,
      allowSortByPriceHighToLow: true,
      allowSortByPriceLowToHigh: false,
      allowSortByViews: true,
      allowSortByDate: false,
      allowSortByRating: true,
      allowFilterByArea: true,
      hideOpeningHoursFilter: false,
      hidePriceFilter: false,
      allowFilterByBookmarks: false,
      distanceUnit: 'metric',
      enableInitialArea: true,
      initialAreaLatitude: 33.809,
      initialAreaLongitude: -117.919,
      initialAreaAddress: 'Anaheim, CA, USA',
      enableBookmarks: true,
      allowBookmarkLocations: true,
      allowBookmarkSearch: false,
      enableOpenHours: true,
      enablePriceRange: false,
      chargeForNewLocations: 'none',
      paymentDetails: '<p>Pre payment terms</p>',
      listViewPosition: 'expanded',
      listViewStyle: 'backgroundImage',
      defaultMapType: 'streets',
      enableMapTerrainView: false,
      hideQuickFilter: false,
      allowMapStyleSelection: true,
      showDetailsCategory: true,
      showContributorName: false,
      detailsMapPosition: 'top',
      introVisibility: 'ALL',
      introDescription: '<p>Pre introduction</p>',
      introImages: [{ title: 'Pre slide', iconUrl: 'https://example.com/pre-slide.png', action: 'noAction' }],
      introSorting: 'alphabetical',
      introLocationSource: 'All',
      introAreaLatitude: 33.809,
      introAreaLongitude: -117.919,
      introAreaAddress: 'Anaheim, CA, USA',
      introAreaRadius: 50
    })).toEqual(jasmine.objectContaining({ measurementUnit: 'metric', design: jasmine.objectContaining({ listViewPosition: 'expanded' }) }));
  });
});
