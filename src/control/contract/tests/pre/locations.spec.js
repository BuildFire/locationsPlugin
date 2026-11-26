// locations: every operation on locations and the values of their extra fields, one block each, after the helpers they share.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));

// A location's required details, with a fixed title.
const place = (title, extra = {}) => ({
  title, address: '1 Market St, San Diego', latitude: 32.7157, longitude: -117.1611, listImage: ['https://example.com/pre-list.png'], description: '<p>A place to visit</p>', ...extra,
});
const holding = (title) => jasmine.arrayContaining([jasmine.objectContaining({ title })]);

// Calls nothing here answers; the operations never wait for them, so the spies only answer.
const answer = (object, method) => {
  if (object && typeof object[method] === 'function') {
    spyOn(object, method).and.callFake((...args) => {
      const callback = args.find((arg) => typeof arg === 'function');
      if (callback) callback(null, {});
    });
  }
};
const quiet = () => {
  answer(buildfire.messaging, 'sendMessageToWidget');
  answer(buildfire.analytics, 'registerEvent');
  answer(buildfire.deeplink, 'registerDeeplink');
  answer(buildfire.deeplink, 'unregisterDeeplink');
  answer(buildfire.services.contract.events, 'send');
};

// Only the control panel makes categories and location fields, and its run comes first: it makes these once, and the app's run finds them.
const forTheApp = { category: 'Pre category for the app', subcategory: 'Pre subcategory for the app', field: 'Pre field for the app' };
let madeCategory;
const categoryForTheApp = () => {
  madeCategory = madeCategory || (contract.host === 'control'
    ? call('createCategory', { title: forTheApp.category, subcategories: forTheApp.subcategory })
    : call('searchCategories', { title: forTheApp.category }).then(({ result }) => result[0] || Promise.reject(new Error(`no category named "${forTheApp.category}": the control run makes it`))));
  return madeCategory;
};
let madeField;
const fieldForTheApp = () => {
  madeField = madeField || (contract.host === 'control'
    ? call('createLocationField', { label: forTheApp.field, section: 'content', type: 'TEXT', allowCustomLabel: true })
    : call('getSettings', {}).then(({ locationFields }) => locationFields.find((field) => field.label === forTheApp.field) || Promise.reject(new Error(`no field labeled "${forTheApp.field}": the control run makes it`))));
  return madeField;
};

contract.describe('searchLocations', () => {
  beforeEach(quiet);

  it('finds a location by its title', async () => {
    const title = `Pre listed location (${contract.host})`;
    await call('createLocation', place(title));
    expect((await call('searchLocations', { title })).locations).toEqual(holding(title));
  });

  it('finds a location by its text, category and subcategory, newest first, a page at a time', async () => {
    await categoryForTheApp();
    const title = `Pre listed location in a category (${contract.host})`;
    const searchText = `prelisted${contract.host}`;
    await call('createLocation', place(title, { subtitle: searchText, categories: `${forTheApp.category} -> ${forTheApp.subcategory}` }));
    expect(await call('searchLocations', {
      title, searchText, category: forTheApp.category, subcategory: forTheApp.subcategory, pinnedOnly: false, sortBy: 'newest', page: 0, pageSize: 10,
    })).toEqual(jasmine.objectContaining({ locations: holding(title), total: jasmine.any(Number) }));
  });
});

