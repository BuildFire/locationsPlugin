// locations: the plugin's places, read through the contract (nothing in the contract adds or changes a location).
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);
const unique = (label) => `Post ${label} (${contract.host}) ${Date.now()}`;
// Only the control panel makes categories, and its run comes first: it makes this one, once, and the app's run finds it.
const forTheApp = 'Post location category for the app';
let madeCategory;
const categoryForTheApp = () => {
  madeCategory = madeCategory || (contract.host === 'control'
    ? call('createCategory', { title: forTheApp })
    : call('searchCategories', { title: forTheApp }).then(({ result: [record] }) => record || Promise.reject(new Error(`no category titled "${forTheApp}": the control run makes it`))));
  return madeCategory;
};
const page = jasmine.objectContaining({
  locations: jasmine.any(Array), total: jasmine.any(Number), page: jasmine.any(Number), hasMore: jasmine.any(Boolean)
});

contract.describe('searchLocations', () => {
  beforeEach(() => {
    // Making the category for the app on the control registers its analytics and tells the widget: bookkeeping the
    // manifest never mentions, so the spies only answer.
    spyOn(buildfire.messaging, 'sendMessageToWidget');
    spyOn(buildfire.analytics, 'registerEvent');
  });

  it('shows a page of locations with no filter given', async () => {
    const result = await call('searchLocations', {});
    expect(result).toEqual(page);
    expect(result.page).toBe(0);
    expect(result.locations.length).toBeLessThanOrEqual(50);
    expect(result.hasMore).toBe(result.total > result.locations.length);
  });

  it('finds nothing for a name no location has', async () => {
    expect(await call('searchLocations', { title: unique('no such location') })).toEqual({ locations: [], total: 0, page: 0, hasMore: false });
  });

  it('finds nothing for a text no location contains', async () => {
    expect(await call('searchLocations', { search: unique('no such text') })).toEqual(jasmine.objectContaining({ locations: [], total: 0 }));
  });

  it('takes every filter together, and the page asked for', async () => {
    await categoryForTheApp();
    expect(await call('searchLocations', {
      title: unique('filtered'), search: 'Post', category: forTheApp, pinnedOnly: true, page: 2, pageSize: 10
    })).toEqual({ locations: [], total: 0, page: 2, hasMore: false });
  });

  it('shows the pinned locations alone', async () => {
    const result = await call('searchLocations', { pinnedOnly: true });
    expect(result).toEqual(page);
    expect(result.total).toBeLessThanOrEqual(3);
  });

  it('shows the locations of a category', async () => {
    await categoryForTheApp();
    expect(await call('searchLocations', { category: forTheApp })).toEqual(page);
  });

  describe('refuses', () => {
    it('a category name no category has', async () => {
      const category = unique('missing category');
      expect(await refusal(call('searchLocations', { category }))).toContain(category);
    });

    it('an empty name, search or category', async () => {
      expect(await refusal(call('searchLocations', { title: '' }))).toContain('title');
      expect(await refusal(call('searchLocations', { search: '' }))).toContain('search');
      expect(await refusal(call('searchLocations', { category: '' }))).toContain('category');
    });

    it('a name that is not text', async () => {
      expect(await refusal(call('searchLocations', { title: 42 }))).toContain('title');
      expect(await refusal(call('searchLocations', { search: null }))).toContain('search');
    });

    it('a pinned choice that is not yes or no', async () => {
      expect(await refusal(call('searchLocations', { pinnedOnly: 'yes' }))).toContain('pinnedOnly');
    });

    it('a page before the first', async () => {
      expect(await refusal(call('searchLocations', { page: -1 }))).toContain('page');
      expect(await refusal(call('searchLocations', { page: 0.5 }))).toContain('page');
    });

    it('a page size outside 1 to 50', async () => {
      expect(await refusal(call('searchLocations', { pageSize: 0 }))).toContain('pageSize');
      expect(await refusal(call('searchLocations', { pageSize: 51 }))).toContain('pageSize');
      expect(await refusal(call('searchLocations', { pageSize: '10' }))).toContain('pageSize');
    });
  });
});
