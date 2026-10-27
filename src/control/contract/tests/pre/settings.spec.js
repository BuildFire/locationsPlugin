// settings: the plugin's one settings record (settings, design and introduction screen), read by getSettings on both
// hosts and changed by updateSettings in the control panel only.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));

// Every setting updateSettings takes, with fixed values.
const everySetting = {
  subscriptionEnabled: true,
  measurementUnit: 'imperial',
  initialArea: true,
  initialAreaAddress: 'San Diego, CA',
  initialAreaLatitude: 32.7157,
  initialAreaLongitude: -117.1611,
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
  bookmarksEnabled: true,
  allowBookmarkLocations: true,
  allowBookmarkSearch: false,
  openHoursEnabled: true,
  priceRangeEnabled: false,
  paymentDetails: '<p>Pre payment details</p>',
  timeFormat: '24H',
  listViewPosition: 'halfExpanded',
  listViewStyle: 'smallImage',
  mapType: 'satellite',
  detailsMapPosition: 'bottom',
  enableMapTerrainView: true,
  hideQuickFilter: false,
  allowStyleSelection: true,
  showDetailsCategory: true,
  showContributorName: false,
  introImages: [{ title: 'Pre welcome', action: 'noAction', iconUrl: 'https://example.com/pre-welcome.png' }],
  introDescription: '<p>Pre welcome text</p>',
  introSorting: 'newest',
  introLocationSource: 'AreaRadius',
  introAreaAddress: 'Austin, TX',
  introAreaLatitude: 30.2672,
  introAreaLongitude: -97.7431,
  introAreaRadius: 25,
};

contract.describe('getSettings', () => {
  it('shows the settings', async () => {
    expect(await call('getSettings', {})).toEqual(jasmine.objectContaining({
      subscription: jasmine.objectContaining({ enabled: jasmine.any(Boolean) }),
      measurementUnit: jasmine.any(String),
      introductoryListView: jasmine.objectContaining({ images: jasmine.any(Array), searchOptions: jasmine.any(Object) }),
      sorting: jasmine.objectContaining({ defaultSorting: jasmine.any(String) }),
      filter: jasmine.any(Object),
      map: jasmine.objectContaining({ initialArea: jasmine.any(Boolean) }),
      bookmarks: jasmine.objectContaining({ enabled: jasmine.any(Boolean) }),
      customFields: jasmine.objectContaining({ quickActions: jasmine.any(Array), content: jasmine.any(Array) }),
      design: jasmine.objectContaining({ listViewPosition: jasmine.any(String) }),
      globalEntries: jasmine.any(Object),
      locationEditors: jasmine.objectContaining({ time: jasmine.any(String) }),
    }));
  });
});

// controlBackground only: this block runs in the control frame, where the datastore is writable.
contract.describe('updateSettings', () => {
  beforeEach(() => spyOn(buildfire.messaging, 'sendMessageToWidget'));

  it('changes one setting', async () => {
    expect(await call('updateSettings', { measurementUnit: 'metric' })).toEqual(jasmine.objectContaining({ measurementUnit: 'metric' }));
  });

  it('changes every setting at once', async () => {
    expect(await call('updateSettings', everySetting)).toEqual(jasmine.objectContaining({
      subscription: jasmine.objectContaining({ enabled: true }),
      measurementUnit: 'imperial',
      introductoryListView: jasmine.objectContaining({
        images: [jasmine.objectContaining({ iconUrl: 'https://example.com/pre-welcome.png', action: 'noAction' })],
        description: '<p>Pre welcome text</p>',
        sorting: 'newest',
        searchOptions: jasmine.objectContaining({
          mode: 'AreaRadius',
          areaRadiusOptions: jasmine.objectContaining({ formattedLocation: 'Austin, TX', lat: 30.2672, lng: -97.7431, radius: 25 }),
        }),
      }),
      sorting: jasmine.objectContaining({
        defaultSorting: 'alphabetical',
        hideSorting: false,
        allowSortByReverseAlphabetical: true,
        allowSortByNearest: true,
        allowSortByPriceLowToHigh: false,
        allowSortByPriceHighToLow: true,
        allowSortByDate: true,
        allowSortByRating: false,
        allowSortByViews: true,
      }),
      filter: jasmine.objectContaining({
        allowFilterByArea: true, allowFilterByBookmarks: true, hideOpeningHoursFilter: false, hidePriceFilter: true,
      }),
      map: jasmine.objectContaining({
        initialArea: true,
        initialAreaCoordinates: jasmine.objectContaining({ lat: 32.7157, lng: -117.1611 }),
        initialAreaDisplayAddress: 'San Diego, CA',
      }),
      bookmarks: jasmine.objectContaining({ enabled: true, allowForLocations: true, allowForFilters: false }),
      design: jasmine.objectContaining({
        listViewPosition: 'halfExpanded',
        listViewStyle: 'smallImage',
        defaultMapType: 'satellite',
        detailsMapPosition: 'bottom',
        enableMapTerrainView: true,
        hideQuickFilter: false,
        allowStyleSelection: true,
        showDetailsCategory: true,
        showContributorName: false,
      }),
      globalEntries: jasmine.objectContaining({
        openHours: jasmine.objectContaining({ enabled: true }),
        priceRange: jasmine.objectContaining({ enabled: false }),
        charging: jasmine.objectContaining({ description: '<p>Pre payment details</p>' }),
      }),
      locationEditors: jasmine.objectContaining({ time: '24H' }),
    }));
  });
});
