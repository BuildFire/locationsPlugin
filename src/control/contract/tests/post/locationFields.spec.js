// locationFields: the extra fields every location can fill in, kept in the settings, one block per operation.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);
const unique = (label) => `Post ${label} (${contract.host}) ${Date.now()}`;

// The fields as the contract's own read shows them.
const fields = async () => (await call('getSettings', {})).locationFields;
const fieldNamed = async (label) => (await fields()).filter((field) => field.label === label);
const labelsIn = async (section) => (await fields()).filter((field) => field.section === section).map((field) => field.label);
const make = (label, extra = {}) => call('createLocationField', {
  label: unique(label), section: 'content', type: 'TEXT', ...extra
});
// There can be ten fields in all: each spec removes the fields it made, so the next one has room.
const cleanUp = async () => {
  const mine = (await fields()).filter((field) => field.label.startsWith('Post ') && field.label.includes(`(${contract.host}) `));
  if (mine.length) await call('deleteLocationFieldsAdvanced', { fields: mine.map((field) => ({ fieldId: field.id })) });
};
// The widget refresh message gets no answer here: a spy stands in for it and only answers.
const quiet = () => spyOn(buildfire.messaging, 'sendMessageToWidget');

// controlBackground only: the settings tab manages location fields.
contract.describe('createLocationField', () => {
  beforeEach(quiet);
  afterEach(cleanUp, 60000);

  it('adds a field with the defaults the page uses, and returns it', async () => {
    const label = unique('field');
    const created = await call('createLocationField', { label, section: 'content', type: 'TEXT' });
    expect(created).toEqual({
      id: jasmine.any(String), label, type: 'TEXT', section: 'content', required: false, allowCustomLabel: false
    });
    expect(await fieldNamed(label)).toEqual([created]);
  });

  it('adds a quick action that is required and takes its own label', async () => {
    const label = unique('quick');
    const created = await call('createLocationField', {
      label, section: 'quickActions', type: 'PHONE', required: true, allowCustomLabel: true
    });
    expect(created).toEqual(jasmine.objectContaining({ section: 'quickActions', type: 'PHONE', required: true, allowCustomLabel: true }));
    expect((await labelsIn('quickActions')).pop()).toBe(label);
  });

  describe('refuses, and adds nothing', () => {
    it('without a label, a section or a type', async () => {
      expect(await refusal(call('createLocationField', { section: 'content', type: 'TEXT' }))).toContain('label');
      expect(await refusal(call('createLocationField', { label: '', section: 'content', type: 'TEXT' }))).toContain('label');
      expect(await refusal(call('createLocationField', { label: unique('no section'), type: 'TEXT' }))).toContain('section');
      expect(await refusal(call('createLocationField', { label: unique('no type'), section: 'content' }))).toContain('type');
    });

    it('a type its section does not take', async () => {
      const label = unique('text action');
      expect(await refusal(call('createLocationField', { label, section: 'quickActions', type: 'TEXT' }))).toContain('type');
      expect(await fieldNamed(label)).toEqual([]);
    });

    it('a section or a type it does not offer', async () => {
      const label = unique('bad type');
      expect(await refusal(call('createLocationField', { label, section: 'footer', type: 'TEXT' }))).toContain('section');
      expect(await refusal(call('createLocationField', { label, section: 'content', type: 'DATE' }))).toContain('type');
      expect(await fieldNamed(label)).toEqual([]);
    });

    it('required or allowCustomLabel that are not true or false', async () => {
      const label = unique('bad flag');
      expect(await refusal(call('createLocationField', { label, section: 'content', type: 'TEXT', required: 'yes' }))).toContain('required');
      expect(await refusal(call('createLocationField', { label, section: 'content', type: 'TEXT', allowCustomLabel: 1 }))).toContain('allowCustomLabel');
      expect(await fieldNamed(label)).toEqual([]);
    });

    it('an eleventh field', async () => {
      const room = 10 - (await fields()).length;
      if (room > 0) {
        await call('createLocationFieldsAdvanced', { fields: Array.from({ length: room }, (value, index) => ({ label: unique(`filler ${index}`), section: 'content', type: 'TEXT' })) });
      }
      const label = unique('eleventh');
      expect(await refusal(call('createLocationField', { label, section: 'content', type: 'TEXT' }))).toContain('10');
      expect(await fieldNamed(label)).toEqual([]);
    }, 120000);
  });
});

