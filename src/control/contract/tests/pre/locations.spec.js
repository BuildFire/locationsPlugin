// locations: every operation on locations (their pins and their location field values included), one block each, after the helpers they share.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));

// Calls nothing here answers, which the contract makes without waiting (the widget refresh, deep links, analytics and its
// events): each spy answers as the real call does. None of them is asserted here.
const answerSideCalls = () => {
  const answer = (owner, name, fake) => {
    if (owner && typeof owner[name] === 'function') spyOn(owner, name).and.callFake(fake);
  };
  answer(buildfire.messaging, 'sendMessageToWidget', () => {});
  answer(buildfire.deeplink, 'registerDeeplink', (options, callback) => callback && callback(null, options));
  answer(buildfire.deeplink, 'unregisterDeeplink', (id, callback) => callback && callback(null, { id }));
  answer(buildfire.analytics, 'registerEvent', (event, options, callback) => callback && callback(null, event));
  answer(buildfire.services.contract.events, 'send', (eventName, data, callback) => callback && callback(null, []));
};

// Only the control panel makes categories, and its run comes first: it makes this one, once, and the app's run finds it.
const categoryTitle = 'Pre locations category for the app';
const subcategoryTitle = 'Pre locations subcategory for the app';
let madeCategory;
const categoryForTheApp = () => {
  madeCategory = madeCategory || (contract.host === 'control'
    ? call('createCategory', { title: categoryTitle, subcategories: subcategoryTitle })
      .then((category) => ({ id: category.id, subcategoryId: category.subcategories[0].id }))
    : call('searchCategories', { title: categoryTitle }).then(({ result: [record] }) => (record
      ? { id: record.id, subcategoryId: record.data.subcategories[0].id }
      : Promise.reject(new Error(`no category titled "${categoryTitle}": the control run makes it`)))));
  return madeCategory;
};

// Only the control panel makes location fields, and its run comes first: it makes this one, once, and the app's run finds it
// in the settings. It is the one location field this file uses.
const fieldLabel = 'Pre field for the app';
let madeField;
const fieldForTheApp = () => {
  madeField = madeField || (contract.host === 'control'
    ? call('createLocationField', { group: 'content', label: fieldLabel, type: 'TEXT', allowCustomLabel: true })
    : call('getSettings', {}).then(({ customFields }) => customFields.quickActions.concat(customFields.content)
      .find((field) => field.label === fieldLabel)
      || Promise.reject(new Error(`no location field labelled "${fieldLabel}": the control run makes it`))));
  return madeField;
};

// At most 3 locations can be pinned in the instance (control only): every pinned one is unpinned first, in the same spec,
// so each run pins the same way and never tries a 4th pin.
const unpinAll = async () => {
  const { locations } = await call('searchLocations', { pinnedOnly: true });
  for (const { id } of locations) {
    await call('updateLocationPinAdvanced', { locationId: id, pinned: false });
  }
};

// What every new location needs.
const address = '1 Market St, San Francisco, CA 94105';
const latitude = 37.7936;
const longitude = -122.3958;
const description = '<p>A location made by the pre specs.</p>';
const listImage = 'https://example.com/pre-location.png';
const requiredDetails = (title) => ({ title, address, latitude, longitude, description, listImage: [listImage] });
const createLocation = (title) => call('createLocation', requiredDetails(title));
const requiredShown = (title) => jasmine.objectContaining({ id: jasmine.any(String), title, address, latitude, longitude, description, listImage });

