// locationFields: the extra fields people fill in for a location, kept in the settings and made in the control panel only.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);
const unique = (label) => `Post ${label} (${contract.host}) ${Date.now()}`;
// Every field as the contract's own read shows it, with the section it is in.
const fields = async () => {
  const { customFields } = await call('getSettings', {});
  return [
    ...customFields.quickActions.map((field) => ({ ...field, section: 'quickActions' })),
    ...customFields.content.map((field) => ({ ...field, section: 'content' }))
  ];
};
const labeled = async (label) => (await fields()).filter((field) => field.label === label);
const sectionIds = async (section) => (await fields()).filter((field) => field.section === section).map((field) => field.id);
// The plugin allows 10 fields in all, so every spec removes the fields it made.
let made = [];
const make = async (label, extra) => {
  const field = await call('createLocationField', { label: unique(label), section: 'content', ...extra });
  made.push(field.id);
  return field;
};
const cleanUp = async () => {
  const ids = made;
  made = [];
  for (const fieldId of ids) {
    await call('deleteLocationFieldAdvanced', { fieldId }).catch(() => null);
  }
};
// The refresh message to the widget is the plugin's own bookkeeping, which the manifest never mentions: the spy only answers.
const quietSideEffects = () => spyOn(buildfire.messaging, 'sendMessageToWidget');

// controlBackground only, like every operation of this file: the settings are written in the control panel.
contract.describe('createLocationField', () => {
  beforeEach(quietSideEffects);
  afterEach(cleanUp);

  it('adds a text content field from its name, and returns it', async () => {
    const field = await make('field');
    expect(field).toEqual(jasmine.objectContaining({
      id: jasmine.any(String), section: 'content', type: 'EMAIL', required: false, allowCustomLabel: false
    }));
    expect(await labeled(field.label)).toEqual([jasmine.objectContaining({
      id: field.id, section: 'content', type: 'EMAIL', required: false, enableCustomLabel: false
    })]);
  });

  it('adds a field with every option', async () => {
    const field = await make('rich field', { type: 'RICH_TEXT', required: true, allowCustomLabel: true });
    expect(field).toEqual(jasmine.objectContaining({ type: 'RICH_TEXT', required: true, allowCustomLabel: true }));
    expect(await labeled(field.label)).toEqual([jasmine.objectContaining({ type: 'RICH_TEXT', required: true, enableCustomLabel: true })]);
  });

  it('adds a quick action field', async () => {
    const field = await make('quick action', { section: 'quickActions', type: 'PHONE' });
    expect(await labeled(field.label)).toEqual([jasmine.objectContaining({ id: field.id, section: 'quickActions', type: 'PHONE' })]);
  });

  describe('refuses, and adds nothing', () => {
    it('a text type in the quick actions', async () => {
      const label = unique('quick text');
      expect(await refusal(call('createLocationField', { label, section: 'quickActions', type: 'TEXT' }))).toContain('type');
      expect(await labeled(label)).toEqual([]);
    });

    it('a type it does not offer', async () => {
      const label = unique('date field');
      expect(await refusal(call('createLocationField', { label, section: 'content', type: 'DATE' }))).toContain('type');
      expect(await labeled(label)).toEqual([]);
    });

    it('a section it does not offer, or none', async () => {
      const label = unique('no section');
      expect(await refusal(call('createLocationField', { label, section: 'footer' }))).toContain('section');
      expect(await refusal(call('createLocationField', { label }))).toContain('section');
      expect(await labeled(label)).toEqual([]);
    });

    it('without a name', async () => {
      expect(await refusal(call('createLocationField', { section: 'content' }))).toContain('label');
      expect(await refusal(call('createLocationField', { label: null, section: 'content' }))).toContain('label');
      expect(await refusal(call('createLocationField', { label: '', section: 'content' }))).toContain('label');
    });

    it('choices that are not yes or no', async () => {
      const label = unique('bad choice');
      expect(await refusal(call('createLocationField', { label, section: 'content', required: 'yes' }))).toContain('required');
      expect(await refusal(call('createLocationField', { label, section: 'content', allowCustomLabel: 1 }))).toContain('allowCustomLabel');
      expect(await labeled(label)).toEqual([]);
    });

    it('an eleventh field', async () => {
      // Fill the fields up to the plugin's limit of 10, made through the contract, given the time that takes.
      const existing = (await fields()).length;
      for (let index = existing; index < 10; index += 1) await make(`filler ${index}`);
      const label = unique('eleventh');
      await expectAsync(call('createLocationField', { label, section: 'content' })).toBeRejected();
      expect(await labeled(label)).toEqual([]);
    }, 180000);
  });
});

