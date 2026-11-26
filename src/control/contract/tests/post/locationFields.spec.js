// locationFields: the extra fields every location can fill in, kept in the plugin's settings; the control panel manages them.
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
const unique = (label) => `Post ${label} (${contract.host}) ${Date.now()}`;

// The location fields as the contract's own read shows them.
const fields = async () => (await call('getSettings', {})).locationFields;
const withLabel = async (label) => (await fields()).filter((field) => field.label === label);

// A refresh message to the widget the manifest never mentions: the spy only answers.
const quiet = () => {
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') spyOn(buildfire.messaging, 'sendMessageToWidget');
};

// Up to ten fields fit on an instance, and the specs share it: each one removes the fields it made before it ends.
let made = [];
const create = async (label, extra = {}) => {
  const field = await call('createLocationField', {
    label: unique(label), section: 'content', type: 'TEXT', ...extra,
  });
  made.push(field.id);
  return field;
};
const track = (ids) => { made.push(...ids.filter(Boolean)); };
const cleanUp = async () => {
  const left = (await fields()).filter((field) => made.includes(field.id));
  made = [];
  if (left.length) await call('deleteLocationFieldsAdvanced', { fields: left.map((field) => ({ fieldId: field.id })) });
};

// controlBackground only, as every operation of this file.
contract.describe('createLocationField', () => {
  beforeEach(quiet);
  // Removing the fields a spec made takes a call per field.
  afterEach(cleanUp, 120000);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('createLocationField', { label: 'Post required', section: 'content', type: 'TEXT' }, ['label', 'section', 'type']));

  it('adds a field every location can fill in, and returns it', async () => {
    const label = unique('field');
    const field = await call('createLocationField', { label, section: 'content', type: 'TEXT' });
    track([field.id]);
    expect(field).toEqual({
      id: jasmine.any(String), label, type: 'TEXT', section: 'content', required: false, allowCustomLabel: false,
    });
    expect(await withLabel(label)).toEqual([field]);
  });

  it('adds a required quick action that takes a label of its own', async () => {
    const field = await create('phone', { section: 'quickActions', type: 'PHONE', required: true, allowCustomLabel: true });
    expect(field).toEqual(jasmine.objectContaining({ section: 'quickActions', type: 'PHONE', required: true, allowCustomLabel: true }));
    expect(await withLabel(field.label)).toEqual([field]);
  });

  it('refuses an eleventh field', async () => {
    const room = 10 - (await fields()).length;
    if (room > 0) {
      const result = await call('createLocationFieldsAdvanced', { fields: Array.from({ length: room }, (value, index) => ({ label: unique(`filler ${index}`), section: 'content', type: 'TEXT' })) });
      track(result.fields.map((entry) => entry.id));
    }
    const label = unique('eleventh');
    expect(await refusal(call('createLocationField', { label, section: 'content', type: 'TEXT' }))).toEqual(refused('limitExceeded', '10'));
    expect(await withLabel(label)).toEqual([]);
  }, 180000);

  describe('refuses, and adds nothing', () => {
    it('a type its section does not take', async () => {
      const label = unique('quick text');
      expect(await refusal(call('createLocationField', { label, section: 'quickActions', type: 'TEXT' }))).toEqual(refused('validation', 'type'));
      expect(await withLabel(label)).toEqual([]);
    });

    it('a section or a type it does not offer', async () => {
      expect(await refusal(call('createLocationField', { label: unique('footer'), section: 'footer', type: 'TEXT' }))).toEqual(refused('validation', 'section'));
      expect(await refusal(call('createLocationField', { label: unique('date'), section: 'content', type: 'DATE' }))).toEqual(refused('validation', 'type'));
    });

    it('without a label, a section or a type', async () => {
      expect(await refusal(call('createLocationField', { section: 'content', type: 'TEXT' }))).toEqual(refused('validation', 'label'));
      expect(await refusal(call('createLocationField', { label: '', section: 'content', type: 'TEXT' }))).toEqual(refused('validation', 'label'));
      expect(await refusal(call('createLocationField', { label: unique('no section'), type: 'TEXT' }))).toEqual(refused('validation', 'section'));
      expect(await refusal(call('createLocationField', { label: unique('no type'), section: 'content' }))).toEqual(refused('validation', 'type'));
    });

    it('options that are not true or false', async () => {
      expect(await refusal(call('createLocationField', { label: unique('required text'), section: 'content', type: 'TEXT', required: 'yes' }))).toEqual(refused('validation', 'required'));
    });
  });
});

