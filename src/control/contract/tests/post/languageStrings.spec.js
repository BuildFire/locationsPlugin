// languageStrings: the app's text labels from the Language tab, one record: read from both sides, changed in the control panel.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);
const stamp = () => `P${Date.now() % 100000}`;
const labelOf = async (key) => (await call('getLanguageStrings', {})).strings.find((string) => string.key === key);

contract.describe('getLanguageStrings', () => {
  it('shows every label with its name, what the app shows and its original text', async () => {
    const { strings } = await call('getLanguageStrings', {});
    expect(strings.length).toBeGreaterThan(100);
    strings.forEach((string) => expect(string).toEqual(jasmine.objectContaining({
      key: jasmine.any(String), title: jasmine.any(String), value: jasmine.any(String), defaultValue: jasmine.any(String)
    })));
    expect(strings).toEqual(jasmine.arrayContaining([
      jasmine.objectContaining({ key: 'general.search', title: 'Search', defaultValue: 'Search' }),
      jasmine.objectContaining({ key: 'general.price', title: 'Price', defaultValue: 'Price' })
    ]));
  });

  it('changes nothing', async () => {
    expect(await call('getLanguageStrings', {})).toEqual(await call('getLanguageStrings', {}));
  });
});

// controlBackground only: the texts are written in the control panel.
contract.describe('updateLanguageString', () => {
  // The refresh message to the widget is the plugin's own bookkeeping, which the manifest never mentions: the spy only answers.
  beforeEach(() => spyOn(buildfire.messaging, 'sendMessageToWidget'));

  it('changes the text the app shows for a label, and returns it', async () => {
    const value = `Find ${stamp()}`;
    expect(await call('updateLanguageString', { key: 'general.search', value })).toEqual(jasmine.objectContaining({
      key: 'general.search', value, defaultValue: 'Search'
    }));
    expect(await labelOf('general.search')).toEqual(jasmine.objectContaining({ value }));
  });

  it('keeps the other labels as they were', async () => {
    const value = `Cost ${stamp()}`.slice(0, 10);
    await call('updateLanguageString', { key: 'general.price', value });
    const other = `Find ${stamp()}`;
    await call('updateLanguageString', { key: 'general.search', value: other });
    expect(await labelOf('general.price')).toEqual(jasmine.objectContaining({ value }));
    expect(await labelOf('general.search')).toEqual(jasmine.objectContaining({ value: other }));
  });

  it('goes back to the original text when cleared', async () => {
    await call('updateLanguageString', { key: 'general.search', value: `Find ${stamp()}` });
    expect(await call('updateLanguageString', { key: 'general.search', value: null })).toEqual(jasmine.objectContaining({ value: 'Search' }));
    expect(await labelOf('general.search')).toEqual(jasmine.objectContaining({ value: 'Search' }));
  });

  it('shows no text for a label the app does not need when left empty', async () => {
    expect(await call('updateLanguageString', { key: 'general.search', value: '' })).toEqual(jasmine.objectContaining({ value: '' }));
    expect(await labelOf('general.search')).toEqual(jasmine.objectContaining({ value: '' }));
  });

  describe('refuses, and changes nothing', () => {
    let before;
    beforeEach(async () => {
      before = (await call('updateLanguageString', { key: 'general.price', value: 'Price' })).value;
    });

    it('an empty text for a label the app needs', async () => {
      expect(await refusal(call('updateLanguageString', { key: 'general.price', value: '' }))).toContain('general.price');
      expect((await labelOf('general.price')).value).toBe(before);
    });

    it('a text longer than the label allows', async () => {
      expect(await refusal(call('updateLanguageString', { key: 'general.price', value: 'Much too long' }))).toContain('10');
      expect((await labelOf('general.price')).value).toBe(before);
    });

    it('a label it does not offer', async () => {
      expect(await refusal(call('updateLanguageString', { key: 'general.nothing', value: 'x' }))).toContain('key');
    });

    it('a text that is not text', async () => {
      expect(await refusal(call('updateLanguageString', { key: 'general.price', value: 42 }))).toContain('value');
      expect((await labelOf('general.price')).value).toBe(before);
    });

    it('without a label or a text', async () => {
      expect(await refusal(call('updateLanguageString', { value: 'x' }))).toContain('key');
      expect(await refusal(call('updateLanguageString', { key: null, value: 'x' }))).toContain('key');
      expect(await refusal(call('updateLanguageString', { key: '', value: 'x' }))).toContain('key');
      expect(await refusal(call('updateLanguageString', { key: 'general.price' }))).toContain('value');
      expect((await labelOf('general.price')).value).toBe(before);
    });
  });
});