// Every optional detail of a new location, and how a location result shows them.
const everyDetail = (title) => ({
  ...requiredDetails(title),
  subtitle: 'Pre subtitle',
  customName: 'Pre custom name',
  images: ['https://example.com/pre-photo-1.png', 'https://example.com/pre-photo-2.png'],
  categories: `${categoryTitle} -> ${subcategoryTitle}`,
  markerType: 'image',
  markerImage: ['https://example.com/pre-marker.png'],
  markerColor: 'rgba(0,128,255,1)',
  showCategory: true,
  showOpeningHours: true,
  showPriceRange: true,
  showStarRating: true,
  priceRange: 3,
  priceCurrency: '€',
  mondayHours: '08:00-12:00, 13:00-20:00',
  tuesdayHours: '09:00-17:00',
  wednesdayHours: '09:00-17:00',
  thursdayHours: '09:00-17:00',
  fridayHours: '09:00-21:00',
  saturdayHours: '10:00-14:00',
  sundayHours: 'closed',
  actionItems: [{ title: 'Website', action: 'linkToWeb', url: 'https://example.com', openIn: '_blank' }],
});
const everyDetailShown = (title, category) => jasmine.objectContaining({
  id: jasmine.any(String),
  title,
  subtitle: 'Pre subtitle',
  address,
  customName: 'Pre custom name',
  latitude,
  longitude,
  description,
  listImage,
  images: ['https://example.com/pre-photo-1.png', 'https://example.com/pre-photo-2.png'],
  categories: `${categoryTitle} -> ${subcategoryTitle}`,
  categoryIds: [category.id],
  subcategoryIds: [category.subcategoryId],
  markerType: 'image',
  markerImage: 'https://example.com/pre-marker.png',
  markerColor: 'rgba(0,128,255,1)',
  showCategory: true,
  showOpeningHours: true,
  showPriceRange: true,
  showStarRating: true,
  priceRange: 3,
  priceCurrency: '€',
  openingHours: jasmine.objectContaining({
    monday: '08:00-12:00, 13:00-20:00',
    tuesday: '09:00-17:00',
    wednesday: '09:00-17:00',
    thursday: '09:00-17:00',
    friday: '09:00-21:00',
    saturday: '10:00-14:00',
    sunday: 'closed',
  }),
  actionItems: [jasmine.objectContaining({ title: 'Website', action: 'linkToWeb' })],
});

// Every optional change of a location, and how a location result shows them.
const newAddress = '1600 Amphitheatre Pkwy, Mountain View, CA 94043';
const everyChange = (newTitle) => ({
  newTitle,
  newSubtitle: 'Pre changed subtitle',
  newAddress,
  newLatitude: 37.422,
  newLongitude: -122.084,
  newCustomName: 'Pre changed custom name',
  newDescription: '<p>Changed by the pre specs.</p>',
  newListImage: ['https://example.com/pre-changed-list.png'],
  newImages: ['https://example.com/pre-changed-photo.png'],
  newCategories: categoryTitle,
  newMarkerType: 'circle',
  newMarkerImage: ['https://example.com/pre-changed-marker.png'],
  newMarkerColor: 'rgba(253,35,5,1)',
  newShowCategory: false,
  newShowOpeningHours: true,
  newShowPriceRange: true,
  newShowStarRating: true,
  newPriceRange: 4,
  newPriceCurrency: '$',
  newMondayHours: 'closed',
  newTuesdayHours: '10:00-18:00',
  newWednesdayHours: '10:00-18:00',
  newThursdayHours: '10:00-18:00',
  newFridayHours: '10:00-12:00, 14:00-22:00',
  newSaturdayHours: '11:00-15:00',
  newSundayHours: '12:00-16:00',
  newActionItems: [{ title: 'Phone', action: 'callNumber', phoneNumber: '+15550100' }],
});
const everyChangeShown = (id, newTitle, category) => jasmine.objectContaining({
  id,
  title: newTitle,
  subtitle: 'Pre changed subtitle',
  address: newAddress,
  customName: 'Pre changed custom name',
  latitude: 37.422,
  longitude: -122.084,
  description: '<p>Changed by the pre specs.</p>',
  listImage: 'https://example.com/pre-changed-list.png',
  images: ['https://example.com/pre-changed-photo.png'],
  categories: categoryTitle,
  categoryIds: [category.id],
  markerType: 'circle',
  markerImage: 'https://example.com/pre-changed-marker.png',
  markerColor: 'rgba(253,35,5,1)',
  showCategory: false,
  showOpeningHours: true,
  showPriceRange: true,
  showStarRating: true,
  priceRange: 4,
  priceCurrency: '$',
  openingHours: jasmine.objectContaining({
    monday: 'closed',
    tuesday: '10:00-18:00',
    wednesday: '10:00-18:00',
    thursday: '10:00-18:00',
    friday: '10:00-12:00, 14:00-22:00',
    saturday: '11:00-15:00',
    sunday: '12:00-16:00',
  }),
  actionItems: [jasmine.objectContaining({ title: 'Phone', action: 'callNumber' })],
});

// A batch's declared result: one entry per location given, in order, each with its id, and every one applied.
const batchOf = (ids) => jasmine.objectContaining({
  locations: ids.map((id, index) => jasmine.objectContaining({ index, id })),
  succeeded: ids.length,
  failed: 0,
});
// A search result holding the location with that title.
const listing = (title) => jasmine.objectContaining({
  locations: jasmine.arrayContaining([jasmine.objectContaining({ id: jasmine.any(String), title })]),
  total: jasmine.any(Number),
  page: 0,
  hasMore: jasmine.any(Boolean),
});

