// locationFields: the extra fields every location can fill in, kept in the plugin's settings; the control panel manages them.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));

// A refresh message to the widget, which nothing here answers: the spy only answers.
const quiet = () => {
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') spyOn(buildfire.messaging, 'sendMessageToWidget');
};
// Up to ten fields fit on an instance, and later runs add their own to it: but for the fields the create specs make, each spec
// removes the fields it made once its own call is done.
const field = (label, extra = {}) => call('createLocationField', {
  label, section: 'content', type: 'TEXT', ...extra,
});
const removeFields = (ids) => call('deleteLocationFieldsAdvanced', { fields: ids.map((fieldId) => ({ fieldId })) });

contract.describe('createLocationField', () => {
  beforeEach(quiet);

  it('adds a field', async () => {
    const label = `Pre field (${contract.host})`;
    expect(await call('createLocationField', { label, section: 'content', type: 'TEXT' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), label }));
  });

  it('adds a required quick action that takes a label of its own', async () => {
    const label = `Pre phone field (${contract.host})`;
    expect(await call('createLocationField', {
      label, section: 'quickActions', type: 'PHONE', required: true, allowCustomLabel: true,
    })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), label }));
  });
});

contract.describe('createLocationFieldsAdvanced', () => {
  beforeEach(quiet);

  it('adds several fields at once', async () => {
    const result = await call('createLocationFieldsAdvanced', {
      fields: [
        { label: `Pre batch field one (${contract.host})`, section: 'content', type: 'RICH_TEXT' },
        { label: `Pre batch field two (${contract.host})`, section: 'quickActions', type: 'EMAIL', required: true, allowCustomLabel: false },
      ],
    });
    expect(result).toEqual(jasmine.objectContaining({ succeeded: 2 }));
    await removeFields(result.fields.map((entry) => entry.id));
  });
});

contract.describe('updateLocationField', () => {
  beforeEach(quiet);

  it("changes a field's type, found by its label", async () => {
    const label = `Pre field to update (${contract.host})`;
    const { id } = await field(label);
    expect(await call('updateLocationField', { label, newType: 'URL' })).toEqual(jasmine.objectContaining({ id }));
    await removeFields([id]);
  });

  it('changes every detail of a field', async () => {
    const label = `Pre field to change fully (${contract.host})`;
    const { id } = await field(label);
    expect(await call('updateLocationField', {
      label, newLabel: `Pre field changed fully (${contract.host})`, newType: 'RICH_TEXT', newRequired: true, newAllowCustomLabel: true,
    })).toEqual(jasmine.objectContaining({ id }));
    await removeFields([id]);
  });
});

contract.describe('updateLocationFieldAdvanced', () => {
  beforeEach(quiet);

  it('changes a field by its id', async () => {
    const { id } = await field(`Pre field to update by id (${contract.host})`);
    expect(await call('updateLocationFieldAdvanced', {
      fieldId: id, newLabel: `Pre field updated by id (${contract.host})`, newType: 'EMAIL', newRequired: true, newAllowCustomLabel: true,
    })).toEqual(jasmine.objectContaining({ id }));
    await removeFields([id]);
  });
});

contract.describe('updateLocationFieldsAdvanced', () => {
  beforeEach(quiet);

  it('changes several fields at once', async () => {
    const one = await field(`Pre batch field to update one (${contract.host})`);
    const two = await field(`Pre batch field to update two (${contract.host})`);
    expect(await call('updateLocationFieldsAdvanced', { fields: [{ fieldId: one.id, newRequired: true }, { fieldId: two.id, newType: 'PHONE', newAllowCustomLabel: true }] }))
      .toEqual(jasmine.objectContaining({ succeeded: 2 }));
    await removeFields([one.id, two.id]);
  });
});

contract.describe('deleteLocationField', () => {
  beforeEach(quiet);

  it('removes a field found by its label', async () => {
    const label = `Pre field to delete (${contract.host})`;
    await field(label);
    expect(await call('deleteLocationField', { label })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), label }));
  });
});

contract.describe('deleteLocationFieldAdvanced', () => {
  beforeEach(quiet);

  it('removes a field by its id', async () => {
    const { id } = await field(`Pre field to delete by id (${contract.host})`);
    expect(await call('deleteLocationFieldAdvanced', { fieldId: id })).toEqual(jasmine.objectContaining({ id }));
  });
});

contract.describe('deleteLocationFieldsAdvanced', () => {
  beforeEach(quiet);

  it('removes several fields at once', async () => {
    const one = await field(`Pre batch field to delete one (${contract.host})`);
    const two = await field(`Pre batch field to delete two (${contract.host})`);
    expect(await call('deleteLocationFieldsAdvanced', { fields: [{ fieldId: one.id }, { fieldId: two.id }] })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('updateLocationFieldOrder', () => {
  beforeEach(quiet);

  it('moves a field, found by its label, to the top of its section', async () => {
    const label = `Pre field to move (${contract.host})`;
    const { id } = await field(label, { section: 'quickActions', type: 'URL' });
    expect(await call('updateLocationFieldOrder', { label, position: 1 })).toEqual(jasmine.objectContaining({ fields: jasmine.arrayContaining([jasmine.objectContaining({ id })]) }));
    await removeFields([id]);
  });
});

contract.describe('updateLocationFieldOrderAdvanced', () => {
  beforeEach(quiet);

  it('moves a field, by its id, to the top of its section', async () => {
    const { id } = await field(`Pre field to move by id (${contract.host})`);
    expect(await call('updateLocationFieldOrderAdvanced', { fieldId: id, position: 1 })).toEqual(jasmine.objectContaining({ fields: jasmine.arrayContaining([jasmine.objectContaining({ id })]) }));
    await removeFields([id]);
  });
});
