// languageStrings: the text labels the app shows, from the Language tab; read from both sides, changed in the control panel.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const quiet = () => {
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') spyOn(buildfire.messaging, 'sendMessageToWidget');
};

contract.describe('getLanguageStrings', () => {
  beforeEach(quiet);

  it('shows the text labels', async () => {
    expect(await call('getLanguageStrings', {})).toEqual(jasmine.objectContaining({
      strings: jasmine.arrayContaining([jasmine.objectContaining({ key: 'general.search', value: jasmine.any(String), defaultValue: 'Search' })])
    }));
  });
});

contract.describe('updateLanguageString', () => {
  beforeEach(quiet);

  it("changes a label's text", async () => {
    expect(await call('updateLanguageString', { key: 'general.search', value: 'Find a place' })).toEqual(jasmine.objectContaining({ key: 'general.search', value: 'Find a place' }));
  });

  it('empties an optional label', async () => {
    expect(await call('updateLanguageString', { key: 'general.notAvailable', value: '' })).toEqual(jasmine.objectContaining({ key: 'general.notAvailable' }));
  });
});
