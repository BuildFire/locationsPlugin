// languageTexts: the texts of the Language tab, read from both sides and changed from the control panel.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));

contract.describe('getLanguageTexts', () => {
  it('shows the texts', async () => {
    expect(await call('getLanguageTexts', {})).toEqual(jasmine.objectContaining({
      texts: jasmine.arrayContaining([jasmine.objectContaining({ key: 'general.search', text: jasmine.any(String) })])
    }));
  });
});

contract.describe('updateLanguageText', () => {
  // The refresh message to the widget gets no answer here: a spy stands in for it and only answers.
  beforeEach(() => spyOn(buildfire.messaging, 'sendMessageToWidget'));

  it('changes a text', async () => {
    expect(await call('updateLanguageText', { key: 'general.search', text: 'Find a place' })).toEqual(jasmine.objectContaining({ key: 'general.search', text: 'Find a place' }));
  });

  it('changes a text the app needs', async () => {
    expect(await call('updateLanguageText', { key: 'general.price', text: 'Cost' })).toEqual(jasmine.objectContaining({ key: 'general.price', text: 'Cost' }));
  });
});