contract.describe('createLocationFieldsAdvanced', () => {
  beforeEach(quiet);
  // Removing the fields a spec made takes a call per field.
  afterEach(cleanUp, 120000);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('createLocationFieldsAdvanced', {}, ['fields']));

  it('adds every field, and reports each', async () => {
    const labels = [unique('batch one'), unique('batch two')];
    const result = await call('createLocationFieldsAdvanced', { fields: [{ label: labels[0], section: 'content', type: 'RICH_TEXT' }, { label: labels[1], section: 'quickActions', type: 'EMAIL', required: true }] });
    track(result.fields.map((entry) => entry.id));
    expect(result).toEqual({
      fields: [jasmine.objectContaining({ index: 0, id: jasmine.any(String) }), jasmine.objectContaining({ index: 1, id: jasmine.any(String) })], succeeded: 2, failed: 0,
    });
    expect(await withLabel(labels[0])).toEqual([jasmine.objectContaining({ id: result.fields[0].id, type: 'RICH_TEXT', section: 'content' })]);
    expect(await withLabel(labels[1])).toEqual([jasmine.objectContaining({ id: result.fields[1].id, type: 'EMAIL', section: 'quickActions', required: true })]);
  });

  describe('refuses the whole list, and adds none of it', () => {
    it('when one entry is invalid', async () => {
      const valid = unique('valid entry');
      expect(await refusal(call('createLocationFieldsAdvanced', { fields: [{ label: valid, section: 'content', type: 'TEXT' }, { label: unique('invalid'), section: 'quickActions', type: 'RICH_TEXT' }] }))).toEqual(refused('validation', 'type'));
      expect(await withLabel(valid)).toEqual([]);
    });

    it('when it is empty, or holds more than ten entries', async () => {
      expect(await refusal(call('createLocationFieldsAdvanced', { fields: [] }))).toEqual(refused('validation', 'fields'));
      const many = Array.from({ length: 11 }, (value, index) => ({ label: unique(`entry ${index}`), section: 'content', type: 'TEXT' }));
      expect(await refusal(call('createLocationFieldsAdvanced', { fields: many }))).toEqual(refused('validation', 'fields'));
      expect(await withLabel(many[0].label)).toEqual([]);
    });

    it('when it would go past ten fields in all', async () => {
      await create('already there');
      const entries = Array.from({ length: 10 }, (value, index) => ({ label: unique(`past ten ${index}`), section: 'content', type: 'TEXT' }));
      expect((await refusal(call('createLocationFieldsAdvanced', { fields: entries }))).code).toBe('limitExceeded');
      expect(await withLabel(entries[0].label)).toEqual([]);
    });
  });
});

