// languageTexts: the texts the plugin shows people, read on both hosts and changed or reset in the control panel only.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
// A text as every operation here shows it: the declared fields.
const aText = (key) => jasmine.objectContaining({
  key,
  section: key.split('.')[0],
  title: jasmine.any(String),
  value: jasmine.any(String),
  defaultValue: jasmine.any(String),
  customized: jasmine.any(Boolean),
  required: jasmine.any(Boolean),
  maxLength: jasmine.any(Number),
});

contract.describe('listLanguageTexts', () => {
  it('shows every text', async () => {
    expect(await call('listLanguageTexts', {})).toEqual(jasmine.objectContaining({
      texts: jasmine.arrayContaining([aText('general.search'), aText('toast.locationSaved')]),
    }));
  });

  it('shows the texts of one section', async () => {
    expect(await call('listLanguageTexts', { section: 'details' })).toEqual(jasmine.objectContaining({
      texts: jasmine.arrayContaining([aText('details.share')]),
    }));
  });
});

// Before updateLanguageText's block, so the texts it changes are what this file leaves.
contract.describe('resetLanguageTexts', () => {
  beforeEach(() => spyOn(buildfire.messaging, 'sendMessageToWidget'));

  it('goes back to the original texts', async () => {
    await call('updateLanguageText', { key: 'general.findMore', value: 'Pre find more' });
    expect(await call('resetLanguageTexts', {})).toEqual(jasmine.objectContaining({
      texts: jasmine.arrayContaining([jasmine.objectContaining({ key: 'general.findMore', customized: false })]),
    }));
  });
});

contract.describe('updateLanguageText', () => {
  beforeEach(() => spyOn(buildfire.messaging, 'sendMessageToWidget'));

  it('changes a text', async () => {
    expect(await call('updateLanguageText', { key: 'general.enterBookmarkTitleHere', value: 'Pre bookmark title' }))
      .toEqual(jasmine.objectContaining({ key: 'general.enterBookmarkTitleHere', value: 'Pre bookmark title', customized: true }));
  });

  it('leaves empty a text that may be left empty', async () => {
    expect(await call('updateLanguageText', { key: 'emptyState.emptyCategories', value: '' }))
      .toEqual(jasmine.objectContaining({ key: 'emptyState.emptyCategories', value: '' }));
  });

  it('goes back to the original of one text', async () => {
    await call('updateLanguageText', { key: 'sortingOptions.recent', value: 'Pre newest' });
    expect(await call('updateLanguageText', { key: 'sortingOptions.recent', value: null }))
      .toEqual(jasmine.objectContaining({ key: 'sortingOptions.recent', customized: false }));
  });
});
