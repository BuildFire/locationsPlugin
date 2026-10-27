// locationFields: the extra fields every location can fill in, kept in the settings; one block per operation, after the helpers they share.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const quiet = () => {
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') spyOn(buildfire.messaging, 'sendMessageToWidget');
};
// At most 10 fields fit, so each spec removes the fields it made once its call is checked.
const removeFields = async (ids) => {
  for (const id of ids) await call('deleteLocationFieldAdvanced', { fieldId: id });
};

contract.describe('createLocationField', () => {
  beforeEach(quiet);

  it('adds a content field', async () => {
    const created = await call('createLocationField', { group: 'content', label: `Pre email field (${contract.host})`, type: 'EMAIL' });
    expect(created).toEqual(jasmine.objectContaining({ id: jasmine.any(String), label: `Pre email field (${contract.host})`, group: 'content' }));
    await removeFields([created.id]);
  });

  it('adds a required quick action with a custom label', async () => {
    const created = await call('createLocationField', { group: 'quickActions', label: `Pre call field (${contract.host})`, type: 'PHONE', required: true, enableCustomLabel: true });
    expect(created).toEqual(jasmine.objectContaining({ id: jasmine.any(String), required: true, enableCustomLabel: true }));
    await removeFields([created.id]);
  });
});

contract.describe('createLocationFieldsAdvanced', () => {
  beforeEach(quiet);

  it('adds several fields at once', async () => {
    const result = await call('createLocationFieldsAdvanced', { fields: [
      { group: 'content', label: `Pre batch field one (${contract.host})`, type: 'TEXT' },
      { group: 'quickActions', label: `Pre batch field two (${contract.host})`, type: 'URL', required: false, enableCustomLabel: true }
    ] });
    expect(result).toEqual(jasmine.objectContaining({ succeeded: 2 }));
    await removeFields(result.fields.map((entry) => entry.id));
  });
});

contract.describe('updateLocationField', () => {
  beforeEach(quiet);

  it('renames a field, naming it by its name', async () => {
    const created = await call('createLocationField', { group: 'content', label: `Pre field to rename (${contract.host})`, type: 'EMAIL' });
    expect(await call('updateLocationField', { fieldName: `Pre field to rename (${contract.host})`, newLabel: `Pre field renamed (${contract.host})` }))
      .toEqual(jasmine.objectContaining({ id: created.id, label: `Pre field renamed (${contract.host})` }));
    await removeFields([created.id]);
  });

  it('changes every detail of a field', async () => {
    const created = await call('createLocationField', { group: 'content', label: `Pre field to change (${contract.host})`, type: 'EMAIL' });
    expect(await call('updateLocationField', { fieldName: `Pre field to change (${contract.host})`, newType: 'RICH_TEXT', required: true, enableCustomLabel: true }))
      .toEqual(jasmine.objectContaining({ id: created.id, type: 'RICH_TEXT' }));
    await removeFields([created.id]);
  });
});

contract.describe('updateLocationFieldAdvanced', () => {
  beforeEach(quiet);

  it('changes a field by its id', async () => {
    const created = await call('createLocationField', { group: 'quickActions', label: `Pre field to change by id (${contract.host})`, type: 'EMAIL' });
    expect(await call('updateLocationFieldAdvanced', { fieldId: created.id, newLabel: `Pre field changed by id (${contract.host})`, newType: 'URL', required: true, enableCustomLabel: false }))
      .toEqual(jasmine.objectContaining({ id: created.id }));
    await removeFields([created.id]);
  });
});

contract.describe('updateLocationFieldsAdvanced', () => {
  beforeEach(quiet);

  it('changes several fields at once', async () => {
    const { fields } = await call('createLocationFieldsAdvanced', { fields: [
      { group: 'content', label: `Pre fields to change one (${contract.host})`, type: 'TEXT' },
      { group: 'content', label: `Pre fields to change two (${contract.host})`, type: 'TEXT' }
    ] });
    expect(await call('updateLocationFieldsAdvanced', { fields: [{ fieldId: fields[0].id, required: true }, { fieldId: fields[1].id, newLabel: `Pre fields changed two (${contract.host})` }] }))
      .toEqual(jasmine.objectContaining({ succeeded: 2 }));
    await removeFields(fields.map((entry) => entry.id));
  });
});

contract.describe('deleteLocationField', () => {
  beforeEach(quiet);

  it('removes a field by its name', async () => {
    await call('createLocationField', { group: 'content', label: `Pre field to delete (${contract.host})`, type: 'PHONE' });
    expect(await call('deleteLocationField', { fieldName: `Pre field to delete (${contract.host})` })).toEqual(jasmine.objectContaining({ id: jasmine.any(String) }));
  });
});

contract.describe('deleteLocationFieldAdvanced', () => {
  beforeEach(quiet);

  it('removes a field by its id', async () => {
    const created = await call('createLocationField', { group: 'content', label: `Pre field to delete by id (${contract.host})`, type: 'PHONE' });
    expect(await call('deleteLocationFieldAdvanced', { fieldId: created.id })).toEqual(jasmine.objectContaining({ id: created.id }));
  });
});

contract.describe('deleteLocationFieldsAdvanced', () => {
  beforeEach(quiet);

  it('removes several fields at once', async () => {
    const { fields } = await call('createLocationFieldsAdvanced', { fields: [
      { group: 'content', label: `Pre fields to delete one (${contract.host})`, type: 'URL' },
      { group: 'content', label: `Pre fields to delete two (${contract.host})`, type: 'URL' }
    ] });
    expect(await call('deleteLocationFieldsAdvanced', { fields: fields.map((entry) => ({ fieldId: entry.id })) })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('updateLocationFieldOrder', () => {
  beforeEach(quiet);

  it('moves a field, naming it by its name', async () => {
    const created = await call('createLocationField', { group: 'quickActions', label: `Pre field to move (${contract.host})`, type: 'URL' });
    expect(await call('updateLocationFieldOrder', { fieldName: `Pre field to move (${contract.host})`, position: 1 }))
      .toEqual(jasmine.objectContaining({ group: 'quickActions', fields: jasmine.arrayContaining([jasmine.objectContaining({ id: created.id })]) }));
    await removeFields([created.id]);
  });
});

contract.describe('updateLocationFieldOrderAdvanced', () => {
  beforeEach(quiet);

  it('moves a field by its id', async () => {
    const created = await call('createLocationField', { group: 'quickActions', label: `Pre field to move by id (${contract.host})`, type: 'URL' });
    expect(await call('updateLocationFieldOrderAdvanced', { fieldId: created.id, position: 1 })).toEqual(jasmine.objectContaining({ group: 'quickActions' }));
    await removeFields([created.id]);
  });
});
