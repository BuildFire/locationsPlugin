// locations: every operation on locations, their location field values and their pinned order, one block each, after the helpers they share.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const quiet = () => {
  spyOn(buildfire.services.contract.events, 'send');
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') spyOn(buildfire.messaging, 'sendMessageToWidget');
  if (buildfire.analytics && typeof buildfire.analytics.registerEvent === 'function') spyOn(buildfire.analytics, 'registerEvent');
  if (buildfire.deeplink && typeof buildfire.deeplink.registerDeeplink === 'function') spyOn(buildfire.deeplink, 'registerDeeplink');
  if (buildfire.deeplink && typeof buildfire.deeplink.unregisterDeeplink === 'function') spyOn(buildfire.deeplink, 'unregisterDeeplink');
};
// A location with every required detail; extra details on top.
const place = (title, extra = {}) => ({
  title,
  address: '1549 El Prado, San Diego, CA 92101',
  latitude: 32.7341,
  longitude: -117.1446,
  description: '<p>A park in the middle of the city.</p>',
  listImage: ['https://example.com/pre-location.png'],
  ...extra
});

// Only the control panel makes categories and location fields, and its run comes first: it makes these, once, and the app's run finds them.
const categoryForTheApp = 'Pre locations category for the app';
let madeCategory;
const appCategory = () => {
  madeCategory = madeCategory || (contract.host === 'control'
    ? call('createCategory', { title: categoryForTheApp }).then(() => call('createSubcategory', { categoryTitle: categoryForTheApp, title: 'Pre gardens' }))
    : call('listCategories', { title: categoryForTheApp }).then(({ result: [record] }) => record || Promise.reject(new Error(`no category titled "${categoryForTheApp}": the control run makes it`))));
  return madeCategory;
};
const fieldForTheApp = 'Pre locations email for the app';
let madeField;
const appField = () => {
  madeField = madeField || (contract.host === 'control'
    ? call('createLocationField', { group: 'content', label: fieldForTheApp, type: 'EMAIL', enableCustomLabel: true })
    : call('getSettings', {}).then((settings) => settings.customFields.content.find((field) => field.label === fieldForTheApp)
      || Promise.reject(new Error(`no location field named "${fieldForTheApp}": the control run makes it`))));
  return madeField;
};
const everyDetail = () => ({
  subtitle: 'Gardens and museums',
  addressAlias: 'The park',
  images: ['https://example.com/pre-photo-1.png', 'https://example.com/pre-photo-2.png'],
  categories: `${categoryForTheApp} -> Pre gardens`,
  markerType: 'circle',
  markerImage: ['https://example.com/pre-marker.png'],
  markerColor: 'rgba(0,128,255,1)',
  showCategory: true,
  showOpeningHours: true,
  showPriceRange: true,
  showStarRating: true,
  priceRange: 3,
  priceCurrency: '€',
  actionItems: [{ title: 'Website', action: 'linkToWeb', url: 'https://example.com', openIn: '_blank' }],
  pinned: false,
  mondayHours: '08:00-12:00, 13:00-20:00',
  tuesdayHours: '09:00-17:00',
  wednesdayHours: '09:00-17:00',
  thursdayHours: '09:00-17:00',
  fridayHours: '09:00-22:00',
  saturdayHours: '10:00-22:00',
  sundayHours: 'closed'
});

contract.describe('searchLocations', () => {
  beforeEach(quiet);

  it('finds a location by its title', async () => {
    const title = `Pre listed location (${contract.host})`;
    await call('createLocation', place(title));
    expect(await call('searchLocations', { title })).toEqual(jasmine.objectContaining({
      locations: jasmine.arrayContaining([jasmine.objectContaining({ title })]), total: jasmine.any(Number), page: 0, hasMore: jasmine.any(Boolean)
    }));
  });

  it('finds a location by a word, category, subcategory and price, a page at a time', async () => {
    await appCategory();
    const title = `Pre narrowed prelocationsword${contract.host}`;
    await call('createLocation', place(title, { categories: `${categoryForTheApp} -> Pre gardens`, priceRange: 2 }));
    expect(await call('searchLocations', {
      search: `prelocationsword${contract.host}`, categoryName: categoryForTheApp, subcategoryName: 'Pre gardens', priceRange: 2, pinnedOnly: false, sort: 'newest', page: 0, pageSize: 10
    })).toEqual(jasmine.objectContaining({ locations: jasmine.arrayContaining([jasmine.objectContaining({ title })]) }));
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
    const { id } = await call('createLocation', place(`Pre location to get by id (${contract.host})`));
    expect(await call('getLocationAdvanced', { locationId: id })).toEqual(jasmine.objectContaining({ id }));
  });
});

contract.describe('createLocation', () => {
  beforeEach(quiet);

  it('adds a location from its required details', async () => {
    const title = `Pre location (${contract.host})`;
    expect(await call('createLocation', place(title))).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });

  it('adds a location with every optional detail', async () => {
    await appCategory();
    const title = `Pre detailed location (${contract.host})`;
    expect(await call('createLocation', place(title, everyDetail()))).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });
});