contract.describe('updateLocationField', () => {
  beforeEach(quietSideEffects);
  afterEach(cleanUp);

  it('renames a field, keeping the rest, and returns it', async () => {
    const field = await make('rename', { type: 'URL' });
    const newLabel = `${field.label} renamed`;
    expect(await call('updateLocationField', { label: field.label, newLabel })).toEqual(jasmine.objectContaining({
      id: field.id, label: newLabel, section: 'content', type: 'URL'
    }));
    expect(await labeled(field.label)).toEqual([]);
    expect(await labeled(newLabel)).toEqual([jasmine.objectContaining({ id: field.id, type: 'URL' })]);
  });

  it('changes its type and choices', async () => {
    const field = await make('choices');
    await call('updateLocationField', { label: field.label, newType: 'TEXT', required: true, allowCustomLabel: true });
    expect(await labeled(field.label)).toEqual([jasmine.objectContaining({ type: 'TEXT', required: true, enableCustomLabel: true })]);
    await call('updateLocationField', { label: field.label, required: false });
    expect(await labeled(field.label)).toEqual([jasmine.objectContaining({ type: 'TEXT', required: false, enableCustomLabel: true })]);
  });

  describe('refuses, and changes nothing', () => {
    it('a name no field has', async () => {
      const label = unique('missing field');
      expect(await refusal(call('updateLocationField', { label, required: true }))).toContain(label);
    });

    it('a name two fields share, saying how many', async () => {
      const field = await make('shared');
      made.push((await call('createLocationField', { label: field.label, section: 'quickActions' })).id);
      expect((await refusal(call('updateLocationField', { label: field.label, required: true }))).replace(field.label, '')).toContain('2');
      expect(await labeled(field.label)).toEqual([jasmine.objectContaining({ required: false }), jasmine.objectContaining({ required: false })]);
    });

    it('removing the name', async () => {
      const field = await make('keep name');
      expect(await refusal(call('updateLocationField', { label: field.label, newLabel: null }))).toContain('newLabel');
      expect(await refusal(call('updateLocationField', { label: field.label, newLabel: '' }))).toContain('newLabel');
      expect(await labeled(field.label)).toEqual([jasmine.objectContaining({ id: field.id })]);
    });

    it('a type its section does not offer', async () => {
      const field = await make('quick type', { section: 'quickActions' });
      expect(await refusal(call('updateLocationField', { label: field.label, newType: 'RICH_TEXT' }))).toContain('newType');
      expect(await labeled(field.label)).toEqual([jasmine.objectContaining({ type: 'EMAIL' })]);
    });

    it('a choice that is not yes or no', async () => {
      const field = await make('bad update choice');
      expect(await refusal(call('updateLocationField', { label: field.label, required: 'no' }))).toContain('required');
      expect(await labeled(field.label)).toEqual([jasmine.objectContaining({ required: false })]);
    });

    it('a call that changes nothing', async () => {
      const field = await make('nothing');
      await expectAsync(call('updateLocationField', { label: field.label })).toBeRejected();
    });

    it('without a name', async () => {
      expect(await refusal(call('updateLocationField', { required: true }))).toContain('label');
      expect(await refusal(call('updateLocationField', { label: '', required: true }))).toContain('label');
    });
  });
});

contract.describe('updateLocationFieldAdvanced', () => {
  beforeEach(quietSideEffects);
  afterEach(cleanUp);

  it('changes the field with that id', async () => {
    const field = await make('by id');
    expect(await call('updateLocationFieldAdvanced', { fieldId: field.id, newLabel: `${field.label} renamed`, newType: 'PHONE' }))
      .toEqual(jasmine.objectContaining({ id: field.id, label: `${field.label} renamed`, type: 'PHONE' }));
    expect(await labeled(`${field.label} renamed`)).toEqual([jasmine.objectContaining({ id: field.id, type: 'PHONE' })]);
  });

  it('refuses an id that matches no field', async () => {
    const field = await call('createLocationField', { label: unique('gone'), section: 'content' });
    await call('deleteLocationFieldAdvanced', { fieldId: field.id });
    await expectAsync(call('updateLocationFieldAdvanced', { fieldId: field.id, required: true })).toBeRejected();
    expect(await labeled(field.label)).toEqual([]);
  });

  it('refuses without an id, or with nothing to change', async () => {
    expect(await refusal(call('updateLocationFieldAdvanced', { required: true }))).toContain('fieldId');
    expect(await refusal(call('updateLocationFieldAdvanced', { fieldId: null, required: true }))).toContain('fieldId');
    const field = await make('id nothing');
    await expectAsync(call('updateLocationFieldAdvanced', { fieldId: field.id })).toBeRejected();
  });
});