contract.describe('searchLocations', () => {
  beforeEach(answerSideCalls);

  it('lists locations with no filter', async () => {
    await createLocation(`Pre listed location (${contract.host})`);
    expect(await call('searchLocations', {})).toEqual(jasmine.objectContaining({
      locations: jasmine.any(Array), total: jasmine.any(Number), page: 0, hasMore: jasmine.any(Boolean),
    }));
  });

  it('finds a location by its exact title', async () => {
    const title = `Pre location found by title (${contract.host})`;
    await createLocation(title);
    expect(await call('searchLocations', { title })).toEqual(listing(title));
  });

  it('finds a location by text in its title', async () => {
    const title = `Pre location found by text (${contract.host})`;
    await createLocation(title);
    expect(await call('searchLocations', { searchText: `found by text (${contract.host})` })).toEqual(listing(title));
  });

  it('finds a location by its category', async () => {
    const title = `Pre location in a category (${contract.host})`;
    await categoryForTheApp();
    await call('createLocation', { ...requiredDetails(title), categories: categoryTitle });
    expect(await call('searchLocations', { title, categoryTitle })).toEqual(listing(title));
  });

  it('finds a location with every filter: text, title, category, subcategory, pinned or not, and page', async () => {
    const title = `Pre location in a subcategory (${contract.host})`;
    await categoryForTheApp();
    await call('createLocation', { ...requiredDetails(title), categories: `${categoryTitle} -> ${subcategoryTitle}` });
    expect(await call('searchLocations', {
      searchText: `in a subcategory (${contract.host})`, title, categoryTitle, subcategoryTitle, pinnedOnly: false, page: 0,
    })).toEqual(listing(title));
  });

  it('lists the pinned locations', async () => {
    // Only the control panel pins: its run pins a location of its own; the app's run lists whatever is pinned.
    if (contract.host === 'control') {
      const title = `Pre pinned listed location (${contract.host})`;
      await createLocation(title);
      await unpinAll();
      await call('updateLocationPin', { title, pinned: true });
      expect(await call('searchLocations', { pinnedOnly: true })).toEqual(listing(title));
    } else {
      expect(await call('searchLocations', { pinnedOnly: true })).toEqual(jasmine.objectContaining({
        locations: jasmine.any(Array), total: jasmine.any(Number), page: 0, hasMore: jasmine.any(Boolean),
      }));
    }
  });
});

contract.describe('getLocation', () => {
  beforeEach(answerSideCalls);

  it('shows a location found by its title', async () => {
    const title = `Pre location to get (${contract.host})`;
    await createLocation(title);
    expect(await call('getLocation', { title })).toEqual(requiredShown(title));
  });
});

contract.describe('getLocationAdvanced', () => {
  beforeEach(answerSideCalls);

  it('shows a location found by its id', async () => {
    const title = `Pre location to get by id (${contract.host})`;
    const { id } = await createLocation(title);
    expect(await call('getLocationAdvanced', { locationId: id })).toEqual(jasmine.objectContaining({ id, title, address, listImage }));
  });
});

contract.describe('createLocation', () => {
  beforeEach(answerSideCalls);

  it('creates a location from its required details', async () => {
    const title = `Pre location (${contract.host})`;
    expect(await createLocation(title)).toEqual(requiredShown(title));
  });

  it('creates a location with every detail', async () => {
    const title = `Pre location with every detail (${contract.host})`;
    const category = await categoryForTheApp();
    expect(await call('createLocation', everyDetail(title))).toEqual(everyDetailShown(title, category));
  });
});

contract.describe('createLocationsAdvanced', () => {
  beforeEach(answerSideCalls);

  it('creates several locations from their required details', async () => {
    const locations = [`Pre batch location one (${contract.host})`, `Pre batch location two (${contract.host})`].map(requiredDetails);
    expect(await call('createLocationsAdvanced', { locations })).toEqual(batchOf([jasmine.any(String), jasmine.any(String)]));
  });

  it('creates a location with every detail in a batch', async () => {
    await categoryForTheApp();
    const locations = [everyDetail(`Pre batch location with every detail (${contract.host})`)];
    expect(await call('createLocationsAdvanced', { locations })).toEqual(batchOf([jasmine.any(String)]));
  });
});

