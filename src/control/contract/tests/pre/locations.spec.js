// locations: every operation on locations, their pins and their field values, one block each, after the helpers they share.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const place = (title, extra = {}) => ({
  title,
  address: '1 Market St, San Diego, CA',
  latitude: 32.7157,
  longitude: -117.1611,
  listImage: ['https://example.com/pre-list.png'],
  description: '<p>A place to visit.</p>',
  ...extra
});
// The plugin's own bookkeeping and the contract events get no answer here: spies stand in for them and only answer.
const quiet = () => {
  spyOn(buildfire.messaging, 'sendMessageToWidget');
  if (buildfire.analytics && buildfire.analytics.registerEvent) spyOn(buildfire.analytics, 'registerEvent');
  if (buildfire.deeplink && buildfire.deeplink.registerDeeplink) spyOn(buildfire.deeplink, 'registerDeeplink');
  if (buildfire.deeplink && buildfire.deeplink.unregisterDeeplink) spyOn(buildfire.deeplink, 'unregisterDeeplink');
  spyOn(buildfire.services.contract.events, 'send').and.callFake((eventName, data, callback) => callback && callback(null, []));
};

// Only the control panel makes categories and location fields, and its run comes first: it makes these once, and the app's run finds them.
const categoryName = 'Pre location category for the app';
const subcategoryName = 'Pre location subcategory for the app';
let madeCategory;
const categoryForTheApp = () => {
  madeCategory = madeCategory || (contract.host === 'control'
    ? call('createCategory', { title: categoryName, subcategories: subcategoryName })
    : call('searchCategories', { title: categoryName }).then(({ result }) => (result[0]
      ? { id: result[0].id, ...result[0].data }
      : Promise.reject(new Error(`no category named "${categoryName}": the control run makes it`)))));
  return madeCategory;
};
const fieldLabel = 'Pre link field for the app';
let madeField;
const fieldForTheApp = () => {
  madeField = madeField || (contract.host === 'control'
    ? call('createLocationField', { label: fieldLabel, section: 'content', type: 'URL', allowCustomLabel: true })
    : call('getSettings', {}).then(({ locationFields }) => locationFields.find((field) => field.label === fieldLabel)
      || Promise.reject(new Error(`no location field labelled "${fieldLabel}": the control run makes it`))));
  return madeField;
};
const located = (title) => jasmine.objectContaining({ locations: jasmine.arrayContaining([jasmine.objectContaining({ title })]) });

contract.describe('searchLocations', () => {
  beforeEach(quiet);

  it('finds a location by its title', async () => {
    const title = `Pre searched location (${contract.host})`;
    await call('createLocation', place(title));
    expect(await call('searchLocations', { title })).toEqual(located(title));
  });

  it('finds a location by its text, category and subcategory, a page at a time', async () => {
    await categoryForTheApp();
    const title = `Pre categorized location (${contract.host})`;
    await call('createLocation', place(title, { categories: `${categoryName} -> ${subcategoryName}` }));
    expect(await call('searchLocations', {
      title, searchText: 'categorized', category: categoryName, subcategory: subcategoryName, pinnedOnly: false, sortBy: 'newest', page: 0, pageSize: 10
    })).toEqual(located(title));
  });
});

contract.describe('getLocation', () => {
  beforeEach(quiet);

  it('shows a location by its title', async () => {
    const title = `Pre location to get (${contract.host})`;
    await call('createLocation', place(title));
    expect(await call('getLocation', { title })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });
});

contract.describe('getLocationAdvanced', () => {
  beforeEach(quiet);

  it('shows a location by its id', async () => {
    const title = `Pre location to get by id (${contract.host})`;
    const { id } = await call('createLocation', place(title));
    expect(await call('getLocationAdvanced', { locationId: id })).toEqual(jasmine.objectContaining({ id, title }));
  });
});

contract.describe('createLocation', () => {
  beforeEach(quiet);

  it('adds a location from its required details', async () => {
    const title = `Pre location (${contract.host})`;
    expect(await call('createLocation', place(title))).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });

  it('adds a location with every optional detail', async () => {
    await categoryForTheApp();
    const title = `Pre full location (${contract.host})`;
    expect(await call('createLocation', place(title, {
      subtitle: 'By the bay',
      formattedAddress: '1 Market St, San Diego, CA 92101, USA',
      addressAlias: 'Market Corner',
      images: ['https://example.com/pre-one.png', 'https://example.com/pre-two.png'],
      categories: `${categoryName} -> ${subcategoryName}`,
      markerType: 'circle',
      markerImage: [],
      markerColor: 'rgba(0,128,255,1)',
      showCategory: false,
      showOpeningHours: true,
      showPriceRange: true,
      showStarRating: true,
      priceRange: 3,
      priceCurrency: '€',
      actionItems: [{ title: 'Call us', action: 'callNumber', phoneNumber: '+15550100' }],
      pinned: false,
      mondayHours: '09:00-12:00, 13:00-17:00',
      tuesdayHours: '09:00-17:00',
      wednesdayHours: '09:00-17:00',
      thursdayHours: '09:00-17:00',
      fridayHours: '09:00-21:00',
      saturdayHours: '10:00-14:00',
      sundayHours: 'closed'
    }))).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title, subtitle: 'By the bay', priceRange: 3 }));
  });
});

