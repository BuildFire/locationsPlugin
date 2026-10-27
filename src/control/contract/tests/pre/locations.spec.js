// locations: the plugin's places, read through the contract (nothing in the contract adds or changes a location).
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const listed = jasmine.objectContaining({
  locations: jasmine.any(Array), total: jasmine.any(Number), page: jasmine.any(Number), hasMore: jasmine.any(Boolean)
});
// Only the control panel makes categories, and its run comes first: it makes this one, once, and the app's run finds it.
const forTheApp = 'Pre location category for the app';
let madeCategory;
const categoryForTheApp = () => {
  madeCategory = madeCategory || (contract.host === 'control'
    ? call('createCategory', { title: forTheApp })
    : call('searchCategories', { title: forTheApp }).then(({ result: [record] }) => record || Promise.reject(new Error(`no category titled "${forTheApp}": the control run makes it`))));
  return madeCategory;
};

contract.describe('searchLocations', () => {
  // Making the category for the app on the control registers its analytics and tells the widget: the spies only answer.
  beforeEach(() => {
    spyOn(buildfire.messaging, 'sendMessageToWidget');
    spyOn(buildfire.analytics, 'registerEvent');
  });

  it('shows the locations', async () => {
    expect(await call('searchLocations', {})).toEqual(listed);
  });

  it('shows the locations matching every filter, a page at a time', async () => {
    await categoryForTheApp();
    expect(await call('searchLocations', {
      title: `Pre location (${contract.host})`, search: 'Pre', category: forTheApp, pinnedOnly: true, page: 0, pageSize: 10
    })).toEqual(listed);
  });
});