contract.describe('createLocationsAdvanced', () => {
  beforeEach(quiet);

  it('adds several locations at once', async () => {
    await appCategory();
    const locations = [place(`Pre batch location one (${contract.host})`), place(`Pre batch location two (${contract.host})`, everyDetail())];
    expect(await call('createLocationsAdvanced', { locations })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('updateLocation', () => {
  beforeEach(quiet);

  it("changes a location's subtitle, naming it by its title", async () => {
    const title = `Pre location to update (${contract.host})`;
    await call('createLocation', place(title));
    expect(await call('updateLocation', { title, subtitle: 'Updated before the next contract' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });

  it('changes every detail of a location', async () => {
    await appCategory();
    const title = `Pre location to change (${contract.host})`;
    await call('createLocation', place(title));
    expect(await call('updateLocation', {
      title,
      newTitle: `Pre location changed (${contract.host})`,
      address: '2 Harbor Dr, San Diego, CA',
      latitude: 32.7,
      longitude: -117.17,
      description: '<p>Changed.</p>',
      listImage: ['https://example.com/pre-changed.png'],
      ...everyDetail()
    })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title: `Pre location changed (${contract.host})` }));
  });
});

contract.describe('updateLocationAdvanced', () => {
  beforeEach(quiet);

  it('changes a location by its id', async () => {
    const { id } = await call('createLocation', place(`Pre location to update by id (${contract.host})`));
    expect(await call('updateLocationAdvanced', { locationId: id, subtitle: 'By id', priceRange: 4 })).toEqual(jasmine.objectContaining({ id }));
  });
});

contract.describe('updateLocationsAdvanced', () => {
  beforeEach(quiet);

  it('changes several locations at once', async () => {
    const { locations } = await call('createLocationsAdvanced', { locations: [place(`Pre locations to change one (${contract.host})`), place(`Pre locations to change two (${contract.host})`)] });
    expect(await call('updateLocationsAdvanced', { locations: [{ locationId: locations[0].id, subtitle: 'Changed together' }, { locationId: locations[1].id, showStarRating: true }] }))
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
    const { locations } = await call('createLocationsAdvanced', { locations: [place(`Pre locations to delete one (${contract.host})`), place(`Pre locations to delete two (${contract.host})`)] });
    expect(await call('deleteLocationsAdvanced', { locations: locations.map((entry) => ({ locationId: entry.id })) })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('updateLocationFieldValue', () => {
  beforeEach(quiet);

  it('fills in a field, naming the location and the field', async () => {
    await appField();
    const title = `Pre location with a field value (${contract.host})`;
    await call('createLocation', place(title));
    expect(await call('updateLocationFieldValue', { locationTitle: title, fieldName: fieldForTheApp, value: 'pre@example.com' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String) }));
  });

  it('fills in a field with a custom label', async () => {
    await appField();
    const title = `Pre location with a labelled field value (${contract.host})`;
    await call('createLocation', place(title));
    expect(await call('updateLocationFieldValue', { locationTitle: title, fieldName: fieldForTheApp, value: 'pre@example.com', customLabel: 'Write to us' }))
      .toEqual(jasmine.objectContaining({ id: jasmine.any(String) }));
  });
});

contract.describe('updateLocationFieldValueAdvanced', () => {
  beforeEach(quiet);

  it('fills in a field by the ids', async () => {
    const field = await appField();
    const { id } = await call('createLocation', place(`Pre location with a field value by id (${contract.host})`));
    expect(await call('updateLocationFieldValueAdvanced', { locationId: id, fieldId: field.id, value: 'pre@example.com', customLabel: 'Mail' })).toEqual(jasmine.objectContaining({ id }));
  });
});

contract.describe('updateLocationFieldValuesAdvanced', () => {
  beforeEach(quiet);

  it('fills in several values at once', async () => {
    const field = await appField();
    const { locations } = await call('createLocationsAdvanced', { locations: [place(`Pre locations with values one (${contract.host})`), place(`Pre locations with values two (${contract.host})`)] });
    expect(await call('updateLocationFieldValuesAdvanced', { values: [
      { locationId: locations[0].id, fieldId: field.id, value: 'one@example.com' },
      { locationId: locations[1].id, fieldId: field.id, value: 'two@example.com', customLabel: 'Two' }
    ] })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

// Pins are few (3), so these specs unpin what they pinned once their call is checked.
contract.describe('updatePinnedLocationOrder', () => {
  beforeEach(quiet);

  it('moves a pinned location, naming it by its title', async () => {
    const first = await call('createLocation', place(`Pre pinned first (${contract.host})`, { pinned: true }));
    const second = await call('createLocation', place(`Pre pinned second (${contract.host})`, { pinned: true }));
    expect(await call('updatePinnedLocationOrder', { title: `Pre pinned second (${contract.host})`, position: 1 }))
      .toEqual(jasmine.objectContaining({ locations: jasmine.arrayContaining([jasmine.objectContaining({ id: second.id })]) }));
    await call('updateLocationsAdvanced', { locations: [{ locationId: first.id, pinned: false }, { locationId: second.id, pinned: false }] });
  }, 90000);
});

contract.describe('updatePinnedLocationOrderAdvanced', () => {
  beforeEach(quiet);

  it('moves a pinned location by its id', async () => {
    const first = await call('createLocation', place(`Pre pinned by id first (${contract.host})`, { pinned: true }));
    const second = await call('createLocation', place(`Pre pinned by id second (${contract.host})`, { pinned: true }));
    expect(await call('updatePinnedLocationOrderAdvanced', { locationId: second.id, position: 1 }))
      .toEqual(jasmine.objectContaining({ locations: jasmine.arrayContaining([jasmine.objectContaining({ id: second.id })]) }));
    await call('updateLocationsAdvanced', { locations: [{ locationId: first.id, pinned: false }, { locationId: second.id, pinned: false }] });
  }, 90000);
});
