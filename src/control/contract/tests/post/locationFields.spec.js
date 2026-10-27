// locationFields: the fields every location can fill in, kept in the plugin's one settings record and read back
// through getSettings' customFields. Every operation here is control only.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);
const unique = (label) => `Post ${label} (${contract.host}) ${Date.now()}`;

const MAX_FIELDS = 10;
// Field ids are UUIDs the contract makes, so one that matches nothing can be any text.
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

// The location fields as the contract's own getSettings shows them, by section, and all together.
const sections = async () => (await call('getSettings', {})).customFields;
const allFields = async () => {
  const { quickActions, content } = await sections();
  return quickActions.concat(content);
};
const fieldById = async (id) => (await allFields()).find((field) => field.id === id);
const labelled = async (label) => (await allFields()).filter((field) => field.label === label);

// The ids the running spec made: its afterEach removes them, whether it passed or not.
let made = [];
const keep = (id) => {
  if (id) made.push(id);
  return id;
};
const cleanUp = async () => {
  const ids = made;
  made = [];
  const existing = (await allFields()).map((field) => field.id);
  const left = ids.filter((id) => existing.indexOf(id) > -1);
  if (left.length) await call('deleteLocationFieldsAdvanced', { fields: left.map((fieldId) => ({ fieldId })) });
};

// At most 10 fields live in the one settings record, and every file of the run shares the instance: a spec that needs
// room clears, through the contract, fields others left (leftover post fields first, the one pre/locations.spec.js uses last).
const makeRoom = async (count) => {
  const fields = await allFields();
  const excess = fields.length + count - MAX_FIELDS;
  if (excess <= 0) return;
  const rank = (field) => {
    if (made.indexOf(field.id) > -1) return 3;
    if (/^Post /.test(field.label || '')) return 0;
    if (field.label === 'Pre field for the app') return 2;
    return 1;
  };
  const removed = fields.slice().sort((a, b) => rank(a) - rank(b)).slice(0, excess);
  await call('deleteLocationFieldsAdvanced', { fields: removed.map((field) => ({ fieldId: field.id })) });
};

// A field this spec owns: a text content field unless told otherwise.
const create = async (label, options = {}) => {
  await makeRoom(1);
  const field = await call('createLocationField', { group: 'content', label, type: 'TEXT', ...options });
  keep(field.id);
  return field;
};
const createMany = async (entries) => {
  await makeRoom(entries.length);
  const result = await call('createLocationFieldsAdvanced', { fields: entries });
  result.fields.forEach((entry) => keep(entry.id));
  return result;
};

// Refused, naming what the contract documents (when given), and the fields are exactly as they were.
const expectRefused = async (operation, parameters, named) => {
  const before = await allFields();
  const why = await refusal(call(operation, parameters));
  if (named) expect(why).toContain(named);
  expect(await allFields()).toEqual(before);
};

// Nothing in the frame answers messaging: the refresh message each save sends the widget is the plugin's own
// bookkeeping, which the manifest never mentions, so its spy only answers.
const quiet = () => {
  spyOn(buildfire.messaging, 'sendMessageToWidget');
};

const fieldOf = (field) => jasmine.objectContaining(field);

