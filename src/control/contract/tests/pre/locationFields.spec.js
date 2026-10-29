// locationFields: the extra fields every location can fill in, kept in the settings, one block per operation.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
// The widget refresh message gets no answer here: a spy stands in for it and only answers.
const quiet = () => spyOn(buildfire.messaging, 'sendMessageToWidget');
// There can be ten fields in all: a spec that makes fields only to act on them removes them again.
const removeAll = (...fields) => call('deleteLocationFieldsAdvanced', { fields: fields.map((field) => ({ fieldId: field.id })) });
const field = (label, extra = {}) => ({ label, section: 'content', type: 'TEXT', ...extra });

contract.describe('createLocationField', () => {
  beforeEach(quiet);

  it('adds a field from its label, section and type', async () => {
    const label = `Pre field (${contract.host})`;
    expect(await call('createLocationField', field(label))).toEqual(jasmine.objectContaining({ id: jasmine.any(String), label }));
  });

  it('adds a required quick action that takes its own label', async () => {
    const label = `Pre quick field (${contract.host})`;
    const created = await call('createLocationField', {
      label, section: 'quickActions', type: 'PHONE', required: true, allowCustomLabel: true
    });
    expect(created).toEqual(jasmine.objectContaining({ id: jasmine.any(String), label }));
    await removeAll(created);
  });
});

contract.describe('createLocationFieldsAdvanced', () => {
  beforeEach(quiet);

  it('adds several fields at once', async () => {
    const result = await call('createLocationFieldsAdvanced', {
      fields: [field(`Pre batch field one (${contract.host})`), field(`Pre batch field two (${contract.host})`, { section: 'quickActions', type: 'URL', required: true, allowCustomLabel: true })]
    });
    expect(result).toEqual(jasmine.objectContaining({ succeeded: 2 }));
    await removeAll(...result.fields);
  });
});

contract.describe('updateLocationField', () => {
  beforeEach(quiet);

  it('makes a field required, naming it by its label', async () => {
    const label = `Pre field to update (${contract.host})`;
    const created = await call('createLocationField', field(label));
    expect(await call('updateLocationField', { label, newRequired: true })).toEqual(jasmine.objectContaining({ id: created.id }));
    await removeAll(created);
  });

  it('changes every detail of a field', async () => {
    const label = `Pre field to change (${contract.host})`;
    const created = await call('createLocationField', field(label));
    expect(await call('updateLocationField', {
      label, newLabel: `Pre field changed (${contract.host})`, newType: 'RICH_TEXT', newRequired: true, newAllowCustomLabel: true
    })).toEqual(jasmine.objectContaining({ id: created.id, label: `Pre field changed (${contract.host})` }));
    await removeAll(created);
  });
});

contract.describe('updateLocationFieldAdvanced', () => {
  beforeEach(quiet);

  it('changes a field by its id', async () => {
    const created = await call('createLocationField', field(`Pre field to change by id (${contract.host})`));
    expect(await call('updateLocationFieldAdvanced', { fieldId: created.id, newType: 'URL' })).toEqual(jasmine.objectContaining({ id: created.id }));
    await removeAll(created);
  });
});

contract.describe('updateLocationFieldsAdvanced', () => {
  beforeEach(quiet);

  it('changes several fields at once', async () => {
    const one = await call('createLocationField', field(`Pre batch field to change one (${contract.host})`));
    const two = await call('createLocationField', field(`Pre batch field to change two (${contract.host})`));
    expect(await call('updateLocationFieldsAdvanced', { fields: [{ fieldId: one.id, newRequired: true }, { fieldId: two.id, newLabel: `Pre batch field changed (${contract.host})` }] }))
      .toEqual(jasmine.objectContaining({ succeeded: 2 }));
    await removeAll(one, two);
  });
});

contract.describe('deleteLocationField', () => {
  beforeEach(quiet);

  it('removes a field by its label', async () => {
    const label = `Pre field to delete (${contract.host})`;
    await call('createLocationField', field(label));
    expect(await call('deleteLocationField', { label })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), label }));
  });
});

contract.describe('deleteLocationFieldAdvanced', () => {
  beforeEach(quiet);

  it('removes a field by its id', async () => {
    const created = await call('createLocationField', field(`Pre field to delete by id (${contract.host})`));
    expect(await call('deleteLocationFieldAdvanced', { fieldId: created.id })).toEqual(jasmine.objectContaining({ id: created.id }));
  });
});

contract.describe('deleteLocationFieldsAdvanced', () => {
  beforeEach(quiet);

  it('removes several fields at once', async () => {
    const one = await call('createLocationField', field(`Pre batch field to delete one (${contract.host})`));
    const two = await call('createLocationField', field(`Pre batch field to delete two (${contract.host})`));
    expect(await call('deleteLocationFieldsAdvanced', { fields: [{ fieldId: one.id }, { fieldId: two.id }] })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('updateLocationFieldOrder', () => {
  beforeEach(quiet);

  it('moves a field to the top of its section', async () => {
    const one = await call('createLocationField', field(`Pre field to move one (${contract.host})`));
    const two = await call('createLocationField', field(`Pre field to move two (${contract.host})`));
    expect(await call('updateLocationFieldOrder', { label: two.label, position: 1 })).toEqual(jasmine.objectContaining({
      fields: jasmine.arrayContaining([jasmine.objectContaining({ id: two.id })])
    }));
    await removeAll(one, two);
  });
});

contract.describe('updateLocationFieldOrderAdvanced', () => {
  beforeEach(quiet);

  it('moves a field by its id', async () => {
    const one = await call('createLocationField', field(`Pre field to move by id one (${contract.host})`));
    const two = await call('createLocationField', field(`Pre field to move by id two (${contract.host})`));
    expect(await call('updateLocationFieldOrderAdvanced', { fieldId: two.id, position: 1 })).toEqual(jasmine.objectContaining({
      fields: jasmine.arrayContaining([jasmine.objectContaining({ id: two.id })])
    }));
    await removeAll(one, two);
  });
});