contract.describe('createLocationFieldsAdvanced', () => {
  beforeEach(quiet);
  afterEach(cleanUp, 60000);

  it('adds every field, in order, and reports each', async () => {
    const labels = [unique('batch one'), unique('batch two')];
    const result = await call('createLocationFieldsAdvanced', { fields: labels.map((label) => ({ label, section: 'content', type: 'URL' })) });
    expect(result).toEqual(jasmine.objectContaining({
      fields: [jasmine.objectContaining({ index: 0, id: jasmine.any(String), error: null }), jasmine.objectContaining({ index: 1, id: jasmine.any(String), error: null })],
      succeeded: 2,
      failed: 0
    }));
    expect((await labelsIn('content')).slice(-2)).toEqual(labels);
  });

  describe('refuses the whole list, and adds none of it', () => {
    it('when one entry is invalid', async () => {
      const valid = unique('valid entry');
      expect(await refusal(call('createLocationFieldsAdvanced', { fields: [{ label: valid, section: 'content', type: 'TEXT' }, { label: unique('invalid'), section: 'quickActions', type: 'RICH_TEXT' }] }))).toContain('type');
      expect(await fieldNamed(valid)).toEqual([]);
    });

    it('when it would make more than ten fields', async () => {
      const room = 10 - (await fields()).length;
      const entries = Array.from({ length: room + 1 }, (value, index) => ({ label: unique(`too many ${index}`), section: 'content', type: 'TEXT' }));
      expect(await refusal(call('createLocationFieldsAdvanced', { fields: entries }))).toContain('10');
      expect(await fieldNamed(entries[0].label)).toEqual([]);
    });

    it('when it is empty', async () => {
      expect(await refusal(call('createLocationFieldsAdvanced', { fields: [] }))).toContain('fields');
    });
  });
});

contract.describe('updateLocationField', () => {
  beforeEach(quiet);
  afterEach(cleanUp, 60000);

  it('changes only what it is given, and returns the field', async () => {
    const created = await make('update');
    const updated = await call('updateLocationField', { label: created.label, newType: 'RICH_TEXT', newRequired: true });
    expect(updated).toEqual({ ...created, type: 'RICH_TEXT', required: true });
    expect(await fieldNamed(created.label)).toEqual([updated]);
  });

  it('renames the field', async () => {
    const created = await make('rename');
    await call('updateLocationField', { label: created.label, newLabel: `${created.label} renamed`, newAllowCustomLabel: true });
    expect(await fieldNamed(created.label)).toEqual([]);
    expect(await fieldNamed(`${created.label} renamed`)).toEqual([jasmine.objectContaining({ id: created.id, allowCustomLabel: true })]);
  });

  describe('refuses, and changes nothing', () => {
    it('a label no field has', async () => {
      const label = unique('missing');
      expect(await refusal(call('updateLocationField', { label, newRequired: true }))).toContain(label);
    });

    it('a label two fields share, saying how many', async () => {
      const label = unique('shared');
      await call('createLocationField', { label, section: 'content', type: 'TEXT' });
      await call('createLocationField', { label, section: 'quickActions', type: 'URL' });
      expect((await refusal(call('updateLocationField', { label, newRequired: true }))).replace(label, '')).toContain('2');
      expect((await fieldNamed(label)).map((field) => field.required)).toEqual([false, false]);
    });

    it('a type its section does not take', async () => {
      const created = await make('quick type', { section: 'quickActions', type: 'URL' });
      expect(await refusal(call('updateLocationField', { label: created.label, newType: 'TEXT' }))).toContain('newType');
      expect((await fieldNamed(created.label))[0].type).toBe('URL');
    });

    it('removing the label, or changing nothing', async () => {
      const created = await make('keep');
      expect(await refusal(call('updateLocationField', { label: created.label, newLabel: null }))).toContain('newLabel');
      expect(await refusal(call('updateLocationField', { label: created.label }))).toContain('newLabel');
      expect(await fieldNamed(created.label)).toEqual([created]);
    });
  });
});

contract.describe('updateLocationFieldAdvanced', () => {
  beforeEach(quiet);
  afterEach(cleanUp, 60000);

  it('changes the field with that id', async () => {
    const created = await make('by id');
    expect(await call('updateLocationFieldAdvanced', { fieldId: created.id, newRequired: true })).toEqual({ ...created, required: true });
  });

  it('refuses an id that matches nothing', async () => {
    expect(await refusal(call('updateLocationFieldAdvanced', { fieldId: 'no-such-field', newRequired: true }))).toContain('no-such-field');
  });
});

contract.describe('updateLocationFieldsAdvanced', () => {
  beforeEach(quiet);
  afterEach(cleanUp, 60000);

  it('changes every field, and reports each', async () => {
    const one = await make('batch update one');
    const two = await make('batch update two');
    expect(await call('updateLocationFieldsAdvanced', { fields: [{ fieldId: one.id, newRequired: true }, { fieldId: two.id, newType: 'EMAIL' }] }))
      .toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
    expect((await fieldNamed(one.label))[0].required).toBe(true);
    expect((await fieldNamed(two.label))[0].type).toBe('EMAIL');
  });

  describe('refuses the whole list, and changes none of it', () => {
    it('when one id matches nothing', async () => {
      const one = await make('batch known');
      expect(await refusal(call('updateLocationFieldsAdvanced', { fields: [{ fieldId: one.id, newRequired: true }, { fieldId: 'no-such-field', newRequired: true }] }))).toContain('no-such-field');
      expect((await fieldNamed(one.label))[0].required).toBe(false);
    });

    it('when one type does not fit its section', async () => {
      const one = await make('batch fits');
      const two = await make('batch quick', { section: 'quickActions', type: 'URL' });
      expect(await refusal(call('updateLocationFieldsAdvanced', { fields: [{ fieldId: one.id, newRequired: true }, { fieldId: two.id, newType: 'TEXT' }] }))).toContain('newType');
      expect((await fieldNamed(one.label))[0].required).toBe(false);
    });

    it('when the same field is listed twice, or the list is empty', async () => {
      const one = await make('batch twice');
      await expectAsync(call('updateLocationFieldsAdvanced', { fields: [{ fieldId: one.id, newRequired: true }, { fieldId: one.id, newRequired: false }] })).toBeRejected();
      expect((await fieldNamed(one.label))[0].required).toBe(false);
      expect(await refusal(call('updateLocationFieldsAdvanced', { fields: [] }))).toContain('fields');
    });
  });
});

