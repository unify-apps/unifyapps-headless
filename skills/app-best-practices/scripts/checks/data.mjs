// Data and query safety (DATA): what a data source or a data block writes, and whether it writes it.
import { blockTarget, dataSourceTarget, isBinding, isBlank, isFixedId, isPlainObject, listOf, liveActions, walkedFacts } from './shared.mjs';

// Storage resources and the input that picks the rows they touch, as the platform's storage node
// schemas shape them. update_record_by_id is
// left out: it upserts, and its id can come from the record payload instead of `recordId`.
const BY_FILTER = new Set(['storage_by_unifyapps_delete_records', 'storage_by_unifyapps_update_records']);
const BY_ID = {
  storage_by_unifyapps_delete_record_by_id: 'entityId',
  storage_by_unifyapps_archive_record_by_id: 'entityId',
  storage_by_unifyapps_update_record_fields_by_id: 'recordId',
};
const RECORD_WRITES = new Set([
  'storage_by_unifyapps_create_record',
  'storage_by_unifyapps_bulk_create_records',
  'storage_by_unifyapps_upsert_record',
  'storage_by_unifyapps_bulk_upsert_records_by_id',
  'storage_by_unifyapps_update_record_by_id',
  'storage_by_unifyapps_update_record_fields_by_id',
  'storage_by_unifyapps_update_records',
]);

/** Leaves in a `triggerInputCondition` tree: a `{ property, filter }` leaf or a `{ resolvedFilter }` entry. */
function filterLeafCount(node) {
  if (!isPlainObject(node)) return 0;
  if (node.resolvedFilter || node.property !== undefined) return 1;
  return Array.isArray(node.filters) ? node.filters.reduce((total, child) => total + filterLeafCount(child), 0) : 0;
}

/** The cleaned folder an upload lands in, or '' when nothing survives. */
const cleanedFolder = path => path.split(/[/\\]/u).map(segment => segment.trim()).filter(segment => segment && !/^\.+$/u.test(segment)).join('/');

const EDITABLE_COLUMN_TYPES = new Set(['TEXT', 'NUMBER', 'PERCENT', 'CURRENCY', 'TAG', 'TOGGLE', 'DATE', 'DATE_ONLY', 'TIME_ONLY', 'MAPPED']);
const isEditable = value => value === true || value === 'true' || (isPlainObject(value) && (value.value === true || value.value === 'true' || value.value === 'conditions'));
// A column a user can actually edit (blocks/table/columns/common.md, `content.columns[].editable`).
const editableColumns = content => listOf(content?.columns)
  .filter(column => isEditable(column?.editable) && column.fieldKey && EDITABLE_COLUMN_TYPES.has(column.type));

const hasIdentifier = identifier => isPlainObject(identifier) && [identifier.key, identifier.path].some(isFixedId);

const entityForms = page => walkedFacts(page, 'Form').filter(({ content }) => content.source === 'entity' && typeof content.entity === 'string' && content.entity && !isBinding(content.entity));

