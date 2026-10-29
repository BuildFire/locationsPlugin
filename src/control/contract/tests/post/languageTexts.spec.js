// languageTexts: the texts of the Language tab, read from both sides and changed from the control panel.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);

const textOf = async (key) => (await call('getLanguageTexts', {})).texts.find((text) => text.key === key);

contract.describe('getLanguageTexts', () => {
  it('shows every text, with what the app shows for it', async () => {
    const { texts } = await call('getLanguageTexts', {});
    expect(texts.length).toBe(126);
    texts.forEach((text) => expect(text).toEqual(jasmine.objectContaining({
      key: jasmine.any(String), section: jasmine.any(String), title: jasmine.any(String), text: jasmine.any(String), defaultText: jasmine.any(String), required: jasmine.any(Boolean)
    })));
    expect(texts.find((text) => text.key === 'general.search')).toEqual(jasmine.objectContaining({ section: 'General', title: 'Search', defaultText: 'Search', maxLength: 25 }));
  });

  it('changes nothing when read', async () => {
    expect(await call('getLanguageTexts', {})).toEqual(await call('getLanguageTexts', {}));
  });
});

// controlBackground only: the app may not write the texts.
contract.describe('updateLanguageText', () => {
  // The refresh message to the widget gets no answer here: a spy stands in for it and only answers.
  beforeEach(() => spyOn(buildfire.messaging, 'sendMessageToWidget'));

  it('changes a text, and the app shows it from then on', async () => {
    const saved = await call('updateLanguageText', { key: 'general.search', text: 'Find a place' });
    expect(saved).toEqual(jasmine.objectContaining({ key: 'general.search', text: 'Find a place', defaultText: 'Search' }));
    expect(await textOf('general.search')).toEqual(jasmine.objectContaining({ text: 'Find a place' }));
  });

  it('keeps the other texts as they were', async () => {
    await call('updateLanguageText', { key: 'general.price', text: 'Cost' });
    await call('updateLanguageText', { key: 'general.currency', text: 'Money' });
    expect(await textOf('general.price')).toEqual(jasmine.objectContaining({ text: 'Cost' }));
    expect(await textOf('general.currency')).toEqual(jasmine.objectContaining({ text: 'Money' }));
  });

  it('empties a text the app does not need', async () => {
    await call('updateLanguageText', { key: 'general.search', text: '' });
    expect((await textOf('general.search')).text).toBe('');
    await call('updateLanguageText', { key: 'general.search', text: 'Search' });
  });

  describe('refuses, and changes nothing', () => {
    beforeEach(() => call('updateLanguageText', { key: 'general.price', text: 'Price' }));

    it('emptying a text the app needs', async () => {
      expect(await refusal(call('updateLanguageText', { key: 'general.price', text: '' }))).toContain('text');
      expect((await textOf('general.price')).text).toBe('Price');
    });

    it('a text longer than its limit', async () => {
      expect(await refusal(call('updateLanguageText', { key: 'general.price', text: 'Much too long a price' }))).toContain('10');
      expect((await textOf('general.price')).text).toBe('Price');
    });

    it('a text the tab does not have', async () => {
      expect(await refusal(call('updateLanguageText', { key: 'general.nothing', text: 'x' }))).toContain('key');
    });

    it('without a key or a text, or with a text that is not text', async () => {
      expect(await refusal(call('updateLanguageText', { text: 'x' }))).toContain('key');
      expect(await refusal(call('updateLanguageText', { key: 'general.price' }))).toContain('text');
      expect(await refusal(call('updateLanguageText', { key: 'general.price', text: null }))).toContain('text');
      expect(await refusal(call('updateLanguageText', { key: 'general.price', text: 7 }))).toContain('text');
      expect((await textOf('general.price')).text).toBe('Price');
    });
  });
});