contract.describe('createLocationField', () => {
  beforeEach(quiet);
  afterEach(cleanUp);

  it('adds a field from its section and label, with email, not required and no custom label by default, and returns it', async () => {
    const label = unique('field');
    await makeRoom(1);
    const field = await call('createLocationField', { group: 'quickActions', label });
    keep(field.id);
    const expected = { group: 'quickActions', label, type: 'EMAIL', required: false, allowCustomLabel: false };
    expect(field).toEqual(fieldOf({ id: jasmine.any(String), ...expected }));
    expect((await sections()).quickActions).toContain(fieldOf({ id: field.id, ...expected }));
  });

  it('adds a field with every option given', async () => {
    const label = unique('rich field');
    await makeRoom(1);
    const field = await call('createLocationField', {
      group: 'content', label, type: 'RICH_TEXT', required: true, allowCustomLabel: true,
    });
    keep(field.id);
    const expected = { group: 'content', label, type: 'RICH_TEXT', required: true, allowCustomLabel: true };
    expect(field).toEqual(fieldOf({ id: jasmine.any(String), ...expected }));
    expect((await sections()).content).toContain(fieldOf({ id: field.id, ...expected }));
  });

  it('adds quick action fields that take a phone number or a URL', async () => {
    const phone = await create(unique('phone'), { group: 'quickActions', type: 'PHONE' });
    const url = await create(unique('url'), { group: 'quickActions', type: 'URL' });
    const { quickActions } = await sections();
    expect(quickActions).toContain(fieldOf({ id: phone.id, group: 'quickActions', type: 'PHONE' }));
    expect(quickActions).toContain(fieldOf({ id: url.id, group: 'quickActions', type: 'URL' }));
  });

  it('adds content fields that take text or a phone number', async () => {
    const text = await create(unique('text'), { type: 'TEXT' });
    const phone = await create(unique('content phone'), { type: 'PHONE' });
    expect(await fieldById(text.id)).toEqual(fieldOf({ group: 'content', type: 'TEXT' }));
    expect(await fieldById(phone.id)).toEqual(fieldOf({ group: 'content', type: 'PHONE' }));
  });

  describe('refuses, and adds nothing', () => {
    const cases = [
      ['without a section', (label) => ({ label }), 'group'],
      ['with a null section', (label) => ({ group: null, label }), 'group'],
      ['with an empty section', (label) => ({ group: '', label }), 'group'],
      ['with a section it does not offer', (label) => ({ group: 'footer', label }), 'group'],
      ['with a section that is not text', (label) => ({ group: 1, label }), 'group'],
      ['without a label', () => ({ group: 'content' }), 'label'],
      ['with a null label', () => ({ group: 'content', label: null }), 'label'],
      ['with an empty label', () => ({ group: 'content', label: '' }), 'label'],
      ['with a label that is not text', () => ({ group: 'content', label: 5 }), 'label'],
      ['with a type it does not offer', (label) => ({ group: 'content', label, type: 'DATE' }), 'type'],
      ['with a type that is not text', (label) => ({ group: 'content', label, type: 3 }), 'type'],
      ['a quick action field taking text', (label) => ({ group: 'quickActions', label, type: 'TEXT' }), 'type'],
      ['a quick action field taking rich text', (label) => ({ group: 'quickActions', label, type: 'RICH_TEXT' }), 'type'],
      ['with a required setting that is not true or false', (label) => ({ group: 'content', label, required: 'yes' }), 'required'],
      ['with a custom label setting that is not true or false', (label) => ({ group: 'content', label, allowCustomLabel: 1 }), 'allowCustomLabel'],
    ];
    cases.forEach(([name, parameters, named]) => {
      it(name, async () => {
        const label = unique('refused');
        await expectRefused('createLocationField', parameters(label), named);
        expect(await labelled(label)).toEqual([]);
      });
    });
  });

  it('refuses an 11th field, and adds nothing', async () => {
    const count = (await allFields()).length;
    if (count < MAX_FIELDS) {
      await createMany(Array.from({ length: MAX_FIELDS - count }, (value, index) => ({
        group: 'content', label: unique(`filler ${index}`), type: 'TEXT',
      })));
    }
    const before = await allFields();
    expect(before.length).toBe(MAX_FIELDS);
    const label = unique('eleventh');
    expect(await refusal(call('createLocationField', { group: 'content', label, type: 'TEXT' }))).toContain(String(MAX_FIELDS));
    expect(await allFields()).toEqual(before);
  });
});

