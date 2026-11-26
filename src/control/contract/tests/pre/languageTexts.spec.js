// languageTexts: the texts the app shows, such as button labels and messages.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));

// A refresh message to the widget, which nothing here answers: the spy only answers.
const quiet = () => {
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') spyOn(buildfire.messaging, 'sendMessageToWidget');
};

contract.describe('getLanguageTexts', () => {
  it('shows the texts the app shows', async () => {
    expect(await call('getLanguageTexts', {})).toEqual(jasmine.objectContaining({
      texts: jasmine.arrayContaining([jasmine.objectContaining({ key: 'general.search', text: jasmine.any(String) })]),
    }));
  });
});

contract.describe('updateLanguageText', () => {
  beforeEach(quiet);

  it('changes one text', async () => {
    expect(await call('updateLanguageText', { key: 'general.findMore', text: 'See more' })).toEqual(jasmine.objectContaining({ key: 'general.findMore', text: 'See more' }));
  });

  it('changes another text', async () => {
    expect(await call('updateLanguageText', { key: 'details.share', text: 'Send to a friend' })).toEqual(jasmine.objectContaining({ key: 'details.share', text: 'Send to a friend' }));
  });
});
