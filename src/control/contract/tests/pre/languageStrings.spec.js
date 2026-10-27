// languageStrings: the app's text labels from the Language tab, one record: read from both sides, changed in the control panel.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));

contract.describe('getLanguageStrings', () => {
  it('shows the text labels', async () => {
    expect(await call('getLanguageStrings', {})).toEqual(jasmine.objectContaining({
      strings: jasmine.arrayContaining([jasmine.objectContaining({ key: 'general.search', title: jasmine.any(String), value: jasmine.any(String), defaultValue: jasmine.any(String) })])
    }));
  });
});

contract.describe('updateLanguageString', () => {
  beforeEach(() => spyOn(buildfire.messaging, 'sendMessageToWidget'));

  it("changes a label's text", async () => {
    expect(await call('updateLanguageString', { key: 'general.reset', value: 'Pre reset' }))
      .toEqual(jasmine.objectContaining({ key: 'general.reset', value: 'Pre reset' }));
  });

  it('puts a label back to its original text', async () => {
    await call('updateLanguageString', { key: 'general.notAvailable', value: 'Pre none' });
    expect(await call('updateLanguageString', { key: 'general.notAvailable', value: null }))
      .toEqual(jasmine.objectContaining({ key: 'general.notAvailable', value: jasmine.any(String) }));
  });
});