contract.describe('createLocationFieldsAdvanced', () => {
  beforeEach(quiet);
  afterEach(cleanUp);

  it('adds every field, and reports each', async () => {
    const plain = unique('batch plain');
    const rich = unique('batch rich');
    const result = await createMany([
      { group: 'quickActions', label: plain },
      { group: 'content', label: rich, type: 'RICH_TEXT', required: true, allowCustomLabel: true },
    ]);
    expect(result).toEqual(jasmine.objectContaining({
      fields: [
        jasmine.objectContaining({ index: 0, id: jasmine.any(String) }),
        jasmine.objectContaining({ index: 1, id: jasmine.any(String) }),
      ],
      succeeded: 2,
      failed: 0,
    }));
    const { quickActions, content } = await sections();
    expect(quickActions).toContain(fieldOf({
      id: result.fields[0].id, group: 'quickActions', label: plain, type: 'EMAIL', required: false, allowCustomLabel: false,
    }));
    expect(content).toContain(fieldOf({
      id: result.fields[1].id, group: 'content', label: rich, type: 'RICH_TEXT', required: true, allowCustomLabel: true,
    }));
  });

  describe('refuses the whole list, and adds none of it', () => {
    const valid = (label) => ({ group: 'content', label, type: 'TEXT' });
    const cases = [
      ['when it is empty', () => ({ fields: [] }), 'fields'],
      ['when it is left out', () => ({}), 'fields'],
      ['when it is null', () => ({ fields: null }), 'fields'],
      ['when it is not a list', (label) => ({ fields: valid(label) }), 'fields'],
      ['when it holds more than 10 entries', (label) => ({
        fields: Array.from({ length: 11 }, (value, index) => valid(`${label} ${index}`)),
      }), 'fields'],
      ['when one entry is not an object', (label) => ({ fields: [valid(label), 'field'] }), 'fields'],
      ['when one entry has a type it does not offer', (label) => ({ fields: [valid(label), { group: 'content', label: `${label} b`, type: 'DATE' }] }), 'type'],
      ['when one quick action entry takes text', (label) => ({ fields: [valid(label), { group: 'quickActions', label: `${label} b`, type: 'TEXT' }] }), 'type'],
      ['when one entry has no label', (label) => ({ fields: [valid(label), { group: 'content', type: 'TEXT' }] }), 'label'],
      ['when one entry has no section', (label) => ({ fields: [valid(label), { label: `${label} b`, type: 'TEXT' }] }), 'group'],
      ['when one entry has a required setting that is not true or false', (label) => ({ fields: [valid(label), { ...valid(`${label} b`), required: 'no' }] }), 'required'],
    ];
    cases.forEach(([name, parameters, named]) => {
      it(name, async () => {
        const label = unique('refused batch');
        await expectRefused('createLocationFieldsAdvanced', parameters(label), named);
        expect(await labelled(label)).toEqual([]);
      });
    });

    it('when it would make more than 10 fields in all', async () => {
      if (!(await allFields()).length) await create(unique('existing'));
      const count = (await allFields()).length;
      const label = unique('over limit');
      const fields = Array.from({ length: MAX_FIELDS - count + 1 }, (value, index) => valid(`${label} ${index}`));
      await expectRefused('createLocationFieldsAdvanced', { fields }, String(MAX_FIELDS));
      expect(await labelled(`${label} 0`)).toEqual([]);
    });
  });
});