contract.describe('updateLocationField', () => {
  beforeEach(quiet);
  // Removing the fields a spec made takes a call per field.
  afterEach(cleanUp, 120000);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateLocationField', { label: 'Post required', newRequired: true }, ['label']));

  it('changes only what it is given, and returns the field', async () => {
    const field = await create('update');
    const result = await call('updateLocationField', { label: field.label, newType: 'URL', newRequired: true });
    expect(result).toEqual({ ...field, type: 'URL', required: true });
    expect(await withLabel(field.label)).toEqual([result]);
  });

  it('renames it, and lets it take a label of its own', async () => {
    const field = await create('rename');
    const newLabel = `${field.label} renamed`;
    expect(await call('updateLocationField', { label: field.label, newLabel, newAllowCustomLabel: true })).toEqual({ ...field, label: newLabel, allowCustomLabel: true });
    expect(await withLabel(field.label)).toEqual([]);
    expect(await withLabel(newLabel)).toEqual([jasmine.objectContaining({ id: field.id })]);
  });

  describe('refuses, and changes nothing', () => {
    it('a label no field has', async () => {
      const label = unique('missing');
      expect(await refusal(call('updateLocationField', { label, newRequired: true }))).toEqual(refused('notFound', label));
    });

    it('a label two fields share, saying how many', async () => {
      const field = await create('shared');
      track([(await call('createLocationField', { label: field.label, section: 'content', type: 'TEXT' })).id]);
      const { code, reason: why } = await refusal(call('updateLocationField', { label: field.label, newRequired: true }));
      expect(code).toBe('conflict');
      expect(why.replace(field.label, '')).toContain('2');
      expect((await withLabel(field.label)).map((entry) => entry.required)).toEqual([false, false]);
    });

    it('a type its section does not take', async () => {
      const field = await create('quick', { section: 'quickActions', type: 'URL' });
      expect(await refusal(call('updateLocationField', { label: field.label, newType: 'TEXT' }))).toEqual(refused('validation', 'newType'));
      expect(await withLabel(field.label)).toEqual([field]);
    });

    it('removing the label, or a call that changes nothing', async () => {
      const field = await create('keep');
      expect(await refusal(call('updateLocationField', { label: field.label, newLabel: null }))).toEqual(refused('validation', 'newLabel'));
      expect((await refusal(call('updateLocationField', { label: field.label }))).code).toBe('validation');
      expect(await withLabel(field.label)).toEqual([field]);
    });

    it('without a label', async () => {
      expect(await refusal(call('updateLocationField', { newRequired: true }))).toEqual(refused('validation', 'label'));
    });
  });
});

contract.describe('updateLocationFieldAdvanced', () => {
  beforeEach(quiet);
  // Removing the fields a spec made takes a call per field.
  afterEach(cleanUp, 120000);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateLocationFieldAdvanced', { fieldId: 'x', newRequired: true }, ['fieldId']));

  it('changes the field with that id', async () => {
    const field = await create('update by id');
    expect(await call('updateLocationFieldAdvanced', { fieldId: field.id, newType: 'RICH_TEXT' })).toEqual({ ...field, type: 'RICH_TEXT' });
    expect(await withLabel(field.label)).toEqual([{ ...field, type: 'RICH_TEXT' }]);
  });

  it('refuses an id no field has', async () => {
    expect(await refusal(call('updateLocationFieldAdvanced', { fieldId: 'no-such-field', newRequired: true }))).toEqual(refused('notFound', 'no-such-field'));
  });

  it('refuses without an id', async () => {
    expect(await refusal(call('updateLocationFieldAdvanced', { newRequired: true }))).toEqual(refused('validation', 'fieldId'));
  });
});