export const dataChecks = [
  {
    // App sources live on the global page and are checked there, so each source is read once.
    id: 'delete-update-mutations-constrained-record',
    run: page => page.dataSources.flatMap(source => {
      const resource = source?.properties?.context?.resourceName;
      const inputs = source?.properties?.inputs ?? {};
      if (BY_FILTER.has(resource)) {
        if (filterLeafCount(inputs.triggerInputCondition) > 0) return [];
        const mode = inputs.numberOfRecordsToDelete ?? inputs.numberOfRecordsToUpdate ?? 'SINGLE';
        return [{ target: dataSourceTarget(source), evidence: `${resource} has no filter in inputs.triggerInputCondition, so ${mode} mode acts on whatever rows come first` }];
      }
      const idKey = BY_ID[resource];
      if (idKey && isBlank(inputs[idKey])) {
        return [{ target: dataSourceTarget(source), evidence: `${resource} has no inputs.${idKey}, so it names no record` }];
      }
      return [];
    }),
  },
  {
    // A set folder turns the platform's uniqueness segment off, so the key is <app>/<folder>/<file name>
    // and a second upload of the same name replaces the first (docs/uploads/VISIBILITY.md).
    id: 'bind-fileupload-uploadfolderpath-record-user',
    run: page => walkedFacts(page, 'FileUpload').flatMap(fact => {
      const path = fact.content.uploadFolderPath;
      if (typeof path !== 'string' || isBinding(path) || !cleanedFolder(path)) return [];
      return [{ target: blockTarget(page, fact.id), evidence: `content.uploadFolderPath is the constant "${path}", so every upload of the same file name lands on one address and replaces the last` }];
    }),
  },
  {
    id: 'give-entity-form-action-submit',
    run: page => entityForms(page).flatMap(fact => {
      const action = fact.content.action;
      if (action === 'create' || action === 'update' || isBinding(action)) return [];
      return [{ target: blockTarget(page, fact.id), evidence: `content.source is "entity" but content.action is ${action === undefined ? 'not set' : `"${action}"`}, so submit reports success and saves nothing` }];
    }),
  },
  {
    // Only a storage write to the form's own object is a duplicate; a write elsewhere (an audit row)
    // or an automation call is not something the stored config can call a second save.
    id: 'dont-wire-your-own-save',
    run: page => {
      const sources = new Map([...page.appDataSources, ...page.dataSources].map(source => [source?.id, source]));
      const saving = new Map(entityForms(page).filter(fact => ['create', 'update'].includes(fact.content.action)).map(fact => [fact.id, fact.content.entity]));
      return liveActions(page)
        .filter(({ target, eventType, action }) => saving.has(target.id) && eventType === 'onSubmit' && action.actionType === 'controlDataSource')
        .flatMap(({ target, action }) => {
          const source = sources.get(action.payload?.dataSourceId);
          const properties = source?.properties ?? {};
          const entity = saving.get(target.id);
          if (!RECORD_WRITES.has(properties.context?.resourceName) || properties.inputs?.object_type !== entity) return [];
          return [{ target, evidence: `onSubmit runs ${properties.name ?? source.id} (${properties.context.resourceName} on "${entity}") although the entity form already saves its "${entity}" record` }];
        });
    },
  },
  {
    // A custom form's root schema refuses unknown keys (additionalProperties false). An entity form's fields come from the object, not the stored schema, so it is skipped.
    id: 'keep-forms-initialformdata-field-keys',
    run: page => walkedFacts(page, 'Form').flatMap(({ id, content }) => {
      const schema = content.schema?.schema;
      if ((content.source ?? 'custom') !== 'custom' || (content.fieldsType ?? 'manual') !== 'manual') return [];
      if (!isPlainObject(content.initialFormData) || schema?.additionalProperties !== false || !isPlainObject(schema.properties)) return [];
      const extra = Object.keys(content.initialFormData).filter(key => !Object.hasOwn(schema.properties, key));
      if (!extra.length) return [];
      return [{ target: blockTarget(page, id), evidence: `content.initialFormData has ${extra.map(key => `"${key}"`).join(', ')}, which ${extra.length === 1 ? 'is not a field' : 'are not fields'} of content.schema, so submit fails and onSubmit never runs` }];
    }),
  },
  {
    id: 'give-table-editable-columns-identifier',
    run: page => walkedFacts(page, 'Table').flatMap(({ id, content }) => {
      const editable = editableColumns(content);
      if (!editable.length || hasIdentifier(content.identifier)) return [];
      const how = content.identifier === undefined ? 'no content.identifier' : 'a content.identifier with no fixed key or path';
      return [{ target: blockTarget(page, id), evidence: `${editable.length} editable column(s) (${editable.map(column => column.id ?? column.fieldKey?.key ?? '?').join(', ')}) and ${how}, so every edit is discarded` }];
    }),
  },
  {
    // The builder seeds `saveAction: { autoClearChangeset: true }` on tables nobody can edit, so a
    // table counts only with a column a user can edit: without one there is no edit to lose.
    id: 'wire-onsave-handler-tables-saveaction',
    run: page => walkedFacts(page, 'Table').flatMap(({ id, content }) => {
      if (!isPlainObject(content.addOns?.saveAction) || !editableColumns(content).length) return [];
      const handled = liveActions(page).some(entry => entry.target.id === id && entry.eventType === 'onSave' && entry.targetId === 'tableSaveActionAddOn' && entry.action.actionType);
      return handled ? [] : [{ target: blockTarget(page, id), evidence: 'content.addOns.saveAction is set but no onSave handler targets "tableSaveActionAddOn", so Save does nothing and edits are lost on reload' }];
    }),
  },
];