contract.describe('updateLocationField', () => {
  beforeEach(quiet);
  afterEach(cleanUp);

  it('changes only what it is given, and returns the field', async () => {
    const label = unique('update');
    const field = await create(label);
    const expected = { id: field.id, group: 'content', label, type: 'TEXT', required: true, allowCustomLabel: false };
    expect(await call('updateLocationField', { label, newRequired: true })).toEqual(fieldOf(expected));
    expect(await fieldById(field.id)).toEqual(fieldOf(expected));
  });

  it('changes the label, type, required and custom label settings together', async () => {
    const label = unique('update all');
    const newLabel = unique('updated all');
    const field = await create(label);
    const expected = { id: field.id, group: 'content', label: newLabel, type: 'URL', required: true, allowCustomLabel: true };
    expect(await call('updateLocationField', {
      label, newLabel, newType: 'URL', newRequired: true, newAllowCustomLabel: true,
    })).toEqual(fieldOf(expected));
    expect(await fieldById(field.id)).toEqual(fieldOf(expected));
    expect(await labelled(label)).toEqual([]);
  });

  it('turns a setting back off', async () => {
    const label = unique('switch off');
    const field = await create(label, { required: true, allowCustomLabel: true });
    await call('updateLocationField', { label, newRequired: false, newAllowCustomLabel: false });
    expect(await fieldById(field.id)).toEqual(fieldOf({ required: false, allowCustomLabel: false, type: 'TEXT' }));
  });

  it('keeps a quick action field to email, phone or URL', async () => {
    const label = unique('quick');
    const field = await create(label, { group: 'quickActions', type: 'EMAIL' });
    await call('updateLocationField', { label, newType: 'PHONE' });
    expect(await refusal(call('updateLocationField', { label, newType: 'TEXT' }))).toContain('newType');
    expect(await refusal(call('updateLocationField', { label, newType: 'RICH_TEXT' }))).toContain('newType');
    expect(await fieldById(field.id)).toEqual(fieldOf({ group: 'quickActions', type: 'PHONE' }));
  });

  describe('refuses, and changes nothing', () => {
    let target;
    beforeEach(async () => {
      target = await create(unique('target'));
    });

    const cases = [
      ['without a label', () => ({ newRequired: true }), () => 'label'],
      ['with a null label', () => ({ label: null, newRequired: true }), () => 'label'],
      ['with an empty label', () => ({ label: '', newRequired: true }), () => 'label'],
      ['with a label that is not text', () => ({ label: 5, newRequired: true }), () => 'label'],
      ['removing the label with null', (label) => ({ label, newLabel: null }), () => 'newLabel'],
      ['removing the label with an empty one', (label) => ({ label, newLabel: '' }), () => 'newLabel'],
      ['with a new label that is not text', (label) => ({ label, newLabel: 5 }), () => 'newLabel'],
      ['with a type it does not offer', (label) => ({ label, newType: 'DATE' }), () => 'newType'],
      ['with a required setting that is not true or false', (label) => ({ label, newRequired: 'yes' }), () => 'newRequired'],
      ['with a custom label setting that is not true or false', (label) => ({ label, newAllowCustomLabel: 'no' }), () => 'newAllowCustomLabel'],
      ['a call that changes nothing', (label) => ({ label }), () => null],
      ['a label no field has', (label) => ({ label: `${label} missing`, newRequired: true }), (label) => `${label} missing`],
    ];
    cases.forEach(([name, parameters, named]) => {
      it(name, async () => {
        await expectRefused('updateLocationField', parameters(target.label), named(target.label));
      });
    });
  });

  it('refuses a label two fields share, saying how many, and changes neither', async () => {
    const label = unique('shared');
    await create(label);
    await create(label);
    const before = await allFields();
    const why = await refusal(call('updateLocationField', { label, newRequired: true }));
    expect(why.replace(label, '')).toContain('2');
    expect(await allFields()).toEqual(before);
  });
});

contract.describe('updateLocationFieldAdvanced', () => {
  beforeEach(quiet);
  afterEach(cleanUp);

  it('changes only what it is given, and returns the field', async () => {
    const label = unique('update by id');
    const field = await create(label, { type: 'PHONE' });
    const expected = { id: field.id, group: 'content', label, type: 'PHONE', required: false, allowCustomLabel: true };
    expect(await call('updateLocationFieldAdvanced', { fieldId: field.id, newAllowCustomLabel: true })).toEqual(fieldOf(expected));
    expect(await fieldById(field.id)).toEqual(fieldOf(expected));
  });

  it('changes the label, type, required and custom label settings together', async () => {
    const field = await create(unique('update all by id'));
    const newLabel = unique('updated all by id');
    const expected = { id: field.id, group: 'content', label: newLabel, type: 'RICH_TEXT', required: true, allowCustomLabel: true };
    expect(await call('updateLocationFieldAdvanced', {
      fieldId: field.id, newLabel, newType: 'RICH_TEXT', newRequired: true, newAllowCustomLabel: true,
    })).toEqual(fieldOf(expected));
    expect(await fieldById(field.id)).toEqual(fieldOf(expected));
  });

  it('keeps a quick action field to email, phone or URL', async () => {
    const field = await create(unique('quick by id'), { group: 'quickActions', type: 'URL' });
    await call('updateLocationFieldAdvanced', { fieldId: field.id, newType: 'EMAIL' });
    expect(await refusal(call('updateLocationFieldAdvanced', { fieldId: field.id, newType: 'TEXT' }))).toContain('newType');
    expect(await refusal(call('updateLocationFieldAdvanced', { fieldId: field.id, newType: 'RICH_TEXT' }))).toContain('newType');
    expect(await fieldById(field.id)).toEqual(fieldOf({ group: 'quickActions', type: 'EMAIL' }));
  });

  describe('refuses, and changes nothing', () => {
    let target;
    beforeEach(async () => {
      target = await create(unique('target by id'));
    });

    const cases = [
      ['without a field id', () => ({ newRequired: true }), 'fieldId'],
      ['with a null field id', () => ({ fieldId: null, newRequired: true }), 'fieldId'],
      ['with an empty field id', () => ({ fieldId: '', newRequired: true }), 'fieldId'],
      ['with a field id that is not text', () => ({ fieldId: 5, newRequired: true }), 'fieldId'],
      ['an id no field has', () => ({ fieldId: UNKNOWN_ID, newRequired: true }), UNKNOWN_ID],
      ['removing the label with null', (id) => ({ fieldId: id, newLabel: null }), 'newLabel'],
      ['removing the label with an empty one', (id) => ({ fieldId: id, newLabel: '' }), 'newLabel'],
      ['with a type it does not offer', (id) => ({ fieldId: id, newType: 'DATE' }), 'newType'],
      ['with a required setting that is not true or false', (id) => ({ fieldId: id, newRequired: 1 }), 'newRequired'],
      ['with a custom label setting that is not true or false', (id) => ({ fieldId: id, newAllowCustomLabel: 'yes' }), 'newAllowCustomLabel'],
      ['a call that changes nothing', (id) => ({ fieldId: id }), null],
    ];
    cases.forEach(([name, parameters, named]) => {
      it(name, async () => {
        await expectRefused('updateLocationFieldAdvanced', parameters(target.id), named);
      });
    });
  });
});