contract.describe('updateLocation', () => {
  beforeEach(answerSideCalls);

  it("changes a location's subtitle, naming the location by its title", async () => {
    const title = `Pre location to update (${contract.host})`;
    const { id } = await createLocation(title);
    expect(await call('updateLocation', { title, newSubtitle: 'Pre subtitle set by title' }))
      .toEqual(jasmine.objectContaining({ id, title, subtitle: 'Pre subtitle set by title' }));
  });

  it('changes every detail of a location, naming it by its title', async () => {
    const title = `Pre location to update in full (${contract.host})`;
    const newTitle = `Pre location updated in full (${contract.host})`;
    const category = await categoryForTheApp();
    const { id } = await createLocation(title);
    expect(await call('updateLocation', { title, ...everyChange(newTitle) })).toEqual(everyChangeShown(id, newTitle, category));
  });
});

contract.describe('updateLocationAdvanced', () => {
  beforeEach(answerSideCalls);

  it("changes a location's subtitle, by its id", async () => {
    const title = `Pre location to update by id (${contract.host})`;
    const { id } = await createLocation(title);
    expect(await call('updateLocationAdvanced', { locationId: id, newSubtitle: 'Pre subtitle set by id' }))
      .toEqual(jasmine.objectContaining({ id, title, subtitle: 'Pre subtitle set by id' }));
  });

  it('changes every detail of a location, by its id', async () => {
    const newTitle = `Pre location updated in full by id (${contract.host})`;
    const category = await categoryForTheApp();
    const { id } = await createLocation(`Pre location to update in full by id (${contract.host})`);
    expect(await call('updateLocationAdvanced', { locationId: id, ...everyChange(newTitle) }))
      .toEqual(everyChangeShown(id, newTitle, category));
  });
});

contract.describe('updateLocationsAdvanced', () => {
  beforeEach(answerSideCalls);

  it('changes several locations at once', async () => {
    const titles = [`Pre batch location to update one (${contract.host})`, `Pre batch location to update two (${contract.host})`];
    const created = await call('createLocationsAdvanced', { locations: titles.map(requiredDetails) });
    const ids = created.locations.map((entry) => entry.id);
    const locations = ids.map((locationId) => ({ locationId, newSubtitle: 'Pre subtitle set in a batch' }));
    expect(await call('updateLocationsAdvanced', { locations })).toEqual(batchOf(ids));
  });

  it('changes every detail of a location in a batch', async () => {
    await categoryForTheApp();
    const { id } = await createLocation(`Pre batch location to update in full (${contract.host})`);
    const locations = [{ locationId: id, ...everyChange(`Pre batch location updated in full (${contract.host})`) }];
    expect(await call('updateLocationsAdvanced', { locations })).toEqual(batchOf([id]));
  });
});

contract.describe('deleteLocation', () => {
  beforeEach(answerSideCalls);

  it('deletes a location, naming it by its title', async () => {
    const title = `Pre location to delete (${contract.host})`;
    const { id } = await createLocation(title);
    expect(await call('deleteLocation', { title })).toEqual(jasmine.objectContaining({ id }));
  });
});

contract.describe('deleteLocationAdvanced', () => {
  beforeEach(answerSideCalls);

  it('deletes a location by its id', async () => {
    const { id } = await createLocation(`Pre location to delete by id (${contract.host})`);
    expect(await call('deleteLocationAdvanced', { locationId: id })).toEqual(jasmine.objectContaining({ id }));
  });
});

contract.describe('deleteLocationsAdvanced', () => {
  beforeEach(answerSideCalls);

  it('deletes several locations at once', async () => {
    const titles = [`Pre batch location to delete one (${contract.host})`, `Pre batch location to delete two (${contract.host})`];
    const created = await call('createLocationsAdvanced', { locations: titles.map(requiredDetails) });
    const ids = created.locations.map((entry) => entry.id);
    expect(await call('deleteLocationsAdvanced', { locations: ids.map((locationId) => ({ locationId })) })).toEqual(batchOf(ids));
  });
});

// controlBackground only: this block runs in the control frame.
contract.describe('updateLocationPin', () => {
  beforeEach(answerSideCalls);

  it('pins a location, naming it by its title', async () => {
    const title = `Pre location to pin (${contract.host})`;
    const { id } = await createLocation(title);
    await unpinAll();
    expect(await call('updateLocationPin', { title, pinned: true })).toEqual(jasmine.objectContaining({
      locations: jasmine.arrayContaining([jasmine.objectContaining({ id, title, pinPosition: 1 })]),
    }));
  });

  it('pins a location at a given place, naming it by its title', async () => {
    const title = `Pre location to pin first (${contract.host})`;
    const { id } = await createLocation(title);
    await unpinAll();
    expect(await call('updateLocationPin', { title, pinned: true, position: 1 })).toEqual(jasmine.objectContaining({
      locations: jasmine.arrayContaining([jasmine.objectContaining({ id, title, pinPosition: 1 })]),
    }));
  });
});

