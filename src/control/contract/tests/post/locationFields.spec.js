// locationFields: the extra fields every location can fill in, kept in the settings; one block per operation, after the helpers they share.
// Every block is controlBackground only: only the control panel's Location Fields tab manages them.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);
const unique = (label) => `Post ${label} (${contract.host}) ${Date.now()}`;

// The fields as the contract's own read shows them.
const allFields = async () => (await call('getSettings', {})).customFields;
const named = async (label) => {
  const { quickActions, content } = await allFields();
  return [...quickActions.map((field) => ({ ...field, group: 'quickActions' })), ...content.map((field) => ({ ...field, group: 'content' }))]
    .filter((field) => field.label === label);
};
// At most 10 fields fit: every spec removes the fields it made, whatever happens.
const removeFields = async (ids) => {
  for (const id of ids) await call('deleteLocationFieldAdvanced', { fieldId: id }).catch(() => null);
};
const field = (label, extra = {}) => ({ group: 'content', label, type: 'EMAIL', ...extra });

// The widget refresh nothing here answers: a spy stands in for it.
const quiet = () => {
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') spyOn(buildfire.messaging, 'sendMessageToWidget');
};

contract.describe('createLocationField', () => {
  beforeEach(quiet);

  it('adds a field at the end of its group, not required and without a custom label', async () => {
    const label = unique('field');
    const created = await call('createLocationField', field(label));
    try {
      expect(created).toEqual(jasmine.objectContaining({ id: jasmine.any(String), group: 'content', label, type: 'EMAIL', required: false, enableCustomLabel: false }));
      const { content } = await allFields();
      expect(content[content.length - 1]).toEqual(jasmine.objectContaining({ id: created.id, label, type: 'EMAIL' }));
    } finally {
      await removeFields([created.id]);
    }
  });

  it('adds a required quick action that takes a custom label', async () => {
    const label = unique('quick');
    const created = await call('createLocationField', field(label, { group: 'quickActions', type: 'PHONE', required: true, enableCustomLabel: true }));
    try {
      expect(await named(label)).toEqual([jasmine.objectContaining({ group: 'quickActions', type: 'PHONE', required: true, enableCustomLabel: true })]);
    } finally {
      await removeFields([created.id]);
    }
  });

  describe('refuses, and stores nothing', () => {
    it('without a group, a name or a type', async () => {
      const label = unique('incomplete');
      expect(await refusal(call('createLocationField', { label, type: 'EMAIL' }))).toContain('group');
      expect(await refusal(call('createLocationField', { group: 'content', type: 'EMAIL' }))).toContain('label');
      expect(await refusal(call('createLocationField', { group: 'content', label: '', type: 'EMAIL' }))).toContain('label');
      expect(await refusal(call('createLocationField', { group: 'content', label: null, type: 'EMAIL' }))).toContain('label');
      expect(await refusal(call('createLocationField', { group: 'content', label }))).toContain('type');
      expect(await named(label)).toEqual([]);
    });

    it('a group or type it does not offer, and text in a quick action', async () => {
      const label = unique('wrong type');
      expect(await refusal(call('createLocationField', field(label, { group: 'sidebar' })))).toContain('group');
      expect(await refusal(call('createLocationField', field(label, { type: 'DATE' })))).toContain('type');
      expect(await refusal(call('createLocationField', field(label, { group: 'quickActions', type: 'TEXT' })))).toContain('type');
      expect(await refusal(call('createLocationField', field(label, { required: 'yes' })))).toContain('required');
      expect(await named(label)).toEqual([]);
    });

    it('an eleventh field', async () => {
      const { quickActions, content } = await allFields();
      const room = 10 - quickActions.length - content.length;
      const made = [];
      try {
        if (room > 0) {
          const result = await call('createLocationFieldsAdvanced', { fields: Array.from({ length: room }, (value, index) => field(unique(`filler ${index}`))) });
          made.push(...result.fields.map((entry) => entry.id));
        }
        const label = unique('eleventh');
        expect(await refusal(call('createLocationField', field(label)))).toContain('10');
        expect(await named(label)).toEqual([]);
      } finally {
        await removeFields(made);
      }
    }, 120000);
  });
});