contract.describe('updateLocationFieldsAdvanced', () => {
  beforeEach(quiet);
  afterEach(cleanUp);

  it('changes every field, keeping what each entry leaves out, and reports each', async () => {
    const first = await create(unique('batch first'));
    const second = await create(unique('batch second'), { group: 'quickActions', type: 'EMAIL' });
    const newLabel = unique('batch renamed');
    const result = await call('updateLocationFieldsAdvanced', {
      fields: [
        { fieldId: first.id, newRequired: true },
        { fieldId: second.id, newLabel, newType: 'PHONE', newAllowCustomLabel: true },
      ],
    });
    expect(result).toEqual(jasmine.objectContaining({
      fields: [
        jasmine.objectContaining({ index: 0, id: first.id }),
        jasmine.objectContaining({ index: 1, id: second.id }),
      ],
      succeeded: 2,
      failed: 0,
    }));
    expect(await fieldById(first.id)).toEqual(fieldOf({
      group: 'content', label: first.label, type: 'TEXT', required: true, allowCustomLabel: false,
    }));
    expect(await fieldById(second.id)).toEqual(fieldOf({
      group: 'quickActions', label: newLabel, type: 'PHONE', required: false, allowCustomLabel: true,
    }));
  });

  describe('refuses the whole list, and changes none of it', () => {
    let first;
    let second;
    beforeEach(async () => {
      first = await create(unique('batch target'));
      second = await create(unique('batch quick target'), { group: 'quickActions', type: 'URL' });
    });

    const change = () => ({ fieldId: first.id, newRequired: true });
    const cases = [
      ['when it is empty', () => ({ fields: [] }), 'fields'],
      ['when it is left out', () => ({}), 'fields'],
      ['when it is null', () => ({ fields: null }), 'fields'],
      ['when it is not a list', () => ({ fields: change() }), 'fields'],
      ['when it holds more than 10 entries', () => ({ fields: Array.from({ length: 11 }, change) }), 'fields'],
      ['when one entry is not an object', () => ({ fields: [change(), 'field'] }), 'fields'],
      ['when one entry has no field id', () => ({ fields: [change(), { newRequired: true }] }), 'fieldId'],
      ['when one entry has a type it does not offer', () => ({ fields: [change(), { fieldId: second.id, newType: 'DATE' }] }), 'newType'],
      ['when one quick action entry takes text', () => ({ fields: [change(), { fieldId: second.id, newType: 'TEXT' }] }), 'newType'],
      ['when one entry removes its label', () => ({ fields: [change(), { fieldId: second.id, newLabel: '' }] }), 'newLabel'],
      ['when one entry changes nothing', () => ({ fields: [change(), { fieldId: second.id }] }), null],
      ['when one id matches no field', () => ({ fields: [change(), { fieldId: UNKNOWN_ID, newRequired: true }] }), UNKNOWN_ID],
      ['when the same field is listed twice', () => ({ fields: [change(), { fieldId: first.id, newAllowCustomLabel: true }] }), null],
    ];
    cases.forEach(([name, parameters, named]) => {
      it(name, async () => {
        await expectRefused('updateLocationFieldsAdvanced', parameters(), named);
      });
    });
  });
});