contract.describe('deleteLocationField', () => {
  beforeEach(quiet);
  afterEach(cleanUp, 60000);

  it('removes the field with that label', async () => {
    const created = await make('delete');
    expect(await call('deleteLocationField', { label: created.label })).toEqual({ id: created.id, label: created.label });
    expect(await fieldNamed(created.label)).toEqual([]);
  });

  it('refuses a label no field has, and none at all', async () => {
    const label = unique('missing');
    expect(await refusal(call('deleteLocationField', { label }))).toContain(label);
    expect(await refusal(call('deleteLocationField', {}))).toContain('label');
  });
});

contract.describe('deleteLocationFieldAdvanced', () => {
  beforeEach(quiet);
  afterEach(cleanUp, 60000);

  it('removes the field with that id', async () => {
    const created = await make('delete by id');
    expect(await call('deleteLocationFieldAdvanced', { fieldId: created.id })).toEqual({ id: created.id, label: created.label });
    expect(await fieldNamed(created.label)).toEqual([]);
  });

  it('refuses an id that matches nothing', async () => {
    expect(await refusal(call('deleteLocationFieldAdvanced', { fieldId: 'no-such-field' }))).toContain('no-such-field');
  });
});

contract.describe('deleteLocationFieldsAdvanced', () => {
  beforeEach(quiet);
  afterEach(cleanUp, 60000);

  it('removes every field, and reports each', async () => {
    const one = await make('batch delete one');
    const two = await make('batch delete two');
    expect(await call('deleteLocationFieldsAdvanced', { fields: [{ fieldId: one.id }, { fieldId: two.id }] })).toEqual(jasmine.objectContaining({
      fields: [jasmine.objectContaining({ index: 0, id: one.id, error: null }), jasmine.objectContaining({ index: 1, id: two.id, error: null })],
      succeeded: 2,
      failed: 0
    }));
    expect(await fieldNamed(one.label)).toEqual([]);
  });

  it('refuses the whole list when one id matches nothing, or one is listed twice', async () => {
    const one = await make('batch delete known');
    expect(await refusal(call('deleteLocationFieldsAdvanced', { fields: [{ fieldId: one.id }, { fieldId: 'no-such-field' }] }))).toContain('no-such-field');
    await expectAsync(call('deleteLocationFieldsAdvanced', { fields: [{ fieldId: one.id }, { fieldId: one.id }] })).toBeRejected();
    expect((await fieldNamed(one.label)).length).toBe(1);
  });
});

contract.describe('updateLocationFieldOrder', () => {
  beforeEach(quiet);
  afterEach(cleanUp, 60000);

  it('moves a field to another place within its section', async () => {
    const one = await make('order one');
    const two = await make('order two');
    const moved = await call('updateLocationFieldOrder', { label: two.label, position: 1 });
    expect(moved.fields[0]).toEqual(two);
    const content = await labelsIn('content');
    expect(content.indexOf(two.label)).toBe(0);
    expect(content.indexOf(one.label)).toBeGreaterThan(0);
  });

  it('refuses a place past the end of its section, or below 1', async () => {
    const one = await make('order past', { section: 'quickActions', type: 'EMAIL' });
    const count = (await labelsIn('quickActions')).length;
    expect(await refusal(call('updateLocationFieldOrder', { label: one.label, position: count + 1 }))).toContain('position');
    expect(await refusal(call('updateLocationFieldOrder', { label: one.label, position: 0 }))).toContain('position');
    expect((await labelsIn('quickActions')).pop()).toBe(one.label);
  });
});

contract.describe('updateLocationFieldOrderAdvanced', () => {
  beforeEach(quiet);
  afterEach(cleanUp, 60000);

  it('moves the field with that id', async () => {
    await make('order by id one');
    const two = await make('order by id two');
    expect((await call('updateLocationFieldOrderAdvanced', { fieldId: two.id, position: 1 })).fields[0]).toEqual(two);
  });

  it('refuses an id that matches nothing', async () => {
    expect(await refusal(call('updateLocationFieldOrderAdvanced', { fieldId: 'no-such-field', position: 1 }))).toContain('no-such-field');
  });
});