contract.describe('updateLocationFieldsAdvanced', () => {
  beforeEach(quiet);
  // Removing the fields a spec made takes a call per field.
  afterEach(cleanUp, 120000);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateLocationFieldsAdvanced', {}, ['fields']));

  it('changes every field, and reports each', async () => {
    const one = await create('batch update one');
    const two = await create('batch update two');
    expect(await call('updateLocationFieldsAdvanced', { fields: [{ fieldId: one.id, newRequired: true }, { fieldId: two.id, newType: 'EMAIL' }] })).toEqual({
      fields: [jasmine.objectContaining({ index: 0, id: one.id }), jasmine.objectContaining({ index: 1, id: two.id })], succeeded: 2, failed: 0,
    });
    expect(await withLabel(one.label)).toEqual([{ ...one, required: true }]);
    expect(await withLabel(two.label)).toEqual([{ ...two, type: 'EMAIL' }]);
  });

  describe('refuses the whole list, and changes none of it', () => {
    it('when one id matches no field', async () => {
      const field = await create('batch unknown');
      expect(await refusal(call('updateLocationFieldsAdvanced', { fields: [{ fieldId: field.id, newRequired: true }, { fieldId: 'no-such-field', newRequired: true }] }))).toEqual(refused('notFound', 'no-such-field'));
      expect(await withLabel(field.label)).toEqual([field]);
    });

    it('when one entry does not fit its field', async () => {
      const field = await create('batch invalid');
      const quick = await create('batch quick', { section: 'quickActions', type: 'PHONE' });
      expect(await refusal(call('updateLocationFieldsAdvanced', { fields: [{ fieldId: field.id, newRequired: true }, { fieldId: quick.id, newType: 'TEXT' }] }))).toEqual(refused('validation', 'newType'));
      expect(await withLabel(field.label)).toEqual([field]);
    });

    it('when the same field is listed twice, or the list is empty', async () => {
      const field = await create('batch twice');
      expect((await refusal(call('updateLocationFieldsAdvanced', { fields: [{ fieldId: field.id, newRequired: true }, { fieldId: field.id, newType: 'URL' }] }))).code).toBe('validation');
      expect(await withLabel(field.label)).toEqual([field]);
      expect(await refusal(call('updateLocationFieldsAdvanced', { fields: [] }))).toEqual(refused('validation', 'fields'));
    });
  });
});

contract.describe('deleteLocationField', () => {
  beforeEach(quiet);
  // Removing the fields a spec made takes a call per field.
  afterEach(cleanUp, 120000);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('deleteLocationField', { label: 'Post required' }, ['label']));

  it('removes the field with that label', async () => {
    const field = await create('delete');
    expect(await call('deleteLocationField', { label: field.label })).toEqual({ id: field.id, label: field.label });
    expect(await withLabel(field.label)).toEqual([]);
  });

  it('refuses a label no field has', async () => {
    const label = unique('missing');
    expect(await refusal(call('deleteLocationField', { label }))).toEqual(refused('notFound', label));
  });

  it('refuses a label two fields share, and removes neither', async () => {
    const field = await create('shared delete');
    track([(await call('createLocationField', { label: field.label, section: 'content', type: 'TEXT' })).id]);
    expect((await refusal(call('deleteLocationField', { label: field.label }))).code).toBe('conflict');
    expect((await withLabel(field.label)).length).toBe(2);
  });

  it('refuses without a label', async () => {
    expect(await refusal(call('deleteLocationField', {}))).toEqual(refused('validation', 'label'));
  });
});

contract.describe('deleteLocationFieldAdvanced', () => {
  beforeEach(quiet);
  // Removing the fields a spec made takes a call per field.
  afterEach(cleanUp, 120000);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('deleteLocationFieldAdvanced', { fieldId: 'x' }, ['fieldId']));

  it('removes the field with that id', async () => {
    const field = await create('delete by id');
    expect(await call('deleteLocationFieldAdvanced', { fieldId: field.id })).toEqual({ id: field.id, label: field.label });
    expect(await withLabel(field.label)).toEqual([]);
  });

  it('refuses an id no field has', async () => {
    expect(await refusal(call('deleteLocationFieldAdvanced', { fieldId: 'no-such-field' }))).toEqual(refused('notFound', 'no-such-field'));
  });

  it('refuses without an id', async () => {
    expect(await refusal(call('deleteLocationFieldAdvanced', {}))).toEqual(refused('validation', 'fieldId'));
  });
});