contract.describe('deleteLocationField', () => {
  beforeEach(quiet);
  afterEach(cleanUp);

  it('removes the field with that label, and returns its id', async () => {
    const label = unique('delete');
    const field = await create(label);
    expect(await call('deleteLocationField', { label })).toEqual(jasmine.objectContaining({ id: field.id }));
    expect(await fieldById(field.id)).toBeUndefined();
    expect(await labelled(label)).toEqual([]);
  });

  it('leaves every other field alone', async () => {
    const kept = await create(unique('kept'), { group: 'quickActions', type: 'PHONE' });
    const label = unique('removed');
    await create(label);
    await call('deleteLocationField', { label });
    expect(await fieldById(kept.id)).toEqual(fieldOf({ label: kept.label, group: 'quickActions', type: 'PHONE' }));
  });

  describe('refuses, and removes nothing', () => {
    let target;
    beforeEach(async () => {
      target = await create(unique('delete target'));
    });

    const cases = [
      ['without a label', () => ({}), () => 'label'],
      ['with a null label', () => ({ label: null }), () => 'label'],
      ['with an empty label', () => ({ label: '' }), () => 'label'],
      ['with a label that is not text', () => ({ label: 5 }), () => 'label'],
      ['a label no field has', (label) => ({ label: `${label} missing` }), (label) => `${label} missing`],
    ];
    cases.forEach(([name, parameters, named]) => {
      it(name, async () => {
        await expectRefused('deleteLocationField', parameters(target.label), named(target.label));
      });
    });
  });

  it('refuses a label two fields share, saying how many, and removes neither', async () => {
    const label = unique('shared delete');
    const one = await create(label);
    const two = await create(label);
    const before = await allFields();
    expect((await refusal(call('deleteLocationField', { label }))).replace(label, '')).toContain('2');
    expect(await allFields()).toEqual(before);
    expect(await fieldById(one.id)).toBeDefined();
    expect(await fieldById(two.id)).toBeDefined();
  }, 120000);
});

contract.describe('deleteLocationFieldAdvanced', () => {
  beforeEach(quiet);
  afterEach(cleanUp);

  it('removes the field with that id, and returns its id', async () => {
    const field = await create(unique('delete by id'));
    expect(await call('deleteLocationFieldAdvanced', { fieldId: field.id })).toEqual(jasmine.objectContaining({ id: field.id }));
    expect(await fieldById(field.id)).toBeUndefined();
  });

  it('leaves every other field alone', async () => {
    const kept = await create(unique('kept by id'));
    const removed = await create(unique('removed by id'));
    await call('deleteLocationFieldAdvanced', { fieldId: removed.id });
    expect(await fieldById(kept.id)).toEqual(fieldOf({ label: kept.label }));
  });

  describe('refuses, and removes nothing', () => {
    beforeEach(async () => {
      await create(unique('delete target by id'));
    });

    const cases = [
      ['without a field id', {}, 'fieldId'],
      ['with a null field id', { fieldId: null }, 'fieldId'],
      ['with an empty field id', { fieldId: '' }, 'fieldId'],
      ['with a field id that is not text', { fieldId: 5 }, 'fieldId'],
      ['an id no field has', { fieldId: UNKNOWN_ID }, UNKNOWN_ID],
    ];
    cases.forEach(([name, parameters, named]) => {
      it(name, async () => {
        await expectRefused('deleteLocationFieldAdvanced', parameters, named);
      });
    });
  });
});