contract.describe('getLocation', () => {
  beforeEach(quiet);

  it('shows a location found by its title', async () => {
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

  it('adds a location with every detail', async () => {
    await categoryForTheApp();
    const title = `Pre location with every detail (${contract.host})`;
    expect(await call('createLocation', place(title, {
      subtitle: 'Fresh food',
      formattedAddress: '1 Market St, San Diego, CA 92101, USA',
      addressAlias: 'The market',
      images: ['https://example.com/pre-one.png', 'https://example.com/pre-two.png'],
      categories: `${forTheApp.category} -> ${forTheApp.subcategory}`,
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
      tuesdayHours: '08:00-20:00',
      wednesdayHours: '08:00-20:00',
      thursdayHours: '08:00-20:00',
      fridayHours: '08:00-22:00',
      saturdayHours: '10:00-14:00',
      sundayHours: 'closed',
    }))).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });
});

contract.describe('createLocationsAdvanced', () => {
  beforeEach(quiet);

  it('adds several locations at once', async () => {
    const locations = [place(`Pre batch location one (${contract.host})`), place(`Pre batch location two (${contract.host})`, { subtitle: 'Second', priceRange: 2 })];
    expect(await call('createLocationsAdvanced', { locations })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('updateLocation', () => {
  beforeEach(quiet);

  it("changes a location's description, found by its title", async () => {
    const title = `Pre location to update (${contract.host})`;
    await call('createLocation', place(title));
    expect(await call('updateLocation', { title, newDescription: '<p>Updated before the next contract</p>' }))
      .toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });

  it('changes every detail of a location', async () => {
    await categoryForTheApp();
    const title = `Pre location to change fully (${contract.host})`;
    await call('createLocation', place(title, { subtitle: 'Before', addressAlias: 'Before' }));
    expect(await call('updateLocation', {
      title,
      newTitle: `Pre location changed fully (${contract.host})`,
      newSubtitle: 'After',
      newAddress: '2 Harbor Dr, San Diego',
      newLatitude: 32.7,
      newLongitude: -117.17,
      newFormattedAddress: '2 Harbor Dr, San Diego, CA 92101, USA',
      newAddressAlias: null,
      newListImage: ['https://example.com/pre-new-list.png'],
      newDescription: '<p>Changed</p>',
      newImages: ['https://example.com/pre-new.png'],
      newCategories: forTheApp.category,
      newMarkerType: 'image',
      newMarkerImage: ['https://example.com/pre-marker.png'],
      newMarkerColor: null,
      newShowCategory: true,
      newShowOpeningHours: true,
      newShowPriceRange: false,
      newShowStarRating: false,
      newPriceRange: 4,
      newPriceCurrency: '$',
      newActionItems: [{ title: 'Website', action: 'linkToWeb', url: 'https://example.com' }],
      newPinned: false,
      newMondayHours: '07:00-19:00',
      newTuesdayHours: '07:00-19:00',
      newWednesdayHours: '07:00-19:00',
      newThursdayHours: '07:00-19:00',
      newFridayHours: '07:00-19:00',
      newSaturdayHours: 'closed',
      newSundayHours: 'closed',
    })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title: `Pre location changed fully (${contract.host})` }));
  });
});

contract.describe('updateLocationAdvanced', () => {
  beforeEach(quiet);

  it('changes a location by its id', async () => {
    const { id } = await call('createLocation', place(`Pre location to update by id (${contract.host})`));
    expect(await call('updateLocationAdvanced', { locationId: id, newSubtitle: 'By id', newShowStarRating: true }))
      .toEqual(jasmine.objectContaining({ id }));
  });
});

contract.describe('updateLocationsAdvanced', () => {
  beforeEach(quiet);

  it('changes several locations at once', async () => {
    const one = await call('createLocation', place(`Pre batch location to update one (${contract.host})`));
    const two = await call('createLocation', place(`Pre batch location to update two (${contract.host})`));
    expect(await call('updateLocationsAdvanced', { locations: [{ locationId: one.id, newSubtitle: 'First' }, { locationId: two.id, newPriceRange: 2 }] }))
      .toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('deleteLocation', () => {
  beforeEach(quiet);

  it('removes a location found by its title', async () => {
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
    expect(await call('deleteLocationsAdvanced', { locations: [{ locationId: one.id }, { locationId: two.id }] }))
      .toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

// Each pin is undone in the same spec: up to three locations can be pinned, and later runs pin on this instance too.
contract.describe('updatePinnedLocationOrder', () => {
  beforeEach(quiet);

  it('moves a pinned location, found by its title, to the first place', async () => {
    const title = `Pre pinned location (${contract.host})`;
    await call('createLocation', place(title, { pinned: true }));
    expect(await call('updatePinnedLocationOrder', { title, position: 1 }))
      .toEqual(jasmine.objectContaining({ locations: jasmine.arrayContaining([jasmine.objectContaining({ title, pinPosition: 1 })]) }));
    await call('updateLocation', { title, newPinned: false });
  });
});

contract.describe('updatePinnedLocationOrderAdvanced', () => {
  beforeEach(quiet);

  it('moves a pinned location, by its id, to the first place', async () => {
    const { id } = await call('createLocation', place(`Pre pinned location by id (${contract.host})`, { pinned: true }));
    expect(await call('updatePinnedLocationOrderAdvanced', { locationId: id, position: 1 }))
      .toEqual(jasmine.objectContaining({ locations: jasmine.arrayContaining([jasmine.objectContaining({ id, pinPosition: 1 })]) }));
    await call('updateLocationAdvanced', { locationId: id, newPinned: false });
  });
});

contract.describe('updateLocationFieldValue', () => {
  beforeEach(quiet);

  it("fills in a location's field, both found by their names", async () => {
    await fieldForTheApp();
    const title = `Pre location with a field (${contract.host})`;
    await call('createLocation', place(title));
    expect(await call('updateLocationFieldValue', { title, fieldLabel: forTheApp.field, newValue: 'Open late on Fridays' }))
      .toEqual(jasmine.objectContaining({ title }));
  });

  it("fills in a location's field with its own label", async () => {
    await fieldForTheApp();
    const title = `Pre location with a labeled field (${contract.host})`;
    await call('createLocation', place(title));
    expect(await call('updateLocationFieldValue', { title, fieldLabel: forTheApp.field, newValue: 'Bring cash', newCustomLabel: 'Note' }))
      .toEqual(jasmine.objectContaining({ title }));
  });
});

contract.describe('updateLocationFieldValueAdvanced', () => {
  beforeEach(quiet);

  it("fills in a location's field by their ids", async () => {
    const field = await fieldForTheApp();
    const { id } = await call('createLocation', place(`Pre location with a field by id (${contract.host})`));
    expect(await call('updateLocationFieldValueAdvanced', { locationId: id, fieldId: field.id, newValue: 'By id', newCustomLabel: 'Note' }))
      .toEqual(jasmine.objectContaining({ id }));
  });
});

contract.describe('updateLocationsFieldValueAdvanced', () => {
  beforeEach(quiet);

  it('fills in fields on several locations at once', async () => {
    const field = await fieldForTheApp();
    const one = await call('createLocation', place(`Pre batch location with a field one (${contract.host})`));
    const two = await call('createLocation', place(`Pre batch location with a field two (${contract.host})`));
    expect(await call('updateLocationsFieldValueAdvanced', { values: [{ locationId: one.id, fieldId: field.id, newValue: 'First' }, { locationId: two.id, fieldId: field.id, newValue: 'Second', newCustomLabel: 'Note' }] }))
      .toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});
