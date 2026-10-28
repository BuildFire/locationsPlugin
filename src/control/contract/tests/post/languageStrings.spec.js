// languageStrings: the text labels the app shows, from the Language tab; read from both sides, changed in the control panel.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);
// Short enough for the shortest labels (8 characters), and different on every run.
const shortText = (label) => `${label}${Date.now() % 1000}`;
const labelOf = async (key) => (await call('getLanguageStrings', {})).strings.find((entry) => entry.key === key);

// The widget refresh nothing here answers: a spy stands in for it.
const quiet = () => {
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') spyOn(buildfire.messaging, 'sendMessageToWidget');
};

contract.describe('getLanguageStrings', () => {
  beforeEach(quiet);

  it('shows every label with the text the app shows and its starting text', async () => {
    const { strings } = await call('getLanguageStrings', {});
    expect(strings.length).toBe(126);
    expect(strings).toContain(jasmine.objectContaining({
      key: 'general.search', section: 'General', label: 'Search', defaultValue: 'Search', required: false, value: jasmine.any(String)
    }));
    expect(strings).toContain(jasmine.objectContaining({ key: 'general.price', defaultValue: 'Price', required: true }));
    strings.forEach((entry) => expect(entry.value).toEqual(jasmine.any(String)));
  });
});

// controlBackground only: the datastore is written from the control panel.
contract.describe('updateLanguageString', () => {
  beforeEach(quiet);

  // First in the block: the specs after it change the one language record the previous pre specs saved.
  describe("the previous contract's data", () => {
    it('shows and changes the labels the previous pre specs saved', async () => {
      expect(await labelOf('general.search')).toEqual(jasmine.objectContaining({ value: 'Find a place', defaultValue: 'Search' }));
      expect(await labelOf('general.notAvailable')).toEqual(jasmine.objectContaining({ value: '', defaultValue: 'N/A' }));
      const value = shortText('NA');
      expect(await call('updateLanguageString', { key: 'general.notAvailable', value })).toEqual({ key: 'general.notAvailable', value });
      expect((await labelOf('general.notAvailable')).value).toBe(value);
      expect((await labelOf('general.search')).value).toBe('Find a place');
    });
  });

  it("changes a label's text, and the app shows it", async () => {
    const value = shortText('Find');
    expect(await call('updateLanguageString', { key: 'general.search', value })).toEqual({ key: 'general.search', value });
    expect(await labelOf('general.search')).toEqual(jasmine.objectContaining({ value, defaultValue: 'Search' }));
    expect(await labelOf('general.price')).toEqual(jasmine.objectContaining({ value: jasmine.any(String) }));
  });

  it('empties an optional label with an empty value, and with null', async () => {
    await call('updateLanguageString', { key: 'general.search', value: shortText('Look') });
    expect(await call('updateLanguageString', { key: 'general.search', value: '' })).toEqual({ key: 'general.search', value: '' });
    expect((await labelOf('general.search')).value).toBe('');
    await call('updateLanguageString', { key: 'general.search', value: shortText('Look') });
    await call('updateLanguageString', { key: 'general.search', value: null });
    expect((await labelOf('general.search')).value).toBe('');
  });

  describe('refuses, and changes nothing', () => {
    it('emptying a label the app needs', async () => {
      const value = shortText('Cost');
      await call('updateLanguageString', { key: 'general.price', value });
      expect(await refusal(call('updateLanguageString', { key: 'general.price', value: '' }))).toContain('Price');
      expect(await refusal(call('updateLanguageString', { key: 'general.price', value: null }))).toContain('Price');
      expect((await labelOf('general.price')).value).toBe(value);
    });

    it('text longer than the label allows', async () => {
      const value = shortText('Cost');
      await call('updateLanguageString', { key: 'general.price', value });
      expect(await refusal(call('updateLanguageString', { key: 'general.price', value: 'Much too long' }))).toContain('10');
      expect((await labelOf('general.price')).value).toBe(value);
    });

    it('a label it does not have, naming it', async () => {
      expect(await refusal(call('updateLanguageString', { key: 'general.nothing', value: 'x' }))).toContain('general.nothing');
    });

    it('without a label or a text', async () => {
      expect(await refusal(call('updateLanguageString', { value: 'x' }))).toContain('key');
      expect(await refusal(call('updateLanguageString', { key: '', value: 'x' }))).toContain('key');
      expect(await refusal(call('updateLanguageString', { key: 'general.search' }))).toContain('value');
    });

    it('text that is not text', async () => {
      expect(await refusal(call('updateLanguageString', { key: 'general.search', value: 42 }))).toContain('value');
    });
  });
});