contract.describe('deleteLocationFieldsAdvanced', () => {
  beforeEach(quiet);
  afterEach(cleanUp);

  it('removes every field, and reports each', async () => {
    const first = await create(unique('batch delete one'));
    const second = await create(unique('batch delete two'), { group: 'quickActions', type: 'EMAIL' });
    const kept = await create(unique('batch kept'));
    expect(await call('deleteLocationFieldsAdvanced', { fields: [{ fieldId: first.id }, { fieldId: second.id }] })).toEqual(jasmine.objectContaining({
      fields: [
        jasmine.objectContaining({ index: 0, id: first.id }),
        jasmine.objectContaining({ index: 1, id: second.id }),
      ],
      succeeded: 2,
      failed: 0,
    }));
    expect(await fieldById(first.id)).toBeUndefined();
    expect(await fieldById(second.id)).toBeUndefined();
    expect(await fieldById(kept.id)).toEqual(fieldOf({ label: kept.label }));
  }, 120000);

  describe('refuses the whole list, and removes none of it', () => {
    let first;
    let second;
    beforeEach(async () => {
      first = await create(unique('batch delete target'));
      second = await create(unique('batch delete other'));
    });

    const cases = [
      ['when it is empty', () => ({ fields: [] }), 'fields'],
      ['when it is left out', () => ({}), 'fields'],
      ['when it is null', () => ({ fields: null }), 'fields'],
      ['when it is not a list', () => ({ fields: { fieldId: first.id } }), 'fields'],
      ['when it holds more than 10 entries', () => ({ fields: Array.from({ length: 11 }, () => ({ fieldId: first.id })) }), 'fields'],
      ['when one entry is not an object', () => ({ fields: [{ fieldId: first.id }, second.id] }), 'fields'],
      ['when one entry has no field id', () => ({ fields: [{ fieldId: first.id }, {}] }), 'fieldId'],
      ['when one id matches no field', () => ({ fields: [{ fieldId: first.id }, { fieldId: UNKNOWN_ID }] }), UNKNOWN_ID],
      ['when the same field is listed twice', () => ({ fields: [{ fieldId: first.id }, { fieldId: second.id }, { fieldId: first.id }] }), null],
    ];
    cases.forEach(([name, parameters, named]) => {
      it(name, async () => {
        await expectRefused('deleteLocationFieldsAdvanced', parameters(), named);
        expect(await fieldById(first.id)).toBeDefined();
        expect(await fieldById(second.id)).toBeDefined();
      }, 120000);
    });
  });
});

contract.describe('updateLocationFieldOrder', () => {
  beforeEach(quiet);
  afterEach(cleanUp);

  it('moves a field to a new place within its section, and returns the section in its new order', async () => {
    const first = await create(unique('order first'));
    const second = await create(unique('order second'));
    const third = await create(unique('order third'));
    const { quickActions } = await sections();
    const result = await call('updateLocationFieldOrder', { label: third.label, position: 1 });
    expect(result.fields[0]).toEqual(fieldOf({ id: third.id, group: 'content', label: third.label }));
    result.fields.forEach((field) => expect(field.group).toBe('content'));
    const after = await sections();
    expect(after.content.map((field) => field.id)).toEqual(result.fields.map((field) => field.id));
    const ids = after.content.map((field) => field.id);
    expect(ids[0]).toBe(third.id);
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));
    // the other section is left as it was
    expect(after.quickActions).toEqual(quickActions);
  }, 120000);

  it('moves a field to the last place', async () => {
    const first = await create(unique('order last'));
    await create(unique('order after'));
    const position = (await sections()).content.length;
    const result = await call('updateLocationFieldOrder', { label: first.label, position });
    expect(result.fields[position - 1]).toEqual(fieldOf({ id: first.id }));
    const { content } = await sections();
    expect(content[content.length - 1].id).toBe(first.id);
  });

  describe('refuses, and moves nothing', () => {
    let target;
    beforeEach(async () => {
      target = await create(unique('order target'));
    });

    const cases = [
      ['without a label', () => ({ position: 1 }), () => 'label'],
      ['with a null label', () => ({ label: null, position: 1 }), () => 'label'],
      ['with an empty label', () => ({ label: '', position: 1 }), () => 'label'],
      ['with a label that is not text', () => ({ label: 5, position: 1 }), () => 'label'],
      ['without a position', (label) => ({ label }), () => 'position'],
      ['with a null position', (label) => ({ label, position: null }), () => 'position'],
      ['with a position below 1', (label) => ({ label, position: 0 }), () => 'position'],
      ['with a position that is not a whole number', (label) => ({ label, position: 1.5 }), () => 'position'],
      ['with a position that is not a number', (label) => ({ label, position: '1' }), () => 'position'],
      ['with a position past the last place', (label, length) => ({ label, position: length + 1 }), () => 'position'],
      ['a label no field has', (label) => ({ label: `${label} missing`, position: 1 }), (label) => `${label} missing`],
    ];
    cases.forEach(([name, parameters, named]) => {
      it(name, async () => {
        const { length } = (await sections()).content;
        await expectRefused('updateLocationFieldOrder', parameters(target.label, length), named(target.label));
      });
    });
  });

  it('refuses a label two fields share, saying how many, and moves neither', async () => {
    const label = unique('shared order');
    await create(label);
    await create(label);
    const before = await allFields();
    expect((await refusal(call('updateLocationFieldOrder', { label, position: 1 }))).replace(label, '')).toContain('2');
    expect(await allFields()).toEqual(before);
  });
});

