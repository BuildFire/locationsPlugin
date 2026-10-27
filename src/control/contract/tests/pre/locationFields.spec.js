// locationFields: the fields every location can fill in, kept in the plugin's one settings record. Every operation here is
// control only.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));

// The instance holds at most 10 location fields, and pre/locations.spec.js adds one after this file: the specs that only
// need a field for a moment remove it again, so this file leaves 7 and never holds more than 9.
const removeAgain = (fieldIds) => call('deleteLocationFieldsAdvanced', { fields: fieldIds.map((fieldId) => ({ fieldId })) });

// A field as every operation here returns it, with the declared details.
const aField = (details) => jasmine.objectContaining({ id: jasmine.any(String), ...details });
// A batch's declared result: one entry per field given, in order, each with its id, and every one applied.
const batchOf = (ids) => jasmine.objectContaining({
  fields: ids.map((id, index) => jasmine.objectContaining({ index, id })),
  succeeded: ids.length,
  failed: 0,
});
const createField = (label) => call('createLocationField', { group: 'content', label, type: 'TEXT' });
const createFields = async (labels) => (await call('createLocationFieldsAdvanced', {
  fields: labels.map((label) => ({ group: 'content', label, type: 'TEXT' })),
})).fields.map((entry) => entry.id);

// The refresh message each save sends the widget gets no answer here: its spy only answers.
const quiet = () => spyOn(buildfire.messaging, 'sendMessageToWidget');

contract.describe('createLocationField', () => {
  beforeEach(quiet);

  it('adds a field from its section and label', async () => {
    const label = `Pre field (${contract.host})`;
    expect(await call('createLocationField', { group: 'quickActions', label })).toEqual(aField({ group: 'quickActions', label }));
  });

  it('adds a field with every option given', async () => {
    const label = `Pre field with every option (${contract.host})`;
    expect(await call('createLocationField', {
      group: 'content', label, type: 'RICH_TEXT', required: true, allowCustomLabel: true,
    })).toEqual(aField({ group: 'content', label, type: 'RICH_TEXT', required: true, allowCustomLabel: true }));
  });
});

contract.describe('createLocationFieldsAdvanced', () => {
  beforeEach(quiet);

  it('adds several fields at once, one with its section and label, one with every option', async () => {
    const fields = [
      { group: 'quickActions', label: `Pre batch field one (${contract.host})` },
      { group: 'content', label: `Pre batch field two (${contract.host})`, type: 'TEXT', required: false, allowCustomLabel: true },
    ];
    expect(await call('createLocationFieldsAdvanced', { fields })).toEqual(batchOf([jasmine.any(String), jasmine.any(String)]));
  });
});

contract.describe('updateLocationField', () => {
  beforeEach(quiet);

  it('changes a field, naming it by its label', async () => {
    const label = `Pre field to update (${contract.host})`;
    const { id } = await createField(label);
    expect(await call('updateLocationField', { label, newRequired: true })).toEqual(aField({ id, label, required: true }));
    await removeAgain([id]);
  });

  it('changes every detail of a field, naming it by its label', async () => {
    const label = `Pre field to update in full (${contract.host})`;
    const newLabel = `Pre field updated in full (${contract.host})`;
    const { id } = await createField(label);
    expect(await call('updateLocationField', {
      label, newLabel, newType: 'URL', newRequired: true, newAllowCustomLabel: true,
    })).toEqual(aField({ id, group: 'content', label: newLabel, type: 'URL', required: true, allowCustomLabel: true }));
  });
});

contract.describe('updateLocationFieldAdvanced', () => {
  beforeEach(quiet);

  it('changes a field, by its id', async () => {
    const label = `Pre field to update by id (${contract.host})`;
    const { id } = await createField(label);
    expect(await call('updateLocationFieldAdvanced', { fieldId: id, newRequired: true })).toEqual(aField({ id, label, required: true }));
    await removeAgain([id]);
  });

  it('changes every detail of a field, by its id', async () => {
    const newLabel = `Pre field updated in full by id (${contract.host})`;
    const { id } = await createField(`Pre field to update in full by id (${contract.host})`);
    expect(await call('updateLocationFieldAdvanced', {
      fieldId: id, newLabel, newType: 'PHONE', newRequired: true, newAllowCustomLabel: true,
    })).toEqual(aField({ id, group: 'content', label: newLabel, type: 'PHONE', required: true, allowCustomLabel: true }));
  });
});

contract.describe('updateLocationFieldsAdvanced', () => {
  beforeEach(quiet);

  it('changes several fields at once', async () => {
    const ids = await createFields([`Pre batch field to update one (${contract.host})`, `Pre batch field to update two (${contract.host})`]);
    expect(await call('updateLocationFieldsAdvanced', { fields: ids.map((fieldId) => ({ fieldId, newRequired: true })) }))
      .toEqual(batchOf(ids));
    await removeAgain(ids);
  });

  it('changes every detail of a field in a batch', async () => {
    const [id] = await createFields([`Pre batch field to update in full (${contract.host})`]);
    const fields = [{
      fieldId: id, newLabel: `Pre batch field updated in full (${contract.host})`, newType: 'EMAIL', newRequired: true, newAllowCustomLabel: true,
    }];
    expect(await call('updateLocationFieldsAdvanced', { fields })).toEqual(batchOf([id]));
  });
});

contract.describe('deleteLocationField', () => {
  beforeEach(quiet);

  it('deletes a field, naming it by its label', async () => {
    const label = `Pre field to delete (${contract.host})`;
    const { id } = await createField(label);
    expect(await call('deleteLocationField', { label })).toEqual(jasmine.objectContaining({ id }));
  });
});

contract.describe('deleteLocationFieldAdvanced', () => {
  beforeEach(quiet);

  it('deletes a field by its id', async () => {
    const { id } = await createField(`Pre field to delete by id (${contract.host})`);
    expect(await call('deleteLocationFieldAdvanced', { fieldId: id })).toEqual(jasmine.objectContaining({ id }));
  });
});

contract.describe('deleteLocationFieldsAdvanced', () => {
  beforeEach(quiet);

  it('deletes several fields at once', async () => {
    const ids = await createFields([`Pre batch field to delete one (${contract.host})`, `Pre batch field to delete two (${contract.host})`]);
    expect(await call('deleteLocationFieldsAdvanced', { fields: ids.map((fieldId) => ({ fieldId })) })).toEqual(batchOf(ids));
  });
});

contract.describe('updateLocationFieldOrder', () => {
  beforeEach(quiet);

  it('moves a field to the top of its section, naming it by its label', async () => {
    const label = `Pre field to move (${contract.host})`;
    const { id } = await createField(label);
    expect(await call('updateLocationFieldOrder', { label, position: 1 })).toEqual(jasmine.objectContaining({
      fields: jasmine.arrayContaining([aField({ id, label })]),
    }));
    await removeAgain([id]);
  });
});

contract.describe('updateLocationFieldOrderAdvanced', () => {
  beforeEach(quiet);

  it('moves a field to the top of its section, by its id', async () => {
    const label = `Pre field to move by id (${contract.host})`;
    const { id } = await createField(label);
    expect(await call('updateLocationFieldOrderAdvanced', { fieldId: id, position: 1 })).toEqual(jasmine.objectContaining({
      fields: jasmine.arrayContaining([aField({ id, label })]),
    }));
    await removeAgain([id]);
  });
});
