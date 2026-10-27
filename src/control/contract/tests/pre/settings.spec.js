// settings: the plugin's one settings record (settings, design and list view tabs), read from both sides and changed in the control panel.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const quiet = () => {
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') spyOn(buildfire.messaging, 'sendMessageToWidget');
};

contract.describe('getSettings', () => {
  beforeEach(quiet);

  it('shows the settings', async () => {
    expect(await call('getSettings', {})).toEqual(jasmine.objectContaining({
      subscription: jasmine.any(Object), design: jasmine.any(Object), sorting: jasmine.any(Object), introductoryListView: jasmine.any(Object), customFields: jasmine.any(Object)
    }));
  });
});

contract.describe('updateSettings', () => {
  beforeEach(quiet);

  it('changes one setting', async () => {
    expect(await call('updateSettings', { listViewStyle: 'smallImage' })).toEqual(jasmine.objectContaining({ design: jasmine.objectContaining({ listViewStyle: 'smallImage' }) }));
  });

  it('changes every setting', async () => {
    expect(await call('updateSettings', {
      subscriptionEnabled: true,
      distanceUnit: 'imperial',
      timeFormat: '24H',
      defaultSorting: 'distance',
      hideSorting: false,
      allowSortByReverseAlphabetical: true,
      allowSortByNearest: true,
      allowSortByPriceLowToHigh: true,
      allowSortByPriceHighToLow: false,
      allowSortByDate: true,
      allowSortByRating: false,
      allowSortByViews: true,
      allowFilterByArea: true,
      allowFilterByBookmarks: true,
      hideOpeningHoursFilter: false,
      hidePriceFilter: true,
      mapInitialArea: true,
      mapInitialAreaAddress: 'San Diego, CA, USA',
      mapInitialAreaLatitude: 32.7157,
      mapInitialAreaLongitude: -117.1611,
      bookmarksEnabled: true,
      allowBookmarkLocations: true,
      allowBookmarkSearches: false,
      listViewPosition: 'halfExpanded',
      listViewStyle: 'backgroundImage',
      defaultMapType: 'satellite',
      detailsMapPosition: 'bottom',
      enableMapTerrainView: true,
      hideQuickFilter: false,
      allowMapStyleSelection: true,
      showDetailsCategory: true,
      showContributorName: true,
      introImages: ['https://example.com/pre-banner.png'],
      introDescription: '<p>Places to visit.</p>',
      introVisibility: 'ALL',
      introSorting: 'alphabetical',
      introLocationsSource: 'AreaRadius',
      introAreaAddress: 'Balboa Park, San Diego',
      introAreaLatitude: 32.7341,
      introAreaLongitude: -117.1446,
      introAreaRadius: 15,
      openingHoursEnabled: true,
      priceRangeEnabled: true,
      chargeForNewLocations: 'none',
      paymentDetails: '<p>Pay once to add a location.</p>'
    })).toEqual(jasmine.objectContaining({
      measurementUnit: 'imperial',
      design: jasmine.objectContaining({ listViewPosition: 'halfExpanded', defaultMapType: 'satellite' }),
      introductoryListView: jasmine.objectContaining({ sorting: 'alphabetical' })
    }));
  });
});