contract.describe('updateLocationFieldOrderAdvanced', () => {
  beforeEach(quiet);
  afterEach(cleanUp);

  it('moves a field to a new place within its section, and returns the section in its new order', async () => {
    const first = await create(unique('quick order first'), { group: 'quickActions', type: 'EMAIL' });
    const second = await create(unique('quick order second'), { group: 'quickActions', type: 'PHONE' });
    const { content } = await sections();
    const result = await call('updateLocationFieldOrderAdvanced', { fieldId: second.id, position: 1 });
    expect(result.fields[0]).toEqual(fieldOf({ id: second.id, group: 'quickActions', label: second.label }));
    result.fields.forEach((field) => expect(field.group).toBe('quickActions'));
    const after = await sections();
    expect(after.quickActions.map((field) => field.id)).toEqual(result.fields.map((field) => field.id));
    expect(after.quickActions[0].id).toBe(second.id);
    expect(after.quickActions.map((field) => field.id)).toContain(first.id);
    // the other section is left as it was
    expect(after.content).toEqual(content);
  });

  it('moves a field to the last place', async () => {
    const first = await create(unique('order last by id'));
    await create(unique('order after by id'));
    const position = (await sections()).content.length;
    const result = await call('updateLocationFieldOrderAdvanced', { fieldId: first.id, position });
    expect(result.fields[position - 1]).toEqual(fieldOf({ id: first.id }));
    const { content } = await sections();
    expect(content[content.length - 1].id).toBe(first.id);
  });

  describe('refuses, and moves nothing', () => {
    let target;
    beforeEach(async () => {
      target = await create(unique('order target by id'));
    });

    const cases = [
      ['without a field id', () => ({ position: 1 }), 'fieldId'],
      ['with a null field id', () => ({ fieldId: null, position: 1 }), 'fieldId'],
      ['with an empty field id', () => ({ fieldId: '', position: 1 }), 'fieldId'],
      ['with a field id that is not text', () => ({ fieldId: 5, position: 1 }), 'fieldId'],
      ['an id no field has', () => ({ fieldId: UNKNOWN_ID, position: 1 }), UNKNOWN_ID],
      ['without a position', (id) => ({ fieldId: id }), 'position'],
      ['with a null position', (id) => ({ fieldId: id, position: null }), 'position'],
      ['with a position below 1', (id) => ({ fieldId: id, position: -1 }), 'position'],
      ['with a position that is not a whole number', (id) => ({ fieldId: id, position: 2.5 }), 'position'],
      ['with a position that is not a number', (id) => ({ fieldId: id, position: 'first' }), 'position'],
      ['with a position past the last place', (id, length) => ({ fieldId: id, position: length + 1 }), 'position'],
    ];
    cases.forEach(([name, parameters, named]) => {
      it(name, async () => {
        const { length } = (await sections()).content;
        await expectRefused('updateLocationFieldOrderAdvanced', parameters(target.id, length), named);
      });
    });
  });
});