contract.describe('createLocationFieldsAdvanced', () => {
  beforeEach(quiet);

  it('adds every field and reports each', async () => {
    const labels = [unique('batch one'), unique('batch two')];
    const result = await call('createLocationFieldsAdvanced', { fields: [field(labels[0]), field(labels[1], { group: 'quickActions', type: 'URL' })] });
    try {
      expect(result).toEqual(jasmine.objectContaining({
        fields: [jasmine.objectContaining({ index: 0, id: jasmine.any(String), error: null }), jasmine.objectContaining({ index: 1, id: jasmine.any(String), error: null })],
        succeeded: 2,
        failed: 0
      }));
      expect(await named(labels[1])).toEqual([jasmine.objectContaining({ group: 'quickActions', type: 'URL' })]);
    } finally {
      await removeFields(result.fields.map((entry) => entry.id));
    }
  });

  it('refuses the whole list when one entry is invalid, or it is empty, and adds none of it', async () => {
    const valid = unique('valid entry');
    expect(await refusal(call('createLocationFieldsAdvanced', { fields: [field(valid), field(unique('bad'), { type: 'DATE' })] }))).toContain('type');
    await expectAsync(call('createLocationFieldsAdvanced', { fields: [] })).toBeRejected();
    expect(await named(valid)).toEqual([]);
  });

  it('refuses more fields than there is room for', async () => {
    const fields = Array.from({ length: 11 }, (value, index) => field(unique(`too many ${index}`)));
    await expectAsync(call('createLocationFieldsAdvanced', { fields })).toBeRejected();
    expect(await named(fields[0].label)).toEqual([]);
  });
});

contract.describe('updateLocationField', () => {
  beforeEach(quiet);

  it('changes only what it is given', async () => {
    const label = unique('update');
    const created = await call('createLocationField', field(label, { enableCustomLabel: true }));
    try {
      expect(await call('updateLocationField', { fieldName: label, newLabel: `${label} renamed`, newType: 'TEXT', required: true }))
        .toEqual(jasmine.objectContaining({ id: created.id, label: `${label} renamed`, type: 'TEXT', required: true, enableCustomLabel: true }));
      expect(await named(`${label} renamed`)).toEqual([jasmine.objectContaining({ id: created.id, type: 'TEXT', required: true, enableCustomLabel: true })]);
      expect(await named(label)).toEqual([]);
    } finally {
      await removeFields([created.id]);
    }
  });

  describe('refuses, and changes nothing', () => {
    it('a name no field has, naming it', async () => {
      const fieldName = unique('missing');
      expect(await refusal(call('updateLocationField', { fieldName, required: true }))).toContain(fieldName);
    });

    it('a name two fields share, saying how many', async () => {
      const label = unique('shared');
      const { fields } = await call('createLocationFieldsAdvanced', { fields: [field(label), field(label)] });
      try {
        expect((await refusal(call('updateLocationField', { fieldName: label, required: true }))).replace(label, '')).toContain('2');
        expect(await named(label)).toEqual([jasmine.objectContaining({ required: false }), jasmine.objectContaining({ required: false })]);
      } finally {
        await removeFields(fields.map((entry) => entry.id));
      }
    });

    it('removing the name, text in a quick action, or a call that changes nothing', async () => {
      const label = unique('keep');
      const created = await call('createLocationField', field(label, { group: 'quickActions', type: 'PHONE' }));
      try {
        expect(await refusal(call('updateLocationField', { fieldName: label, newLabel: null }))).toContain('newLabel');
        expect(await refusal(call('updateLocationField', { fieldName: label, newType: 'RICH_TEXT' }))).toContain('newType');
        await expectAsync(call('updateLocationField', { fieldName: label })).toBeRejected();
        expect(await named(label)).toEqual([jasmine.objectContaining({ type: 'PHONE' })]);
      } finally {
        await removeFields([created.id]);
      }
    });

    it('without a name', async () => {
      expect(await refusal(call('updateLocationField', { required: true }))).toContain('fieldName');
    });
  });
});

contract.describe('updateLocationFieldAdvanced', () => {
  beforeEach(quiet);

  it('changes the field with that id', async () => {
    const label = unique('by id');
    const created = await call('createLocationField', field(label));
    try {
      await call('updateLocationFieldAdvanced', { fieldId: created.id, enableCustomLabel: true });
      expect(await named(label)).toEqual([jasmine.objectContaining({ id: created.id, enableCustomLabel: true })]);
    } finally {
      await removeFields([created.id]);
    }
  });

  it('refuses an id that matches nothing', async () => {
    expect(await refusal(call('updateLocationFieldAdvanced', { fieldId: 'no-such-field', required: true }))).toContain('no-such-field');
  });
});