// controlBackground only: this block runs in the control frame.
contract.describe('updateLocationPinAdvanced', () => {
  beforeEach(answerSideCalls);

  it('pins a location by its id', async () => {
    const title = `Pre location to pin by id (${contract.host})`;
    const { id } = await createLocation(title);
    await unpinAll();
    expect(await call('updateLocationPinAdvanced', { locationId: id, pinned: true })).toEqual(jasmine.objectContaining({
      locations: jasmine.arrayContaining([jasmine.objectContaining({ id, title, pinPosition: 1 })]),
    }));
  });

  it('pins a location at a given place, by its id', async () => {
    const title = `Pre location to pin first by id (${contract.host})`;
    const { id } = await createLocation(title);
    await unpinAll();
    expect(await call('updateLocationPinAdvanced', { locationId: id, pinned: true, position: 1 })).toEqual(jasmine.objectContaining({
      locations: jasmine.arrayContaining([jasmine.objectContaining({ id, title, pinPosition: 1 })]),
    }));
  });
});

contract.describe('updateLocationFieldValue', () => {
  beforeEach(answerSideCalls);

  it("sets a location's value for a location field, naming both by their text", async () => {
    const title = `Pre location with a field value (${contract.host})`;
    const field = await fieldForTheApp();
    const { id } = await createLocation(title);
    expect(await call('updateLocationFieldValue', { title, fieldLabel, value: 'Pre value set by title' })).toEqual(jasmine.objectContaining({
      locationId: id, fieldId: field.id, label: fieldLabel, value: 'Pre value set by title',
    }));
  });

  it("sets a location's value and custom label for a location field, naming both by their text", async () => {
    const title = `Pre location with a custom field label (${contract.host})`;
    const field = await fieldForTheApp();
    const { id } = await createLocation(title);
    expect(await call('updateLocationFieldValue', {
      title, fieldLabel, value: 'Pre value with its label', customLabel: 'Pre custom label',
    })).toEqual(jasmine.objectContaining({
      locationId: id, fieldId: field.id, label: fieldLabel, value: 'Pre value with its label', customLabel: 'Pre custom label',
    }));
  });
});

contract.describe('updateLocationFieldValueAdvanced', () => {
  beforeEach(answerSideCalls);

  it("sets a location's value for a location field, by their ids", async () => {
    const field = await fieldForTheApp();
    const { id } = await createLocation(`Pre location with a field value by id (${contract.host})`);
    expect(await call('updateLocationFieldValueAdvanced', { locationId: id, fieldId: field.id, value: 'Pre value set by id' }))
      .toEqual(jasmine.objectContaining({ locationId: id, fieldId: field.id, label: fieldLabel, value: 'Pre value set by id' }));
  });

  it("sets a location's value and custom label for a location field, by their ids", async () => {
    const field = await fieldForTheApp();
    const { id } = await createLocation(`Pre location with a custom field label by id (${contract.host})`);
    expect(await call('updateLocationFieldValueAdvanced', {
      locationId: id, fieldId: field.id, value: 'Pre value with its label by id', customLabel: 'Pre custom label by id',
    })).toEqual(jasmine.objectContaining({
      locationId: id, fieldId: field.id, label: fieldLabel, value: 'Pre value with its label by id', customLabel: 'Pre custom label by id',
    }));
  });
});

contract.describe('updateLocationsFieldValueAdvanced', () => {
  beforeEach(answerSideCalls);

  it('sets a location field value on several locations at once', async () => {
    const field = await fieldForTheApp();
    const titles = [`Pre batch location with a field value one (${contract.host})`, `Pre batch location with a field value two (${contract.host})`];
    const created = await call('createLocationsAdvanced', { locations: titles.map(requiredDetails) });
    const ids = created.locations.map((entry) => entry.id);
    const locations = ids.map((locationId) => ({ locationId, fieldId: field.id, value: 'Pre value set in a batch' }));
    expect(await call('updateLocationsFieldValueAdvanced', { locations })).toEqual(batchOf(ids));
  });

  it('sets a location field value and custom label in a batch', async () => {
    const field = await fieldForTheApp();
    const { id } = await createLocation(`Pre batch location with a custom field label (${contract.host})`);
    const locations = [{ locationId: id, fieldId: field.id, value: 'Pre batch value with its label', customLabel: 'Pre batch custom label' }];
    expect(await call('updateLocationsFieldValueAdvanced', { locations })).toEqual(batchOf([id]));
  });
});
