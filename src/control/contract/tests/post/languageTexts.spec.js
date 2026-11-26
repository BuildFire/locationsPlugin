// languageTexts: the texts the app shows, such as button labels and messages.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// How a call was refused: its code (ContractOperationInvokeError.CODES) and its reason; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => { fail('expected the call to be refused'); return {}; },
  (error) => ({ code: (error && error.code) || 'unknown', reason: reason(error) }));
// What a refusal is expected to be: its code, and a reason naming the text given.
const refused = (code, text) => ({ code, reason: jasmine.stringContaining(text) });
// Each required parameter left out, empty or nothing is refused, naming it, before anything is looked up or written.
const refusesEachRequired = async (operation, valid, names) => {
  for (const name of names) {
    for (const value of [undefined, null, '']) {
      expect(await refusal(call(operation, { ...valid, [name]: value }))).withContext(`${name}: ${value}`).toEqual(refused('validation', name));
    }
  }
};

// What the contract's own read shows for one text.
const textOf = async (key) => (await call('getLanguageTexts', {})).texts.find((text) => text.key === key);

// A refresh message to the widget the manifest never mentions: the spy only answers.
const quiet = () => {
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') spyOn(buildfire.messaging, 'sendMessageToWidget');
};

contract.describe('getLanguageTexts', () => {
  it('shows every text, with what it says now and what it says by default', async () => {
    const { texts } = await call('getLanguageTexts', {});
    expect(texts.length).toBe(126);
    texts.forEach((text) => expect(text).toEqual({
      key: jasmine.any(String), section: jasmine.any(String), title: jasmine.any(String), text: jasmine.any(String), defaultText: jasmine.any(String), required: jasmine.any(Boolean), maxLength: jasmine.any(Number),
    }));
    expect(texts.find((text) => text.key === 'sortingOptions.priceDsc')).toEqual(jasmine.objectContaining({ section: 'Sorting Options', title: '$$$ - $', defaultText: '$$$ - $', required: true, maxLength: 12 }));
    expect(texts.find((text) => text.key === 'general.follow')).toEqual(jasmine.objectContaining({ section: 'General', defaultText: 'follow' }));
  });
});

// controlBackground only: the owner changes the app's texts from the control panel.
contract.describe('updateLanguageText', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateLanguageText', { key: 'general.open', text: 'Open' }, ['key', 'text']));

  it('changes one text, and returns it', async () => {
    // This text holds at most 20 characters: the run's own value, kept short.
    const text = `Find ${String(Date.now()).slice(-8)}`;
    expect(await call('updateLanguageText', { key: 'general.findMore', text })).toEqual({
      key: 'general.findMore', section: 'General', title: 'Find More', text, defaultText: 'Find More', required: true, maxLength: 20,
    });
    expect(await textOf('general.findMore')).toEqual(jasmine.objectContaining({ text }));
  });

  it('keeps the other texts', async () => {
    await call('updateLanguageText', { key: 'general.reset', text: 'Clear' });
    await call('updateLanguageText', { key: 'general.price', text: 'Cost' });
    expect(await textOf('general.reset')).toEqual(jasmine.objectContaining({ text: 'Clear' }));
    expect(await textOf('general.price')).toEqual(jasmine.objectContaining({ text: 'Cost' }));
  });

  it('empties a text the app can do without', async () => {
    expect(await call('updateLanguageText', { key: 'general.search', text: '' })).toEqual(jasmine.objectContaining({ key: 'general.search', text: '' }));
  });

  describe('refuses, and changes nothing', () => {
    beforeEach(async () => {
      await call('updateLanguageText', { key: 'general.open', text: 'Open' });
    });

    it('a text it does not have', async () => {
      expect(await refusal(call('updateLanguageText', { key: 'general.nowhere', text: 'x' }))).toEqual(refused('validation', 'general.nowhere'));
    });

    it('emptying a text the app needs', async () => {
      expect(await refusal(call('updateLanguageText', { key: 'general.open', text: '' }))).toEqual(refused('validation', 'text'));
      expect((await textOf('general.open')).text).toBe('Open');
    });

    it('a text longer than it may be', async () => {
      expect(await refusal(call('updateLanguageText', { key: 'general.open', text: 'Open all day' }))).toEqual(refused('validation', 'text'));
      expect((await textOf('general.open')).text).toBe('Open');
    });

    it('without the text, or without which one', async () => {
      expect(await refusal(call('updateLanguageText', { key: 'general.open' }))).toEqual(refused('validation', 'text'));
      expect(await refusal(call('updateLanguageText', { key: 'general.open', text: 7 }))).toEqual(refused('validation', 'text'));
      expect(await refusal(call('updateLanguageText', { text: 'Open' }))).toEqual(refused('validation', 'key'));
    });
  });
});
