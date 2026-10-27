// languageTexts: the texts the plugin shows people, read on both hosts and changed or reset in the control panel only.
// They live in one language record of the instance, so every control spec below changes the same record.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);
const unique = (label) => `Post ${label} (${contract.host}) ${Date.now()}`;

// The sections the contract declares, and how many texts updateLanguageText's list of keys holds in all.
const SECTIONS = ['general', 'sortingOptions', 'locationEditing', 'toast', 'details', 'emptyState'];
const TEXT_COUNT = 126;
// A text that may be left empty, and one that may not, each up to 50 characters, in two sections.
const OPTIONAL_TEXT = { key: 'general.enterBookmarkTitleHere', section: 'general', defaultValue: 'Enter bookmark title here', maxLength: 50 };
const REQUIRED_TEXT = { key: 'toast.locationSaved', section: 'toast', defaultValue: 'Location Saved', maxLength: 50 };

const allTexts = async () => (await call('listLanguageTexts', {})).texts;
const textOf = async (key) => (await call('listLanguageTexts', { section: key.split('.')[0] })).texts.find((text) => text.key === key);

// What any text looks like, whatever was saved: each declared field of its type, and the original shown when it is unchanged.
const expectTextShape = (text) => {
  expect(text).toEqual(jasmine.objectContaining({
    key: jasmine.any(String),
    section: jasmine.any(String),
    title: jasmine.any(String),
    value: jasmine.any(String),
    defaultValue: jasmine.any(String),
    customized: jasmine.any(Boolean),
    required: jasmine.any(Boolean),
    maxLength: jasmine.any(Number),
  }));
  expect(SECTIONS).toContain(text.section);
  expect(text.key.indexOf(`${text.section}.`)).toBe(0);
  if (!text.customized) expect(text.value).toBe(text.defaultValue);
};

// Nothing in the frame answers messaging: the reload message each save sends the widget is the plugin's own bookkeeping,
// which the manifest never mentions, so its spy only answers.
const quiet = () => {
  spyOn(buildfire.messaging, 'sendMessageToWidget');
};

contract.describe('listLanguageTexts', () => {
  it('shows every text once, each with its details', async () => {
    const texts = await allTexts();
    expect(texts.length).toBe(TEXT_COUNT);
    expect(new Set(texts.map((text) => text.key)).size).toBe(TEXT_COUNT);
    texts.forEach(expectTextShape);
    expect(texts).toContain(jasmine.objectContaining({
      key: OPTIONAL_TEXT.key, section: 'general', defaultValue: OPTIONAL_TEXT.defaultValue, required: false, maxLength: 50,
    }));
    expect(texts).toContain(jasmine.objectContaining({
      key: REQUIRED_TEXT.key, section: 'toast', defaultValue: REQUIRED_TEXT.defaultValue, required: true, maxLength: 50,
    }));
  });

  it('shows only the texts of the section it is given, and every section together makes the whole list', async () => {
    const all = await allTexts();
    let counted = 0;
    for (const section of SECTIONS) {
      const { texts } = await call('listLanguageTexts', { section });
      expect(texts.length).toBeGreaterThan(0);
      texts.forEach((text) => expect(text.section).toBe(section));
      expect(texts).toEqual(all.filter((text) => text.section === section));
      counted += texts.length;
    }
    expect(counted).toBe(all.length);
  });

  it('changes nothing: two reads in a row agree', async () => {
    const first = await allTexts();
    expect(await allTexts()).toEqual(first);
  });

  describe('refuses', () => {
    it('a section it does not have', async () => {
      expect(await refusal(call('listLanguageTexts', { section: 'footer' }))).toContain('section');
    });

    it('a section that is not text', async () => {
      expect(await refusal(call('listLanguageTexts', { section: 3 }))).toContain('section');
    });
  });
});

