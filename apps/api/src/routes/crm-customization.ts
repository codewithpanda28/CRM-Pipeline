/**
 * CRM customization admin API — Round A.
 * Permissions: workspace:manage (configure) / leads:view for read.
 */
import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database, CrmRecordEntityType } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import {
  CRM_ENTITY_TYPES,
  CRM_FIELD_TYPES,
  createCrmField,
  createCrmOption,
  createCrmSection,
  fieldKeySchema,
  listCrmFields,
  listCrmOptions,
  listCrmSections,
  reorderCrmOptions,
  reorderCrmSections,
  sectionKeySchema,
  updateCrmField,
  updateCrmOption,
  updateCrmSection,
} from '../lib/crm/customization';

const entitySchema = z.enum(CRM_ENTITY_TYPES);

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

export function createCrmCustomizationRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const configure = requirePermission('workspace:manage');
  const view = requirePermission('leads:view');

  router.get('/sections', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const entityType = entitySchema.parse(req.query['entity_type']);
      const includeArchived = req.query['include_archived'] === '1';
      const rows = await listCrmSections(db, workspaceId, entityType, includeArchived);
      res.json({ data: rows, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/sections', configure, async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          entity_type: entitySchema,
          section_key: sectionKeySchema,
          label: z.string().min(1).max(120),
          position: z.number().int().optional(),
        })
        .parse(req.body);
      const row = await createCrmSection(db, {
        workspaceId: auth.workspace.id,
        entityType: body.entity_type,
        sectionKey: body.section_key,
        label: body.label,
        position: body.position,
        actorUserId: auth.user.id,
      });
      res.status(201).json({ data: row, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/sections/:id', configure, async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          label: z.string().min(1).max(120).optional(),
          position: z.number().int().optional(),
          archive: z.boolean().optional(),
        })
        .parse(req.body);
      const row = await updateCrmSection(db, {
        workspaceId: auth.workspace.id,
        sectionId: req.params['id']!,
        ...body,
        actorUserId: auth.user.id,
      });
      if (!row) return fail(res, 404, 'NOT_FOUND', 'Section not found');
      res.json({ data: row, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/sections/reorder', configure, async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          entity_type: entitySchema,
          ids: z.array(z.string().uuid()).min(1),
        })
        .parse(req.body);
      await reorderCrmSections(db, auth.workspace.id, body.entity_type, body.ids, auth.user.id);
      res.json({ data: { reordered: body.ids.length }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/fields', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const entityType = entitySchema.parse(req.query['entity_type']);
      const includeArchived = req.query['include_archived'] === '1';
      const rows = await listCrmFields(db, workspaceId, entityType, includeArchived);
      res.json({ data: rows, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/fields', configure, async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          entity_type: entitySchema,
          section_id: z.string().uuid().nullable().optional(),
          field_key: fieldKeySchema,
          label: z.string().min(1).max(120),
          field_type: z.enum(CRM_FIELD_TYPES),
          required: z.boolean().optional(),
          default_json: z.record(z.unknown()).nullable().optional(),
          validation_json: z.record(z.unknown()).nullable().optional(),
          position: z.number().int().optional(),
          searchable: z.boolean().optional(),
        })
        .parse(req.body);
      try {
        const row = await createCrmField(db, {
          workspaceId: auth.workspace.id,
          entityType: body.entity_type as CrmRecordEntityType,
          sectionId: body.section_id,
          fieldKey: body.field_key,
          label: body.label,
          fieldType: body.field_type,
          required: body.required,
          defaultJson: body.default_json as Record<string, unknown> | null | undefined,
          validationJson: body.validation_json as Record<string, unknown> | null | undefined,
          position: body.position,
          searchable: body.searchable,
          actorUserId: auth.user.id,
        });
        res.status(201).json({ data: row, error: null });
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === 'FIELD_KEY_EXISTS') return fail(res, 409, code, 'field_key already exists');
        if (code === 'SECTION_NOT_FOUND') return fail(res, 400, code, 'section_id not found');
        throw err;
      }
    } catch (e) {
      next(e);
    }
  });

  router.patch('/fields/:id', configure, async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          label: z.string().min(1).max(120).optional(),
          required: z.boolean().optional(),
          default_json: z.record(z.unknown()).nullable().optional(),
          validation_json: z.record(z.unknown()).nullable().optional(),
          position: z.number().int().optional(),
          searchable: z.boolean().optional(),
          section_id: z.string().uuid().nullable().optional(),
          archive: z.boolean().optional(),
          field_type: z.enum(CRM_FIELD_TYPES).optional(),
        })
        .parse(req.body);
      const result = await updateCrmField(db, {
        workspaceId: auth.workspace.id,
        fieldId: req.params['id']!,
        label: body.label,
        required: body.required,
        defaultJson: body.default_json as Record<string, unknown> | null | undefined,
        validationJson: body.validation_json as Record<string, unknown> | null | undefined,
        position: body.position,
        searchable: body.searchable,
        sectionId: body.section_id,
        archive: body.archive,
        fieldType: body.field_type,
        actorUserId: auth.user.id,
      });
      if (!result.ok && result.fail === 'not_found') return fail(res, 404, 'NOT_FOUND', 'Field not found');
      if (!result.ok && result.fail === 'type_change_blocked') {
        return fail(res, 409, 'TYPE_CHANGE_BLOCKED', 'Archive and create a new field instead');
      }
      if (!result.ok) return fail(res, 400, 'VALIDATION', 'Invalid field update');
      res.json({ data: result.field, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/fields/:id/options', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const includeArchived = req.query['include_archived'] === '1';
      const rows = await listCrmOptions(db, workspaceId, req.params['id']!, includeArchived);
      res.json({ data: rows, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/fields/:id/options', configure, async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          option_value: z.string().min(1).max(120),
          label: z.string().min(1).max(120),
          position: z.number().int().optional(),
        })
        .parse(req.body);
      try {
        const row = await createCrmOption(db, {
          workspaceId: auth.workspace.id,
          fieldId: req.params['id']!,
          optionValue: body.option_value,
          label: body.label,
          position: body.position,
          actorUserId: auth.user.id,
        });
        res.status(201).json({ data: row, error: null });
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === 'FIELD_NOT_FOUND') return fail(res, 404, code, 'Field not found');
        if (code === 'OPTIONS_NOT_ALLOWED') return fail(res, 400, code, 'Options only for select fields');
        throw err;
      }
    } catch (e) {
      next(e);
    }
  });

  router.patch('/options/:id', configure, async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          label: z.string().min(1).max(120).optional(),
          position: z.number().int().optional(),
          archive: z.boolean().optional(),
        })
        .parse(req.body);
      const row = await updateCrmOption(db, {
        workspaceId: auth.workspace.id,
        optionId: req.params['id']!,
        ...body,
        actorUserId: auth.user.id,
      });
      if (!row) return fail(res, 404, 'NOT_FOUND', 'Option not found');
      res.json({ data: row, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/fields/:id/options/reorder', configure, async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(req.body);
      await reorderCrmOptions(db, auth.workspace.id, req.params['id']!, body.ids, auth.user.id);
      res.json({ data: { reordered: body.ids.length }, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