contract.describe('updateLocationFieldsAdvanced', () => {
  beforeEach(quiet);

  it('changes every field and reports each', async () => {
    const labels = [unique('many one'), unique('many two')];
    const { fields } = await call('createLocationFieldsAdvanced', { fields: labels.map((label) => field(label)) });
    try {
      expect(await call('updateLocationFieldsAdvanced', { fields: fields.map((entry) => ({ fieldId: entry.id, required: true })) }))
        .toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
      for (const label of labels) expect(await named(label)).toEqual([jasmine.objectContaining({ required: true })]);
    } finally {
      await removeFields(fields.map((entry) => entry.id));
    }
  });

  it('refuses the whole list when an id matches nothing, and changes none of it', async () => {
    const label = unique('kept');
    const created = await call('createLocationField', field(label));
    try {
      await expectAsync(call('updateLocationFieldsAdvanced', { fields: [{ fieldId: created.id, required: true }, { fieldId: 'no-such-field', required: true }] })).toBeRejected();
      expect(await named(label)).toEqual([jasmine.objectContaining({ required: false })]);
    } finally {
      await removeFields([created.id]);
    }
  });
});

contract.describe('deleteLocationField', () => {
  beforeEach(quiet);

  it('removes the field with that name', async () => {
    const label = unique('delete');
    const created = await call('createLocationField', field(label));
    expect(await call('deleteLocationField', { fieldName: label })).toEqual(jasmine.objectContaining({ id: created.id, label, group: 'content' }));
    expect(await named(label)).toEqual([]);
  });

  it('refuses a name no field has, naming it', async () => {
    const fieldName = unique('missing');
    expect(await refusal(call('deleteLocationField', { fieldName }))).toContain(fieldName);
  });
});

contract.describe('deleteLocationFieldAdvanced', () => {
  beforeEach(quiet);

  it('removes the field with that id', async () => {
    const label = unique('delete by id');
    const created = await call('createLocationField', field(label));
    await call('deleteLocationFieldAdvanced', { fieldId: created.id });
    expect(await named(label)).toEqual([]);
  });

  it('refuses an id that matches nothing', async () => {
    expect(await refusal(call('deleteLocationFieldAdvanced', { fieldId: 'no-such-field' }))).toContain('no-such-field');
  });
});

contract.describe('deleteLocationFieldsAdvanced', () => {
  beforeEach(quiet);

  it('removes every field and reports each', async () => {
    const labels = [unique('gone one'), unique('gone two')];
    const { fields } = await call('createLocationFieldsAdvanced', { fields: labels.map((label) => field(label)) });
    expect(await call('deleteLocationFieldsAdvanced', { fields: fields.map((entry) => ({ fieldId: entry.id })) })).toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
    for (const label of labels) expect(await named(label)).toEqual([]);
  });

  it('refuses the whole list when an id is listed twice, and removes none of it', async () => {
    const label = unique('survivor');
    const created = await call('createLocationField', field(label));
    try {
      await expectAsync(call('deleteLocationFieldsAdvanced', { fields: [{ fieldId: created.id }, { fieldId: created.id }] })).toBeRejected();
      expect(await named(label)).toEqual([jasmine.objectContaining({ id: created.id })]);
    } finally {
      await removeFields([created.id]);
    }
  });
});

contract.describe('updateLocationFieldOrder', () => {
  beforeEach(quiet);

  it('moves a field to another place in its group', async () => {
    const first = unique('order first');
    const second = unique('order second');
    const { fields } = await call('createLocationFieldsAdvanced', { fields: [field(first), field(second)] });
    try {
      const { content } = await allFields();
      const position = content.findIndex((entry) => entry.label === first) + 1;
      const result = await call('updateLocationFieldOrder', { fieldName: second, position });
      const labels = result.fields.map((entry) => entry.label);
      expect(labels.indexOf(second)).toBe(position - 1);
      expect(labels.indexOf(first)).toBe(position);
      expect((await allFields()).content.map((entry) => entry.label)).toEqual(labels);
    } finally {
      await removeFields(fields.map((entry) => entry.id));
    }
  });

  it('refuses a position past the end of the group, or none', async () => {
    const label = unique('order range');
    const created = await call('createLocationField', field(label));
    try {
      expect(await refusal(call('updateLocationFieldOrder', { fieldName: label, position: 11 }))).toContain('position');
      expect(await refusal(call('updateLocationFieldOrder', { fieldName: label }))).toContain('position');
    } finally {
      await removeFields([created.id]);
    }
  });
});

contract.describe('updateLocationFieldOrderAdvanced', () => {
  beforeEach(quiet);

  it('moves the field with that id to the top of its group', async () => {
    const label = unique('order by id');
    const created = await call('createLocationField', field(label, { group: 'quickActions', type: 'URL' }));
    try {
      await call('updateLocationFieldOrderAdvanced', { fieldId: created.id, position: 1 });
      expect((await allFields()).quickActions[0]).toEqual(jasmine.objectContaining({ id: created.id }));
    } finally {
      await removeFields([created.id]);
    }
  });

  it('refuses an id that matches nothing', async () => {
    expect(await refusal(call('updateLocationFieldOrderAdvanced', { fieldId: 'no-such-field', position: 1 }))).toContain('no-such-field');
  });
});