// controlBackground only: this block runs in the control frame, where the datastore is writable.
contract.describe('updateLanguageText', () => {
  beforeEach(quiet);

  it('changes the text, and returns it as now shown', async () => {
    const value = unique('title');
    expect(await call('updateLanguageText', { key: OPTIONAL_TEXT.key, value })).toEqual(jasmine.objectContaining({
      key: OPTIONAL_TEXT.key,
      section: 'general',
      title: jasmine.any(String),
      value,
      defaultValue: OPTIONAL_TEXT.defaultValue,
      customized: true,
      required: false,
      maxLength: 50,
    }));
    expect(await textOf(OPTIONAL_TEXT.key)).toEqual(jasmine.objectContaining({ value, customized: true }));
  });

  it('changes one text and leaves every other as it was', async () => {
    const before = await allTexts();
    const value = unique('saved');
    await call('updateLanguageText', { key: REQUIRED_TEXT.key, value });
    const after = await allTexts();
    expect(after.find((text) => text.key === REQUIRED_TEXT.key)).toEqual(jasmine.objectContaining({ value, customized: true }));
    expect(after.filter((text) => text.key !== REQUIRED_TEXT.key)).toEqual(before.filter((text) => text.key !== REQUIRED_TEXT.key));
  });

  it('takes a text exactly as long as its longest length', async () => {
    const value = unique('long').padEnd(OPTIONAL_TEXT.maxLength, 'x');
    expect((await call('updateLanguageText', { key: OPTIONAL_TEXT.key, value })).value).toBe(value);
    expect((await textOf(OPTIONAL_TEXT.key)).value).toBe(value);
  });

  it('goes back to the original text when given no text', async () => {
    await call('updateLanguageText', { key: OPTIONAL_TEXT.key, value: unique('title') });
    expect(await call('updateLanguageText', { key: OPTIONAL_TEXT.key, value: null })).toEqual(jasmine.objectContaining({
      key: OPTIONAL_TEXT.key, value: OPTIONAL_TEXT.defaultValue, customized: false,
    }));
    expect(await textOf(OPTIONAL_TEXT.key)).toEqual(jasmine.objectContaining({ value: OPTIONAL_TEXT.defaultValue, customized: false }));
  });

  it('shows nothing for a text that may be left empty, when left empty', async () => {
    await call('updateLanguageText', { key: OPTIONAL_TEXT.key, value: unique('title') });
    expect(await call('updateLanguageText', { key: OPTIONAL_TEXT.key, value: '' })).toEqual(jasmine.objectContaining({
      key: OPTIONAL_TEXT.key, value: '', customized: true,
    }));
    expect(await textOf(OPTIONAL_TEXT.key)).toEqual(jasmine.objectContaining({ value: '', customized: true }));
  });

  describe('refuses, and changes nothing', () => {
    let before;
    beforeEach(async () => {
      await call('updateLanguageText', { key: REQUIRED_TEXT.key, value: unique('kept') });
      before = await allTexts();
    });
    const expectUnchanged = async () => expect(await allTexts()).toEqual(before);

    it('without a key', async () => {
      expect(await refusal(call('updateLanguageText', { value: unique('no key') }))).toContain('key');
      await expectUnchanged();
    });

    it('with a null key', async () => {
      expect(await refusal(call('updateLanguageText', { key: null, value: unique('null key') }))).toContain('key');
      await expectUnchanged();
    });

    it('with an empty key', async () => {
      expect(await refusal(call('updateLanguageText', { key: '', value: unique('empty key') }))).toContain('key');
      await expectUnchanged();
    });

    it('with a key that is not text', async () => {
      expect(await refusal(call('updateLanguageText', { key: 7, value: unique('number key') }))).toContain('key');
      await expectUnchanged();
    });

    it('with a key no text has', async () => {
      expect(await refusal(call('updateLanguageText', { key: 'general.footer', value: unique('unknown key') }))).toContain('key');
      await expectUnchanged();
    });

    it('without a value', async () => {
      expect(await refusal(call('updateLanguageText', { key: REQUIRED_TEXT.key }))).toContain('value');
      await expectUnchanged();
    });

    it('with a value that is not text', async () => {
      expect(await refusal(call('updateLanguageText', { key: REQUIRED_TEXT.key, value: 12 }))).toContain('value');
      await expectUnchanged();
    });

    it('with a value longer than the text may be', async () => {
      const value = unique('too long').padEnd(REQUIRED_TEXT.maxLength + 1, 'x');
      expect(await refusal(call('updateLanguageText', { key: REQUIRED_TEXT.key, value }))).toContain('value');
      await expectUnchanged();
    });

    it('leaving empty a text that may not be left empty', async () => {
      await expectAsync(call('updateLanguageText', { key: REQUIRED_TEXT.key, value: '' })).toBeRejected();
      await expectUnchanged();
    });
  });
});

// controlBackground only: this block runs in the control frame, where the datastore is writable.
contract.describe('resetLanguageTexts', () => {
  beforeEach(quiet);

  const expectOriginal = (texts) => {
    expect(texts.length).toBe(TEXT_COUNT);
    texts.forEach((text) => {
      expectTextShape(text);
      expect(text).toEqual(jasmine.objectContaining({ value: text.defaultValue, customized: false }));
    });
  };

  it('goes back to every original text, and returns the texts as now shown', async () => {
    await call('updateLanguageText', { key: OPTIONAL_TEXT.key, value: unique('title') });
    await call('updateLanguageText', { key: REQUIRED_TEXT.key, value: unique('saved') });
    const { texts } = await call('resetLanguageTexts', {});
    expectOriginal(texts);
    expect(texts).toContain(jasmine.objectContaining({ key: OPTIONAL_TEXT.key, value: OPTIONAL_TEXT.defaultValue }));
    expect(texts).toContain(jasmine.objectContaining({ key: REQUIRED_TEXT.key, value: REQUIRED_TEXT.defaultValue }));
    const listed = await allTexts();
    expectOriginal(listed);
    expect(listed).toEqual(texts);
  });

  it('brings back a text that was left empty', async () => {
    await call('updateLanguageText', { key: OPTIONAL_TEXT.key, value: '' });
    await call('resetLanguageTexts', {});
    expect(await textOf(OPTIONAL_TEXT.key)).toEqual(jasmine.objectContaining({ value: OPTIONAL_TEXT.defaultValue, customized: false }));
  });

  it('succeeds with nothing changed', async () => {
    await call('resetLanguageTexts', {});
    expectOriginal((await call('resetLanguageTexts', {})).texts);
  });

  it('lets texts be changed again afterwards', async () => {
    await call('resetLanguageTexts', {});
    const value = unique('again');
    await call('updateLanguageText', { key: OPTIONAL_TEXT.key, value });
    expect(await textOf(OPTIONAL_TEXT.key)).toEqual(jasmine.objectContaining({ value, customized: true }));
  });
});