contract.describe('deleteLocationFieldsAdvanced', () => {
  beforeEach(quiet);
  // Removing the fields a spec made takes a call per field.
  afterEach(cleanUp, 120000);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('deleteLocationFieldsAdvanced', {}, ['fields']));

  it('removes every field, and reports each', async () => {
    const one = await create('batch delete one');
    const two = await create('batch delete two');
    expect(await call('deleteLocationFieldsAdvanced', { fields: [{ fieldId: one.id }, { fieldId: two.id }] })).toEqual({
      fields: [jasmine.objectContaining({ index: 0, id: one.id }), jasmine.objectContaining({ index: 1, id: two.id })], succeeded: 2, failed: 0,
    });
    expect(await withLabel(one.label)).toEqual([]);
    expect(await withLabel(two.label)).toEqual([]);
  });

  describe('refuses the whole list, and removes none of it', () => {
    it('when one id matches no field', async () => {
      const field = await create('batch delete unknown');
      expect(await refusal(call('deleteLocationFieldsAdvanced', { fields: [{ fieldId: field.id }, { fieldId: 'no-such-field' }] }))).toEqual(refused('notFound', 'no-such-field'));
      expect(await withLabel(field.label)).toEqual([field]);
    });

    it('when the same field is listed twice, or the list is empty', async () => {
      const field = await create('batch delete twice');
      expect((await refusal(call('deleteLocationFieldsAdvanced', { fields: [{ fieldId: field.id }, { fieldId: field.id }] }))).code).toBe('validation');
      expect(await withLabel(field.label)).toEqual([field]);
      expect(await refusal(call('deleteLocationFieldsAdvanced', { fields: [] }))).toEqual(refused('validation', 'fields'));
    });
  });
});

contract.describe('updateLocationFieldOrder', () => {
  beforeEach(quiet);
  // Removing the fields a spec made takes a call per field.
  afterEach(cleanUp, 120000);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateLocationFieldOrder', { label: 'Post required', position: 1 }, ['label', 'position']));

  it('moves a field to the top of its section', async () => {
    await create('order first', { section: 'quickActions', type: 'URL' });
    const second = await create('order second', { section: 'quickActions', type: 'EMAIL' });
    const result = await call('updateLocationFieldOrder', { label: second.label, position: 1 });
    expect(result.fields[0]).toEqual(second);
    expect(result.fields.every((field) => field.section === 'quickActions')).toBe(true);
    const quickActions = (await fields()).filter((field) => field.section === 'quickActions');
    expect(quickActions[0]).toEqual(second);
  });

  describe('refuses, and moves nothing', () => {
    it('a place past the end of its section', async () => {
      const field = await create('order past end');
      expect(await refusal(call('updateLocationFieldOrder', { label: field.label, position: 99 }))).toEqual(refused('validation', 'position'));
      expect(await refusal(call('updateLocationFieldOrder', { label: field.label, position: 0 }))).toEqual(refused('validation', 'position'));
    });

    it('a label no field has', async () => {
      const label = unique('missing');
      expect(await refusal(call('updateLocationFieldOrder', { label, position: 1 }))).toEqual(refused('notFound', label));
    });

    it('without a label or a place', async () => {
      expect(await refusal(call('updateLocationFieldOrder', { position: 1 }))).toEqual(refused('validation', 'label'));
      expect(await refusal(call('updateLocationFieldOrder', { label: unique('no place') }))).toEqual(refused('validation', 'position'));
    });
  });
});

contract.describe('updateLocationFieldOrderAdvanced', () => {
  beforeEach(quiet);
  // Removing the fields a spec made takes a call per field.
  afterEach(cleanUp, 120000);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateLocationFieldOrderAdvanced', { fieldId: 'x', position: 1 }, ['fieldId', 'position']));

  it('moves the field with that id', async () => {
    await create('order by id first');
    const second = await create('order by id second');
    expect((await call('updateLocationFieldOrderAdvanced', { fieldId: second.id, position: 1 })).fields[0]).toEqual(second);
  });

  it('refuses an id no field has', async () => {
    expect(await refusal(call('updateLocationFieldOrderAdvanced', { fieldId: 'no-such-field', position: 1 }))).toEqual(refused('notFound', 'no-such-field'));
  });

  it('refuses without an id', async () => {
    expect(await refusal(call('updateLocationFieldOrderAdvanced', { position: 1 }))).toEqual(refused('validation', 'fieldId'));
  });
});