contract.describe('deleteLocationField', () => {
  beforeEach(quietSideEffects);
  afterEach(cleanUp);

  it('removes the field, and leaves the others alone', async () => {
    const kept = await make('kept');
    const field = await call('createLocationField', { label: unique('deleted'), section: 'quickActions' });
    expect(await call('deleteLocationField', { label: field.label })).toEqual(jasmine.objectContaining({
      id: field.id, label: field.label, section: 'quickActions', deleted: true
    }));
    expect(await labeled(field.label)).toEqual([]);
    expect(await labeled(kept.label)).toEqual([jasmine.objectContaining({ id: kept.id })]);
  });

  describe('refuses, and removes nothing', () => {
    it('a name no field has', async () => {
      const label = unique('missing delete');
      expect(await refusal(call('deleteLocationField', { label }))).toContain(label);
    });

    it('a name two fields share, saying how many', async () => {
      const field = await make('shared delete');
      made.push((await call('createLocationField', { label: field.label, section: 'content' })).id);
      expect((await refusal(call('deleteLocationField', { label: field.label }))).replace(field.label, '')).toContain('2');
      expect((await labeled(field.label)).length).toBe(2);
    });

    it('without a name', async () => {
      expect(await refusal(call('deleteLocationField', {}))).toContain('label');
      expect(await refusal(call('deleteLocationField', { label: null }))).toContain('label');
    });
  });
});

contract.describe('deleteLocationFieldAdvanced', () => {
  beforeEach(quietSideEffects);
  afterEach(cleanUp);

  it('removes the field with that id', async () => {
    const field = await call('createLocationField', { label: unique('delete by id'), section: 'content' });
    expect(await call('deleteLocationFieldAdvanced', { fieldId: field.id })).toEqual(jasmine.objectContaining({ id: field.id, deleted: true }));
    expect(await labeled(field.label)).toEqual([]);
  });

  it('refuses an id that matches no field', async () => {
    const field = await call('createLocationField', { label: unique('deleted twice'), section: 'content' });
    await call('deleteLocationFieldAdvanced', { fieldId: field.id });
    await expectAsync(call('deleteLocationFieldAdvanced', { fieldId: field.id })).toBeRejected();
  });

  it('refuses without an id', async () => {
    expect(await refusal(call('deleteLocationFieldAdvanced', {}))).toContain('fieldId');
    expect(await refusal(call('deleteLocationFieldAdvanced', { fieldId: '' }))).toContain('fieldId');
  });
});

contract.describe('updateLocationFieldOrder', () => {
  beforeEach(quietSideEffects);
  afterEach(cleanUp);

  it('moves a field to its new place in its section, and returns the new order', async () => {
    const first = await make('first');
    const second = await make('second');
    const result = await call('updateLocationFieldOrder', { label: second.label, position: 1 });
    expect(result).toEqual(jasmine.objectContaining({ section: 'content' }));
    expect(result.fields[0]).toEqual(jasmine.objectContaining({ id: second.id }));
    const order = await sectionIds('content');
    expect(order[0]).toBe(second.id);
    expect(order.indexOf(first.id)).toBeGreaterThan(0);
  });

  describe('refuses, and keeps the order', () => {
    it('a place past the end of its section', async () => {
      const field = await make('too far');
      const before = await sectionIds('content');
      expect(await refusal(call('updateLocationFieldOrder', { label: field.label, position: before.length + 1 }))).toContain('position');
      expect(await sectionIds('content')).toEqual(before);
    });

    it('a place before the start, or not a whole number', async () => {
      const field = await make('bad place');
      expect(await refusal(call('updateLocationFieldOrder', { label: field.label, position: 0 }))).toContain('position');
      expect(await refusal(call('updateLocationFieldOrder', { label: field.label, position: '1' }))).toContain('position');
      expect(await refusal(call('updateLocationFieldOrder', { label: field.label }))).toContain('position');
    });

    it('a name no field has', async () => {
      const label = unique('missing order');
      expect(await refusal(call('updateLocationFieldOrder', { label, position: 1 }))).toContain(label);
    });
  });
});

contract.describe('updateLocationFieldOrderAdvanced', () => {
  beforeEach(quietSideEffects);
  afterEach(cleanUp);

  it('moves the field with that id', async () => {
    await make('id first', { section: 'quickActions' });
    const second = await make('id second', { section: 'quickActions' });
    await call('updateLocationFieldOrderAdvanced', { fieldId: second.id, position: 1 });
    expect((await sectionIds('quickActions'))[0]).toBe(second.id);
  });

  it('refuses an id that matches no field', async () => {
    const field = await call('createLocationField', { label: unique('order gone'), section: 'content' });
    await call('deleteLocationFieldAdvanced', { fieldId: field.id });
    await expectAsync(call('updateLocationFieldOrderAdvanced', { fieldId: field.id, position: 1 })).toBeRejected();
  });

  it('refuses without an id or a place', async () => {
    expect(await refusal(call('updateLocationFieldOrderAdvanced', { position: 1 }))).toContain('fieldId');
    const field = await make('id no place');
    expect(await refusal(call('updateLocationFieldOrderAdvanced', { fieldId: field.id }))).toContain('position');
  });
});