contract.describe('createLocationsAdvanced', () => {
  beforeEach(quiet);

  it('adds several locations at once', async () => {
    const locations = [`Pre batch location one (${contract.host})`, `Pre batch location two (${contract.host})`].map((title) => place(title));
    expect(await call('createLocationsAdvanced', { locations })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('updateLocation', () => {
  beforeEach(quiet);

  it("changes a location's subtitle, naming it by its title", async () => {
    const title = `Pre location to update (${contract.host})`;
    await call('createLocation', place(title));
    expect(await call('updateLocation', { title, newSubtitle: 'Updated before the next contract' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), subtitle: 'Updated before the next contract' }));
  });

  it("changes every detail of a location", async () => {
    await categoryForTheApp();
    const title = `Pre location to change (${contract.host})`;
    await call('createLocation', place(title, { subtitle: 'Old' }));
    expect(await call('updateLocation', {
      title,
      newTitle: `Pre location changed (${contract.host})`,
      newSubtitle: null,
      newAddress: '2 Market St, San Diego, CA',
      newLatitude: 32.72,
      newLongitude: -117.16,
      newFormattedAddress: '2 Market St, San Diego, CA 92101, USA',
      newAddressAlias: 'Next door',
      newListImage: ['https://example.com/pre-new-list.png'],
      newDescription: '<p>Changed.</p>',
      newImages: ['https://example.com/pre-three.png'],
      newCategories: categoryName,
      newMarkerType: 'image',
      newMarkerImage: ['https://example.com/pre-marker.png'],
      newMarkerColor: null,
      newShowCategory: true,
      newShowOpeningHours: true,
      newShowPriceRange: false,
      newShowStarRating: false,
      newPriceRange: 2,
      newPriceCurrency: '$',
      newActionItems: [],
      newPinned: false,
      newMondayHours: 'closed',
      newTuesdayHours: '08:00-20:00',
      newWednesdayHours: '08:00-20:00',
      newThursdayHours: '08:00-20:00',
      newFridayHours: '08:00-22:00',
      newSaturdayHours: '08:00-22:00',
      newSundayHours: '10:00-16:00'
    })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title: `Pre location changed (${contract.host})` }));
  });
});

contract.describe('updateLocationAdvanced', () => {
  beforeEach(quiet);

  it("changes a location by its id", async () => {
    const { id } = await call('createLocation', place(`Pre location to update by id (${contract.host})`));
    expect(await call('updateLocationAdvanced', { locationId: id, newAddressAlias: 'Corner' })).toEqual(jasmine.objectContaining({ id, addressAlias: 'Corner' }));
  });
});

contract.describe('updateLocationsAdvanced', () => {
  beforeEach(quiet);

  it('changes several locations at once', async () => {
    const one = await call('createLocation', place(`Pre batch location to update one (${contract.host})`));
    const two = await call('createLocation', place(`Pre batch location to update two (${contract.host})`));
    expect(await call('updateLocationsAdvanced', { locations: [{ locationId: one.id, newSubtitle: 'One' }, { locationId: two.id, newPriceRange: 2 }] }))
      .toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('deleteLocation', () => {
  beforeEach(quiet);

  it('removes a location by its title', async () => {
    const title = `Pre location to delete (${contract.host})`;
    await call('createLocation', place(title));
    expect(await call('deleteLocation', { title })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });
});

contract.describe('deleteLocationAdvanced', () => {
  beforeEach(quiet);

  it('removes a location by its id', async () => {
    const { id } = await call('createLocation', place(`Pre location to delete by id (${contract.host})`));
    expect(await call('deleteLocationAdvanced', { locationId: id })).toEqual(jasmine.objectContaining({ id }));
  });
});

contract.describe('deleteLocationsAdvanced', () => {
  beforeEach(quiet);

  it('removes several locations at once', async () => {
    const one = await call('createLocation', place(`Pre batch location to delete one (${contract.host})`));
    const two = await call('createLocation', place(`Pre batch location to delete two (${contract.host})`));
    expect(await call('deleteLocationsAdvanced', { locations: [{ locationId: one.id }, { locationId: two.id }] })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

// Pins are shared by every location (up to three): each spec unpins what it pinned.
contract.describe('updatePinnedLocationOrder', () => {
  beforeEach(quiet);

  it('moves a pinned location to the top', async () => {
    const titles = [`Pre pinned location one (${contract.host})`, `Pre pinned location two (${contract.host})`];
    const { locations } = await call('createLocationsAdvanced', { locations: titles.map((title) => place(title, { pinned: true })) });
    expect(await call('updatePinnedLocationOrder', { title: titles[1], position: 1 })).toEqual(jasmine.objectContaining({
      locations: jasmine.arrayContaining([jasmine.objectContaining({ title: titles[1], pinPosition: 1 })])
    }));
    await call('updateLocationsAdvanced', { locations: locations.map((entry) => ({ locationId: entry.id, newPinned: false })) });
  }, 120000);
});

contract.describe('updatePinnedLocationOrderAdvanced', () => {
  beforeEach(quiet);

  it('moves a pinned location by its id', async () => {
    const titles = [`Pre pinned by id one (${contract.host})`, `Pre pinned by id two (${contract.host})`];
    const { locations } = await call('createLocationsAdvanced', { locations: titles.map((title) => place(title, { pinned: true })) });
    expect(await call('updatePinnedLocationOrderAdvanced', { locationId: locations[1].id, position: 1 })).toEqual(jasmine.objectContaining({
      locations: jasmine.arrayContaining([jasmine.objectContaining({ id: locations[1].id, pinPosition: 1 })])
    }));
    await call('updateLocationsAdvanced', { locations: locations.map((entry) => ({ locationId: entry.id, newPinned: false })) });
  }, 120000);
});

contract.describe('updateLocationFieldValue', () => {
  beforeEach(quiet);

  it("sets a location's field value, both named by their text", async () => {
    await fieldForTheApp();
    const title = `Pre location with a field value (${contract.host})`;
    await call('createLocation', place(title));
    expect(await call('updateLocationFieldValue', { title, fieldLabel, newValue: 'https://example.com/pre' }))
      .toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });

  it("sets a location's field value and its own label", async () => {
    await fieldForTheApp();
    const title = `Pre location with a field label (${contract.host})`;
    await call('createLocation', place(title));
    expect(await call('updateLocationFieldValue', {
      title, fieldLabel, newValue: 'https://example.com/pre-menu', newCustomLabel: 'Menu'
    })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });
});

contract.describe('updateLocationFieldValueAdvanced', () => {
  beforeEach(quiet);

  it("sets a location's field value by their ids", async () => {
    const field = await fieldForTheApp();
    const { id } = await call('createLocation', place(`Pre location with a field value by id (${contract.host})`));
    expect(await call('updateLocationFieldValueAdvanced', {
      locationId: id, fieldId: field.id, newValue: 'https://example.com/pre-by-id', newCustomLabel: 'Site'
    })).toEqual(jasmine.objectContaining({ id }));
  });
});

contract.describe('updateLocationsFieldValueAdvanced', () => {
  beforeEach(quiet);

  it('sets field values on several locations at once', async () => {
    const field = await fieldForTheApp();
    const one = await call('createLocation', place(`Pre batch field value one (${contract.host})`));
    const two = await call('createLocation', place(`Pre batch field value two (${contract.host})`));
    expect(await call('updateLocationsFieldValueAdvanced', {
      values: [{ locationId: one.id, fieldId: field.id, newValue: 'https://example.com/pre-one' }, { locationId: two.id, fieldId: field.id, newValue: 'https://example.com/pre-two', newCustomLabel: 'Two' }]
    })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});
